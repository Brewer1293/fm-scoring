"""The friendly way in. Double-click a Start file (Start FM Scoring.command on Mac, Start FM Scoring.bat on Windows,
start.sh on Linux) and it runs this.

    python3 start.py                    check everything's set up, then a menu: talk to your assistant, open your pages...
    python3 start.py check              just the check
    python3 start.py install-fm-files   copy views, search filters and schedules into FM's folder (keeps your own files)
        --overwrite                     ...and replace files of the same name that differ
        --fm-dir PATH                   FM's folder, if it isn't in the usual place

Stdlib only. Keep this file's syntax plain (no walrus, no match) so an old Python gets the upgrade message below
instead of a syntax error.
"""
import sys

if sys.version_info < (3, 11):
    print("This needs Python 3.11 or newer, and this is Python %d.%d." % sys.version_info[:2])
    print("Get the latest from https://www.python.org/downloads/ (on Windows, tick \"Add python.exe to PATH\"),")
    print("then double-click the Start file again.")
    sys.exit(1)

import argparse
import filecmp
import os
import platform
import re
import shutil
import subprocess
import tomllib
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CONFIG = ROOT / "config.toml"
FM_NAME = "Football Manager 27"
FM_FOLDERS = ["views", "player search filters", "staff search filters", "schedules"]  # named like FM's own folders
ASSISTANTS = {"claude": "Claude Code", "codex": "Codex"}
INSTALL_PAGES = {"claude": "https://claude.com/claude-code", "codex": "https://developers.openai.com/codex"}
SETUP_PROMPT = "Help me set up a new save."
OK, WARN, NO = "✓", "!", "✗"

try:  # a console that can't show ✓ shows ? instead of crashing
    sys.stdout.reconfigure(errors="replace")
except (AttributeError, ValueError):
    pass


# --- what's on this computer ---

def load_config():
    try:
        return tomllib.loads(CONFIG.read_text(encoding="utf-8")) if CONFIG.exists() else {}
    except (OSError, tomllib.TOMLDecodeError) as e:
        print(f"{WARN} config.toml couldn't be read ({e}). Ask your assistant to fix it.")
        return {}


def active_save(config):
    """(name, save.toml contents) for config.toml's active_save, or (None, None)."""
    name = config.get("active_save")
    path = ROOT / "saves" / str(name) / "save.toml"
    if not name or not path.exists():
        return None, None
    try:
        return name, tomllib.loads(path.read_text(encoding="utf-8"))
    except (OSError, tomllib.TOMLDecodeError):
        return name, {}


def default_screenshots_dir():
    return "~/Desktop" if platform.system() == "Darwin" else "~/Pictures/Screenshots"  # as score.py


def fm_dir_candidates():
    """Where FM keeps views, filters and schedules, by OS, most likely first."""
    home, system = Path.home(), platform.system()
    if system == "Darwin":
        return [home / "Library" / "Application Support" / "Sports Interactive" / FM_NAME]
    if system == "Windows":
        local = Path(os.environ.get("LOCALAPPDATA") or home / "AppData" / "Local")
        docs = [home / "Documents"] + sorted(home.glob("OneDrive*/Documents")) + sorted(home.glob("OneDrive*/Dokumente"))
        return [local / "Sports Interactive" / FM_NAME] + [d / "Sports Interactive" / FM_NAME for d in docs]
    found = [home / ".local" / "share" / "Sports Interactive" / FM_NAME]  # Linux: native, or Steam's Proton
    for steam in (home / ".steam" / "steam", home / ".local" / "share" / "Steam",
                  home / ".var" / "app" / "com.valvesoftware.Steam" / ".local" / "share" / "Steam"):
        for sub in ("AppData/Local", "Documents"):
            found += sorted(steam.glob(f"steamapps/compatdata/*/pfx/drive_c/users/steamuser/{sub}/Sports Interactive/{FM_NAME}"))
    return found


def find_fm_dir(config, given=None):
    """FM's folder: --fm-dir, then config.toml's fm_dir, then the usual places (preferring one FM has filled in)."""
    if given or config.get("fm_dir"):
        path = Path(given or config["fm_dir"]).expanduser()
        return path if path.is_dir() else None
    existing = [p for p in fm_dir_candidates() if p.is_dir()]
    used = [p for p in existing if (p / "views").is_dir() or (p / "tactics").is_dir()]
    return (used or existing or [None])[0]


def fm_files(fm_dir):
    """(project file, its place in FM, state): state is "missing", "same" or "different"."""
    out = []
    for folder in FM_FOLDERS:
        for src in sorted((ROOT / folder).glob("*.fmf")):
            dst = fm_dir / folder / src.name
            state = "missing" if not dst.exists() else "same" if filecmp.cmp(src, dst, shallow=False) else "different"
            out.append((src, dst, state))
    return out


def fm_running():
    """Best guess at whether FM is open: it only loads new views and filters when it starts."""
    try:
        if platform.system() == "Windows":
            out = subprocess.run(["tasklist", "/fo", "csv", "/nh"], capture_output=True, text=True, timeout=10).stdout
            names = [line.split(",")[0].strip('"').lower() for line in out.splitlines()]
            return any(n == "fm.exe" or "football manager" in n for n in names)
        # macOS: comm is the executable's full path (…/Football Manager 27/fm.app/…); Linux under Proton: …/fm.exe
        fmt = "comm=" if platform.system() == "Darwin" else "args="
        out = subprocess.run(["ps", "-axo" if platform.system() == "Darwin" else "-eo", fmt],
                             capture_output=True, text=True, timeout=10).stdout.lower()
        return any(("football manager" in line and "python" not in line) or line.rstrip().endswith("fm.exe")
                   for line in out.splitlines())
    except (OSError, subprocess.SubprocessError):
        return False


def find_assistants():
    """{"claude": path, "codex": path} for the AI assistants installed, looking beyond PATH: a double-clicked
    script doesn't get the PATH a login shell would."""
    home = Path.home()
    extra = [home / ".local" / "bin", home / ".claude" / "local", Path("/opt/homebrew/bin"), Path("/usr/local/bin"),
             home / ".npm-global" / "bin", home / ".bun" / "bin"]
    if platform.system() == "Windows":
        extra += [Path(os.environ.get("APPDATA") or home / "AppData" / "Roaming") / "npm"]
    search = os.pathsep.join([os.environ.get("PATH", "")] + [str(p) for p in extra])
    found = {}
    for cmd in ASSISTANTS:
        path = shutil.which(cmd, path=search)
        if path:
            found[cmd] = path
    return found


def git_installed():
    try:
        return subprocess.run(["git", "--version"], capture_output=True, timeout=10).returncode == 0
    except (OSError, subprocess.SubprocessError):
        return False


def plural(n, word):
    return f"{n} {word}{'' if n == 1 else 's'}"


def home_short(path):
    """~/Desktop rather than /Users/name/Desktop."""
    try:
        return "~" + os.sep + str(Path(path).relative_to(Path.home()))
    except ValueError:
        return str(path)


# --- the check ---

def check(quiet_ok=False):
    """Print a checklist of everything the tool needs, and return what was found."""
    config = load_config()
    save, save_cfg = active_save(config)
    assistants = find_assistants()
    fm_dir = find_fm_dir(config)
    lines = [(OK, f"Python {platform.python_version()}")]

    if assistants:
        lines.append((OK, " and ".join(ASSISTANTS[a] for a in assistants) + " installed"))
    else:
        lines.append((WARN, "No AI assistant found. It's what reads your screenshots: install Claude Code\n"
                            "     (claude.com/claude-code) or Codex. Already using the Claude desktop app?\n"
                            "     That works too: open this folder in it."))

    if save:
        obs = len(list((ROOT / "saves" / save / "obs").glob("*.csv")))
        club = (save_cfg or {}).get("managed_club", save)
        lines.append((OK, f"Save: {club} ({plural(obs, 'screenshot set')} so far)"))
    elif config.get("active_save"):
        lines.append((NO, f"config.toml points at a save called \"{config['active_save']}\", but saves/"
                          f"{config['active_save']}/save.toml isn't there. Ask your assistant to set it up again."))
    else:
        lines.append((WARN, "No save set up yet"))

    if config:
        shots = Path(config.get("screenshots_dir", default_screenshots_dir())).expanduser()
        if shots.is_dir():
            lines.append((OK, f"Screenshots folder: {home_short(shots)}"))
        else:
            lines.append((NO, f"Screenshots folder {home_short(shots)} doesn't exist. Ask your assistant to change it."))

    if fm_dir is None:
        where = "config.toml's fm_dir" if config.get("fm_dir") else "the usual place"
        lines.append((WARN, f"Couldn't find FM27's folder in {where}. Is FM27 installed, and have you started it once?\n"
                            "     If it's somewhere unusual, ask your assistant to set fm_dir in config.toml."))
    else:
        files = fm_files(fm_dir)
        missing = sum(1 for f in files if f[2] == "missing")
        if missing:
            lines.append((WARN, f"{missing} of this project's {len(files)} FM views, filters and schedules aren't in FM yet"))
        else:
            lines.append((OK, "FM views, filters and schedules are installed"))

    if git_installed():
        lines.append((OK, "Git (keeps a history of your save data)"))
    else:
        lines.append(("-", "Git isn't installed. That's fine: it's optional, and only lets the Last pages step back\n"
                           "     through earlier screenshot sets."))

    for mark, text in lines:
        if not (quiet_ok and mark == OK):
            print(f"  {mark}  {text}")
    return {"config": config, "save": save, "assistants": assistants, "fm_dir": fm_dir}


# --- doing things ---

def install_fm_files(config, fm_dir=None, overwrite=False, interactive=False):
    """Copy views, filters and schedules into FM's folders of the same names. Never replaces a file that differs
    (it may be one of the user's own) unless overwrite, or the user says yes."""
    fm_dir = fm_dir or find_fm_dir(config)
    if fm_dir is None:
        print(f"{NO} Couldn't find FM27's folder. Open FM27 once so it creates it, or tell me where it is with --fm-dir.")
        return 1
    print(f"FM's folder: {home_short(fm_dir)}")
    if fm_running():
        print(f"{WARN} FM looks like it's open. Quit it first: it only picks up new views and filters when it starts.")
        if interactive:
            ask("   Press Enter once FM is closed. ")
    elif interactive:
        print("   (If FM is open, quit it first: it only picks up new views and filters when it starts.)")

    files = fm_files(fm_dir)
    differ = [f for f in files if f[2] == "different"]
    if differ and not overwrite and interactive:
        print(f"\n{plural(len(differ), 'file')} in FM {'has' if len(differ) == 1 else 'have'} the same name as one of this project's, but different contents:")
        for src, dst, _ in differ:
            print(f"     {src.parent.name}/{src.name}")
        one = len(differ) == 1
        print(f"   {'It' if one else 'They'} may be your own, or an older copy of this project's.")
        overwrite = ask(f"   Replace {'it' if one else 'them'} with this project's version{'' if one else 's'}? [y/N] ").lower().startswith("y")

    copied = replaced = 0
    for src, dst, state in files:
        if state == "missing" or (state == "different" and overwrite):
            dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(src, dst)
            copied += state == "missing"
            replaced += state == "different"
    same = sum(1 for f in files if f[2] == "same")
    kept = len(differ) - replaced
    done = [f"copied {plural(copied, 'new file')}"] if copied else []
    done += [f"replaced {plural(replaced, 'file')}"] if replaced else []
    done += [f"{same} {'was' if same == 1 else 'were'} already there"] if same else []
    print(f"\n{OK} " + (", ".join(done) or "nothing to copy").capitalize() + ".")
    if kept:
        print(f"{WARN} Kept your {plural(kept, 'file')} with the same name. To replace {'it' if kept == 1 else 'them'}, "
              "choose this again and answer y, or run: python3 start.py install-fm-files --overwrite")
    if copied or replaced:
        print("   Start FM: the views are in the view options above player and staff lists, the filters in the search\n"
              "   screens and the schedules in the training screen, each named like its file.")
    return 0


def launch_assistant(cmd, path, prompt=None):
    """Hand this window over to the assistant, in this folder."""
    args = [path] + ([prompt] if prompt else [])
    print(f"\nStarting {ASSISTANTS[cmd]}. Type to it in plain English, for example:")
    print('   "new screenshots"  after taking screenshots in FM')
    print('   "open my squad page"')
    print("To leave it, type /exit or press Ctrl+C twice.\n")
    os.chdir(ROOT)
    if platform.system() == "Windows":
        return subprocess.call(args)
    os.execv(path, args)  # replaces this script: the window becomes the assistant's


def no_assistant():
    print("\nThe assistant reads your screenshots and keeps your pages up to date, so you need one of these:")
    print("   Claude Code, with a paid Claude plan:                   https://claude.com/claude-code")
    print("   Codex, with a paid ChatGPT plan or an OpenAI API key:  https://developers.openai.com/codex")
    print("Or, in the Claude desktop app, open this folder:")
    print(f"   {ROOT}")
    if ask("\nOpen the Claude Code page now? [Y/n] ").lower() != "n":
        webbrowser.open(INSTALL_PAGES["claude"])
    print("Once it's installed, double-click the Start file again.")


def pick_assistant(config, assistants):
    """The assistant to start: the only one, or config.toml's choice, or ask and remember."""
    if len(assistants) == 1:
        return next(iter(assistants))
    if config.get("assistant") in assistants:
        return config["assistant"]
    choice = ask("Use Claude Code or Codex? [C/x] ").lower()
    cmd = "codex" if choice.startswith(("x", "o")) else "claude"
    if CONFIG.exists():
        with open(CONFIG, "a", encoding="utf-8") as f:
            f.write(f'assistant = "{cmd}"                 # which AI assistant the Start file opens\n')
    return cmd


def ask(prompt):
    try:
        return input(prompt).strip()
    except EOFError:
        return ""


def menu():
    print("FM player scoring\n=================\n")
    found = check()
    config, save, assistants = found["config"], found["save"], found["assistants"]
    name = ASSISTANTS[pick_assistant(config, assistants)] if len(assistants) == 1 else "your assistant"
    while True:
        print("\nWhat would you like to do?")
        if save:
            options = [("1", f"Talk to {name}: add screenshots, ask about players, change settings", "talk"),
                       ("2", "Open my pages", "pages")]
        else:
            options = [("1", f"Set up my save with {name} (recommended)", "setup"),
                       ("2", "Set up my save here instead: answer a few questions", "init")]
        options += [("3", "Put this project's views, filters and schedules into FM", "fm"), ("q", "Quit", "quit")]
        for key, text, _ in options:
            print(f"   {key}  {text}" + ("   <- press Enter" if key == "1" else ""))
        choice = ask("\n> ").lower() or "1"
        action = next((a for k, _, a in options if k == choice), None)
        if action is None:
            print("Type one of the numbers above, or q to quit.")
            continue
        if action == "quit":
            return 0
        if action in ("talk", "setup"):
            if not assistants:
                no_assistant()
                return 0
            cmd = pick_assistant(config, assistants)
            return launch_assistant(cmd, assistants[cmd], SETUP_PROMPT if action == "setup" else None)
        if action == "init":
            subprocess.call([sys.executable, str(ROOT / "score.py"), "init"])
            if git_installed() and (ROOT / "saves").is_dir() and not (ROOT / "saves" / ".git").exists():
                subprocess.run(["git", "init", "-q", str(ROOT / "saves")])  # local history of the save data, never pushed
            config = load_config()
            save, _ = active_save(config)
        elif action == "pages":
            if subprocess.call([sys.executable, str(ROOT / "score.py"), "--open", "squad"]) == 0:
                print(f"{OK} Opened your squad page in your web browser. Press 1–8 on it to change page, ? for help.")
        elif action == "fm":
            install_fm_files(config, interactive=True)


def main():
    ap = argparse.ArgumentParser(description="Check this tool is set up, and start it.")
    sub = ap.add_subparsers(dest="command")
    sub.add_parser("check", help="check everything's set up")
    sp = sub.add_parser("install-fm-files", help="copy views, search filters and schedules into FM's folder")
    sp.add_argument("--overwrite", action="store_true", help="replace files of the same name that differ")
    sp.add_argument("--fm-dir", help="FM's folder, if it isn't in the usual place")
    args = ap.parse_args()
    try:
        if args.command == "check":
            check()
            return 0
        if args.command == "install-fm-files":
            given = Path(args.fm_dir).expanduser() if args.fm_dir else None
            if given and not given.is_dir():
                print(f"{NO} {given} isn't a folder.")
                return 1
            return install_fm_files(load_config(), given, args.overwrite, interactive=sys.stdin.isatty())
        if not sys.stdin.isatty():  # run by an assistant, not double-clicked: no menu to answer
            check()
            return 0
        return menu()
    except KeyboardInterrupt:
        print()
        return 130


if __name__ == "__main__":
    sys.exit(main())

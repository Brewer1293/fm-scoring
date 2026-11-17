---
name: new-save
description: Set up a new FM save for this scoring tool (first-time setup, or another club). Use when the user says "help me set up a new save", wants to start another save, or there is no config.toml yet.
---

# Starting a new save

The user says "help me set up a new save", or there's no `config.toml` yet. Assume they aren't technical: plain
words, one step at a time, no jargon, and do the typing for them. `README.md` is what they've read.

1. **Check the tools:** run `python3 start.py check` (Windows: `python` or `py`; it says if Python is too old). Python
   3.11+ is required: if it's missing, point them to README's "What you need" and wait. Git is optional: don't ask them
   to install it.
2. **Ask, then write the settings yourself** (don't send them to `score.py init`: it's interactive):
   - the club they manage and its division, exactly as FM shows them in tables;
   - where their screenshots are saved (offer the OS default: Mac `~/Desktop`, Windows `~/Pictures/Screenshots`);
   - the currency FM shows.

   Write `config.toml` (from `config.example.toml`: `active_save`, `screenshots_dir`, `currency`) and
   `saves/<slug of club>/save.toml` (`weights` = the newest `weights/*.toml`, `managed_club`, `short_name`, `division`,
   `last_batch = []`, `last_staff_batch = []`), and create its `obs/` and `staff/` folders. If Git is installed and `saves/`
   isn't a git repo yet, `git init saves` (it stays local: their data isn't pushed with the code).
   Check the screenshots folder exists.
3. **FM views:** offer to install the views, filters and schedules. Ask them to quit FM first, then run
   `python3 start.py install-fm-files`. It finds FM's folder (Mac `~/Library/Application Support/Sports Interactive/Football Manager 27`;
   Windows `%LOCALAPPDATA%\Sports Interactive\…` or `Documents\Sports Interactive\…`), copies what's missing and keeps any file
   of the same name that differs. If it reports kept files, ask before rerunning with `--overwrite`. If it can't find FM's folder,
   ask where it is, rerun with `--fm-dir "<path>"` and add `fm_dir = "<path>"` to `config.toml`.
   If they'd rather make their own views, README's step 5 lists the attributes they need. Those come from the weights file,
   so if it's not `fm27`, list that file's instead (and the included views may need editing).
4. **First screenshots:** their squad screen with the outfield view, scrolling to cover everyone, then the GK view, with FM's
   date and their crest in shot. When they say "new screenshots", follow "Adding screenshots" in AGENTS.md.
5. If Git is installed, commit the new save: `git -C saves add -A && git -C saves commit -m "<save>: new save"`.
6. Tell them how to come back: double-click the Start file (`Start FM Scoring (Mac).command` / `(Windows).bat`) and press Enter.

Another save: same steps; the new save becomes `active_save`. Keep the newest weights unless the user wants new ones: then copy e.g. `weights/fm27.toml`
to `weights/fm28.toml` and point at that.

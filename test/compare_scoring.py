"""Check app/scoring.js against score.py: build a sample save, score it with both, compare every page's data.

    python3 test/compare_scoring.py        (needs node)
"""
import csv, json, math, random, shutil, subprocess, sys, tempfile
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO))
import score  # noqa: E402

rnd = random.Random(27)


def write(path, rows, fields):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fields, extrasaction="ignore", lineterminator="\n")
        w.writeheader()
        w.writerows(rows)


def make_save(root):
    w = score.load_toml(REPO / "weights" / "fm27v2.toml")
    save = root / "saves" / "fixture"
    obs, staff = save / "obs", save / "staff"
    with open(REPO / "leagues" / "2030-01-13_search-premier-league_outfield.csv", encoding="utf-8") as f:
        league = list(csv.DictReader(f))
    attrs = [c for c in league[0] if c not in score.META]
    meta = ["Name", "Club", "Age", "Left Foot", "Wage", "Transfer Value", "Loan"]

    squad = [dict(r) for r in league if r["Club"] == "Arsenal"]
    for i, r in enumerate(squad):
        r["Loan"] = ["", "", "out", "in", "trial", ""][i % 6]
    squad[0]["Name"] = "Arsenal 1 Longnam…"  # truncated, with an alias to the full name
    write(obs / "2030-01-13_arsenal_outfield.csv", squad, meta + attrs)
    older = []
    for r in squad[:8]:
        o = dict(r)
        for a in attrs[:6]:
            o[a] = str(max(1, int(o[a]) - rnd.randint(0, 2)))
        o["Age"] = str(int(o["Age"]) - 1)
        older.append(o)
    older.append({**squad[1], "Name": "Gone Player", "Age": "25"})  # missing from the newer squad screen: left
    write(obs / "2029-07-01_arsenal_outfield.csv", older, meta + attrs[:-2])  # older views lacked two attributes

    gk_attrs = sorted(set(w["gk"]) | set(w["gk_pts"]) | {"Pace", "Acceleration"})
    keepers = [{"Name": f"Keeper {k}", "Club": "Arsenal", "Age": str(20 + 5 * k), "Left Foot": "Weak", "Wage": "£40K p/w",
                "Transfer Value": "£5M - £9M", "Loan": "", **{a: str(rnd.randint(5, 18)) for a in gk_attrs}} for k in range(1, 3)]
    write(obs / "2030-01-13_arsenal_gk.csv", keepers, meta + gk_attrs)
    youth = [{**dict(league[k]), "Name": f"Youngster {k}", "Club": "Arsenal", "Age": str(15 + k % 3), "Loan": ""} for k in range(3)]
    write(obs / "2030-01-13_arsenal-u18s_outfield.csv", youth, meta + attrs)

    champ = list(csv.DictReader(open(REPO / "leagues" / "2030-01-13_search-championship_outfield.csv", encoding="utf-8")))
    search = [dict(r) for r in champ[:12]]
    search[0]["Club"] = "Free agent"
    search[1]["Transfer Value"] = "N/A"
    search[2]["Wage"] = ""
    search[3]["Acceleration"] = ""  # unreadable: carries forward / blocks scoring
    write(obs / "2030-01-13_search-cb_outfield.csv", search[:3] + search[4:], meta[:-1] + attrs)
    intake = [{**dict(champ[20 + k]), "Name": f"Intake {k}", "Club": "Arsenal", "Age": "15"} for k in range(3)]
    write(obs / "2030-01-13_search-youth-intake_outfield.csv", intake, meta[:-1] + attrs)
    write(obs / "2030-01-13_search-premier-league_outfield.csv", [r for r in league if r["Club"] != "Arsenal"],
          meta[:-1] + ["Minutes", "Rating", "Division"] + attrs)

    words = list(w["staff_words"])
    s_attrs = sorted({a for role in w["staff"].values() for a in role})
    def person(name, club, job):
        return {"Name": name, "Club": club, "Age": str(rnd.randint(30, 60)), "Job": job, "Personality": "Balanced",
                **{a: rnd.choice(words) for a in s_attrs}}
    s_meta = ["Name", "Club", "Age", "Job", "Personality"]
    write(staff / "2030-01-10_arsenal.csv", [person(f"Coach {k}", "Arsenal", "Coach") for k in range(5)], s_meta + s_attrs)
    write(staff / "2030-01-13_search-coach.csv", [person(f"Free Coach {k}", "", "Coach") for k in range(4)]
          + [person("Coach 1", "Arsenal", "Coach")], s_meta + s_attrs)

    base = ('weights = "fm27v2"\nmanaged_club = "Arsenal"\nshort_name = "afc"\ndivision = "Premier League"\n'
            'intake_kept = ["Intake 1"]\nreleased = ["Arsenal 3"]\nsigned = ["{signed}"]\nrecalled = ["{recalled}"]\n'
            'staff_released = ["Coach 2"]\n')
    v1 = base + 'last_batch = ["2030-01-13_arsenal_outfield.csv", "2030-01-13_arsenal_gk.csv"]\nlast_staff_batch = ["2030-01-10_arsenal.csv"]\n'
    v2 = base + ('last_batch = ["2030-01-13_search-cb_outfield.csv"]\nlast_staff_batch = ["2030-01-13_search-coach.csv"]\n'
                 'last_staff_names = ["Coach 3"]\n\n[aliases]\n"Arsenal 1 Longnam…" = "Arsenal 1 Longname"\n')
    fill = dict(signed=search[5]["Name"], recalled=squad[2]["Name"])
    v1, v2 = v1.format(**fill), v2.format(**fill)
    (save / "save.toml").write_text(v1, encoding="utf-8")
    subprocess.run(["git", "init", "-q", str(root / "saves")], check=True)
    git = ["git", "-C", str(root / "saves"), "-c", "user.name=t", "-c", "user.email=t@t"]
    subprocess.run(git + ["add", "-A"], check=True)
    subprocess.run(git + ["commit", "-qm", "v1"], check=True)
    (save / "save.toml").write_text(v2, encoding="utf-8")
    subprocess.run(git + ["commit", "-qam", "v2"], check=True)
    return save, [v2, v1]


def same(a, b, where):
    if isinstance(a, float) or isinstance(b, float):
        if a is None or b is None or not math.isclose(a, b, rel_tol=1e-9, abs_tol=1e-9):
            raise AssertionError(f"{where}: {a!r} != {b!r}")
    elif isinstance(a, dict) and isinstance(b, dict):
        if set(a) != set(b):
            raise AssertionError(f"{where}: keys differ: {sorted(set(a) ^ set(b))}")
        for k in a:
            same(a[k], b[k], f"{where}.{k}")
    elif isinstance(a, (list, tuple)) and isinstance(b, (list, tuple)):
        if len(a) != len(b):
            raise AssertionError(f"{where}: {len(a)} items != {len(b)}")
        for i, (x, y) in enumerate(zip(a, b)):
            same(x, y, f"{where}[{i}]")
    elif a != b:
        raise AssertionError(f"{where}: {a!r} != {b!r}")


def main():
    tmp = Path(tempfile.mkdtemp())
    try:
        shutil.copytree(REPO / "weights", tmp / "weights")
        save, versions = make_save(tmp)
        score.ROOT = tmp
        _, pages = score.build("fixture")
        py = json.loads(json.dumps({p: [cols, data, *rest] for p, (cols, data, *rest) in pages.items()}))
        spec = {"save_toml": str(save / "save.toml"), "weights": str(tmp / "weights" / "fm27v2.toml"), "obs": str(save / "obs"),
                "staff": str(save / "staff"), "leagues": str(REPO / "leagues"), "history": versions[1:]}
        (tmp / "spec.json").write_text(json.dumps(spec), encoding="utf-8")
        subprocess.run(["node", str(REPO / "test" / "run_scoring.js"), str(tmp / "spec.json"), str(tmp / "js.json")], check=True)
        js = json.loads((tmp / "js.json").read_text(encoding="utf-8"))
        if js["errors"]:
            raise AssertionError(f"scoring.js reported: {js['errors']}")
        for page in py:
            same(py[page], js["pages"][page], page)
            print(f"  {page}: {len(py[page][1])} rows match")
        print("scoring.js matches score.py")
    finally:
        shutil.rmtree(tmp)


if __name__ == "__main__":
    main()

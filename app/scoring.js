// score.py's scoring, in JavaScript, for the web app: the same rules, the same page data, the same templates.
// Keep the two in step: test/compare_scoring.py checks this file against score.py on a sample save.
(function (root) {
  "use strict";
  const T = typeof module !== "undefined" && module.exports ? require("./toml.js") : root.TOML;
  const { okeys, oentries } = T;

  const PAGES = ["squad", "elsewhere", "last", "filters", "charts", "staff", "last_staff", "staff_filters"];
  const META = new Set(["Name", "Club", "Age", "Left Foot", "Wage", "Transfer Value", "Loan", "Minutes", "Rating", "Division"]);
  const STAFF_META = new Set(["Name", "Club", "Age", "Job", "Personality"]);
  const LEFT_FOOTED = new Set(["Fairly Strong", "Strong", "Very Strong"]);
  const PARTIAL_SQUAD = /-(u\d+s?|reserves|first-team)$/;
  const YOUTH_TEAM = /-(u\d+)s?$/;
  const SEARCH_MIN_WEIGHT = 2;
  const LAST_BATCHES = 3;
  const MIN_DIVISION = 20;
  const CHART_ATTRS = ["Acceleration", "Pace", "Stamina", "Strength", "Jumping Reach", "Anticipation", "Concentration"];
  const PTS_LEVELS = [1, 8, 12, 16, 20];

  class ScoreError extends Error {}

  const sum = a => a.reduce((s, x) => s + x, 0);
  const dateOf = f => f.slice(0, 10);
  const stemOf = f => f.replace(/\.csv$/i, "");
  // the first key with the highest value, in the given order (Python's max(d, key=d.get))
  function bestKey(scores, order) {
    let best = null;
    for (const k of order) if (k in scores && (best === null || scores[k] > scores[best])) best = k;
    return best;
  }

  function money(text) {
    const m = /^\D*?([\d.]+)\s*([KMB]?)/i.exec(String(text).trim());
    if (!m) return null;
    const v = parseFloat(m[1]);
    return isNaN(v) ? null : v * { "": 1, K: 1e3, M: 1e6, B: 1e9 }[m[2].toUpperCase()];
  }

  // Each group's Σ(attribute × weight) / Σ(weights), for the groups whose attributes are all known: [[key, score]] in order
  function weighted(attrs, groups) {
    const out = {};
    for (const [key, w] of groups) {
      const ws = oentries(w);
      if (ws.every(([a]) => a in attrs)) out[key] = sum(ws.map(([a, x]) => attrs[a] * x)) / sum(ws.map(([, x]) => x));
    }
    return out;
  }

  function curveValue(points, x) {
    const [[x0, y0], [x1, y1]] = x < 6 ? [[1, points[0]], [6, points[1]]] : x < 12 ? [[6, points[1]], [12, 0]] : [[12, 0], [18, points[2]]];
    return y0 + (y1 - y0) * (x - x0) / (x1 - x0);
  }

  function curveScores(attrs, w) {
    const out = {};
    for (const [label, prof] of oentries(w.curve_scores || {})) {
      const m = [];
      for (const a of okeys(w.curve)) {
        const x = (a in prof ? prof[a] : 5);
        if (a in attrs && x) m.push([a, x / 5]);
      }
      const total = sum(m.map(([a, x]) => x * curveValue(w.curve[a], attrs[a])));
      let lo = 1.0, hi = 20.0;
      for (let i = 0; i < 30; i++) {
        const mid = (lo + hi) / 2;
        if (sum(m.map(([a, x]) => x * curveValue(w.curve[a], mid))) < total) lo = mid; else hi = mid;
      }
      if (m.length) out[label] = lo;
    }
    return out;
  }

  function winScore(attrs, w) {
    if (!w.win || !okeys(w.win).length) return null;
    return sum(oentries(w.win).filter(([a]) => a in attrs).map(([a, pts]) => curveValue(pts, attrs[a])));
  }

  function ptsValue(points, x) {
    const ys = [points[0], points[1], 0, ...points.slice(2)];
    const i = x < 16 ? [1, 2, 3].find(i => x < PTS_LEVELS[i]) : 4;
    const [x0, y0, x1, y1] = [PTS_LEVELS[i - 1], ys[i - 1], PTS_LEVELS[i], ys[i]];
    return y0 + (y1 - y0) * (x - x0) / (x1 - x0);
  }

  function ptsScore(attrs, w) {
    if (!w.gk_pts || !okeys(w.gk_pts).length) return null;
    return sum(oentries(w.gk_pts).filter(([a]) => a in attrs).map(([a, pts]) => ptsValue(pts, attrs[a])));
  }

  function* timeline(dates) {
    const attrs = {};
    for (const date of Object.keys(dates).sort()) {
      Object.assign(attrs, dates[date].attrs);
      yield [date, dates[date], { ...attrs }];
    }
  }

  const sortedFiles = files => [...files].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const toInt = (v, what) => {
    const x = Number(String(v).trim());
    if (!Number.isInteger(x)) throw new ScoreError(`${what}: ${JSON.stringify(v)} isn't a whole number`);
    return x;
  };

  // --- players ---

  function loadPlayers(files, aliases) {
    const players = new Map(), fileInfo = {};
    for (const file of sortedFiles(files)) {
      const stem = stemOf(file.name);
      const date = dateOf(stem), rest = stem.slice(11), cut = rest.lastIndexOf("_");
      const source = cut < 0 ? rest : rest.slice(0, cut), view = stem.slice(stem.lastIndexOf("_") + 1);
      for (const row0 of file.rows) {
        const row = { ...row0 };
        row.Name = aliases && Object.prototype.hasOwnProperty.call(aliases, row.Name) ? aliases[row.Name] : row.Name;
        const info = fileInfo[file.name] || (fileInfo[file.name] = { date, source, clubs: new Set() });
        info.clubs.add(row.Club);
        if (!players.has(row.Name)) players.set(row.Name, { keeper: false, files: new Set(), dates: {} });
        const p = players.get(row.Name);
        p.keeper = p.keeper || view === "gk";
        p.files.add(file.name);
        const snap = p.dates[date] || (p.dates[date] = { attrs: {} });
        snap.club = row.Club;
        snap.age = toInt(row.Age, `${file.name}: ${row.Name}: Age`);
        if (row["Left Foot"]) snap.leftFoot = row["Left Foot"];
        if (row.Wage) snap.wage = money(row.Wage);
        if (row["Transfer Value"]) {
          const tv = row["Transfer Value"], k = tv.indexOf(" - ");
          const lo = k < 0 ? tv : tv.slice(0, k), hi = k < 0 ? "" : tv.slice(k + 3);
          snap.value = [money(lo), money(hi || lo)];
        }
        if ("Loan" in row) snap.loan = row.Loan || null;
        if (row.Division) snap.division = row.Division;
        if (row.Rating) { snap.minutes = toInt(row.Minutes, `${file.name}: ${row.Name}: Minutes`); snap.rating = parseFloat(row.Rating); }
        for (const [k, v] of Object.entries(row)) {
          if (!META.has(k) && v !== "" && v !== null && v !== undefined) snap.attrs[k] = toInt(v, `${file.name}: ${row.Name}: ${k}`);
        }
      }
    }
    return { players, files: fileInfo };
  }

  function playerRow(name, p, w) {
    const positions = p.keeper ? [["GK", w.gk]] : oentries(w.outfield);
    const posKeys = positions.map(([k]) => k);
    const ages = okeys(w.age_benchmark).map(Number).sort((a, b) => a - b);
    const known = { leftFoot: null, wage: null, value: [null, null], loan: null };
    const history = [];
    for (const [date, snap, attrs] of timeline(p.dates)) {
      for (const k of Object.keys(known)) if (k in snap) known[k] = snap[k];
      const scores = weighted(attrs, positions);
      if (!Object.keys(scores).length) continue;
      const best = bestKey(scores, posKeys);
      const bench = w.age_benchmark[String(Math.min(Math.max(snap.age, ages[0]), ages[ages.length - 1]))];
      if (bench === undefined) throw new ScoreError(`${name}: no age_benchmark for age ${snap.age}`);
      history.push({
        date, club: snap.club, age: snap.age, leftFoot: known.leftFoot,
        ...scores, ...(p.keeper ? {} : curveScores(attrs, w)), win: p.keeper ? null : winScore(attrs, w),
        pts: p.keeper ? ptsScore(attrs, w) : null, best, score: scores[best], vsAge: scores[best] / bench,
        minutes: snap.minutes ?? null, rating: snap.rating ?? null, division: snap.division ?? null, attrs,
      });
    }
    const lastDate = Object.keys(p.dates).sort().pop();
    if (!history.length || history[history.length - 1].date !== lastDate)
      throw new ScoreError(`${name}: not enough attributes to score any position on ${lastDate}`);
    const latest = { ...history[history.length - 1] };
    delete latest.date; delete latest.leftFoot; delete latest.attrs;
    return {
      name, ...latest,
      left: known.leftFoot === null ? null : LEFT_FOOTED.has(known.leftFoot) ? "yes" : "no",
      loan: known.loan, wage: known.wage, valueLo: known.value[0], value: known.value[1],
      history,
    };
  }

  function playerCols(w, withClub, withRating) {
    withRating = withRating === undefined ? withClub : withRating;
    const wage = { key: "wage", label: "Wage", num: true, fmt: "money" };
    const club = [{ key: "club", label: "Club" }, wage, { key: "value", label: "Value", num: true, fmt: "range" }];
    return [
      { key: "name", label: "Player" },
      ...(withClub ? club : []),
      { key: "age", label: "Age", num: true },
      ...(withClub ? [] : [wage]),
      { key: "left", label: "Left", fmt: "yesno" },
      ...["GK", ...okeys(w.outfield)].map(p => ({ key: p, label: p, num: true, fmt: "f1" })),
      ...(w.win && okeys(w.win).length ? [{ key: "win", label: "%win", num: true, fmt: "win" }] : []),
      ...(w.gk_pts && okeys(w.gk_pts).length ? [{ key: "pts", label: "GKpts", num: true, fmt: "pts" }] : []),
      { key: "best", label: "Best" },
      { key: "vsAge", label: "vs Age", num: true, fmt: "pct" },
      ...(withRating ? [{ key: "rating", label: "Rating", num: true, fmt: "f2" }, { key: "minutes", label: "Mins", num: true }] : []),
    ];
  }

  const byWeightDesc = pw => oentries(pw).map((e, i) => [...e, i]).sort((a, b) => b[1] - a[1] || a[2] - b[2]);
  const topBy = (rows, key, n) => rows.map((r, i) => [r, i]).filter(([r]) => r[key] !== undefined && r[key] !== null)
    .sort((a, b) => b[0][key] - a[0][key] || a[1] - b[1]).slice(0, n).map(([r]) => r);

  function filters(squad, w) {
    const out = [];
    for (const [pos, pw] of [["GK", w.gk], ...oentries(w.outfield)]) {
      const ranked = topBy(squad, pos, pos === "GK" ? 1 : 3);
      if (!ranked.length) continue;
      const rows = byWeightDesc(pw).map(([attr, weight]) => {
        const values = ranked.map(r => r.history[r.history.length - 1].attrs[attr]);
        return { attr, weight, values, min: weight >= SEARCH_MIN_WEIGHT ? Math.floor(sum(values) / values.length + 0.5) : null };
      });
      out.push({ pos, rows, players: ranked.map(r => ({ name: r.name, age: r.age, score: r[pos] })) });
    }
    return out;
  }

  function divisions(rows) {
    const counts = {};
    for (const r of rows) if (r.division) counts[r.division] = (counts[r.division] || 0) + 1;
    return new Set(Object.keys(counts).filter(d => counts[d] >= MIN_DIVISION));
  }

  function charts(rows, squad, w, cfg, leagues, errors) {
    const own = divisions(rows);
    const shared = [];
    for (const f of sortedFiles(leagues || [])) {
      const { players } = loadPlayers([f]);  // each file alone: its "Arsenal 1" isn't another file's
      for (const [n, p] of players) {
        try { shared.push(playerRow(n, p, w)); } catch (e) { if (e instanceof ScoreError) errors.push(`${f.name}: ${e.message}`); else throw e; }
      }
    }
    const inSquad = new Set(squad);
    const all = [
      ...rows.filter(r => r.division !== null && !inSquad.has(r)).map(r => [r, false, false]),
      ...squad.map(r => [r, true, false]),
      ...shared.filter(r => !own.has(r.division)).map(r => [r, false, true]),
    ];
    const posKeys = ["GK", ...okeys(w.outfield)];
    const players = all.map(([r, mine, ref]) => {
      const attrs = r.history[r.history.length - 1].attrs;
      const scores = {};
      for (const p of posKeys) if (r[p] !== undefined && r[p] !== null) scores[p] = r[p];
      const o = { name: r.name, club: r.club, division: r.division, age: r.age, squad: mine, ref, wage: r.wage,
                  rating: r.rating, minutes: r.minutes, best: r.best, win: r.win, pts: r.pts ?? null, scores };
      for (const a of CHART_ATTRS) o[a] = a in attrs ? attrs[a] : null;
      return o;
    });
    return { positions: [...okeys(w.outfield), "GK"], players, managed: cfg.managed_club, division: cfg.division ?? null };
  }

  // --- staff ---

  function loadStaff(files, words) {
    const staff = new Map();
    for (const file of sortedFiles(files)) {
      const date = dateOf(file.name);
      for (const row of file.rows) {
        if (!staff.has(row.Name)) staff.set(row.Name, { files: new Set(), dates: {} });
        const p = staff.get(row.Name);
        p.files.add(file.name);
        const snap = p.dates[date] || (p.dates[date] = { attrs: {} });
        Object.assign(snap, { club: row.Club, age: row.Age ? toInt(row.Age, `${file.name}: ${row.Name}: Age`) : null,
                              job: row.Job || null, personality: row.Personality || null });
        for (const [k, v] of Object.entries(row)) {
          if (!STAFF_META.has(k) && v) {
            if (!(v in words)) throw new ScoreError(`${file.name}: ${row.Name}: ${k} = "${v}" isn't one of FM's staff words`);
            snap.attrs[k] = words[v];
          }
        }
      }
    }
    return staff;
  }

  function staffRow(name, p, roles) {
    const history = [], known = { job: null, personality: null };
    const roleKeys = roles.map(([k]) => k);
    for (const [date, snap, attrs] of timeline(p.dates)) {
      for (const k of Object.keys(known)) if (snap[k]) known[k] = snap[k];
      const scores = weighted(attrs, roles);
      const best = bestKey(scores, roleKeys);
      history.push({ date, club: snap.club, age: snap.age, ...scores, best, score: best === null ? null : scores[best], attrs });
    }
    const latest = { ...history[history.length - 1] };
    delete latest.date; delete latest.attrs;
    return { name, ...latest, ...known, history };
  }

  function staffCols(roles) {
    return [{ key: "name", label: "Name" }, { key: "club", label: "Club" }, { key: "age", label: "Age", num: true },
            { key: "job", label: "Job" }, { key: "personality", label: "Personality" },
            ...roles.map(([r]) => ({ key: r, label: r, num: true, fmt: "f1" }))];
  }

  function staffFilters(clubStaff, roles, words, names) {
    const wordList = oentries(words);
    const word = v => wordList.reduce((best, e) => (best === null || Math.abs(e[1] - v) < Math.abs(best[1] - v) ? e : best), null)[0];
    const out = [];
    for (const [role, rw] of roles) {
      const ranked = topBy(clubStaff, role, 3);
      if (!ranked.length) continue;
      const rows = byWeightDesc(rw).map(([attr, weight]) => {
        const values = ranked.map(r => r.history[r.history.length - 1].attrs[attr]);
        return { attr, weight, values, labels: values.map(word), min: weight >= SEARCH_MIN_WEIGHT ? word(sum(values) / values.length) : null };
      });
      const title = names && names[role] !== undefined && names[role] !== role ? names[role] : null;
      out.push({ pos: role, title, rows, players: ranked.map(r => ({ name: r.name, age: r.age, score: r[role] })) });
    }
    return out;
  }

  // --- pages ---

  function checkListed(cfg, key, known, what) {
    const missing = (cfg[key] || []).filter(x => !known.has(x));
    if (missing.length) throw new ScoreError(`save settings ${key} ${what}: ${missing.sort().join(", ")}`);
  }

  // The last n distinct (files, names) batches, newest first: the current settings, then earlier versions
  function recentBatches(versions, filesKey, namesKey, n = LAST_BATCHES) {
    const batches = [], seen = new Set();
    for (const v of versions) {
      const b = [[...(v[filesKey] || [])], [...(v[namesKey] || [])]];
      const id = JSON.stringify(b);
      if ((b[0].length || b[1].length) && !seen.has(id)) {
        seen.add(id); batches.push(b);
        if (batches.length === n) break;
      }
    }
    return batches;
  }

  function batchLabel(files, names) {
    const parts = [...new Set(files.map(f => `${f.slice(0, 10)} ${stemOf(f).slice(11).replace(/_outfield$/, "").replace(/_gk$/, "")}`))];
    return [...parts, ...(names.length ? [`${names.length} named`] : [])].join(" · ");
  }

  function batched(rows, batches, member) {
    const labels = batches.map(([files, names]) => batchLabel(files, names));
    const out = [];
    for (const r of rows) {
      const idx = batches.map(([files, names], i) => (member(r, new Set(files), new Set(names)) ? i : -1)).filter(i => i >= 0);
      if (idx.length) out.push({ ...r, batches: idx });
    }
    return [out, labels];
  }

  /** Every page's [columns, data, (batch labels)], as score.py's build(). input: {cfg, weights, obs: [{name, rows}],
   *  staff: [{name, rows}], history: [earlier cfg versions, newest first], leagues: [{name, rows}]} */
  function build(input) {
    const { cfg, weights: w } = input;
    const errors = [];
    const managed = cfg.managed_club;
    const { players, files: obsFiles } = loadPlayers(input.obs || [], cfg.aliases);
    const rows = [];
    for (const [n, p] of players) {
      try { rows.push(playerRow(n, p, w)); } catch (e) { if (e instanceof ScoreError) errors.push(e.message); else throw e; }
    }
    const names = new Set(players.keys());
    checkListed(cfg, "last_names", names, "has players never observed");
    checkListed(cfg, "last_batch", new Set(Object.keys(obsFiles)), "names files with no players");

    const squadDate = Object.values(obsFiles).filter(f => !f.source.startsWith("search-") && !PARTIAL_SQUAD.test(f.source) && f.clubs.has(managed))
      .map(f => f.date).reduce((a, b) => (b > a ? b : a), "");
    checkListed(cfg, "released", names, "has players never observed");
    const released = new Set(cfg.released || []), signed = new Set(cfg.signed || []), recalled = new Set(cfg.recalled || []);
    for (const r of rows)
      if (r.club === managed && (r.history[r.history.length - 1].date < squadDate || released.has(r.name))) r.club = `left ${managed}`;
    checkListed(cfg, "signed", names, "has players never observed");
    for (const r of rows) if (signed.has(r.name) && r.history[r.history.length - 1].date >= squadDate) r.club = managed;
    checkListed(cfg, "recalled", names, "has players never observed");
    for (const r of rows) if (recalled.has(r.name) && r.loan === "out") r.loan = null;
    const squad = rows.filter(r => r.club === managed);
    for (const r of squad) {
      const own = [...players.get(r.name).files].map(f => obsFiles[f]).filter(f => !f.source.startsWith("search-"));
      let m = null;
      if (own.length) {
        const latest = own.reduce((a, b) => (b.date > a.date ? b : a));
        m = YOUTH_TEAM.exec(latest.source);
      }
      r.team = m ? m[1].toUpperCase() : null;
    }
    const intakeDate = Object.values(obsFiles).filter(f => f.source.includes("intake")).map(f => f.date).reduce((a, b) => (b > a ? b : a), "");
    const intake = new Set([...players].filter(([, p]) =>
      [...p.files].some(f => obsFiles[f].date === intakeDate && obsFiles[f].source.includes("intake"))
      && ![...p.files].some(f => obsFiles[f].date >= intakeDate && !obsFiles[f].source.startsWith("search-"))).map(([n]) => n));
    const kept = new Set(cfg.intake_kept || []);
    const signedUp = squad.filter(r => !(intake.has(r.name) && !kept.has(r.name)));

    const roles = oentries(w.staff || {});
    const words = w.staff_words || {};
    const staff = loadStaff(input.staff || [], words);
    const staffRows = [...staff].map(([n, p]) => staffRow(n, p, roles));
    checkListed(cfg, "staff_released", new Set(staff.keys()), "has staff never observed");
    const staffReleased = new Set(cfg.staff_released || []);
    for (const r of staffRows) if (r.club === managed && staffReleased.has(r.name)) r.club = `left ${managed}`;
    checkListed(cfg, "last_staff_batch", new Set([...staff.values()].flatMap(p => [...p.files])), "names files with no staff");
    checkListed(cfg, "last_staff_names", new Set(staff.keys()), "has staff never observed");
    const clubDates = [];
    for (const p of staff.values()) for (const f of p.files)
      if (!f.slice(11).startsWith("search-") && p.dates[dateOf(f)].club === managed) clubDates.push(dateOf(f));
    const clubDate = clubDates.reduce((a, b) => (b > a ? b : a), "");
    const clubStaff = staffRows.filter(r => r.club === managed && r.history[r.history.length - 1].date >= clubDate);

    const versions = [cfg, ...(input.history || [])];
    return {
      cfg, errors,
      pages: {
        squad: [playerCols(w, false), signedUp],
        elsewhere: [playerCols(w, true), rows.filter(r => r.club !== managed)],
        last: [playerCols(w, true, false), ...batched(rows, recentBatches(versions, "last_batch", "last_names"),
          (r, files, nm) => (nm.size ? nm.has(r.name) : [...players.get(r.name).files].some(f => files.has(f))))],
        filters: [[], filters(signedUp, w)],
        charts: [[], charts(rows, signedUp, w, cfg, input.leagues, errors)],
        staff: [staffCols(roles), staffRows],
        last_staff: [staffCols(roles), ...batched(staffRows, recentBatches(versions, "last_staff_batch", "last_staff_names"),
          (r, files, nm) => [...staff.get(r.name).files].some(f => files.has(f)) || nm.has(r.name))],
        staff_filters: [[], staffFilters(clubStaff, roles, words, w.staff_names || {})],
      },
    };
  }

  const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
  const round2 = x => Math.round(x * 100) / 100;

  /** One page's HTML from template.html / charts.html, as score.py's write_pages(); in the app, SITE.app makes the
   *  page's 1–8 keys ask the app to switch page instead of following links. */
  function pageHtml(page, built, opts) {
    const { cfg, pages } = built;
    const w = opts.weights;
    const [columns, data, batches] = pages[page];
    const home = esc(cfg.short_name || cfg.managed_club || "squad");
    const site = JSON.stringify({ pages: Object.fromEntries(PAGES.map((p, i) => [String(i + 1), p])), currency: opts.currency || "£",
                                  gameDate: opts.gameDate || null, app: !!opts.app });
    const weightsJson = {};
    for (const [k, v] of [["GK", w.gk], ...oentries(w.outfield), ...oentries(w.staff || {})]) weightsJson[k] = Object.fromEntries(oentries(v));
    const win = Object.fromEntries(oentries(w.win || {}).map(([a, pts]) => [a, Array.from({ length: 18 }, (_, i) => round2(curveValue(pts, i + 1)))]));
    const pts = Object.fromEntries(oentries(w.gk_pts || {}).map(([a, v]) => [a, Array.from({ length: 20 }, (_, i) => round2(ptsValue(v, i + 1)))]));
    const labels = Object.fromEntries(PAGES.map(p => [p, p === "squad" ? home : p.replace(/_/g, " ")]));
    const nav = opts.nav !== undefined ? opts.nav
      : PAGES.map((p, i) => `<a href="${p}.html"${p === page ? ' class="on"' : ""}>${i + 1} ${labels[p]}</a>`).join("");
    const template = page === "charts" ? opts.chartsTemplate : opts.template;
    const fills = [["__THEME__", opts.theme], ["__NAV__", nav], ["__TITLE__", `${home} · ${labels[page]}`], ["__SAVE__", opts.save],
                   ["__HOME__", home], ["__PAGE__", page], ["__SITE__", site], ["__BATCHES__", JSON.stringify(batches || [])],
                   ["__COLS__", JSON.stringify(columns)], ["__WEIGHTS__", JSON.stringify(weightsJson)], ["__WIN__", JSON.stringify(win)],
                   ["__PTS__", JSON.stringify(pts)], ["__DATA__", JSON.stringify(data).replace(/<\//g, "<\\/")]];
    let html = template;
    for (const [k, v] of fills) html = html.split(k).join(v);
    return html;
  }

  const api = { PAGES, META, STAFF_META, ScoreError, build, pageHtml, money, curveValue, ptsValue, loadPlayers };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.FMScore = api;
})(typeof self !== "undefined" ? self : globalThis);

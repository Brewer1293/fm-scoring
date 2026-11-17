// The web app: setup, adding screenshots (read by OpenAI through the relay), the eight pages, player changes and settings.
// Everything is kept in this browser (IndexedDB); Settings has backup, restore, and import/export for the Python version.
(function () {
  "use strict";
  const S = FMScore, R = FMRead, F = FMFiles, T = TOML;
  const $ = s => document.querySelector(s);

  // h("div.class#id", {attr, onclick}, ...children)
  function h(spec, attrs, ...kids) {
    const [, tag, rest] = /^([a-z0-9]+)(.*)$/i.exec(spec);
    const el = document.createElement(tag);
    for (const m of rest.matchAll(/([.#])([\w-]+)/g)) m[1] === "." ? el.classList.add(m[2]) : (el.id = m[2]);
    if (attrs && (typeof attrs !== "object" || attrs instanceof Node || Array.isArray(attrs))) { kids.unshift(attrs); attrs = null; }
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === null || v === undefined || v === false) continue;
      if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else if (k === "html") el.innerHTML = v;
      else if (k in el && k !== "list" && typeof v !== "string") el[k] = v;
      else el.setAttribute(k, v === true ? "" : v);
    }
    for (const k of kids.flat(Infinity)) if (k !== null && k !== undefined && k !== false) el.append(k instanceof Node ? k : String(k));
    return el;
  }
  const clone = o => JSON.parse(JSON.stringify(o));
  const plural = (n, w, ws) => `${n} ${n === 1 ? w : ws || w + "s"}`;
  const LABELS = { squad: null, elsewhere: "Elsewhere", last: "Last screenshots", filters: "Filters", charts: "Charts",
                   staff: "Staff", last_staff: "Last staff", staff_filters: "Staff filters" };
  const MODELS = [["gpt-6.1-terra", "gpt-6.1-terra: fast and cheap (recommended)"], ["gpt-6.1-sol", "gpt-6.1-sol: more careful, ~4× the cost"],
                  ["gpt-6-luna", "gpt-6-luna: cheapest, least accurate"]];
  const REPO = "https://github.com/Brewer1293/fm-scoring";

  let state = null;         // what's saved: {version, settings, saves: {id: {cfg, obs, staff, history}}}
  let assets = null;        // the templates, theme, manifest and shared leagues, fetched once
  const weightsCache = {};
  let built = null, weights = null, page = "squad", persisted = true;

  // --- storage and data ---

  async function persist() {
    persisted = await F.save(state);
    if (!persisted) banner("This browser isn't letting the page keep data, so nothing will be kept after you close it. Use Settings → Download a backup.", "warn");
  }
  const current = () => state.saves[state.settings.active] || null;
  const fileList = map => Object.entries(map || {}).map(([name, f]) => ({ name, rows: f.rows }));
  const gameDate = sv => [...Object.keys(sv.obs), ...Object.keys(sv.staff)].map(f => f.slice(0, 10)).sort().pop() || null;

  async function loadAssets() {
    const text = async p => { const r = await fetch(p); if (!r.ok) throw new Error(`${p}: ${r.status}`); return r.text(); };
    const [template, charts, theme, manifest] = await Promise.all(["template.html", "charts.html", "theme.css", "app/manifest.json"].map(text));
    const m = JSON.parse(manifest);
    const leagues = await Promise.all(m.leagues.map(async name => ({ name, rows: F.parseCsv(await text("leagues/" + name)).rows }))).catch(() => []);
    assets = { template, charts, theme, manifest: m, leagues };
  }
  async function weightsFor(name) {
    if (!weightsCache[name]) {
      const r = await fetch(`weights/${encodeURIComponent(name)}.toml`);
      if (!r.ok) throw new Error(`There's no weights/${name}.toml`);
      weightsCache[name] = T.parse(await r.text());
    }
    return weightsCache[name];
  }

  async function compute() {
    const sv = current();
    built = null; weights = null;
    banner("");
    if (!sv) return;
    try {
      weights = await weightsFor(sv.cfg.weights);
      built = S.build({ cfg: sv.cfg, weights, obs: fileList(sv.obs), staff: fileList(sv.staff), history: sv.history, leagues: assets.leagues });
      if (built.errors.length) banner(h("span", plural(built.errors.length, "player") + " couldn't be scored and are left out: ",
        h("span.dim", built.errors.slice(0, 3).join(" · ") + (built.errors.length > 3 ? " …" : ""))), "warn");
    } catch (e) {
      banner("Couldn't score this save: " + e.message, "bad");
      console.error(e);
    }
  }

  // --- the frame ---

  function renderTop() {
    const sv = current();
    const sel = $("#saveSel");
    sel.replaceChildren(...Object.entries(state.saves).map(([id, s]) => h("option", { value: id, selected: id === state.settings.active }, s.cfg.managed_club)),
                        h("option", { value: "__new" }, "+ New save…"));
    sel.hidden = !Object.keys(state.saves).length;
    $("#gameDate").textContent = sv && gameDate(sv) ? "game date " + fmtDate(gameDate(sv)) : "";
    $("#tabs").replaceChildren(...(sv ? S.PAGES : []).map((p, i) => h("button", { class: p === page ? "on" : "", title: `press ${i + 1}`,
      onclick: () => show(p) }, h("b", String(i + 1)), " ", p === "squad" ? (sv ? sv.cfg.short_name || "Squad" : "Squad") : LABELS[p])));
    for (const id of ["#addBtn", "#changesBtn"]) $(id).disabled = !sv;
  }
  const fmtDate = d => { const [y, m, dd] = d.split("-"); return `${+dd}/${+m}/${y}`; };

  function render() {
    renderTop();
    const sv = current(), frame = $("#page"), welcome = $("#welcome");
    const empty = sv && !Object.keys(sv.obs).length && !Object.keys(sv.staff).length;
    if (!sv || (empty && page !== "charts")) {
      frame.hidden = true; welcome.hidden = false;
      welcome.replaceChildren(sv ? gettingStarted(sv) : setupForm());
      return;
    }
    welcome.hidden = true; frame.hidden = false;
    if (!built) { frame.srcdoc = ""; return; }
    frame.srcdoc = S.pageHtml(page, built, { weights, template: assets.template, chartsTemplate: assets.charts, theme: assets.theme,
      currency: state.settings.currency, gameDate: gameDate(sv), save: state.settings.active, app: true, nav: "" });
    frame.onload = () => { try { frame.contentWindow.focus(); } catch (e) { /* fine */ } };
  }
  function show(p) { page = p; render(); }

  function banner(msg, kind) {
    const b = $("#banner");
    b.className = kind || "";
    b.replaceChildren(...(msg ? [msg instanceof Node ? msg : String(msg)] : []));
    b.hidden = !msg;
  }
  let toastTimer;
  function toast(content, ms) {
    const t = $("#toast");
    t.replaceChildren(content instanceof Node ? content : String(content), h("button.x", { onclick: () => (t.hidden = true), title: "close" }, "×"));
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.hidden = true), ms || 9000);
  }

  // --- welcome: a new save, or how to start ---

  function setupForm(isAnother) {
    const f = {};
    const field = (label, input, hint) => h("label.field", h("span", label), input, hint ? h("small", hint) : null);
    const weightsSel = h("select", ...assets.manifest.weights.map(w => h("option", { value: w }, w)));
    const form = h("form.card",
      { onsubmit: async e => {
          e.preventDefault();
          const club = f.club.value.trim();
          if (!club) return f.club.focus();
          let id = R.slug(club) || "save", n = 2;
          while (state.saves[id]) id = `${R.slug(club)}-${n++}`;
          state.saves[id] = { cfg: { weights: weightsSel.value, managed_club: club, short_name: f.short.value.trim() || R.slug(club),
                                     division: f.division.value.trim(), last_batch: [], last_staff_batch: [] },
                              obs: {}, staff: {}, history: [] };
          state.settings.active = id;
          state.settings.currency = f.currency.value.trim() || "£";
          await persist(); closeModal(); page = "squad"; await compute(); render();
        } },
      h("h1", isAnother ? "A new save" : "Welcome"),
      isAnother ? null : h("p", "This scores Football Manager 27 players for every position from screenshots of FM's player lists, and keeps track of them as they develop. Everything stays in this browser."),
      field("Club you manage", f.club = h("input", { placeholder: "e.g. Man Utd", required: true, autofocus: true }), "Exactly as FM shows it in its tables: “Man Utd”, not “Manchester United”."),
      field("Your club's division", f.division = h("input", { placeholder: "e.g. Sky Bet League One" }), "Also as FM shows it. Optional: it's the charts page's starting league."),
      field("Short name", f.short = h("input", { placeholder: "e.g. utd" }), "For the first tab. Optional."),
      h("div.row", field("Currency FM shows", f.currency = h("input", { value: state.settings.currency || "£", size: 3 })),
                   field("Weights", weightsSel, "How positions are scored; fm27v2 is the newest.")),
      h("div.actions", h("button.primary", { type: "submit" }, "Start this save"),
        isAnother ? h("button", { type: "button", onclick: closeModal }, "Cancel") : null),
      isAnother ? null : h("p.dim", "Already using the Python version, or have a backup? ",
        h("a", { href: "#", onclick: e => { e.preventDefault(); importPython(); } }, "Import a saves folder"), " · ",
        h("a", { href: "#", onclick: e => { e.preventDefault(); restoreBackup(); } }, "Restore a backup")));
    return form;
  }

  function gettingStarted(sv) {
    const ready = state.settings.apiKey && state.settings.relayUrl;
    return h("div.card",
      h("h1", sv.cfg.managed_club + ": getting started"),
      h("ol.steps",
        h("li", h("b", "Put the views into FM. "), "FM's player lists need the right columns. ",
          h("a", { href: "#", onclick: e => { e.preventDefault(); downloadFmFiles(); } }, "Download the views, filters and schedules"),
          ", quit FM, and copy each folder's files into FM's folder of the same name:",
          h("div.dim", "Mac: ~/Library/Application Support/Sports Interactive/Football Manager 27"),
          h("div.dim", "Windows: %LOCALAPPDATA%\\Sports Interactive\\Football Manager 27 (or Documents\\Sports Interactive\\…)")),
        h("li", h("b", "Set up reading. "), ready ? "Done ✓" : ["Screenshots are read by OpenAI with your API key, through a small free relay. ",
          h("a", { href: "#", onclick: e => { e.preventDefault(); openSettings("reading"); } }, "Set it up in Settings"), "."]),
        h("li", h("b", "Screenshot your squad. "), "In FM, open your squad screen with the ", h("code", "attribs_outfield"), " view and screenshot it, scrolling until you've covered everyone; then the ",
          h("code", "attribs_gk"), " view for your keepers. Keep FM's date (top right) and your club's crest (top left) in shot."),
        h("li", h("b", "Add them here: "), "drag them onto this page, paste them (⌘V / Ctrl+V), or ",
          h("button.primary", { onclick: () => openAdd() }, "+ Add screenshots"))),
      h("p.dim", "The charts page already works: it compares against shared English league data. ", h("a", { href: "#", onclick: e => { e.preventDefault(); show("charts"); } }, "Have a look")));
  }

  // --- modal ---

  function openModal(...content) {
    $("#panel").replaceChildren(...content.filter(c => c !== null && c !== undefined));
    $("#modal").hidden = false;
  }
  function closeModal() {
    $("#modal").hidden = true;
    $("#panel").replaceChildren();
    addFlow = null;
  }

  // --- adding screenshots ---

  let addFlow = null;
  function openAdd(files) {
    if (!current()) return;
    if (!addFlow) addFlow = { files: [], kind: "squad", label: "", team: "", stage: "pick" };
    if (files) addImages(files);
    renderAdd();
  }
  function addImages(files) {
    for (const f of files) if (/^image\//.test(f.type) && !addFlow.files.some(x => x.file.name === f.name && x.file.size === f.size))
      addFlow.files.push({ file: f, url: URL.createObjectURL(f) });
  }

  function renderAdd() {
    const a = addFlow;
    if (a.stage === "pick") return openModal(...pickStage());
    if (a.stage === "reading") return openModal(...readingStage());
    if (a.stage === "review") return openModal(...reviewStage());
  }

  function pickStage() {
    const a = addFlow, k = R.KINDS[a.kind];
    const ready = state.settings.apiKey && state.settings.relayUrl;
    const input = h("input", { type: "file", accept: "image/*", multiple: true, hidden: true,
      onchange: e => { addImages(e.target.files); renderAdd(); } });
    const needsLabel = !!k.ask && !a.label.trim();
    return [
      h("h2", "Add screenshots"),
      h("div.drop", { onclick: () => input.click(),
          ondragover: e => { e.preventDefault(); e.currentTarget.classList.add("over"); },
          ondragleave: e => e.currentTarget.classList.remove("over"),
          ondrop: e => { e.preventDefault(); addImages(e.dataTransfer.files); renderAdd(); } },
        input,
        a.files.length ? h("div.thumbs", ...a.files.map((f, i) => h("figure", h("img", { src: f.url, alt: f.file.name }),
            h("button.x", { title: "remove", onclick: e => { e.stopPropagation(); a.files.splice(i, 1); renderAdd(); } }, "×"))))
          : h("div", h("b", "Drop FM screenshots here"), h("div.dim", "or click to choose them, or paste with ⌘V / Ctrl+V"))),
      h("fieldset", h("legend", "What are they?"),
        ...Object.entries(R.KINDS).map(([key, kd]) => h("label.radio",
          h("input", { type: "radio", name: "kind", checked: a.kind === key, onchange: () => { a.kind = key; a.label = ""; renderAdd(); } }), kd.label)),
        k.ask ? h("label.field", h("span", k.ask), h("input", { value: a.label, autofocus: true, oninput: e => { a.label = e.target.value; $("#readBtn").disabled = !a.files.length || !e.target.value.trim(); } })) : null,
        k.squad ? h("label.field", h("span", "Which part of the club?"), h("select", { onchange: e => (a.team = e.target.value) },
          ...Object.entries(R.TEAMS).map(([v, l]) => h("option", { value: v, selected: a.team === v }, l))),
          h("small", "Whole club also notices who's left since your last squad screenshots.")) : null,
        a.kind === "league" ? h("small", "Use the division view so Division, Minutes and Average Rating show. One league per batch is easiest.") : null),
      h("div.actions",
        ready
          ? h("button.primary#readBtn", { disabled: !a.files.length || needsLabel, onclick: startReading }, a.files.length ? `Read ${plural(a.files.length, "screenshot")}` : "Read screenshots")
          : h("button.primary", { onclick: () => openSettings("reading") }, "Set up reading first"),
        h("button", { onclick: closeModal }, "Cancel"),
        h("span.dim", ready ? `with ${state.settings.model || "gpt-6.1-terra"}` : "")),
    ];
  }

  async function startReading() {
    const a = addFlow, sv = current();
    a.stage = "reading"; a.abort = new AbortController(); a.cost = 0;
    a.jobs = a.files.map(f => ({ ...f, status: "waiting", msg: "" }));
    renderAdd();
    const columns = R.columnsFor(weights || await weightsFor(sv.cfg.weights),
      Object.values(sv.obs).flatMap(f => f.columns));
    const ctx = { managed: sv.cfg.managed_club, label: a.label.trim(), team: a.team };
    let next = 0;
    const worker = async () => {
      while (next < a.jobs.length && addFlow === a) {
        const job = a.jobs[next++];
        job.status = "reading"; renderAdd();
        try {
          const { result, usage, model } = await R.readImage({ file: job.file, kind: a.kind, ctx, settings: state.settings, columns, signal: a.abort.signal });
          job.result = result; job.usage = usage;
          const c = R.cost(model, usage);
          if (c !== null) a.cost += c;
          job.status = "done";
          job.msg = `${plural((result.rows || []).length, "row")} · ${((usage.input_tokens || 0) + (usage.output_tokens || 0)).toLocaleString()} tokens`;
        } catch (e) {
          if (e.name === "AbortError") return;
          job.status = "failed"; job.msg = e.message;
        }
        if (addFlow === a) renderAdd();
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    if (addFlow !== a || a.abort.signal.aborted) return;
    if (a.jobs.some(j => j.status === "done")) { prepareReview(); a.stage = "review"; }
    renderAdd();
  }

  function readingStage() {
    const a = addFlow;
    const failed = a.jobs.filter(j => j.status === "failed").length, done = a.jobs.every(j => j.status === "done" || j.status === "failed");
    return [
      h("h2", "Reading screenshots…"),
      h("ul.jobs", ...a.jobs.map(j => h("li." + j.status, h("img", { src: j.url, alt: "" }), h("span.name", j.file.name),
        h("span.status", { done: "✓ read", failed: "✗ failed", reading: "reading…", waiting: "waiting" }[j.status]), h("span.dim", j.msg)))),
      h("p.dim", a.cost ? `So far: about $${a.cost.toFixed(3)} of OpenAI credit.` : ""),
      h("div.actions",
        done && failed ? h("button", { onclick: () => { a.stage = "pick"; renderAdd(); } }, "Back") : null,
        h("button", { onclick: () => { a.abort.abort(); closeModal(); } }, done ? "Close" : "Cancel")),
    ];
  }

  function prepareReview() {
    const a = addFlow, sv = current();
    const latest = Object.keys(R.KINDS[a.kind].staff ? sv.staff : sv.obs).map(f => f.slice(0, 10)).sort().pop() || "";
    const ctx = { managed: sv.cfg.managed_club, label: a.label.trim(), team: a.team, staffWords: (weights && weights.staff_words) || {} };
    a.ctx = ctx;
    a.readings = a.jobs.filter(j => j.status === "done").map(j => {
      const res = j.result, warn = [];
      const wantStaff = !!R.KINDS[a.kind].staff;
      if (!res.is_fm || res.kind === "other") warn.push("This doesn't look like an FM player or staff list: it's left out.");
      else if (wantStaff !== (res.kind === "staff")) warn.push(wantStaff ? "This looks like a player list, not staff." : "This looks like a staff list, not players.");
      const club = (res.top_left_club || "").toLowerCase(), managed = sv.cfg.managed_club.toLowerCase();
      if (club && !club.includes(managed) && !managed.includes(club))
        warn.push(`The crest at the top left looks like ${res.top_left_club}, not ${sv.cfg.managed_club}: is this the right save?`);
      const date = /^\d{4}-\d{2}-\d{2}$/.test(res.game_date || "") ? res.game_date : "";
      if (date && latest && date < latest) warn.push(`FM's date here (${fmtDate(date)}) is before your latest screenshots (${fmtDate(latest)}): is this the right save?`);
      return { job: j, result: res, date, warn, skip: !res.is_fm || res.kind === "other",
               rows: res.is_fm && res.kind !== "other" ? R.rowsFrom(res, a.kind, ctx) : [] };
    });
  }

  function reviewStage() {
    const a = addFlow, sv = current();
    const live = a.readings.filter(r => !r.skip);
    const included = live.flatMap(r => r.rows.filter(x => x.include));
    const bad = included.reduce((n, r) => n + Object.values(r.flags).filter(f => f === "bad").length, 0);
    const unsure = included.reduce((n, r) => n + Object.values(r.flags).filter(f => f === "unsure").length, 0);
    const noDate = live.filter(r => !r.date).length;
    const isNames = a.kind === "names";
    const known = new Set(built ? built.pages.squad[1].concat(built.pages.elsewhere[1]).map(r => r.name) : []);

    const blocks = live.map(rd => {
      const cols = [...new Set(rd.rows.flatMap(r => Object.keys(r.cells)))];
      const order = ["Name", "Club", "Loan", "Age", "Left Foot", "Wage", "Transfer Value", "Minutes", "Rating", "Division", "Job", "Personality"];
      cols.sort((x, y) => (order.indexOf(x) + 1 || 99) - (order.indexOf(y) + 1 || 99));
      return h("section.reading",
        h("div.rhead", h("a", { href: rd.job.url, target: "_blank", title: "open the screenshot" }, h("img", { src: rd.job.url, alt: "" })),
          h("div", h("b", rd.job.file.name), h("div.dim", rd.result.kind === "gk" ? "goalkeeper view" : rd.result.kind === "staff" ? "staff" : "outfield view", " · ",
            plural(rd.rows.filter(r => r.include).length, isNames ? "name" : "row")),
            h("label.inline", "FM date ", h("input", { type: "date", value: rd.date, required: true, class: rd.date ? "" : "bad",
              onchange: e => { rd.date = e.target.value; renderAdd(); } })))),
        ...rd.warn.map(w => h("p.warn", w)),
        isNames
          ? h("p", ...rd.rows.map(r => h("span.chip" + (known.has(r.cells.Name) ? "" : ".bad"), r.cells.Name)),
              rd.rows.some(r => !known.has(r.cells.Name)) ? h("small.dim", " Red names haven't been added before, so they can't be shown: add them from a search first.") : null)
          : h("div.gridwrap", h("table.grid",
              h("thead", h("tr", h("th", "✓"), ...cols.map(c => h("th", c)))),
              h("tbody", ...rd.rows.map(row => h("tr" + (row.include ? "" : ".off"),
                h("td", h("input", { type: "checkbox", checked: row.include, title: row.note || "include this row", onchange: e => { row.include = e.target.checked; renderAdd(); } })),
                ...cols.map(c => h("td" + (row.flags[c] ? "." + row.flags[c] : ""), { title: { unsure: "OpenAI wasn't sure: check it against the screenshot", bad: "this doesn't look right: fix it or untick the row", fixed: "expanded from FM's cut-off text" }[row.flags[c]] || "" },
                  h("input", { value: row.cells[c] ?? "", size: Math.max(2, Math.min(18, String(row.cells[c] ?? "").length + 1)),
                    onchange: e => {
                      const { value, flag } = R.checkCell(c, e.target.value, a.kind, a.ctx);
                      row.cells[c] = value;
                      if (flag && flag !== "fixed") row.flags[c] = flag; else delete row.flags[c];
                      renderAdd();
                    } }))),
                row.note ? h("td.note", row.note) : null)))))
      );
    });

    const skipped = a.readings.filter(r => r.skip).map(r => h("p.warn", `${r.job.file.name}: ${r.warn[0]}`));
    const failed = a.jobs.filter(j => j.status === "failed").map(j => h("p.warn", `${j.file.name} couldn't be read: ${j.msg}`));
    const blocked = bad || noDate;
    return [
      h("h2", isNames ? "Check the names" : "Check what was read"),
      h("p.dim", isNames ? "These players will be shown together on the Last screenshots page." :
        ["Yellow cells: OpenAI wasn't sure. Red: they don't look right. Click any cell to correct it against the screenshot (click a thumbnail to open it). ",
         a.cost ? `This batch cost about $${a.cost.toFixed(3)}.` : ""]),
      ...failed, ...skipped, ...blocks,
      h("div.actions.sticky",
        h("button.primary", { disabled: !!blocked || !included.length, onclick: saveReadings }, isNames ? "Show them" : `Save ${plural(included.length, isNames ? "name" : "row")}`),
        h("button", { onclick: closeModal }, "Discard"),
        h("span" + (blocked ? ".badtext" : ".dim"),
          noDate ? "Fill in FM's date for each screenshot." : bad ? `${plural(bad, "red cell")} to fix or untick.` : unsure ? `${plural(unsure, "yellow cell")} worth a look.` : "All clear.")),
    ];
  }

  async function saveReadings() {
    const a = addFlow, sv = current(), k = R.KINDS[a.kind];
    const before = clone(sv.cfg);
    const live = a.readings.filter(r => !r.skip);
    if (a.kind === "names") {
      const known = new Set(built ? built.pages.squad[1].concat(built.pages.elsewhere[1]).map(r => r.name) : []);
      const names = [...new Set(live.flatMap(r => r.rows.filter(x => x.include).map(x => x.cells.Name)).filter(n => known.has(n)))];
      if (!names.length) return toast("None of those names have been added before.");
      sv.history.unshift(before);
      sv.cfg.last_names = names;
    } else {
      const planned = R.plan(live, a.kind, a.ctx);
      for (const g of planned) {
        const folder = g.folder === "obs" ? sv.obs : sv.staff;
        folder[g.name] = R.mergeFile(folder[g.name], g);
      }
      sv.history.unshift(before);
      const names = planned.map(g => g.name);
      if (k.staff) {
        sv.cfg.last_staff_batch = names; delete sv.cfg.last_staff_names;
        if (a.kind === "staffclub" && !a.team) sv.cfg.staff_released = [];
      } else {
        sv.cfg.last_batch = names; delete sv.cfg.last_names;
        if (a.kind === "squad" && !a.team) { sv.cfg.released = []; sv.cfg.signed = []; sv.cfg.recalled = []; }
      }
    }
    sv.history = sv.history.slice(0, 60);
    const cost = a.cost;
    await persist();
    closeModal();
    page = k.staff ? "last_staff" : "last";
    await compute();
    render();
    if (built) toast(notable(k.staff ? "last_staff" : "last", cost), 15000);
  }

  // A few words on the batch: its best, and the biggest changes since a player's previous screenshot
  function notable(pg, cost) {
    const rows = built.pages[pg][1].filter(r => (r.batches || [0]).includes(0));
    const staff = pg === "last_staff";
    const top = [...rows].sort((x, y) => (staff ? (y.score ?? 0) - (x.score ?? 0) : y.vsAge - x.vsAge)).slice(0, 3);
    const moves = staff ? [] : rows.map(r => {
      const hs = r.history; if (hs.length < 2) return null;
      return { r, d: hs[hs.length - 1].score - hs[hs.length - 2].score };
    }).filter(x => x && Math.abs(x.d) >= 0.4).sort((x, y) => Math.abs(y.d) - Math.abs(x.d)).slice(0, 3);
    return h("div",
      h("b", `Saved ${plural(rows.length, staff ? "person" : "player", staff ? "people" : "players")}.`), cost ? h("span.dim", ` About $${cost.toFixed(3)} of OpenAI credit.`) : null,
      top.length ? h("div", "Best: ", top.map((r, i) => [i ? " · " : "", h("b", r.name), staff ? ` (${r.best} ${(r.score ?? 0).toFixed(1)})` : ` (${r.best} ${r.score.toFixed(1)}, ${Math.round(r.vsAge * 100)}% for their age)`])) : null,
      moves.length ? h("div", "Biggest changes: ", moves.map((m, i) => [i ? " · " : "", h("b", m.r.name), ` ${m.d > 0 ? "+" : "−"}${Math.abs(m.d).toFixed(1)}`])) : null,
      h("div.dim", "A misread number is the most likely mistake, so it's worth checking a few against FM."));
  }

  // --- player changes ---

  const CHANGES = [
    ["released", "Left my club", "Sold or released since your last squad screenshots.", "squad"],
    ["signed", "Joined my club", "Signed since your last squad screenshots (they need to have been added from a search).", "others"],
    ["recalled", "Back from loan", "Recalled from a loan since your last squad screenshots.", "loanout"],
    ["intake_kept", "Kept from the youth intake", "Youth intake players you're keeping: they join the squad.", "all"],
    ["staff_released", "Staff who've left", "Staff let go since your last staff screenshots.", "staff"],
  ];
  function openChanges() {
    const sv = current();
    const rows = built ? [...built.pages.squad[1], ...built.pages.elsewhere[1]] : [];
    const pools = {
      squad: built ? built.pages.squad[1].map(r => r.name) : [],
      others: built ? built.pages.elsewhere[1].map(r => r.name) : [],
      loanout: rows.filter(r => r.loan === "out").map(r => r.name),
      all: rows.map(r => r.name),
      staff: built ? built.pages.staff[1].filter(r => r.club === sv.cfg.managed_club).map(r => r.name) : [],
    };
    const save = async () => { await persist(); await compute(); render(); openChanges(); };
    const sections = CHANGES.map(([key, title, hint, pool]) => {
      const list = sv.cfg[key] || [];
      const dl = "dl-" + key;
      const input = h("input", { list: dl, placeholder: "type a name" });
      const add = async () => {
        const v = input.value.trim();
        if (!v) return;
        const valid = key === "staff_released" ? built.pages.staff[1].map(r => r.name) : pools.all;
        if (!valid.includes(v)) return toast(`“${v}” isn't one of your ${key === "staff_released" ? "staff" : "players"}: pick from the list.`);
        if (!list.includes(v)) { sv.cfg[key] = [...list, v]; await save(); }
      };
      return h("section.change",
        h("h3", title), h("small.dim", hint),
        h("div", ...list.map(n => h("span.chip", n, h("button.x", { title: "remove", onclick: async () => { sv.cfg[key] = list.filter(x => x !== n); await save(); } }, "×")))),
        h("div.row", input, h("datalist", { id: dl }, ...pools[pool].map(n => h("option", { value: n }))), h("button", { onclick: add }, "Add")));
    });
    const aliases = sv.cfg.aliases || {};
    const cut = rows.filter(r => /…$/.test(r.name)).map(r => r.name);
    const from = h("input", { list: "dl-cut", placeholder: "Antony Papadopoul…" }), to = h("input", { placeholder: "Antony Papadopoulos" });
    sections.push(h("section.change", h("h3", "Full names"), h("small.dim", "FM cuts off long names. When you know the full name, link them so the player's history stays together."),
      h("div", ...Object.entries(aliases).map(([a, b]) => h("span.chip", `${a} → ${b}`, h("button.x", { onclick: async () => { delete aliases[a]; sv.cfg.aliases = aliases; await save(); } }, "×")))),
      h("div.row", from, h("datalist#dl-cut", ...cut.map(n => h("option", { value: n }))), " → ", to,
        h("button", { onclick: async () => { const a = from.value.trim(), b = to.value.trim(); if (a && b) { sv.cfg.aliases = { ...aliases, [a]: b }; await save(); } } }, "Link"))));
    openModal(h("h2", "Player changes"), h("p.dim", "Tell the app about moves before your next squad screenshots. A new whole-club squad screenshot clears the first three lists."),
      ...sections, h("div.actions", h("button.primary", { onclick: closeModal }, "Done")));
  }

  // --- settings ---

  function openSettings(focus) {
    const sv = current(), st = state.settings;
    const field = (label, input, hint) => h("label.field", h("span", label), input, hint ? h("small", hint) : null);
    const key = h("input", { type: "password", value: st.apiKey || "", placeholder: "sk-…", autocomplete: "off", spellcheck: false });
    const relay = h("input", { value: st.relayUrl || "", placeholder: "https://fm-scoring-relay.<you>.workers.dev", spellcheck: false });
    const known = MODELS.some(([m]) => m === st.model);
    const model = h("select", ...MODELS.map(([m, l]) => h("option", { value: m, selected: st.model === m || (!st.model && m === "gpt-6.1-terra") }, l)),
                    h("option", { value: "__other", selected: !!st.model && !known }, "Another model…"));
    const other = h("input", { value: known ? "" : st.model || "", placeholder: "model id", hidden: known || !st.model });
    model.onchange = () => { other.hidden = model.value !== "__other"; };
    const testOut = h("span.dim");
    const saveReading = async () => {
      st.apiKey = key.value.trim(); st.relayUrl = relay.value.trim().replace(/\/+$/, "");
      st.model = model.value === "__other" ? other.value.trim() : model.value;
      await persist();
    };
    const c = sv ? sv.cfg : null;
    const f = {};
    const reading = h("section#reading",
      h("h3", "Reading screenshots"),
      h("p.dim", "Screenshots are read by OpenAI with your own API key (", h("a", { href: "https://platform.openai.com/api-keys", target: "_blank" }, "get one here"),
        "). OpenAI won't take requests straight from a web page, so they go through a small relay you run free on Cloudflare: ",
        h("a", { href: REPO + "/blob/main/relay/README.md", target: "_blank" }, "how to set it up (5 minutes)"), ". Your key stays in this browser and goes only to OpenAI, through your relay."),
      field("OpenAI API key", key), field("Relay address", relay), field("Model", h("div.row", model, other)),
      h("div.actions", h("button.primary", { onclick: async () => { await saveReading(); toast("Saved."); render(); closeModal(); } }, "Save"),
        h("button", { onclick: async () => { await saveReading(); testOut.textContent = "Testing…"; testOut.textContent = await testRelay(); } }, "Test it"), testOut));
    const saveSection = sv ? h("section",
      h("h3", "This save"),
      field("Club you manage", f.club = h("input", { value: c.managed_club }), "Exactly as FM shows it."),
      field("Division", f.division = h("input", { value: c.division || "" })),
      h("div.row", field("Short name", f.short = h("input", { value: c.short_name || "" })),
        field("Currency", f.cur = h("input", { value: st.currency || "£", size: 3 })),
        field("Weights", f.weights = h("select", ...assets.manifest.weights.map(w => h("option", { value: w, selected: c.weights === w }, w))))),
      h("div.actions", h("button.primary", { onclick: async () => {
        Object.assign(c, { managed_club: f.club.value.trim() || c.managed_club, division: f.division.value.trim(), short_name: f.short.value.trim(), weights: f.weights.value });
        st.currency = f.cur.value.trim() || "£";
        await persist(); await compute(); render(); toast("Saved."); closeModal();
      } }, "Save"))) : null;
    let confirmDelete = false;
    const delBtn = sv ? h("button.danger", { onclick: async e => {
      if (!confirmDelete) { confirmDelete = true; e.target.textContent = `Really delete ${c.managed_club}? Click again`; return; }
      delete state.saves[state.settings.active];
      state.settings.active = Object.keys(state.saves)[0] || null;
      await persist(); closeModal(); page = "squad"; await compute(); render();
    } }, "Delete this save") : null;
    const data = h("section",
      h("h3", "Your data"),
      h("p.dim", "Everything is kept in this browser on this computer" + (persisted ? "" : " (but this browser isn't keeping it!)") + ". Download a backup now and then, and to move to another computer."),
      h("div.actions.wrap",
        h("button", { onclick: downloadBackup }, "Download a backup"),
        h("button", { onclick: restoreBackup }, "Restore a backup"),
        sv ? h("button", { onclick: exportPython }, "Export for the Python version") : null,
        h("button", { onclick: importPython }, "Import a saves folder"),
        h("button", { onclick: downloadFmFiles }, "Download the FM views"),
        delBtn));
    openModal(h("h2", "Settings"), saveSection, reading, data, h("div.actions", h("button", { onclick: closeModal }, "Close")));
    if (focus === "reading") { reading.scrollIntoView(); (st.apiKey ? relay : key).focus(); }
  }

  async function testRelay() {
    const st = state.settings;
    if (!st.relayUrl || !st.apiKey) return "Fill in both first.";
    try {
      const r = await fetch(st.relayUrl + "/v1/responses", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + st.apiKey },
        body: JSON.stringify({ model: st.model || "gpt-6.1-terra", input: "Reply with the word OK.", max_output_tokens: 16 }) });
      const t = await r.text();
      if (r.ok) return "✓ Working: the relay reached OpenAI and your key was accepted.";
      if (r.status === 401) return "✗ The relay works, but OpenAI didn't accept the key.";
      if (r.status === 403) return "✗ The relay refused this page: add " + location.origin + " to ALLOWED_ORIGINS in worker.js.";
      let msg = t; try { msg = JSON.parse(t).error.message; } catch (e) { /* plain text */ }
      return `✗ ${r.status}: ${String(msg).slice(0, 160)}`;
    } catch (e) {
      return "✗ Couldn't reach the relay at that address.";
    }
  }

  // --- data in and out ---

  const pickFiles = opts => new Promise(ok => {
    const i = h("input", { type: "file", hidden: true, ...opts });
    i.onchange = () => { ok([...i.files]); i.remove(); };
    document.body.append(i); i.click();
  });
  const stamp = () => new Date().toISOString().slice(0, 10);

  function downloadBackup() {
    const out = clone({ ...state, settings: { ...state.settings, apiKey: "" } });  // never put the key in a file
    F.download(`fm-scoring-backup-${stamp()}.json`, new Blob([JSON.stringify(out)], { type: "application/json" }));
  }
  async function restoreBackup() {
    const [file] = await pickFiles({ accept: ".json,application/json" });
    if (!file) return;
    try {
      const b = JSON.parse(await file.text());
      if (!b || !b.saves) throw new Error("not a backup from this app");
      const n = Object.keys(b.saves).length;
      for (const [id, sv] of Object.entries(b.saves)) state.saves[id] = sv;
      state.settings = { ...state.settings, ...b.settings, apiKey: state.settings.apiKey };
      if (!state.saves[state.settings.active]) state.settings.active = Object.keys(state.saves)[0];
      await persist(); closeModal(); await compute(); render();
      toast(`Restored ${plural(n, "save")}.`);
    } catch (e) { toast("That file couldn't be restored: " + e.message); }
  }

  // The Python version's folder: saves/<save>/save.toml, obs/*.csv, staff/*.csv (pick saves/ or one save's folder)
  async function importPython() {
    const files = await pickFiles({ webkitdirectory: true, multiple: true });
    if (!files.length) return;
    const bySave = {};
    for (const f of files) {
      const parts = f.webkitRelativePath.split("/");
      const name = parts[parts.length - 1];
      let saveDir, kind;
      if (name === "save.toml") { saveDir = parts.slice(0, -1).join("/"); kind = "toml"; }
      else if (/\.csv$/i.test(name) && ["obs", "staff"].includes(parts[parts.length - 2])) { saveDir = parts.slice(0, -2).join("/"); kind = parts[parts.length - 2]; }
      else continue;
      (bySave[saveDir] = bySave[saveDir] || { obs: {}, staff: {} });
      if (kind === "toml") bySave[saveDir].toml = await f.text();
      else bySave[saveDir][kind][name] = F.parseCsv(await f.text());
    }
    const found = Object.entries(bySave).filter(([, s]) => s.toml);
    if (!found.length) return toast("No save.toml found there: pick the saves folder, or one save's folder inside it.");
    try {
      for (const [dir, s] of found) {
        const cfg = clone(T.parse(s.toml));
        let id = dir.split("/").pop() || R.slug(cfg.managed_club), n = 2;
        while (state.saves[id]) id = `${dir.split("/").pop()}-${n++}`;
        state.saves[id] = { cfg, obs: s.obs, staff: s.staff, history: [] };
        state.settings.active = id;
      }
      await persist(); closeModal(); page = "squad"; await compute(); render();
      toast(`Imported ${plural(found.length, "save")}.`);
    } catch (e) { toast("Couldn't import: " + e.message); }
  }

  function exportPython() {
    const id = state.settings.active, sv = current();
    const files = [{ path: `saves/${id}/save.toml`, text: T.stringify(sv.cfg, `# A save managing ${sv.cfg.managed_club}: exported from the web app.`) }];
    for (const [folder, map] of [["obs", sv.obs], ["staff", sv.staff]])
      for (const [name, f] of Object.entries(map)) files.push({ path: `saves/${id}/${folder}/${name}`, text: F.toCsv(f.columns, f.rows) });
    F.download(`fm-scoring-${id}-${stamp()}.zip`, F.zip(files));
  }

  async function downloadFmFiles() {
    try {
      const files = await Promise.all(assets.manifest.fm_files.map(async p => {
        const r = await fetch(p.split("/").map(encodeURIComponent).join("/"));
        if (!r.ok) throw new Error(p);
        return { path: p, bytes: new Uint8Array(await r.arrayBuffer()) };
      }));
      F.download("fm-scoring-views.zip", F.zip(files));
    } catch (e) { toast("Couldn't fetch the FM files: " + e.message); }
  }

  // --- start ---

  async function init() {
    if (location.protocol === "file:") {
      $("#welcome").replaceChildren(h("div.card", h("h1", "Open this from a web address"),
        h("p", "This page needs to be opened from the web: ", h("a", { href: "https://brewer1293.github.io/fm-scoring/" }, "brewer1293.github.io/fm-scoring"),
          ". To run it on your own computer instead, run ", h("code", "python3 -m http.server 8000"), " in this folder and open http://localhost:8000.")));
      return;
    }
    state = (await F.load()) || { version: 1, settings: { model: "gpt-6.1-terra", currency: "£", active: null }, saves: {} };
    try { if (navigator.storage && navigator.storage.persist) await navigator.storage.persist(); } catch (e) { /* optional */ }
    try { await loadAssets(); } catch (e) {
      $("#welcome").replaceChildren(h("div.card", h("h1", "Couldn't load the app"), h("p", e.message)));
      return;
    }
    if (location.hash && S.PAGES.includes(location.hash.slice(1).replace(/-/g, "_"))) page = location.hash.slice(1).replace(/-/g, "_");
    await compute();
    render();

    $("#saveSel").onchange = async e => {
      if (e.target.value === "__new") { e.target.value = state.settings.active; return openModal(setupForm(true)); }
      state.settings.active = e.target.value; await persist(); await compute(); render();
    };
    $("#addBtn").onclick = () => openAdd();
    $("#changesBtn").onclick = openChanges;
    $("#settingsBtn").onclick = () => openSettings();
    $("#modal").addEventListener("mousedown", e => { if (e.target.id === "modal" && (!addFlow || addFlow.stage === "pick")) closeModal(); });
    addEventListener("message", e => { if (e.data && e.data.fmPage && S.PAGES.includes(e.data.fmPage)) show(e.data.fmPage); });
    addEventListener("keydown", e => {
      if (e.metaKey || e.ctrlKey || e.altKey || /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) return;
      if (e.key === "Escape" && !$("#modal").hidden && (!addFlow || addFlow.stage === "pick")) return closeModal();
      if ($("#modal").hidden && current() && /^[1-8]$/.test(e.key)) show(S.PAGES[+e.key - 1]);
    });
    addEventListener("dragover", e => { if (current() && [...e.dataTransfer.types].includes("Files")) e.preventDefault(); });
    addEventListener("drop", e => { if (!current()) return; e.preventDefault(); if (!addFlow || addFlow.stage === "pick") openAdd(e.dataTransfer.files); });
    addEventListener("paste", e => {
      const imgs = [...(e.clipboardData || {}).files || []].filter(f => /^image\//.test(f.type));
      if (!imgs.length || !current() || (addFlow && addFlow.stage !== "pick")) return;
      e.preventDefault();
      openAdd(imgs.map((f, i) => new File([f], `pasted-${Date.now()}-${i}.png`, { type: f.type })));
    });
  }
  init();
})();

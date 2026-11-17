// Reading FM screenshots with OpenAI's vision models, for the web app, then turning what was read into observation
// files exactly like the ones AGENTS.md describes (saves/<save>/obs/*.csv, staff/*.csv).
// OpenAI refuses keyed requests straight from a web page, so they go through a small relay (relay/worker.js).
(function (root) {
  "use strict";

  const PLAYER_ABBR = {
    Acc: "Acceleration", Aer: "Aerial Reach", Agg: "Aggression", Agi: "Agility", Ant: "Anticipation", Bal: "Balance",
    Bra: "Bravery", Cmd: "Command of Area", Com: "Communication", Cmp: "Composure", Cnt: "Concentration", Cor: "Corners",
    Cro: "Crossing", Dec: "Decisions", Det: "Determination", Dri: "Dribbling", Ecc: "Eccentricity", Fin: "Finishing",
    Fir: "First Touch", Fla: "Flair", Fre: "Free Kick Taking", Han: "Handling", Hea: "Heading", Jum: "Jumping Reach",
    Kic: "Kicking", Ldr: "Leadership", Lon: "Long Shots", "L Th": "Long Throws", Mar: "Marking", Nat: "Natural Fitness",
    OtB: "Off The Ball", "1v1": "One on Ones", Pac: "Pace", Pas: "Passing", Pen: "Penalty Taking", Pos: "Positioning",
    Pun: "Punching (Tendency)", Ref: "Reflexes", TRO: "Rushing Out (Tendency)", Sta: "Stamina", Str: "Strength",
    Tck: "Tackling", Tea: "Teamwork", Tec: "Technique", Thr: "Throwing", Vis: "Vision", Wor: "Work Rate",
  };
  const STAFF_ABBR = {
    Det: "Determination", Mot: "Motivating", JCA: "Judging Player Ability", Mgm: "People Management", Auth: "Authority",
    TCo: "Tactical Knowledge", JPA: "Judging Player Potential", Tec: "Technical", Yng: "Working With Youngsters",
    Pos: "Possession", Tct: "Tactical", Att: "Attacking", Def: "Defending", Phy: "Physiotherapy", Fit: "Fitness",
    SpS: "Sports Science", "Ana D": "Analysing Data", Set: "Set Pieces", GK: "Goalkeeping",
  };
  const LEFT_FOOT = ["Very Weak", "Weak", "Reasonable", "Fairly Strong", "Strong", "Very Strong"];
  const PLAYER_META = ["Name", "Club", "Age", "Left Foot", "Wage", "Transfer Value", "Loan", "Minutes", "Rating", "Division"];
  const STAFF_META = ["Name", "Club", "Age", "Job", "Personality"];
  const LOAN = { blue: "in", red: "out", yellow: "trial" };

  // What the user says the screenshots are
  const KINDS = {
    squad: { label: "My squad", staff: false, squad: true },
    search: { label: "A player search or shortlist", staff: false, ask: "What's the search for? (e.g. cb, strikers, loans)" },
    league: { label: "A whole league (for the charts page)", staff: false },
    intake: { label: "My youth intake", staff: false },
    names: { label: "Players I've already added (just to see them together)", staff: false },
    staffclub: { label: "My club's staff", staff: true, squad: true },
    staffsearch: { label: "A staff search", staff: true, ask: "Which job? (e.g. coach, scout, physio)" },
  };
  const TEAMS = { "": "Whole club", "-first-team": "First team only", "-u21s": "U21s", "-u18s": "U18s", "-reserves": "Reserves" };

  const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const divisionSlug = d => slug(String(d).replace(/^Sky Bet /, ""));

  function columnsFor(weights, extraAttrs) {
    const attrs = new Set(Object.values(PLAYER_ABBR));
    const add = t => { for (const k of Object.keys(t || {})) attrs.add(k); };
    add(weights.gk); for (const t of Object.values(weights.outfield || {})) add(t);
    add(weights.win); add(weights.gk_pts); add(weights.curve);
    const staff = new Set(Object.values(STAFF_ABBR));
    for (const t of Object.values(weights.staff || {})) for (const k of Object.keys(t)) staff.add(k);
    for (const a of extraAttrs || []) attrs.add(a);
    return { player: [...attrs].sort(), staff: [...staff].sort() };
  }

  function prompt(kind, ctx) {
    const k = KINDS[kind];
    const lines = [
      "This is a screenshot from Football Manager 2027 showing a table of " + (k.staff ? "staff" : "players") + ".",
      `The user says it's: ${k.label}${ctx.label ? ` (${ctx.label})` : ""}. They manage ${ctx.managed}.`,
      "Read it exactly. Return:",
      "- is_fm: false if this isn't a Football Manager table at all.",
      "- game_date: FM's in-game date, shown at the top right, day first (30/6/2025 is 2025-06-30), as YYYY-MM-DD; null if it isn't visible.",
      "- top_left_club: the club named or shown by the crest at FM's far top-left, if you can tell; else null.",
      "- kind: \"gk\" if the columns are goalkeeping attributes (Handling, Reflexes, Aerial Reach…), \"staff\" for staff attributes, \"outfield\" for other player attributes, \"other\" otherwise.",
      "- columns: the table's columns left to right, each as one of the allowed names. FM abbreviates headers: map them to full names.",
      k.staff
        ? "  Staff headers: " + Object.entries(STAFF_ABBR).map(([a, b]) => `${a} ${b}`).join(", ") + ". Person or Name is Name; Preferred Job is Job."
        : "  Player headers: " + Object.entries(PLAYER_ABBR).map(([a, b]) => `${a} ${b}`).join(", ") + ". Player or Name is Name; Average Rating (Av Rat) is Rating; Mins is Minutes.",
      "  Use \"Other\" for any column not in the allowed list (Height, Position, Nationality, Status, a selection tick…).",
      "- rows: every visible row, top to bottom. cells has one entry per column, exactly as shown, in the same order: null for an empty cell.",
      "  Names exactly as shown, including a cut-off name's ellipsis (Antony Papadopoul…). Wages and values exactly as shown (£1.5K p/w, £16K - £150K, N/A).",
      k.staff
        ? "  Staff attributes are words: write them in full when cut off (Compe… is Competent, Very G… is Very Good). Expand a cut-off Job or Personality too."
        : "  Attributes are whole numbers 1–20; if FM shows a range (11-15) because the player isn't fully scouted, copy the range. Left Foot in full (Rea… is Reasonable); if it's cut off ambiguously (Ve…) copy it as shown.",
      "  name_colour: the colour of the row's name: blue, red, yellow, or normal (white/grey).",
      "  unsure: the indexes (0-based, into cells) of any cell you can't read confidently, e.g. small, blurred or covered text.",
      "Don't guess hidden rows or columns; a row cut off at the top or bottom edge can be left out.",
    ];
    return lines.join("\n");
  }

  function schema(cols) {
    return {
      type: "object", additionalProperties: false,
      required: ["is_fm", "game_date", "top_left_club", "kind", "columns", "rows"],
      properties: {
        is_fm: { type: "boolean" },
        game_date: { type: ["string", "null"] },
        top_left_club: { type: ["string", "null"] },
        kind: { type: "string", enum: ["outfield", "gk", "staff", "other"] },
        columns: { type: "array", items: { type: "string", enum: cols } },
        rows: {
          type: "array",
          items: {
            type: "object", additionalProperties: false, required: ["name_colour", "cells", "unsure"],
            properties: {
              name_colour: { type: "string", enum: ["normal", "blue", "red", "yellow"] },
              cells: { type: "array", items: { type: ["string", "null"] } },
              unsure: { type: "array", items: { type: "integer" } },
            },
          },
        },
      },
    };
  }

  // A data: URL for the image, re-encoded as JPEG only if it's very large
  async function imageUrl(file) {
    const read = blob => new Promise((ok, bad) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = bad; r.readAsDataURL(blob); });
    if (file.size < 12e6 || typeof createImageBitmap === "undefined") return read(file);
    const bmp = await createImageBitmap(file);
    const c = document.createElement("canvas");
    c.width = bmp.width; c.height = bmp.height;
    c.getContext("2d").drawImage(bmp, 0, 0);
    return c.toDataURL("image/jpeg", 0.92);
  }

  class ReadError extends Error {}

  /** Read one screenshot. Returns {result, usage, model}. */
  async function readImage({ file, kind, ctx, settings, columns, signal, fetchImpl }) {
    const relay = (settings.relayUrl || "").replace(/\/+$/, "");
    if (!relay) throw new ReadError("Add your relay's address in Settings first (see “Set up reading”).");
    if (!settings.apiKey) throw new ReadError("Add your OpenAI API key in Settings first.");
    const cols = ["Name", "Club", "Age", "Left Foot", "Wage", "Transfer Value", "Minutes", "Rating", "Division", "Job", "Personality",
                  ...(KINDS[kind].staff ? columns.staff : columns.player).filter(c => !["Name", "Club", "Age"].includes(c)), "Other"];
    const body = {
      model: settings.model || "gpt-6.1-terra",
      input: [{ role: "user", content: [
        { type: "input_text", text: prompt(kind, ctx) },
        { type: "input_image", image_url: await imageUrl(file), detail: "high" },
      ] }],
      text: { format: { type: "json_schema", name: "fm_screenshot", strict: true, schema: schema([...new Set(cols)]) } },
      max_output_tokens: 32000,
    };
    let res;
    try {
      res = await (fetchImpl || fetch)(relay + "/v1/responses", {
        method: "POST", signal,
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + settings.apiKey },
        body: JSON.stringify(body),
      });
    } catch (e) {
      if (e.name === "AbortError") throw e;
      throw new ReadError(`Couldn't reach your relay at ${relay}. Check its address in Settings.`);
    }
    const text = await res.text();
    let data = null;
    try { data = JSON.parse(text); } catch (e) { /* not JSON */ }
    if (!res.ok) {
      const msg = data && data.error && data.error.message ? data.error.message : text.slice(0, 200);
      if (res.status === 401) throw new ReadError("OpenAI didn't accept your API key. Check it in Settings.");
      if (res.status === 403 && /origin/i.test(text)) throw new ReadError("Your relay refused this page. Add this page's address to ALLOWED_ORIGINS in the relay.");
      if (res.status === 429) throw new ReadError("OpenAI says you're over your limit or out of credits: " + msg);
      if (res.status === 404 && /model/i.test(msg)) throw new ReadError(`OpenAI doesn't know the model "${body.model}". Pick another in Settings.`);
      throw new ReadError(`OpenAI said (${res.status}): ${msg}`);
    }
    const out = [];
    for (const item of (data && data.output) || []) for (const c of item.content || []) if (c.type === "output_text") out.push(c.text);
    if (data && data.status === "incomplete") throw new ReadError("The answer was cut short (the table may be too big): try a smaller screenshot.");
    const refusal = ((data && data.output) || []).flatMap(i => i.content || []).find(c => c.type === "refusal");
    if (refusal) throw new ReadError("OpenAI wouldn't read this one: " + refusal.refusal);
    let result;
    try { result = JSON.parse(out.join("")); } catch (e) { throw new ReadError("OpenAI's answer wasn't in the expected format. Try again."); }
    return { result, usage: data.usage || {}, model: data.model || body.model };
  }

  // --- turning a reading into rows ---

  const ELLIPSIS = /(…|\.\.\.)$/;
  function expand(value, options) {  // "Rea…" -> "Reasonable"; "" if it could be more than one
    const v = String(value || "").trim();
    if (!v) return { value: "", ok: true };
    const exact = options.find(o => o.toLowerCase() === v.toLowerCase());
    if (exact) return { value: exact, ok: true };
    const stem = v.replace(ELLIPSIS, "").trim().toLowerCase();
    const hits = stem ? options.filter(o => o.toLowerCase().startsWith(stem)) : [];
    return hits.length === 1 ? { value: hits[0], ok: true } : { value: "", ok: false };
  }

  /** Tidy and check one cell: {value, flag} where flag is "", "unsure" (couldn't be sure), "fixed" (expanded) or "bad". */
  function checkCell(c, raw, kind, ctx) {
    const k = KINDS[kind];
    let v = raw === null || raw === undefined ? "" : String(raw).trim(), flag = "";
    if (c === "Name") v = v.replace(/\.\.\.$/, "…");
    else if (c === "Club") { if (v === "-" || v === "–") v = k.staff ? "" : "Free agent"; }
    else if (c === "Age") { if (v && !/^\d+$/.test(v)) flag = "bad"; }
    else if (c === "Left Foot") {  // a cut-off "Ve…" could be Very Weak or Very Strong: leave it blank
      const e = expand(v, LEFT_FOOT);
      if (!e.ok) flag = ELLIPSIS.test(v) ? "unsure" : "bad";
      else if (e.value !== v) flag = "fixed";
      v = e.ok ? e.value : ELLIPSIS.test(v) ? "" : v;
    }
    else if (c === "Minutes") { v = v.replace(/[,\s]/g, ""); if (v === "-") v = ""; if (v && !/^\d+$/.test(v)) flag = "bad"; }
    else if (c === "Rating") { if (v === "-") v = ""; if (v && !/^\d+(\.\d+)?$/.test(v)) flag = "bad"; }
    else if (["Job", "Personality", "Division", "Wage", "Transfer Value", "Loan"].includes(c)) { /* as shown */ }
    else if (k.staff) {
      if (v) { const e = expand(v, Object.keys(ctx.staffWords || {})); if (!e.ok) flag = "bad"; else { if (e.value !== v) flag = "fixed"; v = e.value; } }
    } else if (v) {
      const range = /^(\d+)\s*[-–]\s*(\d+)$/.exec(v);
      if (range) { v = String(Math.round((+range[1] + +range[2]) / 2)); flag = "unsure"; }
      else if (!/^\d+$/.test(v) || +v < 1 || +v > 20) flag = "bad";
    }
    return { value: v, flag };
  }

  /** One screenshot's rows as {cells: {column: value}, flags: {column: "unsure"|"fixed"|"bad"}, colour, include, note}. */
  function rowsFrom(result, kind, ctx) {
    const k = KINDS[kind];
    const cols = result.columns || [];
    const rows = [];
    for (const r of result.rows || []) {
      const cells = {}, flags = {};
      cols.forEach((c, i) => {
        if (c === "Other") return;
        const { value, flag } = checkCell(c, r.cells[i], kind, ctx);
        cells[c] = value;
        if (flag) flags[c] = flag;
        if ((r.unsure || []).includes(i) && flags[c] !== "bad") flags[c] = "unsure";
      });
      if (!cells.Name) continue;
      if (k.squad) {  // squad screens: everyone's at the managed club, and the name's colour is the loan status
        cells.Club = ctx.managed;
        if (!k.staff) cells.Loan = LOAN[r.name_colour] || "";
      }
      rows.push({ cells, flags, colour: r.name_colour, include: true, note: "" });
    }
    // A goalkeeper in an outfield view (or an outfielder in a GK view) would be scored wrongly: leave them out by default
    if (!k.staff) for (const row of rows) {
      const c = row.cells, low = a => c[a] !== undefined && c[a] !== "" && +c[a] <= 4;
      if (result.kind === "outfield" && low("Finishing") && low("Tackling")) { row.include = false; row.note = "looks like a goalkeeper: use the GK view"; }
      if (result.kind === "gk" && low("Handling") && low("Reflexes")) { row.include = false; row.note = "looks like an outfield player"; }
    }
    return rows;
  }

  /** Group what was read into the files to write: [{name, folder: "obs"|"staff", date, source, view, rows, columns}].
   *  readings: [{result, rows, date (as read or as fixed by the user)}] */
  function plan(readings, kind, ctx) {
    const k = KINDS[kind];
    const groups = new Map();
    for (const rd of readings) {
      const view = k.staff ? null : rd.result.kind === "gk" ? "gk" : "outfield";
      for (const row of rd.rows) {
        if (!row.include) continue;
        let source;
        if (kind === "squad" || kind === "staffclub") source = slug(ctx.managed) + (ctx.team || "");
        else if (kind === "league") source = "search-" + (row.cells.Division ? divisionSlug(row.cells.Division) : slug(ctx.label || "league"));
        else if (kind === "intake") source = "search-youth-intake";
        else source = "search-" + (slug(ctx.label) || (k.staff ? "staff" : "players"));
        const name = k.staff ? `${rd.date}_${source}.csv` : `${rd.date}_${source}_${view}.csv`;
        if (!groups.has(name)) groups.set(name, { name, folder: k.staff ? "staff" : "obs", date: rd.date, source, view, rows: new Map(), columns: new Set() });
        const g = groups.get(name);
        const prev = g.rows.get(row.cells.Name) || {};
        const merged = { ...prev };
        for (const [c, v] of Object.entries(row.cells)) if (v !== "" || !(c in merged)) merged[c] = v;  // later screenshots fill gaps
        g.rows.set(row.cells.Name, merged);
        for (const c of Object.keys(row.cells)) g.columns.add(c);
      }
    }
    return [...groups.values()].map(g => {
      const meta = k.staff ? STAFF_META : PLAYER_META;
      const columns = [...meta.filter(c => g.columns.has(c) || (!k.staff && ["Name", "Club", "Age"].includes(c))),
                       ...[...g.columns].filter(c => !meta.includes(c))];
      if (!k.staff && !k.squad) { const i = columns.indexOf("Loan"); if (i >= 0) columns.splice(i, 1); }  // only squad screens show loans
      return { ...g, columns, rows: [...g.rows.values()].map(r => Object.fromEntries(columns.map(c => [c, r[c] ?? ""]))) };
    });
  }

  /** Merge planned rows into an existing file's rows (same date, source and view): by name, new values win. */
  function mergeFile(existing, planned) {
    if (!existing) return { columns: planned.columns, rows: planned.rows };
    const columns = [...existing.columns];
    for (const c of planned.columns) if (!columns.includes(c)) columns.push(c);
    const byName = new Map(existing.rows.map(r => [r.Name, { ...r }]));
    for (const r of planned.rows) {
      const cur = byName.get(r.Name) || {};
      for (const [c, v] of Object.entries(r)) if (v !== "" || !(c in cur)) cur[c] = v;
      byName.set(r.Name, cur);
    }
    return { columns, rows: [...byName.values()].map(r => Object.fromEntries(columns.map(c => [c, r[c] ?? ""]))) };
  }

  // Rough cost from the usage OpenAI reports; prices per million tokens (input, output) from OpenAI's pricing page, Nov 2026
  const PRICES = { "gpt-6.1-terra": [0.5, 2.5], "gpt-6-luna": [0.05, 0.25], "gpt-6.1-sol": [2, 10], "gpt-6.2-sol": [2, 10] };
  function cost(model, usage) {
    const key = Object.keys(PRICES).find(m => String(model).startsWith(m));
    if (!key || !usage) return null;
    return ((usage.input_tokens || 0) * PRICES[key][0] + (usage.output_tokens || 0) * PRICES[key][1]) / 1e6;
  }

  const api = { KINDS, TEAMS, LEFT_FOOT, PLAYER_ABBR, STAFF_ABBR, ReadError, slug, columnsFor, checkCell, prompt, schema, readImage, rowsFrom, plan, mergeFile, cost, expand, PRICES };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.FMRead = api;
})(typeof self !== "undefined" ? self : globalThis);

// node test/run_scoring.js input.json output.json: app/scoring.js's build() on files score.py would read
const fs = require("fs"), path = require("path");
const TOML = require("../app/toml.js"), S = require("../app/scoring.js");
const [inp, outp] = process.argv.slice(2);
const spec = JSON.parse(fs.readFileSync(inp, "utf8"));
function csv(text) {  // RFC 4180, as Python's csv.DictReader
  const rows = []; let row = [], f = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(f); f = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(f); rows.push(row); row = []; f = ""; }
    else f += c;
  }
  if (f !== "" || row.length) { row.push(f); rows.push(row); }
  const [head, ...body] = rows.filter(r => r.length > 1 || r[0] !== "");
  return body.map(r => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ""])));
}
const files = dir => fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith(".csv")).map(f => ({ name: f, rows: csv(fs.readFileSync(path.join(dir, f), "utf8")) })) : [];
const built = S.build({
  cfg: TOML.parse(fs.readFileSync(spec.save_toml, "utf8")),
  weights: TOML.parse(fs.readFileSync(spec.weights, "utf8")),
  obs: files(spec.obs), staff: files(spec.staff), leagues: files(spec.leagues),
  history: spec.history.map(t => TOML.parse(t)),
});
fs.writeFileSync(outp, JSON.stringify({ pages: built.pages, errors: built.errors }));

// A small TOML reader for this project's files (weights/*.toml, saves/*/save.toml, config.toml): tables, dotted and
// quoted keys, strings, numbers, booleans, arrays (over several lines too) and inline tables. No dates or multi-line strings.
// Every table remembers its keys in file order (okeys), since JavaScript objects put number-like keys ("6", "10") first.
(function (root) {
  "use strict";

  function table() {
    const t = {};
    Object.defineProperty(t, "__order", { value: [], enumerable: false });
    return t;
  }
  function set(t, k, v) {
    if (!(k in t)) t.__order.push(k);
    t[k] = v;
  }
  function okeys(o) {
    return o && o.__order ? o.__order.filter(k => k in o) : Object.keys(o || {});
  }
  function oentries(o) {
    return okeys(o).map(k => [k, o[k]]);
  }

  function parse(text) {
    let i = 0;
    const n = text.length;
    const fail = msg => {
      const line = text.slice(0, i).split("\n").length;
      throw new Error(`TOML line ${line}: ${msg}`);
    };
    const skipWs = () => { while (i < n && (text[i] === " " || text[i] === "\t")) i++; };
    const skipComment = () => { if (text[i] === "#") while (i < n && text[i] !== "\n") i++; };
    const skipAll = () => {  // whitespace, newlines and comments: inside arrays
      for (;;) {
        skipWs(); skipComment();
        if (text[i] === "\n" || text[i] === "\r") { i++; continue; }
        break;
      }
    };
    const endLine = () => {
      skipWs(); skipComment();
      if (i < n && text[i] !== "\n" && text[i] !== "\r") fail(`unexpected ${JSON.stringify(text[i])}`);
    };

    function string() {
      const q = text[i];
      if (text.startsWith(q.repeat(3), i)) fail("multi-line strings aren't supported");
      i++;
      let s = "";
      if (q === "'") {
        while (i < n && text[i] !== "'") { if (text[i] === "\n") fail("unterminated string"); s += text[i++]; }
        i++;
        return s;
      }
      let raw = "";
      while (i < n && text[i] !== '"') {
        if (text[i] === "\n") fail("unterminated string");
        if (text[i] === "\\") { raw += text[i++]; }
        raw += text[i++];
      }
      i++;
      raw = raw.replace(/\\U([0-9a-fA-F]{8})/g, (_, h) => String.fromCodePoint(parseInt(h, 16)));
      try { return JSON.parse('"' + raw + '"'); } catch (e) { fail("bad string escape"); }
    }
    function key() {
      skipWs();
      const parts = [];
      for (;;) {
        skipWs();
        if (text[i] === '"' || text[i] === "'") parts.push(string());
        else {
          const m = /^[A-Za-z0-9_-]+/.exec(text.slice(i, i + 200));
          if (!m) fail("expected a key");
          parts.push(m[0]); i += m[0].length;
        }
        skipWs();
        if (text[i] === ".") { i++; continue; }
        return parts;
      }
    }
    function value() {
      skipWs();
      const c = text[i];
      if (c === '"' || c === "'") return string();
      if (c === "[") {
        i++;
        const arr = [];
        for (;;) {
          skipAll();
          if (text[i] === "]") { i++; return arr; }
          arr.push(value());
          skipAll();
          if (text[i] === ",") { i++; continue; }
          if (text[i] === "]") { i++; return arr; }
          fail("expected , or ] in an array");
        }
      }
      if (c === "{") {
        i++;
        const t = table();
        skipWs();
        if (text[i] === "}") { i++; return t; }
        for (;;) {
          const k = key();
          skipWs();
          if (text[i] !== "=") fail("expected =");
          i++;
          assign(t, k, value());
          skipWs();
          if (text[i] === ",") { i++; continue; }
          if (text[i] === "}") { i++; return t; }
          fail("expected , or } in an inline table");
        }
      }
      const m = /^(true|false|[+-]?(inf|nan)|[+-]?[0-9_]+(\.[0-9_]+)?([eE][+-]?[0-9_]+)?)/.exec(text.slice(i, i + 100));
      if (!m) fail("expected a value");
      i += m[0].length;
      if (m[0] === "true") return true;
      if (m[0] === "false") return false;
      if (/inf/.test(m[0])) return m[0][0] === "-" ? -Infinity : Infinity;
      if (/nan/.test(m[0])) return NaN;
      return Number(m[0].replace(/_/g, ""));
    }
    function descend(t, parts) {
      for (const p of parts) {
        if (!(p in t)) set(t, p, table());
        t = t[p];
        if (typeof t !== "object" || Array.isArray(t)) fail(`${parts.join(".")} isn't a table`);
      }
      return t;
    }
    function assign(t, parts, v) {
      const last = parts[parts.length - 1];
      const target = descend(t, parts.slice(0, -1));
      if (last in target) fail(`${parts.join(".")} is set twice`);
      set(target, last, v);
    }

    const out = table();
    let cur = out;
    while (i < n) {
      skipAll();
      if (i >= n) break;
      if (text[i] === "[") {
        if (text[i + 1] === "[") fail("arrays of tables aren't supported");
        i++;
        const parts = key();
        skipWs();
        if (text[i] !== "]") fail("expected ]");
        i++;
        cur = descend(out, parts);
        endLine();
        continue;
      }
      const k = key();
      skipWs();
      if (text[i] !== "=") fail("expected =");
      i++;
      assign(cur, k, value());
      endLine();
    }
    return out;
  }

  // Writing: enough for save.toml and config.toml (top-level scalars and arrays, then tables of strings)
  function str(s) { return JSON.stringify(String(s)); }
  function bare(k) { return /^[A-Za-z0-9_-]+$/.test(k) ? k : str(k); }
  function val(v) {
    if (Array.isArray(v)) return "[" + v.map(val).join(", ") + "]";
    if (typeof v === "string") return str(v);
    if (typeof v === "boolean" || typeof v === "number") return String(v);
    throw new Error("can't write " + typeof v + " to TOML");
  }
  function stringify(obj, header) {
    const lines = header ? [header] : [];
    const tables = [];
    for (const [k, v] of oentries(obj)) {
      if (v === undefined || v === null) continue;
      if (typeof v === "object" && !Array.isArray(v)) tables.push([k, v]);
      else lines.push(`${bare(k)} = ${val(v)}`);
    }
    for (const [k, v] of tables) {
      lines.push("", `[${bare(k)}]`);
      for (const [k2, v2] of oentries(v)) lines.push(`${bare(k2)} = ${val(v2)}`);
    }
    return lines.join("\n") + "\n";
  }

  const api = { parse, stringify, okeys, oentries, table, set };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.TOML = api;
})(typeof self !== "undefined" ? self : globalThis);

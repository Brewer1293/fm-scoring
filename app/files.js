// CSV (as Python's csv module reads and writes it), a tiny ZIP writer (stored, no compression), and IndexedDB storage.
(function (root) {
  "use strict";

  function parseCsv(text) {
    text = text.replace(/^﻿/, "");
    const rows = [];
    let row = [], f = "", q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c;
      } else if (c === '"') q = true;
      else if (c === ",") { row.push(f); f = ""; }
      else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(f); rows.push(row); row = []; f = ""; }
      else f += c;
    }
    if (f !== "" || row.length) { row.push(f); rows.push(row); }
    const kept = rows.filter(r => r.length > 1 || r[0] !== "");
    if (!kept.length) return { columns: [], rows: [] };
    const [columns, ...body] = kept;
    return { columns, rows: body.map(r => Object.fromEntries(columns.map((h, i) => [h, r[i] ?? ""]))) };
  }

  function toCsv(columns, rows) {
    const cell = v => { v = v === null || v === undefined ? "" : String(v); return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    return [columns.map(cell).join(","), ...rows.map(r => columns.map(c => cell(r[c])).join(","))].join("\n") + "\n";
  }

  // ZIP, stored: enough for a folder of CSVs that the Python version can use
  const CRC = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    return t;
  })();
  const crc32 = b => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  function zip(files) {  // [{path, text} or {path, bytes: Uint8Array}] -> Blob
    const enc = new TextEncoder(), parts = [], central = [];
    let offset = 0;
    const d = new Date(), dosTime = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    const dosDate = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    for (const f of files) {
      const name = enc.encode(f.path), data = f.bytes || enc.encode(f.text), crc = crc32(data);
      const local = new DataView(new ArrayBuffer(30));
      [[0, 0x04034b50, 4], [4, 20, 2], [6, 0x0800, 2], [8, 0, 2], [10, dosTime, 2], [12, dosDate, 2], [14, crc, 4],
       [18, data.length, 4], [22, data.length, 4], [26, name.length, 2], [28, 0, 2]]
        .forEach(([o, v, s]) => (s === 4 ? local.setUint32(o, v, true) : local.setUint16(o, v, true)));
      const cen = new DataView(new ArrayBuffer(46));
      [[0, 0x02014b50, 4], [4, 20, 2], [6, 20, 2], [8, 0x0800, 2], [10, 0, 2], [12, dosTime, 2], [14, dosDate, 2], [16, crc, 4],
       [20, data.length, 4], [24, data.length, 4], [28, name.length, 2], [30, 0, 2], [32, 0, 2], [34, 0, 2], [36, 0, 2],
       [38, 0, 4], [42, offset, 4]].forEach(([o, v, s]) => (s === 4 ? cen.setUint32(o, v, true) : cen.setUint16(o, v, true)));
      parts.push(local, name, data);
      central.push(cen, name);
      offset += 30 + name.length + data.length;
    }
    const size = central.reduce((s, p) => s + p.byteLength, 0);
    const end = new DataView(new ArrayBuffer(22));
    [[0, 0x06054b50, 4], [8, files.length, 2], [10, files.length, 2], [12, size, 4], [16, offset, 4]]
      .forEach(([o, v, s]) => (s === 4 ? end.setUint32(o, v, true) : end.setUint16(o, v, true)));
    return new Blob([...parts, ...central, end], { type: "application/zip" });
  }

  // IndexedDB: one record holding everything. Falls back to memory (with a warning) where storage is unavailable.
  const DB = "fm-scoring", STORE = "kv";
  let memory = null;
  function open() {
    return new Promise((ok, bad) => {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => ok(req.result);
      req.onerror = () => bad(req.error);
    });
  }
  async function load() {
    try {
      const db = await open();
      return await new Promise((ok, bad) => {
        const r = db.transaction(STORE).objectStore(STORE).get("state");
        r.onsuccess = () => ok(r.result || null); r.onerror = () => bad(r.error);
      });
    } catch (e) { return memory; }
  }
  async function save(state) {
    try {
      const db = await open();
      await new Promise((ok, bad) => {
        const tx = db.transaction(STORE, "readwrite");
        tx.objectStore(STORE).put(state, "state");
        tx.oncomplete = ok; tx.onerror = () => bad(tx.error);
      });
      return true;
    } catch (e) { memory = state; return false; }
  }

  function download(name, blob) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  }

  const api = { parseCsv, toCsv, zip, crc32, load, save, download };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.FMFiles = api;
})(typeof self !== "undefined" ? self : globalThis);

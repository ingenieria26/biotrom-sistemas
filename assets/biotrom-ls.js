/* BIOTROM — memoria del navegador (localStorage) sin quedarse sin lugar.
   Todas las herramientas del sitio comparten 5 MB. Este modulo comprime solo los datos grandes de btmp2_* al guardarlos
   y los descomprime al leerlos, de forma transparente: el resto del codigo sigue usando localStorage.getItem/setItem igual.
   - Compresion LZW sin perdida (se verifica antes de guardar; si algo no coincide se guarda sin comprimir).
   - Lo que ya estaba guardado sin comprimir se sigue leyendo normal y se comprime en el proximo guardado.
   - window.__lsRawLen(clave) = caracteres que ocupa realmente una clave. */
(function () {
  "use strict";
  if (window.__bioLS) return;
  var ST = window.Storage && Storage.prototype, LS;
  try { LS = window.localStorage; } catch (e) { return; }
  if (!ST || !LS) return;
  var gi = ST.getItem, si = ST.setItem;
  var PFX = "\u0001Z", MIN = 20000, MAXC = 50000, END = 50000, BLK = 150000, OFF = 0x100;
  var cache = {};

  function ch(v) { return String.fromCharCode(v + OFF); }
  function comp(s) {
    var n = s.length, idx = new Map(), al = [], i, c, out = [], A;
    for (i = 0; i < n; i++) { c = s.charCodeAt(i); if (!idx.has(c)) { idx.set(c, al.length); al.push(c); } }
    A = al.length;
    if (A > 20000) throw new Error("alfabeto");
    out.push(ch(A >> 8), ch(A & 255));
    for (i = 0; i < A; i++) out.push(ch(al[i] >> 8), ch(al[i] & 255));
    for (var b = 0; b < n; b += BLK) {
      var e = Math.min(n, b + BLK), d = new Map(), next = A, w = idx.get(s.charCodeAt(b));
      for (i = b + 1; i < e; i++) {
        var ci = idx.get(s.charCodeAt(i)), key = w * A + ci, f = d.get(key);
        if (f !== undefined) w = f;
        else { out.push(ch(w)); if (next < MAXC) d.set(key, next++); w = ci; }
      }
      out.push(ch(w), ch(END));
    }
    return out.join("");
  }
  function decomp(t) {
    var p = 0, A = ((t.charCodeAt(p++) - OFF) << 8) | (t.charCodeAt(p++) - OFF), al = [], i, out = [];
    for (i = 0; i < A; i++) { al.push(String.fromCharCode(((t.charCodeAt(p++) - OFF) << 8) | (t.charCodeAt(p++) - OFF))); }
    var n = t.length;
    while (p < n) {
      var tab = [], next = A, prev = null;
      for (;;) {
        var code = t.charCodeAt(p++) - OFF;
        if (code === END) break;
        var en;
        if (code < A) en = al[code];
        else if (code < next) en = tab[code - A];
        else en = prev + prev.charAt(0);
        out.push(en);
        if (prev !== null && next < MAXC) { tab[next - A] = prev + en.charAt(0); next++; }
        prev = en;
        if (p >= n) break;
      }
    }
    return out.join("");
  }

  ST.getItem = function (k) {
    var v = gi.call(this, k);
    if (this === LS && v && v.charCodeAt(0) === 1 && v.charCodeAt(1) === 90) {
      var c = cache[k];
      if (c && c.c === v) return c.v;
      try { var r = decomp(v.slice(2)); cache[k] = { c: v, v: r }; return r; } catch (e) { return null; }
    }
    return v;
  };
  ST.setItem = function (k, v) {
    if (this === LS && typeof v === "string" && v.length > MIN && /^btmp2_/.test(k)) {
      var z = null;
      try {
        var t = comp(v);
        if (t.length + 2 < v.length * 0.85 && decomp(t) === v) z = PFX + t;
      } catch (e) { z = null; }
      if (z) { si.call(this, k, z); cache[k] = { c: z, v: v }; return; }
    }
    delete cache[k];
    return si.call(this, k, v);
  };
  var rm = ST.removeItem;
  ST.removeItem = function (k) { if (this === LS) delete cache[k]; return rm.call(this, k); };

  /* Lo que ya estaba guardado sin comprimir se comprime una vez, al abrir la herramienta (libera lugar enseguida). */
  setTimeout(function () {
    try {
      var ks = [], i;
      for (i = 0; i < LS.length; i++) ks.push(LS.key(i));
      ks.forEach(function (k) {
        if (!/^btmp2_/.test(k)) return;
        var v = gi.call(LS, k);
        if (v && v.length > MIN && v.charCodeAt(0) !== 1) { try { ST.setItem.call(LS, k, v); } catch (e) {} }
      });
    } catch (e) {}
  }, 2500);

  window.__lsRawLen = function (k) { var v = gi.call(LS, k); return String(k).length + (v ? v.length : 0); };
  window.__bioLS = { comp: comp, decomp: decomp };
})();

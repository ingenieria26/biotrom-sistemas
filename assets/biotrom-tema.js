// ══════════════════════════════════════════════════════
// BIOTROM · botón para ver las herramientas en claro u oscuro.
// Una sola elección para todas (se guarda en "biotrom-theme", la misma clave
// que ya usaba el Panel Ejecutivo: "light" / "dark").
//
// · Si la página trae sus dos versiones (<html data-bt-tema>), solo se le avisa
//   cuál usar con html[data-tema=light|dark] y la página pone su paleta.
// · Si la página es clara de origen, el modo oscuro se arma solo: se recorren sus
//   estilos (hojas y estilos sueltos de cada elemento) y los fondos claros pasan a
//   los grises oscuros del Panel, los textos oscuros a claros y los bordes claros a
//   oscuros. Los colores con significado (rojo, verde, ámbar…) se conservan.
// · Solo si la página es oscura de origen y no trae versión clara, se invierten colores.
// Uso: <script src="../assets/biotrom-tema.js"></script> antes de </body>.
// ══════════════════════════════════════════════════════
(function () {
  if (document.getElementById('theme-toggle')) return;   // la herramienta ya trae su propio botón (Panel Ejecutivo)
  var KEY = 'biotrom-theme', H = document.documentElement;
  function leer() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function guardar(v) { try { localStorage.setItem(KEY, v); } catch (e) { } }

  // ---------- colores ----------
  function rgba(c) {
    var m = String(c || '').match(/rgba?\(([^)]+)\)/); if (!m) return null;
    var p = m[1].split(/[ ,/]+/).filter(Boolean).map(parseFloat);
    return p.length >= 3 ? [p[0], p[1], p[2], p.length > 3 ? p[3] : 1] : null;
  }
  function lum(c) { return (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255; }
  function hsl(c) {
    var r = c[0] / 255, g = c[1] / 255, b = c[2] / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, h = 0, s = 0, d = mx - mn;
    if (d) { s = d / (1 - Math.abs(2 * l - 1)); h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; if (h < 0) h += 360; }
    return [h, s, l];
  }
  function css(h, s, l, a) { return 'hsla(' + Math.round(h) + ',' + Math.round(s * 100) + '%,' + Math.round(l * 100) + '%,' + (a == null ? 1 : a) + ')'; }
  var P = { bg: '#0D1117', s1: '#161B22', s2: '#1C2128', s3: '#21262D', b: '#30363D', t: '#E6EDF3', t2: '#8B949E' };
  // fondo claro -> oscuro (los tintes se conservan apagados)
  function fondoOscuro(c, raiz) {
    if (!c || c[3] < 0.35) return null;
    var L = lum(c), x = hsl(c);
    if (L < 0.62) return null;                                    // ya es oscuro o es un color fuerte (botones): se deja
    if (x[1] > 0.25 && L < 0.97) return css(x[0], Math.min(0.55, x[1]), 0.2, 0.9);   // tinte claro (rojo, verde, azul suave)
    if (raiz) return P.bg;
    return L > 0.975 ? P.s1 : L > 0.93 ? P.s2 : P.s3;
  }
  // texto oscuro -> claro; texto de color -> el mismo color más luminoso
  function textoClaro(c) {
    if (!c) return null;
    var L = lum(c), x = hsl(c);
    if (L > 0.6) return null;
    if (x[1] > 0.3) return css(x[0], Math.min(0.85, x[1]), 0.68, c[3]);
    return L < 0.3 ? P.t : P.t2;
  }
  function bordeOscuro(c) { if (!c || c[3] < 0.2) return null; return lum(c) > 0.7 ? (hsl(c)[1] > 0.3 ? css(hsl(c)[0], 0.4, 0.3) : P.b) : null; }

  var base = rgba(getComputedStyle(document.body).backgroundColor) || rgba(getComputedStyle(H).backgroundColor) || [255, 255, 255, 1];
  if (base[3] === 0) base = [255, 255, 255, 1];
  var nativo = lum(base) < 0.45 ? 'dark' : 'light';
  var propio = H.hasAttribute('data-bt-tema');

  // ---------- modo oscuro armado a partir de los estilos de la página ----------
  var probe = document.createElement('div'); probe.id = 'bt-probe'; probe.style.display = 'none';
  function aRGBA(v) { if (!v) return null; probe.style.color = ''; probe.style.color = v; return probe.style.color ? rgba(getComputedStyle(probe).color) : null; }
  function prefijo(sel) {
    return sel.split(',').map(function (x) {
      x = x.trim(); if (!x) return x;
      if (/^:root\b/.test(x)) return x.replace(/^:root/, 'html[data-tema=dark]');
      if (/^html\b/.test(x)) return x.replace(/^html/, 'html[data-tema=dark]');
      return 'html[data-tema=dark] ' + x;
    }).join(',');
  }
  function reglas(lista, out, n) {
    for (var i = 0; i < lista.length && n.c < 20000; i++) {
      var r = lista[i]; n.c++;
      if (r.cssRules && r.media) { if (!/print/.test(r.media.mediaText)) reglas(r.cssRules, out, n); continue; }
      if (r.cssRules && !r.style) { reglas(r.cssRules, out, n); continue; }
      if (!r.style || !r.selectorText || r.selectorText.indexOf('data-tema') >= 0 || r.selectorText.indexOf('#bt-tema') >= 0) continue;
      var st = r.style, d = [], raiz = /(^|,)\s*(html|body|:root)\s*(,|$)/.test(r.selectorText);
      var bg = fondoOscuro(aRGBA(st.backgroundColor), raiz); if (bg) d.push('background-color:' + bg);
      if (/gradient/.test(st.backgroundImage || '') && !bg) {
        var g = (st.backgroundImage.match(/rgba?\([^)]+\)|#[0-9a-f]{3,8}\b/gi) || []).map(aRGBA).filter(Boolean);
        if (g.length && g.every(function (c) { return lum(c) > 0.8; })) d.push('background-image:none;background-color:' + P.s2);
      }
      var tx = textoClaro(aRGBA(st.color)); if (tx) d.push('color:' + tx);
      ['Top', 'Right', 'Bottom', 'Left'].forEach(function (s) { var b = bordeOscuro(aRGBA(st['border' + s + 'Color'])); if (b) d.push('border-' + s.toLowerCase() + '-color:' + b); });
      var ol = bordeOscuro(aRGBA(st.outlineColor)); if (ol) d.push('outline-color:' + ol);
      for (var k = 0; k < st.length; k++) {   // variables de color definidas en la página (--bg, --text, …)
        var nm = st[k]; if (nm.indexOf('--') !== 0) continue;
        var c = aRGBA(st.getPropertyValue(nm).trim()); if (!c) continue;
        var v = lum(c) > 0.62 ? (/bord|line|dim$/.test(nm) ? bordeOscuro(c) || fondoOscuro(c, false) : fondoOscuro(c, /^--(bg|background)$/.test(nm))) : textoClaro(c);
        if (v) d.push(nm + ':' + v);
      }
      if (d.length) out.push(prefijo(r.selectorText) + '{' + d.map(function (x) { return x + '!important'; }).join(';') + '}');
    }
  }
  var hoja = null;
  function armarHoja() {
    if (!probe.parentNode) document.body.appendChild(probe);
    var out = ['html[data-tema=dark]{color-scheme:dark;background:' + P.bg + '!important}',
      'html[data-tema=dark] body{background-color:' + P.bg + '!important;color:' + P.t + '}',
      'html[data-tema=dark] input,html[data-tema=dark] select,html[data-tema=dark] textarea{background-color:' + P.s2 + ';color:' + P.t + ';border-color:' + P.b + '}',
      'html[data-tema=dark] ::placeholder{color:' + P.t2 + '!important}',
      'html[data-tema=dark] img[src*="logo"]{background:#fff;border-radius:6px}'], n = { c: 0 };
    for (var i = 0; i < document.styleSheets.length; i++) {
      var sh = document.styleSheets[i]; if (sh.ownerNode && sh.ownerNode.id === 'bt-oscuro') continue;
      try { reglas(sh.cssRules, out, n); } catch (e) { }   // hojas de otros sitios (fuentes) no se pueden leer: se saltean
    }
    if (!hoja) { hoja = document.createElement('style'); hoja.id = 'bt-oscuro'; document.head.appendChild(hoja); }
    hoja.textContent = out.join('\n');
  }
  // estilos sueltos de cada elemento (style="…"): se guardan los originales para volver al claro
  function inline(el) {
    if (!el.getAttribute || el.id === 'bt-tema' || el.id === 'bt-probe') return;
    if (!probe.parentNode) document.body.appendChild(probe);
    var s = el.getAttribute('style'); if (!s || el._btHecho === s) return;
    if (el._btOrig == null || el._btHecho !== s) el._btOrig = s;
    var st = el.style, cambio = false;
    var bg = fondoOscuro(aRGBA(st.backgroundColor), false); if (bg) { st.setProperty('background-color', bg, 'important'); cambio = true; }
    if (/gradient/.test(st.backgroundImage || '')) {
      var g = (st.backgroundImage.match(/rgba?\([^)]+\)|#[0-9a-f]{3,8}\b/gi) || []).map(aRGBA).filter(Boolean);
      if (g.length && g.every(function (c) { return lum(c) > 0.8; })) { st.setProperty('background-image', 'none', 'important'); st.setProperty('background-color', P.s2, 'important'); cambio = true; }
    }
    var tx = textoClaro(aRGBA(st.color)); if (tx) { st.setProperty('color', tx, 'important'); cambio = true; }
    ['top', 'right', 'bottom', 'left'].forEach(function (sd) { var b = bordeOscuro(aRGBA(st.getPropertyValue('border-' + sd + '-color'))); if (b) { st.setProperty('border-' + sd + '-color', b, 'important'); cambio = true; } });
    el._btHecho = el.getAttribute('style');
    if (!cambio) el._btOrig = null;
  }
  function inlineTodo(raiz) { (raiz.querySelectorAll ? raiz.querySelectorAll('[style]') : []).forEach(inline); if (raiz.getAttribute && raiz.getAttribute('style')) inline(raiz); }
  function inlineDeshacer() { document.querySelectorAll('[style]').forEach(function (el) { if (el._btOrig != null) { el.setAttribute('style', el._btOrig); el._btOrig = null; el._btHecho = null; } }); }
  var obs = null, pend = [], tmr = null;
  function observar(on) {
    if (on && !obs) {
      obs = new MutationObserver(function (ms) {
        ms.forEach(function (m) { if (m.type === 'attributes') pend.push(m.target); else m.addedNodes.forEach(function (x) { if (x.nodeType === 1) pend.push(x); }); });
        clearTimeout(tmr); tmr = setTimeout(function () { var l = pend; pend = []; l.forEach(inlineTodo); }, 60);
      });
      obs.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] });
    } else if (!on && obs) { obs.disconnect(); obs = null; }
  }
  var armada = false;
  function oscuroPropio(on) {
    if (on) {
      if (!armada) { armarHoja(); armada = true; setTimeout(armarHoja, 1500); }   // segunda pasada: estilos que se agregan después de cargar (Tailwind, tablas)
      inlineTodo(document.body); observar(true);
    } else { observar(false); inlineDeshacer(); }
  }

  // ---------- botón ----------
  var est = document.createElement('style');
  est.id = 'bt-tema-css';
  est.textContent =
    'html.bt-inv{filter:invert(1) hue-rotate(180deg);background:rgb(' + base.slice(0, 3).join(',') + ')}' +
    'html.bt-inv img,html.bt-inv video,html.bt-inv picture,html.bt-inv canvas,html.bt-inv iframe,html.bt-inv embed,html.bt-inv object,' +
    'html.bt-inv svg image,html.bt-inv [style*="background-image"]{filter:invert(1) hue-rotate(180deg)}' +
    '#bt-tema{position:fixed;left:14px;bottom:14px;z-index:99999;width:40px;height:40px;border-radius:50%;border:1px solid #cbd5e1;' +
    'background:#fff;box-shadow:0 4px 14px rgba(15,23,42,.18);cursor:pointer;font-size:18px;line-height:1;display:flex;align-items:center;justify-content:center;padding:0}' +
    'html[data-tema=dark] #bt-tema{background:#21262D!important;border-color:#30363D!important}' +
    '#bt-tema:hover{transform:scale(1.06)}' +
    '@media print{#bt-tema{display:none}html.bt-inv{filter:none}}';
  document.head.appendChild(est);

  var btn = document.createElement('button');
  btn.id = 'bt-tema'; btn.type = 'button';
  function aplicar() {
    var elegido = leer() || nativo;
    var auto = !propio && nativo === 'light';            // página clara sin versión oscura: se arma sola
    if (propio || auto) H.setAttribute('data-tema', elegido); else H.removeAttribute('data-tema');
    if (auto) oscuroPropio(elegido === 'dark');
    var inv = !propio && !auto && elegido !== nativo;     // solo páginas oscuras sin versión clara
    H.classList.toggle('bt-inv', inv);
    btn.textContent = elegido === 'dark' ? '☀️' : '🌙';
    btn.title = elegido === 'dark' ? 'Ver en claro' : 'Ver en oscuro';
    btn.style.filter = inv ? 'invert(1) hue-rotate(180deg)' : '';
  }
  btn.onclick = function () { guardar((leer() || nativo) === 'dark' ? 'light' : 'dark'); aplicar(); };
  document.body.appendChild(btn);
  aplicar();
  window.addEventListener('storage', function (e) { if (e.key === KEY) aplicar(); });
})();

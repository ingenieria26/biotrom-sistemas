// ══════════════════════════════════════════════════════
// BIOTROM · botón para ver las herramientas en claro u oscuro.
// Una sola elección para todas (se guarda en "biotrom-theme", la misma clave
// que ya usaba el Panel Ejecutivo: "light" / "dark").
// Cada herramienta tiene su diseño original (unas claras, otras oscuras):
// este script detecta cuál es y, si no coincide con lo elegido, invierte los
// colores de la página. Fotos, gráficos, PDFs e iframes se vuelven a invertir
// para que se vean como siempre.
// Uso: <script src="../assets/biotrom-tema.js"></script> antes de </body>.
// ══════════════════════════════════════════════════════
(function () {
  if (document.getElementById('theme-toggle')) return;   // la herramienta ya trae su propio botón (Panel Ejecutivo)
  var KEY = 'biotrom-theme';
  function leer() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function guardar(v) { try { localStorage.setItem(KEY, v); } catch (e) { } }

  function rgb(c) {
    var m = String(c || '').match(/[\d.]+/g);
    if (!m || m.length < 3 || (m.length >= 4 && +m[3] === 0)) return null;
    return m.slice(0, 3).map(Number);
  }
  // diseño original de la página: claro u oscuro, según el color de fondo
  function fondo() {
    return rgb(getComputedStyle(document.body).backgroundColor) || rgb(getComputedStyle(document.documentElement).backgroundColor) || [255, 255, 255];
  }
  var base = fondo();
  var nativo = (0.299 * base[0] + 0.587 * base[1] + 0.114 * base[2]) / 255 < 0.45 ? 'dark' : 'light';

  var css = document.createElement('style');
  css.id = 'bt-tema-css';
  css.textContent =
    'html.bt-inv{filter:invert(1) hue-rotate(180deg);background:rgb(' + base.join(',') + ')}' +
    'html.bt-inv img,html.bt-inv video,html.bt-inv picture,html.bt-inv canvas,html.bt-inv iframe,html.bt-inv embed,html.bt-inv object,' +
    'html.bt-inv svg image,html.bt-inv [style*="background-image"]{filter:invert(1) hue-rotate(180deg)}' +
    '#bt-tema{position:fixed;left:14px;bottom:14px;z-index:99999;width:40px;height:40px;border-radius:50%;border:1px solid #cbd5e1;' +
    'background:#fff;box-shadow:0 4px 14px rgba(15,23,42,.18);cursor:pointer;font-size:18px;line-height:1;display:flex;align-items:center;justify-content:center;padding:0}' +
    '#bt-tema:hover{transform:scale(1.06)}' +
    '@media print{#bt-tema{display:none}html.bt-inv{filter:none}}';
  document.head.appendChild(css);

  var btn = document.createElement('button');
  btn.id = 'bt-tema'; btn.type = 'button';
  function aplicar() {
    var elegido = leer() || nativo;
    document.documentElement.classList.toggle('bt-inv', elegido !== nativo);
    // el botón muestra a qué se cambia (sol = pasar a claro, luna = pasar a oscuro)
    btn.textContent = elegido === 'dark' ? '☀️' : '🌙';
    btn.title = elegido === 'dark' ? 'Ver en claro' : 'Ver en oscuro';
    // si la página quedó invertida, el botón también: se compensa para que siempre se vea blanco
    btn.style.filter = elegido !== nativo ? 'invert(1) hue-rotate(180deg)' : '';
  }
  btn.onclick = function () { guardar((leer() || nativo) === 'dark' ? 'light' : 'dark'); aplicar(); };
  aplicar();
  document.body.appendChild(btn);
  // si se cambia en otra pestaña/herramienta abierta, esta se actualiza sola
  window.addEventListener('storage', function (e) { if (e.key === KEY) aplicar(); });
})();

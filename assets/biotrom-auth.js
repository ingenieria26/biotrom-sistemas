// ══════════════════════════════════════════════════════
// LOGIN COMPARTIDO DE LA EMPRESA — acceso a la base de datos Firebase de
// BIOTROM. Todas las herramientas incluyen este mismo archivo e inician
// sesión con la misma clave de empresa antes de leer/escribir datos
// compartidos. Una vez que FB_WEB_API_KEY/EMAIL/PASS tengan los valores
// reales (dejan de ser "__PENDIENTE__"), las reglas de la base van a exigir
// ese login para leer/escribir.
//
// Mientras esas credenciales no estén completas todavía, BiotromAuth.fetch()
// no bloquea nada: intenta loguearse y, si no puede (porque falta
// configurar), sigue de largo con un fetch normal sin autenticar — así el
// sincronizado entre computadoras sigue funcionando igual que ahora mismo
// (la base todavía acepta pedidos sin autenticar) hasta que la configuración
// esté lista del todo. Ese día, esta misma función empieza a mandar el login
// sin que haga falta tocar ninguna de las herramientas.
//
// Esto NO es autenticación por persona: es una única clave compartida (como
// una contraseña de WiFi) para que solo quien tenga acceso a estas páginas
// pueda leer/escribir los datos — evita que cualquiera que encuentre la URL
// de Firebase por internet vea o modifique la información de la fábrica.
// No protege contra alguien que inspeccione el código fuente de la página
// (ahí quedan visibles el usuario/clave), pero sube muchísimo la vara
// respecto a tenerlo completamente abierto como estaba antes.
// ══════════════════════════════════════════════════════
(function (global) {
  var FB_WEB_API_KEY = '__PENDIENTE__';
  var FB_AUTH_EMAIL = '__PENDIENTE__';
  var FB_AUTH_PASS = '__PENDIENTE__';

  var _configured = FB_WEB_API_KEY !== '__PENDIENTE__' && FB_AUTH_EMAIL !== '__PENDIENTE__' && FB_AUTH_PASS !== '__PENDIENTE__';
  var _idToken = null;
  var _expiry = 0;
  var _loginPromise = null;
  var _warnedOnce = false;

  function login() {
    if (!_configured) {
      if (!_warnedOnce) { console.info('[BiotromAuth] Credenciales Firebase todavía no configuradas — sincronizando sin login (modo abierto).'); _warnedOnce = true; }
      return Promise.reject(new Error('BiotromAuth: no configurado todavía'));
    }
    if (_idToken && Date.now() < _expiry) return Promise.resolve(_idToken);
    if (_loginPromise) return _loginPromise;
    _loginPromise = fetch(
      'https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=' + FB_WEB_API_KEY,
      { method: 'POST', body: JSON.stringify({ email: FB_AUTH_EMAIL, password: FB_AUTH_PASS, returnSecureToken: true }) }
    )
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (!data.idToken) throw new Error('Login BIOTROM falló: ' + (data.error && data.error.message));
        _idToken = data.idToken;
        _expiry = Date.now() + (parseInt(data.expiresIn || '3600', 10) * 1000) - 60000; // refrescar 1min antes de vencer
        _loginPromise = null;
        return _idToken;
      })
      .catch(function (e) { _loginPromise = null; throw e; });
    return _loginPromise;
  }

  // Reemplazo directo de fetch() para pegarle a Firebase. Si el login está
  // configurado, autentica; si no, hace un fetch normal sin auth (fallback)
  // en vez de bloquear la sincronización.
  function fbFetch(url, opts) {
    return login()
      .then(function (token) {
        var sep = url.indexOf('?') === -1 ? '?' : '&';
        return fetch(url + sep + 'auth=' + token, opts);
      })
      .catch(function () {
        return fetch(url, opts);
      });
  }

  global.BiotromAuth = { login: login, fetch: fbFetch, configured: _configured };
})(window);

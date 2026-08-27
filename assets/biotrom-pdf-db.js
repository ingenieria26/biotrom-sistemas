// ══════════════════════════════════════════════════════════════════
// BIOTROM · Base de datos local + sincronizada de PDFs (cartas y planos)
// ══════════════════════════════════════════════════════════════════
// Cada PDF se guarda DOS veces:
//   1) En IndexedDB de esta computadora -- se abre al instante y sin
//      internet una vez que ya se guardó/descargó una vez acá.
//   2) En la misma base Firebase que ya usan Cartas/Planos, Máquinas e
//      Historial de Costos (nodo aparte "pdfs_binarios"), como texto en
//      base64 -- así cualquier otra PC que abra el mismo código lo puede
//      bajar, aunque nunca se haya guardado ahí antes. Al bajarlo una vez,
//      esa PC también lo deja guardado localmente para las próximas veces.
//
// No hace falta ninguna configuración nueva: usa el mismo BiotromAuth.fetch
// (si el HTML que lo usa ya incluye biotrom-auth.js) o un fetch normal si no.
//
// Aviso de capacidad: el plan gratis de Firebase tiene un tope de almacenamiento
// total (~1 GB). Los PDFs de más de 5 MB no se suben a la nube (quedan solo
// locales, para no arriesgar ese tope) -- se avisa por consola cuando pasa.
// Si con el tiempo se acumulan muchos cientos de planos, en algún momento va a
// hacer falta revisar el uso de Firebase.
//
// Uso desde cualquier herramienta:
//   <script src="../assets/biotrom-auth.js"></script>   (opcional, pero recomendado)
//   <script src="../assets/biotrom-pdf-db.js"></script>
//   await BiotromPDF.guardar('1AX00003', 'plano', archivoOBlob);   // guarda local + nube
//   await BiotromPDF.abrir('1AX00003', 'plano');                   // busca local, si no está lo baja de la nube, y lo abre
//   const blob = await BiotromPDF.obtener('1AX00003', 'plano');    // o lo tomás vos
//
// "tipo" es 'plano' o 'carta' (son dos casilleros separados, un mismo código
// puede tener las dos cosas guardadas a la vez).
window.BiotromPDF = (() => {
  const DB_NAME = "biotrom_pdfs";
  const DB_VERSION = 1;
  const STORE = "archivos";
  const FB_BASE = "https://biotrom-carga-maquina-default-rtdb.firebaseio.com/pdfs_binarios";
  const MAX_SUBIDA_BYTES = 5 * 1024 * 1024; // 5 MB por archivo, deja margen bajo los límites de Firebase
  let _dbPromise = null;

  function _fetch(url, opts) {
    return (window.BiotromAuth ? BiotromAuth.fetch(url, opts) : fetch(url, opts));
  }

  function _abrirDB() {
    if (_dbPromise) return _dbPromise;
    _dbPromise = new Promise((resolve, reject) => {
      if (!window.indexedDB) { reject(new Error("Este navegador no soporta IndexedDB")); return; }
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: "id" });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return _dbPromise;
  }

  function _clave(codigo) {
    return String(codigo || "").toUpperCase().trim().replace(/[.$#\[\]\/]/g, "_");
  }
  function _id(codigo, tipo) {
    return (tipo || "plano") + ":" + _clave(codigo);
  }

  function _blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  }
  function _base64ToBlob(base64, mime) {
    const bin = atob(base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: mime || "application/pdf" });
  }

  async function _guardarLocal(codigo, tipo, blobOrFile, nombreArchivo) {
    const db = await _abrirDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put({
        id: _id(codigo, tipo),
        codigo: _clave(codigo),
        tipo: tipo || "plano",
        blob: blobOrFile,
        nombreArchivo: nombreArchivo !== undefined ? nombreArchivo : (blobOrFile.name || ""),
        guardado: new Date().toISOString()
      });
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  }

  // Cada archivo se guarda en dos ramas separadas en Firebase:
  //   .../<tipo>/<clave>/meta  -> liviano (nombre, tamaño, fecha) para listar rápido
  //   .../<tipo>/<clave>/data  -> pesado (el archivo en base64), se pide aparte
  // así se puede armar un listado de "qué hay subido" sin bajar todos los archivos.
  async function _subirALaNube(codigo, tipo, blobOrFile) {
    try {
      if (blobOrFile.size > MAX_SUBIDA_BYTES) {
        console.warn(`BiotromPDF: "${codigo}" pesa ${(blobOrFile.size/1024/1024).toFixed(1)} MB, no se sube a la nube (queda solo en esta PC).`);
        return false;
      }
      const base64 = await _blobToBase64(blobOrFile);
      const path = `${FB_BASE}/${tipo || "plano"}/${_clave(codigo)}.json`;
      const res = await _fetch(path, {
        method: "PUT", keepalive: true,
        body: JSON.stringify({
          data: base64,
          meta: { mime: blobOrFile.type || "application/pdf", nombreArchivo: blobOrFile.name || "", guardado: new Date().toISOString(), tamanoBytes: blobOrFile.size }
        })
      });
      return res.ok;
    } catch (e) { console.warn("BiotromPDF._subirALaNube:", e); return false; }
  }

  async function _bajarDeLaNube(codigo, tipo) {
    try {
      const path = `${FB_BASE}/${tipo || "plano"}/${_clave(codigo)}.json`;
      const res = await _fetch(path);
      if (!res.ok) return null;
      const data = await res.json();
      if (!data || !data.data) return null;
      const meta = data.meta || {};
      const bytes = _base64ToBlob(data.data, meta.mime);
      // Se reconstruye como File (no Blob suelto) para que .name sobreviva el
      // viaje por la nube -- así el código que lo usa (mostrar nombre, sacar
      // extensión, etc.) funciona igual venga del disco local o de Firebase.
      const blob = meta.nombreArchivo
        ? new File([bytes], meta.nombreArchivo, { type: meta.mime || "application/octet-stream" })
        : bytes;
      await _guardarLocal(codigo, tipo, blob, meta.nombreArchivo || "");
      return blob;
    } catch (e) { console.warn("BiotromPDF._bajarDeLaNube:", e); return null; }
  }

  // Metadatos de un archivo puntual SIN bajar el contenido pesado.
  async function metadatosNube(codigo, tipo) {
    try {
      const path = `${FB_BASE}/${tipo || "plano"}/${_clave(codigo)}/meta.json`;
      const res = await _fetch(path);
      if (!res.ok) return null;
      const meta = await res.json();
      return meta ? { codigo: _clave(codigo), tipo: tipo || "plano", nombreArchivo: meta.nombreArchivo || "", guardado: meta.guardado || "", tamanoBytes: meta.tamanoBytes || 0 } : null;
    } catch (e) { console.warn("BiotromPDF.metadatosNube:", e); return null; }
  }

  // Lista TODO lo que hay subido a la nube para un "tipo" (de cualquier PC,
  // se haya bajado acá o no) sin descargar ningún archivo pesado -- primero
  // pide solo las claves (shallow) y después el meta liviano de cada una.
  async function listarNube(tipo) {
    try {
      const path = `${FB_BASE}/${tipo || "plano"}.json?shallow=true`;
      const res = await _fetch(path);
      if (!res.ok) return [];
      const claves = await res.json();
      if (!claves) return [];
      const items = await Promise.all(Object.keys(claves).map(cod => metadatosNube(cod, tipo)));
      return items.filter(Boolean);
    } catch (e) { console.warn("BiotromPDF.listarNube:", e); return []; }
  }

  async function guardar(codigo, tipo, blobOrFile) {
    if (!codigo || !blobOrFile) return false;
    try {
      await _guardarLocal(codigo, tipo, blobOrFile);
      _subirALaNube(codigo, tipo, blobOrFile); // en segundo plano, no bloquea el guardado local
      return true;
    } catch (e) { console.warn("BiotromPDF.guardar:", e); return false; }
  }

  async function obtener(codigo, tipo) {
    if (!codigo) return null;
    try {
      const db = await _abrirDB();
      const local = await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, "readonly");
        const req = tx.objectStore(STORE).get(_id(codigo, tipo));
        req.onsuccess = () => resolve(req.result ? req.result.blob : null);
        req.onerror = () => reject(req.error);
      });
      if (local) return local;
    } catch (e) { console.warn("BiotromPDF.obtener (local):", e); }
    return await _bajarDeLaNube(codigo, tipo);
  }

  async function existe(codigo, tipo) {
    return !!(await obtener(codigo, tipo));
  }

  async function abrir(codigo, tipo) {
    const blob = await obtener(codigo, tipo);
    if (!blob) return false;
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    return true;
  }

  async function listar() {
    try {
      const db = await _abrirDB();
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, "readonly");
        const req = tx.objectStore(STORE).getAll();
        req.onsuccess = () => resolve((req.result || []).map(r => ({
          codigo: r.codigo, tipo: r.tipo, nombreArchivo: r.nombreArchivo,
          guardado: r.guardado, tamanoBytes: r.blob ? r.blob.size : 0
        })));
        req.onerror = () => reject(req.error);
      });
    } catch (e) { console.warn("BiotromPDF.listar:", e); return []; }
  }

  // Borra local Y la copia en la nube -- si no, borrar en una PC no sacaría
  // el archivo que otra PC ya bajó/subió, y volvería a aparecer solo.
  async function eliminar(codigo, tipo) {
    let localOk = false;
    try {
      const db = await _abrirDB();
      localOk = await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, "readwrite");
        tx.objectStore(STORE).delete(_id(codigo, tipo));
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(tx.error);
      });
    } catch (e) { console.warn("BiotromPDF.eliminar (local):", e); }
    let nubeOk = false;
    try {
      const path = `${FB_BASE}/${tipo || "plano"}/${_clave(codigo)}.json`;
      const res = await _fetch(path, { method: "DELETE" });
      nubeOk = res.ok;
    } catch (e) { console.warn("BiotromPDF.eliminar (nube):", e); }
    return localOk || nubeOk;
  }

  async function estadisticas() {
    const items = await listar();
    const totalBytes = items.reduce((s, i) => s + (i.tamanoBytes || 0), 0);
    return { cantidad: items.length, totalMB: +(totalBytes / 1024 / 1024).toFixed(1) };
  }

  // Sube a la nube todo lo que ya está guardado en esta PC (útil para lo que
  // se guardó localmente antes de que existiera esta sincronización, o para
  // forzar una subida manual). No vuelve a bajar nada, solo empuja lo local.
  async function sincronizarTodo() {
    const items = await listar();
    let subidos = 0, saltados = 0;
    for (const it of items) {
      try {
        const blob = await obtener(it.codigo, it.tipo);
        if (!blob) { saltados++; continue; }
        const ok = await _subirALaNube(it.codigo, it.tipo, blob);
        if (ok) subidos++; else saltados++;
      } catch (e) { saltados++; }
    }
    return { subidos, saltados, total: items.length };
  }

  // Combina lo local con lo que hay en la nube (sin descargar los archivos
  // pesados) -- para pantallas de "historial" que necesitan ver todo lo que
  // se subió desde cualquier PC, no solo lo que ya se vio en esta.
  async function listarTodo(tipo) {
    const [locales, nube] = await Promise.all([listar(), listarNube(tipo)]);
    const porClave = new Map();
    nube.forEach(it => porClave.set(it.codigo + ":" + it.tipo, { ...it, enEstaPC: false }));
    locales.filter(it => !tipo || it.tipo === tipo).forEach(it => porClave.set(it.codigo + ":" + it.tipo, { ...it, enEstaPC: true }));
    return Array.from(porClave.values());
  }

  return { guardar, obtener, existe, abrir, listar, eliminar, estadisticas, sincronizarTodo, listarNube, metadatosNube, listarTodo };
})();

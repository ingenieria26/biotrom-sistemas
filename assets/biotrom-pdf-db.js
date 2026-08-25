// ══════════════════════════════════════════════════════════════════
// BIOTROM · Base de datos local de PDFs (cartas de proceso y planos)
// ══════════════════════════════════════════════════════════════════
// Guarda los PDFs reales (no solo el nombre/ruta) en IndexedDB, adentro del
// navegador de esta computadora. Una vez guardado un PDF, se puede volver a
// abrir sin conexión a internet -- IndexedDB es 100% local, no depende de
// wifi, del servidor de la fábrica ni de que el sitio de GitHub esté online.
//
// Todos los HTML de BIOTROM que abren esta base comparten los mismos datos,
// porque en el navegador, todas las páginas abiertas como archivo local
// (file:///...) caen dentro del mismo origen de almacenamiento -- no importa
// en qué carpeta esté cada .html, todas ven la misma base.
//
// Uso desde cualquier herramienta:
//   <script src="../assets/biotrom-pdf-db.js"></script>
//   await BiotromPDF.guardar('1AX00003', 'plano', archivoOBlob);
//   await BiotromPDF.abrir('1AX00003', 'plano');           // lo abre en pestaña nueva
//   const blob = await BiotromPDF.obtener('1AX00003', 'plano'); // o lo tomás vos
//
// "tipo" es 'plano' o 'carta' (son dos casilleros separados, un mismo código
// puede tener las dos cosas guardadas a la vez).
window.BiotromPDF = (() => {
  const DB_NAME = "biotrom_pdfs";
  const DB_VERSION = 1;
  const STORE = "archivos";
  let _dbPromise = null;

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

  function _id(codigo, tipo) {
    return (tipo || "plano") + ":" + String(codigo || "").toUpperCase().trim();
  }

  async function guardar(codigo, tipo, blobOrFile) {
    if (!codigo || !blobOrFile) return false;
    try {
      const db = await _abrirDB();
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, "readwrite");
        tx.objectStore(STORE).put({
          id: _id(codigo, tipo),
          codigo: String(codigo).toUpperCase().trim(),
          tipo: tipo || "plano",
          blob: blobOrFile,
          nombreArchivo: blobOrFile.name || "",
          guardado: new Date().toISOString()
        });
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(tx.error);
      });
    } catch (e) { console.warn("BiotromPDF.guardar:", e); return false; }
  }

  async function obtener(codigo, tipo) {
    if (!codigo) return null;
    try {
      const db = await _abrirDB();
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, "readonly");
        const req = tx.objectStore(STORE).get(_id(codigo, tipo));
        req.onsuccess = () => resolve(req.result ? req.result.blob : null);
        req.onerror = () => reject(req.error);
      });
    } catch (e) { console.warn("BiotromPDF.obtener:", e); return null; }
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

  async function eliminar(codigo, tipo) {
    try {
      const db = await _abrirDB();
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, "readwrite");
        tx.objectStore(STORE).delete(_id(codigo, tipo));
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(tx.error);
      });
    } catch (e) { console.warn("BiotromPDF.eliminar:", e); return false; }
  }

  async function estadisticas() {
    const items = await listar();
    const totalBytes = items.reduce((s, i) => s + (i.tamanoBytes || 0), 0);
    return { cantidad: items.length, totalMB: +(totalBytes / 1024 / 1024).toFixed(1) };
  }

  return { guardar, obtener, existe, abrir, listar, eliminar, estadisticas };
})();

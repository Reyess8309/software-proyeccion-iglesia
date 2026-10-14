// main.js
const { app, BrowserWindow, WebContentsView, Menu, ipcMain, dialog, screen, session } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const sqlite3 = require('sqlite3').verbose();

// La carpeta de datos se llamaría como el "productName" del instalador; la fijamos en "proyecto"
// para que la app instalada y la de desarrollo usen las mismas canciones, agendas y ajustes
app.setPath('userData', path.join(app.getPath('appData'), 'proyecto'));

// ============================================================
// BASES DE DATOS
// ============================================================

// 1. Biblias (solo lectura). Empaquetada, la app la busca en la carpeta "resources"
//    (configúrala como extraResources en el empaquetador, sqlite no puede abrirla dentro del .asar)
const bibleDbPath = app.isPackaged
  ? path.join(process.resourcesPath, 'bibles.sqlite')
  : path.join(__dirname, 'bibles.sqlite');

const db = new sqlite3.Database(bibleDbPath, sqlite3.OPEN_READONLY, (err) => {
  if (err) console.error('Error al conectar con bibles.sqlite:', err.message);
  else console.log('Conectado a', bibleDbPath);
});

// 2. Base de datos del usuario (canciones y agendas)
// Se guarda en la carpeta de datos de la app (AppData\Roaming\proyecto en Windows),
// que siempre tiene permisos de escritura, incluso con la app empaquetada.
const userDataPath = path.join(app.getPath('userData'), 'userdata.db');

// Si es la primera vez, copiamos la BD que estaba junto al código para no perder canciones
const legacyUserDataPath = path.join(__dirname, 'userdata.db');
if (!fs.existsSync(userDataPath) && fs.existsSync(legacyUserDataPath)) {
  fs.mkdirSync(path.dirname(userDataPath), { recursive: true });
  fs.copyFileSync(legacyUserDataPath, userDataPath);
}

const userDb = new sqlite3.Database(userDataPath, (err) => {
  if (err) console.error('Error al conectar con userdata.db:', err.message);
  else console.log('Conectado a', userDataPath);
});

// Creamos las tablas si no existen
userDb.serialize(() => {
  userDb.run(`CREATE TABLE IF NOT EXISTS canciones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      titulo TEXT NOT NULL,
      letra TEXT NOT NULL
  )`);
  userDb.run(`CREATE TABLE IF NOT EXISTS agendas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      fecha DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  userDb.run(`CREATE TABLE IF NOT EXISTS agenda_canciones (
      agenda_id INTEGER,
      cancion_id INTEGER,
      orden INTEGER DEFAULT 0,
      FOREIGN KEY(agenda_id) REFERENCES agendas(id),
      FOREIGN KEY(cancion_id) REFERENCES canciones(id)
  )`);
  // Quitamos canciones repetidas dentro de una misma agenda y evitamos que vuelva a pasar
  userDb.run(`DELETE FROM agenda_canciones WHERE rowid NOT IN
      (SELECT MIN(rowid) FROM agenda_canciones GROUP BY agenda_id, cancion_id)`);
  userDb.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_agenda_cancion ON agenda_canciones (agenda_id, cancion_id)`);
  // Galería multimedia y logos (se guardan las rutas de los archivos, no los archivos)
  userDb.run(`CREATE TABLE IF NOT EXISTS multimedia (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      categoria TEXT NOT NULL,          -- 'fondo' | 'logo'
      tipo TEXT NOT NULL,               -- 'video' | 'imagen'
      nombre TEXT NOT NULL,
      ruta TEXT NOT NULL,
      fecha DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (categoria, ruta)
  )`);
  // Presentaciones: toda la presentación (estilo, transición y diapositivas) se guarda como JSON
  userDb.run(`CREATE TABLE IF NOT EXISTS presentaciones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      datos TEXT NOT NULL,
      actualizado DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  // Estilos creados por el usuario para reutilizar en otras presentaciones
  userDb.run(`CREATE TABLE IF NOT EXISTS estilos_presentacion (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      datos TEXT NOT NULL
  )`);
  // Historial de versículos proyectados (el más reciente primero; un versículo aparece una sola vez)
  userDb.run(`CREATE TABLE IF NOT EXISTS historial_biblia (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      id_version INTEGER NOT NULL,
      id_libro INTEGER NOT NULL,
      libro TEXT NOT NULL,
      capitulo INTEGER NOT NULL,
      versiculo INTEGER NOT NULL,
      texto TEXT NOT NULL,
      cita TEXT NOT NULL,
      fecha DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
});

// Funciones auxiliares: convierten las consultas de sqlite3 en Promesas
const dbAll = (database, sql, params = []) => new Promise((resolve, reject) => {
  database.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows));
});
const dbRun = (database, sql, params = []) => new Promise((resolve, reject) => {
  database.run(sql, params, function (err) { err ? reject(err) : resolve(this); });
});

// ============================================================
// VENTANAS
// ============================================================
let controlPanelWindow;
let projectionWindow;

// Crea la ventana principal de control
function createControlPanel() {
  controlPanelWindow = new BrowserWindow({
    width: 1200, height: 800, title: 'Panel de Control',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false
    }
  });
  controlPanelWindow.loadFile(path.join(__dirname, 'index.html'));
  //controlPanelWindow.webContents.openDevTools();

  // Sin el menú de la ventana, estos atajos se manejan aquí:
  //  F11 → pantalla completa de la proyección · Ctrl + / Ctrl - / Ctrl 0 → zoom del panel
  //  Ctrl+Shift+I → herramientas de desarrollo (solo sin empaquetar)
  controlPanelWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    const wc = controlPanelWindow.webContents;
    const ctrl = input.control || input.meta;
    let handled = true;
    if (input.key === 'F11' && projectionWindow) projectionWindow.setFullScreen(!projectionWindow.isFullScreen());
    else if (ctrl && ['+', '='].includes(input.key)) wc.setZoomLevel(Math.min(wc.getZoomLevel() + 0.5, 3));
    else if (ctrl && input.key === '-') wc.setZoomLevel(Math.max(wc.getZoomLevel() - 0.5, -3));
    else if (ctrl && input.key === '0') wc.setZoomLevel(0);
    else if (ctrl && input.shift && input.key.toLowerCase() === 'i' && !app.isPackaged) wc.toggleDevTools();
    else handled = false;
    if (handled) event.preventDefault();
  });

  // Si se cierra el panel de control, se cierra toda la aplicación (incluida la proyección)
  controlPanelWindow.on('closed', () => {
    controlPanelWindow = null;
    app.quit();
  });
}

// Crea la ventana de proyección. Si hay un segundo monitor (proyector/TV), se abre ahí en pantalla completa.
function createProjectionWindow() {
  if (projectionWindow) { projectionWindow.focus(); return; }

  const primary = screen.getPrimaryDisplay();
  const external = screen.getAllDisplays().find(d => d.id !== primary.id);

  projectionWindow = new BrowserWindow({
    width: 800, height: 600, title: 'Pantalla de Proyección', autoHideMenuBar: true,
    backgroundColor: '#000000',
    ...(external && { x: external.bounds.x, y: external.bounds.y, fullscreen: true }),
    webPreferences: {
      preload: path.join(__dirname, 'projection-preload.js'),
      contextIsolation: true, nodeIntegration: false,
      backgroundThrottling: false // que el video y el reloj sigan fluidos aunque la ventana no tenga el foco
    }
  });
  projectionWindow.loadFile(path.join(__dirname, 'projection.html'));

  // Al terminar de cargar, le enviamos todo lo que ya estaba configurado en el panel
  projectionWindow.webContents.on('did-finish-load', replayProjectionState);

  // F11 alterna pantalla completa, Esc la quita
  projectionWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11') projectionWindow.setFullScreen(!projectionWindow.isFullScreen());
    if (input.key === 'Escape' && projectionWindow.isFullScreen()) projectionWindow.setFullScreen(false);
  });

  // Si hay una página web proyectada, sigue el tamaño de la ventana
  projectionWindow.on('resize', fitWebToProjection);
  projectionWindow.on('enter-full-screen', fitWebToProjection);
  projectionWindow.on('leave-full-screen', fitWebToProjection);
  // Antes de cerrar, la página web regresa al panel (así no se pierde)
  projectionWindow.on('close', () => { if (webHost === 'projection') moveWebToPanel(); });

  projectionWindow.on('closed', () => {
    projectionWindow = null;
    sendToControlPanel('projection-status', false);
  });
  sendToControlPanel('projection-status', true);
}

function sendToControlPanel(channel, data) {
  if (controlPanelWindow && !controlPanelWindow.isDestroyed()) controlPanelWindow.webContents.send(channel, data);
}

app.whenReady().then(() => {
  // Sin la barra de menú (File, Edit, View, Window, Help) en ninguna ventana
  Menu.setApplicationMenu(null);
  // Las páginas web se abren en una sesión separada de la app; solo se permite pantalla completa y copiar
  session.fromPartition(WEB_PARTITION).setPermissionRequestHandler((wc, permission, callback) =>
    callback(['fullscreen', 'clipboard-sanitized-write'].includes(permission)));
  createControlPanel();
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('will-quit', () => { db.close(); userDb.close(); });

// ============================================================
// COMUNICACIÓN PANEL → PROYECCIÓN
// ============================================================
// Guardamos el último valor de cada ajuste para que, si la proyección se abre (o se reabre)
// después, aparezca con el mismo texto, fondo, logo, estilos, etc.
const projectionState = new Map();

function sendToProjection(channel, data, stateKey = channel) {
  if (stateKey) projectionState.set(stateKey, [channel, data]);
  if (projectionWindow && !projectionWindow.isDestroyed()) projectionWindow.webContents.send(channel, data);
}

function replayProjectionState() {
  for (const [channel, data] of projectionState.values()) projectionWindow.webContents.send(channel, data);
}

ipcMain.on('open-projection', () => { createProjectionWindow(); });

// El texto, la cuenta regresiva y las diapositivas se reemplazan entre sí (y quitan la página web de la pantalla)
function clearMainContent(except) {
  for (const key of ['receive-text', 'countdown', 'slide']) if (key !== except) projectionState.delete(key);
  if (webHost === 'projection') moveWebToPanel();
}

ipcMain.on('send-text', (event, data) => {
  clearMainContent('receive-text');
  sendToProjection('receive-text', data);
});

// PRESENTACIONES: { diapositiva, estilo, transicion, paso, indice, presentacionId }
ipcMain.on('show-slide', (event, data) => {
  clearMainContent('slide');
  sendToProjection('show-slide', data, 'slide');
});
ipcMain.on('clear-slide', () => {
  projectionState.delete('slide');
  sendToProjection('clear-slide', null, null);
});

// Los tres tipos de fondo comparten la misma clave: solo se recuerda el último elegido
ipcMain.on('change-bg-color', (event, color) => sendToProjection('set-bg-color', color, 'background'));
ipcMain.on('change-bg-image', (event, url) => sendToProjection('set-bg-image', url, 'background'));
ipcMain.on('change-bg-video', (event, url) => sendToProjection('set-bg-video', url, 'background'));
// Cómo se acomoda la imagen o el video de fondo: 'rellenar' | 'ajustar' | 'estirar' | 'ancho' | 'alto' | 'original'
ipcMain.on('change-bg-fit', (event, fit) => sendToProjection('update-bg-fit', fit));

// Mostrar / ocultar el texto sin quitarlo (se recuerda si la proyección se reabre)
ipcMain.on('set-text-visible', (event, visible) => sendToProjection('set-text-visible', visible));

ipcMain.on('change-text-style',(event, styleData) => sendToProjection('update-text-style', styleData));
ipcMain.on('change-font-size', (event, size) => sendToProjection('update-font-size', size));
ipcMain.on('toggle-auto-fit', (event, isAuto) => sendToProjection('toggle-auto-fit', isAuto));
ipcMain.on('change-citation-size', (event, size) => sendToProjection('update-citation-size', size));
ipcMain.on('change-citation-align', (event, align) => sendToProjection('update-citation-align', align));
ipcMain.on('change-dimmer', (event, opacity) => sendToProjection('update-dimmer', opacity));
ipcMain.on('change-logo', (event, logoData) => sendToProjection('update-logo', logoData));
ipcMain.on('set-video-loop', (event, loopValue) => sendToProjection('update-video-loop', loopValue));

// Reproductor de video: el panel controla y la proyección informa en qué segundo va
ipcMain.on('video-control', (event, data) => sendToProjection('video-control', data, null));
ipcMain.on('video-status', (event, status) => sendToControlPanel('video-status', status));

// Guardamos la hora exacta de término: si la proyección se reabre, el reloj sigue donde iba
ipcMain.on('start-countdown', (event, { prefix, minutes }) => {
  clearMainContent('countdown');
  sendToProjection('start-countdown', { prefix, endTime: Date.now() + minutes * 60000 }, 'countdown');
});
ipcMain.on('stop-countdown', () => {
  projectionState.delete('countdown');
  projectionState.delete('receive-text');
  sendToProjection('stop-countdown', null, null);
});

// MINIATURA EN VIVO: captura reducida de la proyección (JPEG pequeño, mucho más liviano que un PNG completo)
// (si hay una página web proyectada, la miniatura sale de sus propios cuadros: ver startWebFrames)
setInterval(() => {
  if (!projectionWindow || projectionWindow.isDestroyed() || !controlPanelWindow || webHost === 'projection') return;
  projectionWindow.webContents.capturePage().then(image => {
    if (image.isEmpty()) return;
    const thumb = image.resize({ width: 320 });
    sendToControlPanel('update-preview', 'data:image/jpeg;base64,' + thumb.toJPEG(70).toString('base64'));
  }).catch(() => { /* la ventana se está cerrando */ });
}, 500);

// ============================================================
// ARCHIVOS MULTIMEDIA
// ============================================================
const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'];
const VIDEO_EXTENSIONS = ['mp4', 'webm', 'mov', 'm4v', 'mkv'];

// Galería guardada en userdata.db. categoria: 'fondo' (videos e imágenes) | 'logo' (solo imágenes)
// Cada elemento trae su url ya codificada (soporta espacios, #, acentos…) y si el archivo todavía existe
async function getMedia(categoria) {
  const rows = await dbAll(userDb, `SELECT * FROM multimedia WHERE categoria = ? ORDER BY nombre COLLATE NOCASE`, [categoria]);
  return rows.map(row => ({ ...row, url: pathToFileURL(row.ruta).href, existe: fs.existsSync(row.ruta) }));
}

ipcMain.handle('get-media', (event, categoria) => getMedia(categoria));

// Abre el explorador de Windows, guarda los archivos elegidos y devuelve la galería actualizada
ipcMain.handle('import-media', async (event, categoria) => {
  const extensions = categoria === 'logo' ? IMAGE_EXTENSIONS : [...IMAGE_EXTENSIONS, ...VIDEO_EXTENSIONS];
  const result = await dialog.showOpenDialog(controlPanelWindow, {
    title: categoria === 'logo' ? 'Seleccionar logos' : 'Seleccionar videos e imágenes',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: categoria === 'logo' ? 'Imágenes' : 'Multimedia', extensions }]
  });

  for (const filePath of result.filePaths) {
    const ext = path.extname(filePath).slice(1).toLowerCase();
    const tipo = VIDEO_EXTENSIONS.includes(ext) ? 'video' : 'imagen';
    await dbRun(userDb, `INSERT OR IGNORE INTO multimedia (categoria, tipo, nombre, ruta) VALUES (?, ?, ?, ?)`,
      [categoria, tipo, path.basename(filePath), filePath]);
  }
  return getMedia(categoria);
});

// Quita el archivo de la galería (no lo borra del disco)
ipcMain.handle('remove-media', async (event, id) =>
  (await dbRun(userDb, `DELETE FROM multimedia WHERE id = ?`, [id])).changes);

// ============================================================
// BIBLIAS
// ============================================================
ipcMain.handle('get-versions', () =>
  dbAll(db, `SELECT id, nombre, abreviatura FROM versiones ORDER BY id`));

ipcMain.handle('get-books', (event, versionId) =>
  dbAll(db, `SELECT l.id, l.nombre AS name, l.testamento
             FROM libros l
             JOIN version_libro_link vll ON l.id = vll.id_libro
             WHERE vll.id_version = ?
             ORDER BY l.id`, [versionId]));

ipcMain.handle('get-chapters', (event, { versionId, bookId }) =>
  dbAll(db, `SELECT DISTINCT capitulo AS number
             FROM versiculos
             WHERE id_version = ? AND id_libro = ?
             ORDER BY capitulo`, [versionId, bookId]));

ipcMain.handle('get-verses', (event, { versionId, bookId, chapterNumber }) =>
  dbAll(db, `SELECT id, versiculo AS number, texto AS text
             FROM versiculos
             WHERE id_version = ? AND id_libro = ? AND capitulo = ?
             ORDER BY versiculo`, [versionId, bookId, chapterNumber]));

// BÚSQUEDA POR TEXTO: la primera vez se carga la versión completa en memoria con el texto
// normalizado (sin acentos, mayúsculas ni signos), así cada búsqueda es instantánea.
const normalizeSearch = (text) => String(text || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const searchCache = new Map(); // versionId → Promise<versículos>
const MAX_SEARCH_RESULTS = 200;

function getSearchIndex(versionId) {
  if (!searchCache.has(versionId)) {
    const load = dbAll(db, `SELECT v.id_libro AS bookId, l.nombre AS bookName, v.capitulo AS chapter,
                                   v.versiculo AS number, v.texto AS text
                            FROM versiculos v JOIN libros l ON l.id = v.id_libro
                            WHERE v.id_version = ?
                            ORDER BY v.id_libro, v.capitulo, v.versiculo`, [versionId])
      .then(rows => rows.map(row => ({ ...row, norm: ' ' + normalizeSearch(row.text) + ' ' })));
    load.catch(() => searchCache.delete(versionId));
    searchCache.set(versionId, load);
  }
  return searchCache.get(versionId);
}

// Devuelve primero los versículos con la frase exacta y luego los que tienen todas las palabras
ipcMain.handle('search-verses', async (event, { versionId, query }) => {
  const phrase = normalizeSearch(query);
  if (phrase.length < 3) return { total: 0, results: [] };
  const words = phrase.split(' ');
  const exact = [], partial = [];
  for (const verse of await getSearchIndex(Number(versionId))) {
    if (verse.norm.includes(phrase)) exact.push(verse);
    else if (words.length > 1 && words.every(w => verse.norm.includes(w))) partial.push(verse);
  }
  const all = exact.concat(partial);
  return {
    total: all.length,
    results: all.slice(0, MAX_SEARCH_RESULTS).map(({ norm, ...verse }) => verse)
  };
});

// HISTORIAL DE VERSÍCULOS PROYECTADOS
const MAX_HISTORY = 300;

ipcMain.handle('get-bible-history', () =>
  dbAll(userDb, `SELECT id, id_version AS versionId, id_libro AS bookId, libro AS bookName,
                        capitulo AS chapter, versiculo AS number, texto AS text, cita, fecha
                 FROM historial_biblia ORDER BY id DESC`));

ipcMain.handle('add-bible-history', async (event, v) => {
  await dbRun(userDb, `DELETE FROM historial_biblia
                       WHERE id_version = ? AND id_libro = ? AND capitulo = ? AND versiculo = ?`,
    [v.versionId, v.bookId, v.chapter, v.number]);
  await dbRun(userDb, `INSERT INTO historial_biblia (id_version, id_libro, libro, capitulo, versiculo, texto, cita)
                       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [v.versionId, v.bookId, v.bookName, v.chapter, v.number, v.text, v.cita]);
  await dbRun(userDb, `DELETE FROM historial_biblia WHERE id NOT IN
                       (SELECT id FROM historial_biblia ORDER BY id DESC LIMIT ?)`, [MAX_HISTORY]);
});

ipcMain.handle('remove-bible-history', async (event, id) =>
  (await dbRun(userDb, `DELETE FROM historial_biblia WHERE id = ?`, [id])).changes);

ipcMain.handle('clear-bible-history', async () =>
  (await dbRun(userDb, `DELETE FROM historial_biblia`)).changes);

// ============================================================
// CANCIONES
// ============================================================
ipcMain.handle('get-songs', () =>
  dbAll(userDb, `SELECT * FROM canciones ORDER BY titulo COLLATE NOCASE ASC`));

ipcMain.handle('add-song', async (event, { titulo, letra }) =>
  (await dbRun(userDb, `INSERT INTO canciones (titulo, letra) VALUES (?, ?)`, [titulo, letra])).lastID);

ipcMain.handle('update-song', async (event, { id, titulo, letra }) =>
  (await dbRun(userDb, `UPDATE canciones SET titulo = ?, letra = ? WHERE id = ?`, [titulo, letra, id])).changes);

// Elimina la canción y también sus referencias en las agendas
ipcMain.handle('delete-song', async (event, songId) => {
  await dbRun(userDb, `DELETE FROM agenda_canciones WHERE cancion_id = ?`, [songId]);
  return (await dbRun(userDb, `DELETE FROM canciones WHERE id = ?`, [songId])).changes;
});

// ============================================================
// AGENDAS
// ============================================================
ipcMain.handle('create-agenda', async (event, nombre) =>
  (await dbRun(userDb, `INSERT INTO agendas (nombre) VALUES (?)`, [nombre])).lastID);

ipcMain.handle('get-agendas', () =>
  dbAll(userDb, `SELECT a.*, (SELECT COUNT(*) FROM agenda_canciones ac WHERE ac.agenda_id = a.id) AS total
                 FROM agendas a ORDER BY a.fecha DESC, a.id DESC`));

ipcMain.handle('delete-agenda', async (event, agendaId) => {
  await dbRun(userDb, `DELETE FROM agenda_canciones WHERE agenda_id = ?`, [agendaId]);
  return (await dbRun(userDb, `DELETE FROM agendas WHERE id = ?`, [agendaId])).changes;
});

// Canciones de una agenda, en el orden del servicio
ipcMain.handle('get-agenda-songs', (event, agendaId) =>
  dbAll(userDb, `SELECT c.* FROM agenda_canciones ac
                 JOIN canciones c ON c.id = ac.cancion_id
                 WHERE ac.agenda_id = ?
                 ORDER BY ac.orden, ac.rowid`, [agendaId]));

// Agrega la canción al final de la agenda (si ya está en esa agenda, no la duplica)
ipcMain.handle('add-song-to-agenda', async (event, { agenda_id, cancion_id }) =>
  (await dbRun(userDb, `INSERT OR IGNORE INTO agenda_canciones (agenda_id, cancion_id, orden)
                        VALUES (?, ?, (SELECT COALESCE(MAX(orden), 0) + 1 FROM agenda_canciones WHERE agenda_id = ?))`,
    [agenda_id, cancion_id, agenda_id])).changes); // 0 si ya estaba en la agenda

ipcMain.handle('remove-song-from-agenda', async (event, { agenda_id, cancion_id }) =>
  (await dbRun(userDb, `DELETE FROM agenda_canciones WHERE agenda_id = ? AND cancion_id = ?`, [agenda_id, cancion_id])).changes);

// Recibe la lista de ids de canciones en el nuevo orden
ipcMain.handle('reorder-agenda', async (event, { agenda_id, cancion_ids }) => {
  await dbRun(userDb, 'BEGIN TRANSACTION');
  try {
    for (const [index, cancion_id] of cancion_ids.entries()) {
      await dbRun(userDb, `UPDATE agenda_canciones SET orden = ? WHERE agenda_id = ? AND cancion_id = ?`, [index + 1, agenda_id, cancion_id]);
    }
    await dbRun(userDb, 'COMMIT');
  } catch (err) {
    await dbRun(userDb, 'ROLLBACK');
    throw err;
  }
});

// ============================================================
// PRESENTACIONES
// ============================================================
const parseRow = (row) => row && ({ ...row, datos: JSON.parse(row.datos) });

ipcMain.handle('get-presentations', async () =>
  (await dbAll(userDb, `SELECT id, nombre, actualizado, datos FROM presentaciones ORDER BY actualizado DESC, id DESC`))
    .map(row => {
      const datos = JSON.parse(row.datos);
      return { id: row.id, nombre: row.nombre, actualizado: row.actualizado, total: datos.diapositivas.length,
               portada: datos.diapositivas[0] || null, estilo: datos.estilo };
    }));

ipcMain.handle('get-presentation', async (event, id) =>
  parseRow((await dbAll(userDb, `SELECT * FROM presentaciones WHERE id = ?`, [id]))[0]));

// Crea (sin id) o actualiza (con id). Devuelve el id.
ipcMain.handle('save-presentation', async (event, { id, nombre, datos }) => {
  const json = JSON.stringify(datos);
  if (id) {
    await dbRun(userDb, `UPDATE presentaciones SET nombre = ?, datos = ?, actualizado = CURRENT_TIMESTAMP WHERE id = ?`, [nombre, json, id]);
    return id;
  }
  return (await dbRun(userDb, `INSERT INTO presentaciones (nombre, datos) VALUES (?, ?)`, [nombre, json])).lastID;
});

ipcMain.handle('delete-presentation', async (event, id) =>
  (await dbRun(userDb, `DELETE FROM presentaciones WHERE id = ?`, [id])).changes);

// Estilos propios
ipcMain.handle('get-presentation-styles', async () =>
  (await dbAll(userDb, `SELECT * FROM estilos_presentacion ORDER BY nombre COLLATE NOCASE`)).map(parseRow));

ipcMain.handle('save-presentation-style', async (event, { nombre, datos }) =>
  (await dbRun(userDb, `INSERT INTO estilos_presentacion (nombre, datos) VALUES (?, ?)`, [nombre, JSON.stringify(datos)])).lastID);

ipcMain.handle('delete-presentation-style', async (event, id) =>
  (await dbRun(userDb, `DELETE FROM estilos_presentacion WHERE id = ?`, [id])).changes);

// Elegir una imagen para una diapositiva o un fondo. Devuelve { nombre, ruta, url } o null
ipcMain.handle('pick-image', async () => {
  const result = await dialog.showOpenDialog(controlPanelWindow, {
    title: 'Elegir imagen', properties: ['openFile'],
    filters: [{ name: 'Imágenes', extensions: IMAGE_EXTENSIONS }]
  });
  if (result.canceled || !result.filePaths.length) return null;
  const ruta = result.filePaths[0];
  return { nombre: path.basename(ruta), ruta, url: pathToFileURL(ruta).href };
});

// ============================================================
// PÁGINA WEB
// ============================================================
// La página vive en una sola "vista" (WebContentsView) que se mueve entre dos lugares:
//  - 'panel': dentro del panel de control, en privado, para navegar antes de mostrarla
//  - 'projection': en la pantalla de proyección. El panel recibe un espejo en vivo
//    y le reenvía clics, desplazamiento y teclas, así se controla desde el panel.
const WEB_PARTITION = 'persist:web';
let webView = null;
let webHost = 'none';        // 'none' | 'panel' | 'projection'
let webPanelRect = null;     // dónde dibujarla dentro del panel (lo informa renderer.js)
let webFrameTimer = null;
let webLastFrame = null;
let webLastPreview = 0;

function sendWebStatus() {
  const wc = webView && webView.webContents;
  sendToControlPanel('web-status', wc ? {
    abierta: true,
    url: wc.getURL(),
    titulo: wc.getTitle(),
    cargando: wc.isLoading(),
    puedeAtras: wc.navigationHistory.canGoBack(),
    puedeAdelante: wc.navigationHistory.canGoForward(),
    zoom: Math.round(wc.getZoomFactor() * 100),
    host: webHost
  } : { abierta: false, host: 'none' });
}

function ensureWebView() {
  if (webView) return webView;
  webView = new WebContentsView({ webPreferences: { partition: WEB_PARTITION, sandbox: true, contextIsolation: true } });
  webView.setBackgroundColor('#ffffff');
  const wc = webView.webContents;
  // Los enlaces que abren ventanas nuevas se abren en la misma vista
  wc.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) wc.loadURL(url);
    return { action: 'deny' };
  });
  ['did-navigate', 'did-navigate-in-page', 'page-title-updated', 'did-start-loading', 'did-stop-loading', 'zoom-changed']
    .forEach(evt => wc.on(evt, sendWebStatus));
  wc.on('did-fail-load', (event, code, description, url, isMainFrame) => {
    if (isMainFrame && code !== -3) sendToControlPanel('web-error', `No se pudo abrir la página (${description}).`);
  });
  return webView;
}

// Texto de la barra de dirección → URL (si no parece una dirección, se busca en Google)
function toWebUrl(text) {
  const t = String(text || '').trim();
  if (!t) return null;
  if (/^https?:\/\//i.test(t)) return t;
  if (!/\s/.test(t) && /^[^\s/]+\.[^\s]{2,}/.test(t)) return 'https://' + t;
  return 'https://www.google.com/search?q=' + encodeURIComponent(t);
}

function detachWeb() {
  if (!webView) return;
  for (const win of [controlPanelWindow, projectionWindow]) {
    if (win && !win.isDestroyed() && win.contentView.children.includes(webView)) win.contentView.removeChildView(webView);
  }
}

function applyWebPanelBounds() {
  if (!webView || webHost !== 'panel') return;
  if (webPanelRect) {
    webView.setBounds(webPanelRect);
    webView.setVisible(true);
  } else {
    webView.setVisible(false);
  }
}

function moveWebToPanel() {
  if (!webView || !controlPanelWindow) return;
  stopWebFrames();
  detachWeb();
  controlPanelWindow.contentView.addChildView(webView);
  webHost = 'panel';
  applyWebPanelBounds();
  sendWebStatus();
}

function fitWebToProjection() {
  if (!webView || webHost !== 'projection' || !projectionWindow) return;
  const [width, height] = projectionWindow.getContentSize();
  webView.setBounds({ x: 0, y: 0, width, height });
}

function moveWebToProjection() {
  if (!webView) return;
  createProjectionWindow();
  detachWeb();
  projectionWindow.contentView.addChildView(webView);
  webView.setVisible(true);
  webHost = 'projection';
  fitWebToProjection();
  startWebFrames();
  sendWebStatus();
  controlPanelWindow.focus(); // el control sigue en el panel
}

// Espejo en vivo: hasta ~15 cuadros por segundo al panel, y 2 por segundo para la miniatura
function startWebFrames() {
  stopWebFrames();
  const wc = webView.webContents;
  let lastSent = 0;
  wc.beginFrameSubscription(false, (image) => { webLastFrame = image; });
  wc.invalidate();
  setTimeout(() => { if (!wc.isDestroyed()) wc.invalidate(); }, 200); // por si la vista aún no estaba lista
  webFrameTimer = setInterval(() => {
    // Una página quieta no se vuelve a pintar: cada segundo sin cuadros nuevos tomamos una captura
    if (!webLastFrame && Date.now() - lastSent > 1000 && !wc.isDestroyed()) {
      lastSent = Date.now();
      wc.capturePage().then(img => { if (!img.isEmpty() && !webLastFrame) webLastFrame = img; }).catch(() => {});
    }
    if (!webLastFrame) return;
    lastSent = Date.now();
    const frame = webLastFrame;
    webLastFrame = null;
    const big = frame.getSize().width > 1280 ? frame.resize({ width: 1280 }) : frame;
    sendToControlPanel('web-frame', 'data:image/jpeg;base64,' + big.toJPEG(75).toString('base64'));
    if (Date.now() - webLastPreview > 500) {
      webLastPreview = Date.now();
      sendToControlPanel('update-preview', 'data:image/jpeg;base64,' + frame.resize({ width: 320 }).toJPEG(70).toString('base64'));
    }
  }, 66);
}

function stopWebFrames() {
  clearInterval(webFrameTimer);
  webFrameTimer = null;
  webLastFrame = null;
  if (webView && !webView.webContents.isDestroyed()) {
    try { webView.webContents.endFrameSubscription(); } catch { /* no estaba suscrito */ }
  }
}

ipcMain.on('web-load', (event, text) => {
  const url = toWebUrl(text);
  if (!url) return;
  ensureWebView();
  if (webHost === 'none') moveWebToPanel();
  webView.webContents.loadURL(url).catch(() => { /* el error se informa en did-fail-load */ });
});

ipcMain.on('web-panel-rect', (event, rect) => {
  webPanelRect = rect && rect.width > 0 && rect.height > 0
    ? { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) }
    : null;
  applyWebPanelBounds();
});

ipcMain.on('web-nav', (event, accion) => {
  if (!webView) return;
  const wc = webView.webContents;
  if (accion === 'atras' && wc.navigationHistory.canGoBack()) wc.navigationHistory.goBack();
  if (accion === 'adelante' && wc.navigationHistory.canGoForward()) wc.navigationHistory.goForward();
  if (accion === 'recargar') wc.reload();
  if (accion === 'detener') wc.stop();
});

ipcMain.on('web-zoom', (event, percent) => {
  if (!webView) return;
  webView.webContents.setZoomFactor(Math.min(3, Math.max(0.3, percent / 100)));
  sendWebStatus();
});

ipcMain.on('web-project', (event, project) => {
  if (!webView) return;
  if (project) {
    // La página reemplaza al texto, la cuenta regresiva o la diapositiva que estuviera en pantalla
    for (const key of ['receive-text', 'countdown', 'slide']) projectionState.delete(key);
    sendToProjection('receive-text', { texto: '', cita: '' }, null);
    sendToProjection('clear-slide', null, null);
    moveWebToProjection();
  } else {
    moveWebToPanel();
  }
});

ipcMain.on('web-close', () => {
  if (!webView) return;
  stopWebFrames();
  detachWeb();
  webView.webContents.close();
  webView = null;
  webHost = 'none';
  sendWebStatus();
});

// Rueda del mouse: Chromium ignora la rueda simulada si la ventana de proyección no tiene el foco
// (y dárselo le quitaría el teclado al panel). Por eso se avisa a la página con un evento "wheel"
// y, si la página no lo usa para otra cosa, se desplaza lo que está bajo el puntero.
function scrollWebAt(x, y, dx, dy) {
  const target = document.elementFromPoint(x, y) || document.body;
  const wheel = new WheelEvent('wheel', { clientX: x, clientY: y, deltaX: dx, deltaY: dy, deltaMode: 0, bubbles: true, cancelable: true });
  if (!target.dispatchEvent(wheel)) return; // la página lo manejó (mapas, carruseles…)
  const scrollable = (node, vertical) => {
    const style = getComputedStyle(node);
    const overflow = vertical ? style.overflowY : style.overflowX;
    return /(auto|scroll|overlay)/.test(overflow) &&
      (vertical ? node.scrollHeight > node.clientHeight : node.scrollWidth > node.clientWidth);
  };
  for (let node = target; node && node !== document.body && node !== document.documentElement; node = node.parentElement) {
    if ((dy && scrollable(node, true)) || (dx && scrollable(node, false))) {
      node.scrollBy(dx, dy);
      return;
    }
  }
  (document.scrollingElement || document.documentElement).scrollBy(dx, dy);
}

// Eventos del espejo del panel. x e y llegan entre 0 y 1 (proporción de la imagen)
ipcMain.on('web-input', (event, input) => {
  if (!webView || webHost !== 'projection') return;
  const wc = webView.webContents;
  const ev = { ...input };
  if ('x' in ev) {
    const { width, height } = webView.getBounds();
    ev.x = Math.round(ev.x * width);
    ev.y = Math.round(ev.y * height);
  }
  if (ev.type === 'mouseWheel') {
    const zoom = wc.getZoomFactor(); // la página mide en píxeles CSS
    const args = [ev.x / zoom, ev.y / zoom, -ev.deltaX, -ev.deltaY].map(n => Math.round(n));
    wc.executeJavaScript(`(${scrollWebAt.toString()})(${args.join(',')})`).catch(() => {});
    return;
  }
  wc.sendInputEvent(ev);
});

ipcMain.on('web-status-request', sendWebStatus);

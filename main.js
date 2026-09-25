// main.js
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

// 1. Conectamos a tu base de datos de biblia
const dbPath = path.join(__dirname, 'bibles.sqlite'); 
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) console.error('Error al conectar con la BD:', err.message);
  else console.log('Conectado a bibles.sqlite');
});

// Añade esto debajo de donde defines tu 'db' de Bibles:
const userDataPath = path.join(__dirname, 'userdata.db');
const userDb = new sqlite3.Database(userDataPath);

// Creamos la tabla de canciones si no existe
userDb.serialize(() => {
    userDb.run(`CREATE TABLE IF NOT EXISTS canciones (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        titulo TEXT NOT NULL,
        letra TEXT NOT NULL
    )`);
});

let controlPanelWindow;
let projectionWindow;

//Crea la ventana principal de control
function createControlPanel() {
  controlPanelWindow = new BrowserWindow({
    width: 1200, height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false
    }
  });
  controlPanelWindow.loadFile('index.html');
  controlPanelWindow.webContents.openDevTools(); 
}

//Crea la ventana de proyección
function createProjectionWindow() {
  if (projectionWindow) { projectionWindow.focus(); return; }
  projectionWindow = new BrowserWindow({
    width: 800, height: 600, title: 'Pantalla de Proyección', autoHideMenuBar: true,
    webPreferences: { 
      preload: path.join(__dirname, 'projection-preload.js'), 
      contextIsolation: true, nodeIntegration: false
    }
  });
  projectionWindow.loadFile('projection.html');
  projectionWindow.on('closed', () => { projectionWindow = null; });
}

app.whenReady().then(() => { createControlPanel(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

// ---- Comunicaciones hacia pantalla de proyeccion ----

ipcMain.on('open-projection', () => { createProjectionWindow(); });

ipcMain.on('send-text', (event, text) => {
  if (projectionWindow) projectionWindow.webContents.send('receive-text', text);
});

ipcMain.on('change-text-style', (event, styleData) => {
    // Si la ventana de proyección está abierta, le pasamos los datos
    if (projectionWindow) {
        projectionWindow.webContents.send('update-text-style', styleData);
    }
});

// Obtiene todas las versiones de la Base de datos de biblia
ipcMain.handle('get-versions', async () => {
  return new Promise((resolve, reject) => {
    db.all(`SELECT id, nombre, abreviatura FROM versiones ORDER BY id`, [], (err, rows) => {
      if (err) reject(err); else resolve(rows);
    });
  });
});

// Recibe versionId y devuelve los libros de esa versión
ipcMain.handle('get-books', async (event, versionId) => {
  return new Promise((resolve, reject) => {
    const sql = `SELECT l.id, l.nombre AS name 
                 FROM libros l
                 JOIN version_libro_link vll ON l.id = vll.id_libro
                 WHERE vll.id_version = ? 
                 ORDER BY l.id`;
    db.all(sql, [versionId], (err, rows) => {
      if (err) reject(err); else resolve(rows);
    });
  });
});

// Recibe versionId y bookId y devuelve los capítulos de ese libro
ipcMain.handle('get-chapters', async (event, { versionId, bookId }) => {
  return new Promise((resolve, reject) => {
    const sql = `SELECT DISTINCT capitulo AS number 
                 FROM versiculos 
                 WHERE id_version = ? AND id_libro = ? 
                 ORDER BY capitulo`;
    db.all(sql, [versionId, bookId], (err, rows) => {
      if (err) reject(err); else resolve(rows);
    });
  });
});

// Recibe versionId, bookId y chapterNumber y devuelve los versículos de ese capítulo
ipcMain.handle('get-verses', async (event, { versionId, bookId, chapterNumber }) => {
  return new Promise((resolve, reject) => {
    const sql = `SELECT id, versiculo AS number, texto AS text 
                 FROM versiculos 
                 WHERE id_version = ? AND id_libro = ? AND capitulo = ? 
                 ORDER BY versiculo`;
    db.all(sql, [versionId, bookId, chapterNumber], (err, rows) => {
      if (err) reject(err); else resolve(rows);
    });
  });
});

// --- MANEJADORES PARA FONDOS ---
ipcMain.on('change-bg-color', (event, color) => {
  if (projectionWindow) projectionWindow.webContents.send('set-bg-color', color);
});

ipcMain.on('change-bg-image', (event, imageData) => {
  if (projectionWindow) projectionWindow.webContents.send('set-bg-image', imageData);
});

ipcMain.on('change-bg-video', (event, videoPath) => {
  if (projectionWindow) projectionWindow.webContents.send('set-bg-video', videoPath);
});

//Abre el explorador de archivos de windows para cargar imágenes y videos
ipcMain.handle('open-media-dialog', async () => {
    const result = await dialog.showOpenDialog(controlPanelWindow, {
        title: 'Seleccionar Fondos (Imágenes o Videos)',
        properties: ['openFile', 'multiSelections'], // Permite elegir varios a la vez
        filters: [
            { name: 'Multimedia', extensions: ['jpg', 'jpeg', 'png', 'gif', 'mp4', 'avi', 'mkv', 'webm'] }
        ]
    });
    return result.filePaths; // Devuelve las rutas reales exactas
});

// --- MANEJADORES IPC PARA CANCIONES
ipcMain.handle('get-songs', () => {
    return new Promise((resolve, reject) => {
        userDb.all("SELECT * FROM canciones ORDER BY titulo ASC", (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
});

ipcMain.handle('add-song', (event, song) => {
    return new Promise((resolve, reject) => {
        userDb.run("INSERT INTO canciones (titulo, letra) VALUES (?, ?)", [song.titulo, song.letra], function(err) {
            if (err) reject(err);
            else resolve(this.lastID);
        });
    });
});
// preload.js
const { contextBridge, ipcRenderer } = require('electron');

// Exponemos un objeto global llamado electronAPI en la ventana index
contextBridge.exposeInMainWorld('electronAPI', {
  // La función que exponemos se llama openProjection
  // Cuando se llame en el HTML, enviará el mensaje open-projection
  // al proceso principal main.js que está escuchando
  openProjection: () => ipcRenderer.send('open-projection'),

  // Envía el texto al proceso 'main' (main.js)
  sendText: (text) => ipcRenderer.send('send-text', text),

  //Obtiene las versiones, libros, capitulo y versículos de la base de datos
  getVersions: () => ipcRenderer.invoke('get-versions'),
  getBooks: (versionId) => ipcRenderer.invoke('get-books', versionId),
  getChapters: (versionId, bookId) => ipcRenderer.invoke('get-chapters', { versionId, bookId }),
  getVerses: (versionId, bookId, chapterNumber) => ipcRenderer.invoke('get-verses', { versionId, bookId, chapterNumber }),

  //OBTIENE LOS FONDOS
  changeBgColor: (color) => ipcRenderer.send('change-bg-color', color),
  changeBgImage: (imageData) => ipcRenderer.send('change-bg-image', imageData),
  changeBgVideo: (videoPath) => ipcRenderer.send('change-bg-video', videoPath),
  openMediaDialog: () => ipcRenderer.invoke('open-media-dialog'),

  //OBTIENE LAS CANCIONES DE LA BASE DE DATOS
  getSongs: () => ipcRenderer.invoke('get-songs'),
  addSong: (song) => ipcRenderer.invoke('add-song', song),

  //OBTIENE LOS AJUSTES DE TEXTO
  changeTextStyle: (styleData) => ipcRenderer.send('change-text-style', styleData),
  //onUpdateTextStyle: (callback) => ipcRenderer.on('update-text-style', (event, data) => callback(data))

  //Cambia la opaidad en pantalla
  changeDimmer: (opacity) => ipcRenderer.send('change-dimmer', opacity),

  changeLogo: (logoData) => ipcRenderer.send('change-logo', logoData),
});
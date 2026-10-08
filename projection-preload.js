// projection-preload.js
const { contextBridge, ipcRenderer } = require('electron');

// Expone una API segura a la ventana de proyección
contextBridge.exposeInMainWorld('electronAPI', {
  // Función para registrar un 'escuchador'
  // El 'renderer' de proyección usará esto para saber cuándo llega texto
  onReceiveText: (callback) => {
    ipcRenderer.on('receive-text', (event, text) => callback(text));
  },

  // RECEPTORES DE FONDO
    onReceiveBgColor: (callback) => ipcRenderer.on('set-bg-color', (event, color) => callback(color)),
    onReceiveBgImage: (callback) => ipcRenderer.on('set-bg-image', (event, imageData) => callback(imageData)),
    onReceiveBgVideo: (callback) => ipcRenderer.on('set-bg-video', (event, videoPath) => callback(videoPath)),

  // Escuchar cambios de estilo de texto
    onUpdateTextStyle: (callback) => ipcRenderer.on('update-text-style', (event, data) => callback(data)),

    onUpdateDimmer: (callback) => ipcRenderer.on('update-dimmer', (event, opacity) => callback(opacity)),

    onUpdateLogo: (callback) => ipcRenderer.on('update-logo', (event, logoData) => callback(logoData)),
});
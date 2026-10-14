// projection-preload.js
const { contextBridge, ipcRenderer } = require('electron');

// Expone una API segura a la ventana de proyección: casi todo son "escuchadores"
// de lo que manda el Panel de Control a través de main.js
contextBridge.exposeInMainWorld('electronAPI', {
  // TEXTO: { texto, cita, titulo, alineacion }
  onReceiveText: (callback) => ipcRenderer.on('receive-text', (event, data) => callback(data)),
  onSetTextVisible: (callback) => ipcRenderer.on('set-text-visible', (event, visible) => callback(visible)),

  // FONDOS
  onReceiveBgColor: (callback) => ipcRenderer.on('set-bg-color', (event, color) => callback(color)),
  onReceiveBgImage: (callback) => ipcRenderer.on('set-bg-image', (event, url) => callback(url)),
  onReceiveBgVideo: (callback) => ipcRenderer.on('set-bg-video', (event, url) => callback(url)),
  onUpdateBgFit: (callback) => ipcRenderer.on('update-bg-fit', (event, fit) => callback(fit)),
  onUpdateVideoLoop:(callback) => ipcRenderer.on('update-video-loop', (event, loopValue) => callback(loopValue)),
  onUpdateDimmer: (callback) => ipcRenderer.on('update-dimmer', (event, opacity) => callback(opacity)),

  // REPRODUCTOR DE VIDEO: recibe órdenes y avisa al panel en qué segundo va
  onVideoControl: (callback) => ipcRenderer.on('video-control', (event, data) => callback(data)),
  sendVideoStatus: (status) => ipcRenderer.send('video-status', status),

  // ESTILOS DEL TEXTO
  onUpdateTextStyle: (callback) => ipcRenderer.on('update-text-style', (event, data) => callback(data)),
  onToggleAutoFit: (callback) => ipcRenderer.on('toggle-auto-fit', (event, isAuto) => callback(isAuto)),
  onUpdateFontSize: (callback) => ipcRenderer.on('update-font-size', (event, size) => callback(size)),
  onUpdateCitationSize: (callback) => ipcRenderer.on('update-citation-size', (event, size) => callback(size)),
  onUpdateCitationAlign: (callback) => ipcRenderer.on('update-citation-align', (event, align) => callback(align)),

  // LOGO
  onUpdateLogo: (callback) => ipcRenderer.on('update-logo', (event, logoData) => callback(logoData)),

  // PRESENTACIONES
  onShowSlide: (callback) => ipcRenderer.on('show-slide', (event, data) => callback(data)),
  onClearSlide: (callback) => ipcRenderer.on('clear-slide', () => callback()),

  // CUENTA REGRESIVA
  onStartCountdown: (callback) => ipcRenderer.on('start-countdown', (event, data) => callback(data)),
  onStopCountdown: (callback) => ipcRenderer.on('stop-countdown', () => callback()),
});

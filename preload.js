// preload.js
const { contextBridge, ipcRenderer } = require('electron');

// Exponemos un objeto global llamado electronAPI en la ventana index (Panel de Control).
// Cada función envía un mensaje al proceso principal (main.js), que es quien habla
// con las bases de datos y con la ventana de proyección.
contextBridge.exposeInMainWorld('electronAPI', {
  // PROYECCIÓN
  openProjection: () => ipcRenderer.send('open-projection'),
  onProjectionStatus: (callback) => ipcRenderer.on('projection-status', (event, isOpen) => callback(isOpen)),
  onUpdatePreview: (callback) => ipcRenderer.on('update-preview', (event, imageSrc) => callback(imageSrc)),

  // Envía { texto, cita } a la pantalla de proyección
  sendText: (data) => ipcRenderer.send('send-text', data),
  // Muestra u oculta el texto en pantalla sin quitarlo
  setTextVisible: (visible) => ipcRenderer.send('set-text-visible', visible),

  // BIBLIAS: versiones, libros, capítulos y versículos
  getVersions: () => ipcRenderer.invoke('get-versions'),
  getBooks: (versionId) => ipcRenderer.invoke('get-books', versionId),
  getChapters: (versionId, bookId) => ipcRenderer.invoke('get-chapters', { versionId, bookId }),
  getVerses: (versionId, bookId, chapterNumber) => ipcRenderer.invoke('get-verses', { versionId, bookId, chapterNumber }),
  searchVerses: (versionId, query) => ipcRenderer.invoke('search-verses', { versionId, query }),

  // HISTORIAL DE VERSÍCULOS PROYECTADOS
  getBibleHistory: () => ipcRenderer.invoke('get-bible-history'),
  addBibleHistory: (verse) => ipcRenderer.invoke('add-bible-history', verse),
  removeBibleHistory: (id) => ipcRenderer.invoke('remove-bible-history', id),
  clearBibleHistory: () => ipcRenderer.invoke('clear-bible-history'),

  // FONDOS (reciben la url del archivo)
  changeBgColor: (color) => ipcRenderer.send('change-bg-color', color),
  changeBgImage: (url) => ipcRenderer.send('change-bg-image', url),
  changeBgVideo: (url) => ipcRenderer.send('change-bg-video', url),
  changeBgFit: (fit) => ipcRenderer.send('change-bg-fit', fit),
  setVideoLoop: (loopValue) => ipcRenderer.send('set-video-loop', loopValue),
  changeDimmer: (opacity) => ipcRenderer.send('change-dimmer', opacity),

  // REPRODUCTOR DE VIDEO: { accion: 'play' | 'pause' | 'seek', tiempo }
  videoControl: (data) => ipcRenderer.send('video-control', data),
  onVideoStatus: (callback) => ipcRenderer.on('video-status', (event, status) => callback(status)),

  // GALERÍA GUARDADA (categoria: 'fondo' | 'logo')
  getMedia: (categoria) => ipcRenderer.invoke('get-media', categoria),
  importMedia: (categoria) => ipcRenderer.invoke('import-media', categoria),
  removeMedia: (id) => ipcRenderer.invoke('remove-media', id),

  // CANCIONES
  getSongs: () => ipcRenderer.invoke('get-songs'),
  addSong: (song) => ipcRenderer.invoke('add-song', song),
  updateSong: (song) => ipcRenderer.invoke('update-song', song),
  deleteSong: (songId) => ipcRenderer.invoke('delete-song', songId),

  // AGENDAS
  createAgenda: (nombre) => ipcRenderer.invoke('create-agenda', nombre),
  getAgendas: () => ipcRenderer.invoke('get-agendas'),
  deleteAgenda: (agendaId) => ipcRenderer.invoke('delete-agenda', agendaId),
  getAgendaSongs: (agendaId) => ipcRenderer.invoke('get-agenda-songs', agendaId),
  addSongToAgenda: (data) => ipcRenderer.invoke('add-song-to-agenda', data),
  removeSongFromAgenda: (data) => ipcRenderer.invoke('remove-song-from-agenda', data),
  reorderAgenda: (data) => ipcRenderer.invoke('reorder-agenda', data),

  // AJUSTES DE TEXTO
  changeTextStyle: (styleData) => ipcRenderer.send('change-text-style', styleData),
  changeFontSize: (size) => ipcRenderer.send('change-font-size', size),
  toggleAutoFit: (isAuto) => ipcRenderer.send('toggle-auto-fit', isAuto),
  changeCitationSize: (size) => ipcRenderer.send('change-citation-size', size),
  changeCitationAlign: (align) => ipcRenderer.send('change-citation-align', align),

  // LOGO
  changeLogo: (logoData) => ipcRenderer.send('change-logo', logoData),

  // CUENTA REGRESIVA
  startCountdown: (data) => ipcRenderer.send('start-countdown', data),
  stopCountdown: () => ipcRenderer.send('stop-countdown'),

  // PRESENTACIONES
  getPresentations: () => ipcRenderer.invoke('get-presentations'),
  getPresentation: (id) => ipcRenderer.invoke('get-presentation', id),
  savePresentation: (data) => ipcRenderer.invoke('save-presentation', data),
  deletePresentation: (id) => ipcRenderer.invoke('delete-presentation', id),
  getPresentationStyles: () => ipcRenderer.invoke('get-presentation-styles'),
  savePresentationStyle: (data) => ipcRenderer.invoke('save-presentation-style', data),
  deletePresentationStyle: (id) => ipcRenderer.invoke('delete-presentation-style', id),
  pickImage: () => ipcRenderer.invoke('pick-image'),
  showSlide: (data) => ipcRenderer.send('show-slide', data),
  clearSlide: () => ipcRenderer.send('clear-slide'),

  // PÁGINA WEB
  webLoad: (text) => ipcRenderer.send('web-load', text),
  webPanelRect: (rect) => ipcRenderer.send('web-panel-rect', rect),
  webNav: (accion) => ipcRenderer.send('web-nav', accion),
  webZoom: (percent) => ipcRenderer.send('web-zoom', percent),
  webProject: (project) => ipcRenderer.send('web-project', project),
  webClose: () => ipcRenderer.send('web-close'),
  webInput: (input) => ipcRenderer.send('web-input', input),
  webStatusRequest: () => ipcRenderer.send('web-status-request'),
  onWebStatus: (callback) => ipcRenderer.on('web-status', (event, status) => callback(status)),
  onWebFrame: (callback) => ipcRenderer.on('web-frame', (event, frame) => callback(frame)),
  onWebError: (callback) => ipcRenderer.on('web-error', (event, message) => callback(message)),
});

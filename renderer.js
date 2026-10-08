const openButton = document.getElementById('openButton');
openButton.addEventListener('click', () => { window.electronAPI.openProjection(); });

const sendButton = document.getElementById('sendButton');
const textInput = document.getElementById('textInput');
sendButton.addEventListener('click', () => {
    // CORREGIDO: Era electronAPI, no Electron
    window.electronAPI.sendText({ texto: textInput.value, cita: "" }); 
});

// ==========================================
// BOTÓN PARA LIMPIAR TEXTO EN PANTALLA
// ==========================================

const clearTextButton = document.getElementById('clearTextBtn'); 

if (clearTextButton) {
    clearTextButton.addEventListener('click', () => {
        // 1. Enviamos texto y cita en blanco a la pantalla de proyección
        window.electronAPI.sendText({ texto: "", cita: "" });

        // 2. Quitamos el color amarillo de cualquier versículo seleccionado
        document.querySelectorAll('#col-verses div').forEach(el => {
            el.style.backgroundColor = 'transparent';
        });

        // 3. Quitamos el color amarillo de cualquier estrofa de canción seleccionada
        document.querySelectorAll('#stanzas-list div').forEach(el => {
            el.style.background = '#ffffff';
        });
    });
}


// ==========================================
// NAVEGACIÓN DEL MENÚ LATERAL (OPTIMIZADA)
// ==========================================

// 1. Variables de los botones del menú
const navBible = document.getElementById('nav-bible');
const navSongs = document.getElementById('nav-songs');
const navLogo = document.getElementById('nav-logo');
const navMultimedia = document.getElementById('nav-multimedia');
const navResources = document.getElementById('nav-resources');

// 2. Variables de las columnas
const colBooks = document.getElementById('col-books');
const colChapters = document.getElementById('col-chapters');
const colVerses = document.getElementById('col-verses');
const colSongs = document.getElementById('col-songs');
const colStanzas = document.getElementById('col-stanzas');
const colLogo = document.getElementById('col-logo');
const colMultimedia = document.getElementById('col-multimedia');
const colResources = document.getElementById('col-resources');

// 3. Función auxiliar: Apaga TODAS las columnas y quita el color de todos los botones
function hideAllAndReset() {
    // Ocultar columnas
    colBooks.style.display = 'none';
    colChapters.style.display = 'none';
    colVerses.style.display = 'none';
    colSongs.style.display = 'none';
    colStanzas.style.display = 'none';
    colLogo.style.display = 'none';
    colMultimedia.style.display = 'none';
    colResources.style.display = 'none';

    // Quitar fondo de los botones del menú
    navBible.style.backgroundColor = 'transparent';
    navSongs.style.backgroundColor = 'transparent';
    navLogo.style.backgroundColor = 'transparent';
    navMultimedia.style.backgroundColor = 'transparent';
    navResources.style.backgroundColor = 'transparent';
}

// 4. Funciones individuales (ahora son cortas y precisas)
function showBible() {
    hideAllAndReset();
    colBooks.style.display = 'flex';
    colChapters.style.display = 'flex';
    colVerses.style.display = 'flex';
    navBible.style.backgroundColor = 'rgba(255,255,255,0.2)';
}

function showSongs() {
    hideAllAndReset();
    colSongs.style.display = 'flex';
    colStanzas.style.display = 'flex';
    navSongs.style.backgroundColor = 'rgba(255,255,255,0.2)';
    
    if (typeof loadSongs === 'function') loadSongs(); // Cargar canciones si existe la función
}

function showLogo() {
    hideAllAndReset();
    colLogo.style.display = 'flex';
    navLogo.style.backgroundColor = 'rgba(255,255,255,0.2)';
}

function showMultimedia() {
    hideAllAndReset();
    colMultimedia.style.display = 'flex';
    navMultimedia.style.backgroundColor = 'rgba(255,255,255,0.2)';
}

function showResources() {
    hideAllAndReset();
    colResources.style.display = 'flex'; // Enciende la columna de recursos
    navResources.style.backgroundColor = 'rgba(255,255,255,0.2)'; // Ilumina el botón
}

// 5. Asignar los clics a los iconos del menú
navBible.addEventListener('click', showBible);
navSongs.addEventListener('click', showSongs);
navLogo.addEventListener('click', showLogo);
navMultimedia.addEventListener('click', showMultimedia);
navResources.addEventListener('click', showResources);

// Mostrar la sección de Biblia al iniciar la aplicación
showBible(); 


// ==========================================
// MÓDULO DE BIBLIAS
// ==========================================
const versionSelect = document.getElementById('versionSelect');
const booksListDiv = document.getElementById('books-list');
const chaptersListDiv = document.getElementById('col-chapters');
const versesListDiv = document.getElementById('col-verses');

// Variables para recordar dónde estamos
let currentVersionId = 1; 
let currentBookId = null;
let currentBookName = ''; //Para recordar el nombre del libro

// 1. Cargar las versiones en el selector
async function loadVersions() {
  try {
    const versions = await window.electronAPI.getVersions();
    versionSelect.innerHTML = ''; // Limpiar selector
    
    versions.forEach(v => {
      const option = document.createElement('option');
      option.value = v.id;
      option.textContent = `${v.nombre} (${v.abreviatura})`; // Ej: Reina-Valera 1960 (RVR1960)
      versionSelect.appendChild(option);
    });

    // Escuchar cuando el usuario cambia de versión
    versionSelect.addEventListener('change', (e) => {
      currentVersionId = e.target.value;
      chaptersListDiv.innerHTML = '<h3>Capítulos</h3>'; // Limpiar columnas al cambiar Biblia
      versesListDiv.innerHTML = '<h3>Versículos</h3>';
      loadBooks(); 
    });

    // Iniciar cargando la primera versión de la lista
    currentVersionId = versionSelect.value;
    loadBooks();

  } catch (error) { console.error('Error al cargar versiones:', error); }
}

async function loadBooks() {
  try {
    const books = await window.electronAPI.getBooks(currentVersionId); 
    booksListDiv.innerHTML = ''; 

    books.forEach(book => {
      const bookElement = document.createElement('div');
      bookElement.textContent = book.name;
      bookElement.style.cursor = 'pointer';
      bookElement.style.padding = '5px';
      bookElement.style.borderBottom = '1px solid #ccc';
      
      bookElement.addEventListener('click', () => {
        currentBookId = book.id; // Guardamos el ID del libro seleccionado
        currentBookName = book.name; // Guardamos el nombre del libro
        loadChapters(book.id); // Cargar capítulos del libro seleccionado
      });
      
      booksListDiv.appendChild(bookElement);
    });
  } catch (error) { console.error('Error al cargar libros:', error); }
}

async function loadChapters(bookId) {
  try {
    const chapters = await window.electronAPI.getChapters(currentVersionId, bookId);
    chaptersListDiv.innerHTML = '<h3>Capítulos</h3>'; 
    chaptersListDiv.scrollTop = 0;
    
    chapters.forEach(chapter => {
      const chapterElement = document.createElement('div');
      chapterElement.textContent = `Capítulo ${chapter.number}`;
      chapterElement.style.cursor = 'pointer';
      chapterElement.style.padding = '5px';
      chapterElement.style.borderBottom = '1px solid #ccc';

      chapterElement.addEventListener('click', () => loadVerses(currentBookId, chapter.number));
      chaptersListDiv.appendChild(chapterElement);
    });
  } catch (error) { console.error('Error al cargar capítulos:', error); }
}

async function loadVerses(bookId, chapterNumber) {
  try {
    const verses = await window.electronAPI.getVerses(currentVersionId, bookId, chapterNumber);
    versesListDiv.innerHTML = '<h3>Versículos</h3>'; 
    versesListDiv.scrollTop = 0;

    verses.forEach(verse => {
      const verseElement = document.createElement('div');
      verseElement.textContent = `${verse.number}. ${verse.text}`;
      verseElement.style.cursor = 'pointer';
      verseElement.style.padding = '5px';
      verseElement.style.borderBottom = '1px solid #ccc';

      verseElement.addEventListener('click', () => {
        // 1. Obtenemos el nombre de la versión elegida
        const versionSelect = document.getElementById('versionSelect');
        const versionText = versionSelect.options[versionSelect.selectedIndex].text;
        
        // 2. Armamos la cita bíblica
        const citaBiblica = `${currentBookName} ${chapterNumber}:${verse.number} - ${versionText}`;

        // 3. Enviamos el "paquete" a la pantalla
        window.electronAPI.sendText({ 
            texto: verse.text, 
            cita: citaBiblica 
        });
      });
      versesListDiv.appendChild(verseElement);
    });
  } catch (error) { console.error('Error al cargar versículos:', error); }
}

// ==========================================
// CONTROLES DE FONDO
// ==========================================
const bgColorInput = document.getElementById('bgColor');
const bgMediaBtn = document.getElementById('bgMediaBtn');
const bgGallery = document.getElementById('bgGallery');
const clearBgButton = document.getElementById('clearBgButton');

// Enviar color al cambiarlo
bgColorInput.addEventListener('input', (e) => {
    window.electronAPI.changeBgColor(e.target.value);
    // Quitar el borde azul de cualquier miniatura seleccionada
    document.querySelectorAll('#bgGallery img').forEach(img => img.style.border = '2px solid transparent');
});

// Leer las rutas reales desde la ventana de Windows
bgMediaBtn.addEventListener('click', async () => {
    const filePaths = await window.electronAPI.openMediaDialog();
    if (!filePaths || filePaths.length === 0) return;

    filePaths.forEach(filePath => {
        const safePath = 'file:///' + encodeURI(filePath.replace(/\\/g, '/'));
        const ext = filePath.split('.').pop().toLowerCase();
        const isVideo = ['mp4', 'mkv', 'avi', 'webm'].includes(ext);
        const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext);

        if (isImage) {
            const thumbnail = document.createElement('img');
            thumbnail.src = safePath; 
            thumbnail.style.width = '80px';
            thumbnail.style.height = '60px';
            thumbnail.style.objectFit = 'cover';
            thumbnail.style.cursor = 'pointer';
            thumbnail.style.borderRadius = '4px';
            thumbnail.style.border = '2px solid transparent';
            
            thumbnail.addEventListener('click', () => {
                window.electronAPI.changeBgImage(safePath); 
                document.querySelectorAll('#bgGallery img, #bgGallery video').forEach(el => el.style.border = '2px solid transparent');
                thumbnail.style.border = '2px solid #007bff';
            });
            bgGallery.appendChild(thumbnail);
            
        } else if (isVideo) {
            const thumbnail = document.createElement('video');
            thumbnail.src = safePath;
            thumbnail.style.width = '80px';
            thumbnail.style.height = '60px';
            thumbnail.style.objectFit = 'cover';
            thumbnail.style.cursor = 'pointer';
            thumbnail.style.borderRadius = '4px';
            thumbnail.style.border = '2px solid transparent';
            thumbnail.muted = true;
            
            thumbnail.preload = 'metadata';
            thumbnail.onloadedmetadata = () => { thumbnail.currentTime = 1; }; 

            thumbnail.addEventListener('mouseenter', () => thumbnail.play());
            thumbnail.addEventListener('mouseleave', () => thumbnail.pause());

            thumbnail.addEventListener('click', () => {
                window.electronAPI.changeBgVideo(safePath); 
                document.querySelectorAll('#bgGallery img, #bgGallery video').forEach(el => el.style.border = '2px solid transparent');
                thumbnail.style.border = '2px solid #007bff';
            });
            bgGallery.appendChild(thumbnail);
        }
    });
});

// Botón para quitar la imagen
clearBgButton.addEventListener('click', () => {
    document.querySelectorAll('#bgGallery img, #bgGallery video').forEach(el => el.style.border = '2px solid transparent');
    window.electronAPI.changeBgColor(bgColorInput.value); 
});


// ==========================================
// MÓDULO DE CANCIONES
// ==========================================
const btnNewSong = document.getElementById('btnNewSong');
const modalAddSong = document.getElementById('modalAddSong');
const btnCancelSong = document.getElementById('btnCancelSong');
const btnSaveSong = document.getElementById('btnSaveSong');
const songTitleInput = document.getElementById('songTitleInput');
const songLyricsInput = document.getElementById('songLyricsInput');
const songsList = document.getElementById('songs-list');
const stanzasList = document.getElementById('stanzas-list');
const songTitleDisplay = document.getElementById('songTitleDisplay');

// Abrir y Cerrar Modal
btnNewSong.addEventListener('click', () => modalAddSong.style.display = 'flex');
btnCancelSong.addEventListener('click', () => {
    modalAddSong.style.display = 'none';
    songTitleInput.value = '';
    songLyricsInput.value = '';
});

// Guardar Canción
btnSaveSong.addEventListener('click', async () => {
    const titulo = songTitleInput.value.trim();
    const letra = songLyricsInput.value.trim();
    
    if (titulo && letra) {
        await window.electronAPI.addSong({ titulo, letra });
        modalAddSong.style.display = 'none';
        songTitleInput.value = '';
        songLyricsInput.value = '';
        loadSongs(); // Recargar la lista
    } else {
        alert('Por favor, escribe un título y la letra.');
    }
});

// Cargar y mostrar la lista de canciones
async function loadSongs() {
    songsList.innerHTML = '';
    const songs = await window.electronAPI.getSongs();
    
    songs.forEach(song => {
        const div = document.createElement('div');
        div.textContent = song.titulo;
        div.style.padding = '10px';
        div.style.background = '#f8f9fa';
        div.style.border = '1px solid #dee2e6';
        div.style.cursor = 'pointer';
        div.style.borderRadius = '5px';
        div.style.color = 'black';
        
        div.addEventListener('click', () => {
            document.querySelectorAll('#songs-list div').forEach(el => el.style.background = '#f8f9fa');
            div.style.background = '#cce5ff'; // Resaltar
            showStanzas(song);
        });
        
        songsList.appendChild(div);
    });
}

// Separar en estrofas y proyectar
function showStanzas(song) {
    stanzasList.innerHTML = '';
    songTitleDisplay.textContent = song.titulo;
    
    const estrofas = song.letra.split(/\n\s*\n/);
    
    estrofas.forEach((estrofa) => {
        const div = document.createElement('div');
        div.innerText = estrofa;
        div.style.padding = '10px';
        div.style.background = '#ffffff';
        div.style.border = '1px solid #dee2e6';
        div.style.cursor = 'pointer';
        div.style.borderRadius = '5px';
        div.style.color = 'black';
        div.style.whiteSpace = 'pre-line'; 
        
        div.addEventListener('click', () => {
            // CORREGIDO: Era electronAPI, no Electron
            window.electronAPI.sendText({
                texto: estrofa.trim(),
                cita: song.titulo // El título aparecerá abajo como si fuera la cita bíblica
            });
            
            document.querySelectorAll('#stanzas-list div').forEach(el => el.style.background = '#ffffff');
            div.style.background = '#ffeb3b'; 
        });
        
        stanzasList.appendChild(div);
    });
}

// Iniciar cargando versiones de Biblia
loadVersions();

// ==========================================
// MÓDULO DE AJUSTES RÁPIDOS (TEXTO)
// ==========================================

const btnTextSettings = document.getElementById('btnTextSettings');
const modalTextSettings = document.getElementById('modalTextSettings');
const btnCloseSettings = document.getElementById('btnCloseSettings');

const fontSizeSlider = document.getElementById('fontSizeSlider');
const fontSizeValue = document.getElementById('fontSizeValue');
const textColorPicker = document.getElementById('textColorPicker');
const textShadowSlider = document.getElementById('textShadowSlider');
const textAlignSelect = document.getElementById('textAlignSelect');

// Abrir y cerrar el modal
btnTextSettings.addEventListener('click', () => modalTextSettings.style.display = 'flex');
btnCloseSettings.addEventListener('click', () => modalTextSettings.style.display = 'none');

// Función que recopila los datos y los envía a la proyección
function sendStyleUpdate() {
    const styleData = {
        fontSize: fontSizeSlider.value + 'vw', 
        color: textColorPicker.value,
        shadowSize: textShadowSlider.value,
        align: textAlignSelect.value
    };
    window.electronAPI.changeTextStyle(styleData);
}

// Escuchar cambios en los controles (¡se actualiza en tiempo real al moverlos!)
fontSizeSlider.addEventListener('input', (e) => {
    fontSizeValue.textContent = e.target.value + 'vw';
    sendStyleUpdate();
});
textColorPicker.addEventListener('input', sendStyleUpdate);
textShadowSlider.addEventListener('input', sendStyleUpdate);
textAlignSelect.addEventListener('change', sendStyleUpdate);

// ==========================================
// CONTROL DE ILUMINACIÓN (DIMMER)
// ==========================================
const dimmerSlider = document.getElementById('dimmerSlider');
const dimmerValue = document.getElementById('dimmerValue');

if (dimmerSlider) {
    dimmerSlider.addEventListener('input', (e) => {
        const opacity = e.target.value;
        // Actualizar el texto del porcentaje (ej. 0.5 * 100 = 50%)
        dimmerValue.textContent = Math.round(opacity * 100) + '%';
        // Enviar a la proyección
        window.electronAPI.changeDimmer(opacity);
    });
}

// ==========================================
// MÓDULO DE LOGO
// ==========================================

// (Opcional) Si quieres que este panel reaccione al menú lateral, debes agregar 
// colLogo.style.display = 'none'; en tus funciones showBible() y showSongs(),
// y crear una función showLogo() similar para mostrar el colLogo.

navLogo.addEventListener('click', () => {
    // Ocultar Biblia y Canciones (ajusta los IDs si necesitas)
    document.getElementById('col-books').style.display = 'none';
    document.getElementById('col-chapters').style.display = 'none';
    document.getElementById('col-verses').style.display = 'none';
    document.getElementById('col-songs').style.display = 'none';
    document.getElementById('col-stanzas').style.display = 'none';
    
    // Mostrar Logo
    colLogo.style.display = 'flex';
    
    // Resaltar en el menú
    navLogo.style.backgroundColor = 'rgba(255,255,255,0.2)';
    document.getElementById('nav-bible').style.backgroundColor = 'transparent';
    document.getElementById('nav-songs').style.backgroundColor = 'transparent';
});

// Controles del Logo
const btnLoadLogo = document.getElementById('btnLoadLogo');
const logoPathDisplay = document.getElementById('logoPathDisplay');
const toggleLogo = document.getElementById('toggleLogo');
const logoSize = document.getElementById('logoSize');
const logoSizeVal = document.getElementById('logoSizeVal');
const logoPosition = document.getElementById('logoPosition');

let currentLogoPath = '';

// Reutilizamos la función de medios para elegir el Logo
btnLoadLogo.addEventListener('click', async () => {
    const filePaths = await window.electronAPI.openMediaDialog();
    if (filePaths && filePaths.length > 0) {
        currentLogoPath = 'file:///' + encodeURI(filePaths[0].replace(/\\/g, '/'));
        logoPathDisplay.textContent = filePaths[0]; // Mostrar ruta
        sendLogoUpdate(); // Actualizar si está prendido
    }
});

// Enviar los datos del logo al proyectarse
function sendLogoUpdate() {
    window.electronAPI.changeLogo({
        src: currentLogoPath,
        visible: toggleLogo.checked,
        size: logoSize.value,
        position: logoPosition.value
    });
}

toggleLogo.addEventListener('change', sendLogoUpdate);
logoPosition.addEventListener('change', sendLogoUpdate);
logoSize.addEventListener('input', (e) => {
    logoSizeVal.textContent = e.target.value + 'vw';
    sendLogoUpdate();
});

// Función para mostrar MULTIMEDIA
function showMultimedia() {
    colMultimedia.style.display = 'flex';
    
    colBooks.style.display = 'none';
    colChapters.style.display = 'none';
    colVerses.style.display = 'none';
    colSongs.style.display = 'none';
    colStanzas.style.display = 'none';
    colLogo.style.display = 'none';
    
    navMultimedia.style.backgroundColor = 'rgba(255,255,255,0.2)';
    navBible.style.backgroundColor = 'transparent';
    navSongs.style.backgroundColor = 'transparent';
    navLogo.style.backgroundColor = 'transparent';
}

navMultimedia.addEventListener('click', showMultimedia);

// ==========================================
// MÓDULO MULTIMEDIA
// ==========================================
const btnAddMedia = document.getElementById('btnAddMedia');
const mediaGallery = document.getElementById('mediaGallery');
const tabVideos = document.getElementById('tabVideos');
const tabImages = document.getElementById('tabImages');
const chkVideoLoop = document.getElementById('chkVideoLoop');

let mediaLibrary = { videos: [], images: [] };
let currentTab = 'videos'; // Empieza en videos

// Enviar el estado del Loop cuando cambia
chkVideoLoop.addEventListener('change', () => {
    window.electronAPI.setVideoLoop(chkVideoLoop.checked);
});

// Cambiar pestañas
tabVideos.addEventListener('click', () => {
    currentTab = 'videos';
    tabVideos.style.background = '#333'; tabVideos.style.color = 'white';
    tabImages.style.background = '#eee'; tabImages.style.color = 'black';
    renderGallery();
});
tabImages.addEventListener('click', () => {
    currentTab = 'images';
    tabImages.style.background = '#333'; tabImages.style.color = 'white';
    tabVideos.style.background = '#eee'; tabVideos.style.color = 'black';
    renderGallery();
});

// Agregar medios
btnAddMedia.addEventListener('click', async () => {
    const filePaths = await window.electronAPI.openMediaDialog();
    if (filePaths && filePaths.length > 0) {
        filePaths.forEach(path => {
            const ext = path.split('.').pop().toLowerCase();
            const mediaObj = { name: path.split('\\').pop().split('/').pop(), path: 'file:///' + encodeURI(path.replace(/\\/g, '/')) };
            
            if (['mp4', 'webm', 'mov'].includes(ext)) {
                mediaLibrary.videos.push(mediaObj);
            } else if (['png', 'jpg', 'jpeg', 'gif'].includes(ext)) {
                mediaLibrary.images.push(mediaObj);
            }
        });
        renderGallery();
    }
});

// Dibujar la cuadrícula
function renderGallery() {
    mediaGallery.innerHTML = '';
    const items = currentTab === 'videos' ? mediaLibrary.videos : mediaLibrary.images;
    
    items.forEach(item => {
        const div = document.createElement('div');
        div.style = "background: #f1f1f1; padding: 10px; border-radius: 5px; text-align: center; cursor: pointer; word-break: break-all; font-size: 12px; border: 1px solid #ddd;";
        div.innerHTML = `<div>${currentTab === 'videos' ? '🎥' : '🖼️'}</div><div style="margin-top: 5px;">${item.name}</div>`;
        
        // Al hacer clic, enviarlo al proyector
        div.addEventListener('click', () => {
            if (currentTab === 'videos') {
                window.electronAPI.changeBgVideo(item.path);
            } else {
                window.electronAPI.changeBgImage(item.path);
            }
        });
        mediaGallery.appendChild(div);
    });
}

// ==========================================
// MÓDULO DE RECURSOS
// ==========================================

function showResources() {
    colResources.style.display = 'flex';
    // Ocultar las demás
    colBooks.style.display = 'none'; colChapters.style.display = 'none'; colVerses.style.display = 'none';
    colSongs.style.display = 'none'; colStanzas.style.display = 'none';
    colLogo.style.display = 'none'; colMultimedia.style.display = 'none';
    
    // Pestaña activa
    navResources.style.backgroundColor = 'rgba(255,255,255,0.2)';
    navBible.style.backgroundColor = 'transparent'; navSongs.style.backgroundColor = 'transparent';
    navLogo.style.backgroundColor = 'transparent'; navMultimedia.style.backgroundColor = 'transparent';
}
navResources.addEventListener('click', showResources);

// (Recuerda agregar colResources.style.display = 'none'; a tus funciones showBible, showSongs, showLogo, showMultimedia)

// --- Lógica Cuenta Regresiva ---
const btnStartTimer = document.getElementById('btnStartTimer');
const btnStopTimer = document.getElementById('btnStopTimer');
const countdownPrefix = document.getElementById('countdownPrefix');
const countdownMinutes = document.getElementById('countdownMinutes');

btnStartTimer.addEventListener('click', () => {
    window.electronAPI.startCountdown({
        prefix: countdownPrefix.value,
        minutes: parseInt(countdownMinutes.value)
    });
});

btnStopTimer.addEventListener('click', () => {
    window.electronAPI.stopCountdown();
});

// --- Lógica Notas Rápidas ---
// Reutilizamos sendText para mandar las notas directamente
for (let i = 1; i <= 4; i++) {
    document.getElementById(`btnNote${i}`).addEventListener('click', () => {
        const text = document.getElementById(`note${i}`).value;
        if (text.trim() !== "") {
            window.electronAPI.sendText(text);
        }
    });
}
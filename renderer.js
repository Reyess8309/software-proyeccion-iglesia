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
// FUNCIONAMIENTO GENERAL DE LA PANTALLA
// ==========================================

// Controles para menu lateral siempre visible
const navBible = document.getElementById('nav-bible');
const navSongs = document.getElementById('nav-songs');

// Columnas
const colBooks = document.getElementById('col-books');
const colChapters = document.getElementById('col-chapters');
const colVerses = document.getElementById('col-verses');
const colSongs = document.getElementById('col-songs');
const colStanzas = document.getElementById('col-stanzas');

// CORREGIDO: Funciones limpias para mostrar módulos
function showBible() {
    colBooks.style.display = 'flex';
    colChapters.style.display = 'flex';
    colVerses.style.display = 'flex';
    
    colSongs.style.display = 'none';
    colStanzas.style.display = 'none';
    
    navBible.style.backgroundColor = 'rgba(255,255,255,0.2)';
    navSongs.style.backgroundColor = 'transparent';
}

function showSongs() {
    colBooks.style.display = 'none';
    colChapters.style.display = 'none';
    colVerses.style.display = 'none';
    
    colSongs.style.display = 'flex';
    colStanzas.style.display = 'flex';
    
    navSongs.style.backgroundColor = 'rgba(255,255,255,0.2)';
    navBible.style.backgroundColor = 'transparent';
    
    loadSongs(); // Cargar canciones al entrar
}

// Asignar los clics a los iconos
navBible.addEventListener('click', showBible);
navSongs.addEventListener('click', showSongs);

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
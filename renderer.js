// renderer.js
// Panel de Control: aquí se elige qué mostrar. Todo se envía a la proyección a través de window.electronAPI (preload.js).

const $ = (id) => document.getElementById(id);

// Crea un elemento con clase y texto
function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

function iconButton(icon, title, onClick, className = 'btn btn-ghost btn-icon btn-sm') {
    const btn = el('button', className, icon);
    btn.title = title;
    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        onClick();
    });
    return btn;
}

function emptyState(icon, text) {
    const div = el('div', 'empty');
    div.appendChild(el('span', 'empty-icon', icon));
    div.appendChild(document.createTextNode(text));
    return div;
}

const formatTime = (seconds) => {
    const s = Math.max(0, Math.floor(seconds || 0));
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

// ==========================================
// PANEL "PANTALLA": PROYECCIÓN, VISTA PREVIA Y TEXTO EN PANTALLA
// ==========================================
const openButton = $('openButton');
const preview = $('preview');
const previewImg = $('previewImage');
const onAirLabel = $('onAirLabel');

openButton.addEventListener('click', () => window.electronAPI.openProjection());

window.electronAPI.onProjectionStatus((isOpen) => {
    openButton.textContent = isOpen ? 'Proyección abierta ✓' : 'Abrir proyección';
    openButton.classList.toggle('btn-primary', !isOpen);
    if (!isOpen) preview.classList.remove('en-vivo');
});

window.electronAPI.onUpdatePreview((imageSrc) => {
    previewImg.src = imageSrc;
    preview.classList.add('en-vivo');
});

function setOnAir(label) {
    onAirLabel.textContent = '';
    if (!label) {
        onAirLabel.textContent = 'Pantalla vacía';
        return;
    }
    onAirLabel.appendChild(document.createTextNode('En pantalla: '));
    onAirLabel.appendChild(el('strong', '', label));
}

// TRANSICIONES DEL TEXTO: una por categoría (biblia, canciones, notas), elegidas en Ajustes de texto
const TEXT_TRANSITIONS_KEY = 'transicionesTexto';
const textTransitions = {
    biblia: 'desvanecer', canciones: 'desvanecer', notas: 'desvanecer', duracion: 500,
    ...JSON.parse(localStorage.getItem(TEXT_TRANSITIONS_KEY) || '{}')
};
let lastTextCategory = 'notas'; // "Quitar texto" usa la transición de lo que estaba en pantalla

// Envía texto a la proyección. data: { texto, cita, titulo, alineacion }
// categoria: 'biblia' | 'canciones' | 'notas' (decide la transición)
// (el texto reemplaza a la cuenta regresiva, a la presentación y a la página web en pantalla)
function projectText(data, label, categoria = 'notas') {
    lastTextCategory = categoria;
    const transicion = { tipo: textTransitions[categoria] || 'ninguna', duracion: textTransitions.duracion };
    window.electronAPI.sendText({ texto: '', cita: '', ...data, transicion });
    if (textHidden) setTextHidden(false); // lo nuevo siempre se ve
    stopTimerStatus();
    presentingEnded();
    setOnAir(label);
}

function clearScreenText() {
    projectText({}, '', lastTextCategory);
    clearProjectedMark();
}
$('clearTextBtn').addEventListener('click', clearScreenText);

// MOSTRAR / OCULTAR TEXTO: el texto sigue cargado en la proyección, solo deja de verse
const toggleTextBtn = $('toggleTextBtn');
let textHidden = false;

function setTextHidden(hidden) {
    textHidden = hidden;
    window.electronAPI.setTextVisible(!hidden);
    toggleTextBtn.textContent = hidden ? 'Mostrar texto' : 'Ocultar texto';
    toggleTextBtn.title = hidden ? 'Vuelve a mostrar el texto (T)' : 'Oculta el texto sin quitarlo (T)';
    toggleTextBtn.classList.toggle('btn-primary', hidden);
    preview.classList.toggle('texto-oculto', hidden);
}
toggleTextBtn.addEventListener('click', () => setTextHidden(!textHidden));

// TEXTO RÁPIDO
const textInput = $('textInput');
function sendQuickText() {
    const texto = textInput.value.trim();
    if (!texto) return;
    projectText({ texto }, texto);
    clearProjectedMark();
}
$('sendButton').addEventListener('click', sendQuickText);
textInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendQuickText(); });

// ==========================================
// ELEMENTO PROYECTADO Y NAVEGACIÓN CON TECLADO
// ==========================================
// Lo que está en pantalla se marca con .proyectado. Con las flechas (o PageUp/PageDown
// de un presentador/clicker) se pasa al siguiente o anterior elemento .navegable de la misma lista.
let activeList = null;

function markProjected(element) {
    clearProjectedMark();
    element.classList.add('proyectado');
    element.scrollIntoView({ block: 'nearest' });
    activeList = element.parentElement;
}

function clearProjectedMark() {
    document.querySelectorAll('.proyectado').forEach(node => node.classList.remove('proyectado'));
}

const isModalOpen = () => [...document.querySelectorAll('.modal')].some(m => m.style.display === 'flex');

// ==========================================
// ATAJOS DE TECLADO (la lista completa está en Ajustes)
// ==========================================
// F11 y el zoom (Ctrl + / Ctrl -) los maneja main.js
function clearEverything() {
    clearScreenText();
    setBackground('color');
    toggleLogo.checked = false;
    sendLogoUpdate();
}

function toggleLogoShortcut() {
    if (!selectedLogo()) return;
    toggleLogo.checked = !toggleLogo.checked;
    sendLogoUpdate();
}

// Ctrl+F: busca canciones si se está en Canciones; si no, versículos
function focusSearch() {
    const completo = document.body.classList.contains('layout-completo');
    if (!completo && currentNav === 'nav-songs') {
        tabAllSongs.click();
        searchSong.focus();
        searchSong.select();
        return;
    }
    showSection(completo ? 'nav-pro' : 'nav-bible');
    showVerseView('search');
    verseSearchInput.select();
}

// Ctrl+1…8: botones visibles del menú lateral, en orden
function goToNav(number) {
    const navs = [...document.querySelectorAll('.sidebar .nav-btn')]
        .filter(btn => btn.id !== 'nav-settings' && btn.offsetParent !== null);
    if (navs[number - 1]) navs[number - 1].click();
}

// Atajos que funcionan aunque se esté escribiendo en un campo. Devuelve true si se usó la tecla.
function handleGlobalShortcut(e) {
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && !e.shiftKey && /^[1-8]$/.test(e.key)) { goToNav(Number(e.key)); return true; }
    if (ctrl && e.key.toLowerCase() === 'f') { focusSearch(); return true; }
    if (ctrl && e.key.toLowerCase() === 'p') { window.electronAPI.openProjection(); return true; }
    if (ctrl && e.key === ',') { modalSettings.style.display = 'flex'; return true; }
    if (ctrl || e.altKey || e.repeat) return false;
    if (e.key === 'F1') { clearEverything(); return true; }
    if (e.key === 'F2') { clearScreenText(); return true; }
    if (e.key === 'F3') { setBackground('color'); return true; }
    if (e.key === 'F4') { toggleLogoShortcut(); return true; }
    return false;
}

document.addEventListener('keydown', (e) => {
    if (document.activeElement && document.activeElement.id === 'webScreen') return; // las teclas van a la página web
    if (e.key === 'Escape') {
        document.querySelectorAll('.modal').forEach(m => m.style.display = 'none');
        return;
    }
    if (isModalOpen()) return;
    if (handleGlobalShortcut(e)) {
        e.preventDefault();
        return;
    }
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return;

    // T: ocultar / mostrar el texto (sin Ctrl ni Alt, y sin repetir si se deja presionada)
    if (e.key.toLowerCase() === 't' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        if (!e.repeat) setTextHidden(!textHidden);
        return;
    }

    const forward = ['ArrowDown', 'ArrowRight', 'PageDown'].includes(e.key);
    const backward = ['ArrowUp', 'ArrowLeft', 'PageUp'].includes(e.key);
    const edge = ['Home', 'End'].includes(e.key);

    // Mientras se presenta, las flechas, el espacio y el clicker avanzan la presentación
    if (presenting && (forward || backward || edge || e.key === ' ')) {
        e.preventDefault();
        if (edge) goToSlide(e.key === 'Home' ? 0 : pres.datos.diapositivas.length - 1);
        else if (backward) prevStep();
        else nextStep();
        return;
    }

    if (!activeList || !activeList.isConnected || activeList.offsetParent === null) return;
    if (!forward && !backward && !edge) return;

    e.preventDefault();
    const items = [...activeList.querySelectorAll(':scope > .navegable')];
    const current = items.findIndex(item => item.classList.contains('proyectado'));
    const next = edge
        ? items[e.key === 'Home' ? 0 : items.length - 1]
        : items[current + (forward ? 1 : -1)];
    if (next && !next.classList.contains('proyectado')) next.click();
});

// ==========================================
// MENÚ LATERAL
// ==========================================
const sections = {
    'nav-bible': 'sec-bible',
    'nav-songs': 'sec-songs',
    'nav-multimedia': 'sec-media',
    'nav-logo': 'sec-logo',
    'nav-resources': 'sec-resources',
    'nav-presentations': 'sec-presentations',
    'nav-web': 'sec-web'
};
// Presentar y Web también existen en la vista "Todo en pantalla" (se abren encima de la cuadrícula)
const GLOBAL_NAVS = ['nav-presentations', 'nav-web'];

let currentNav = 'nav-bible';   // sección abierta en "Por secciones"
let currentGlobal = null;       // Presentar / Web abierto en "Todo en pantalla" (null = cuadrícula "En vivo")

function showSection(navId) {
    const completo = document.body.classList.contains('layout-completo');
    let visible = navId;
    if (completo) {
        currentGlobal = GLOBAL_NAVS.includes(navId) ? navId : null;
        visible = currentGlobal;
        document.body.classList.toggle('vista-global', !!currentGlobal);
        $('nav-pro').classList.toggle('activo', !currentGlobal);
    } else {
        currentNav = navId;
    }
    for (const [nav, section] of Object.entries(sections)) {
        $(nav).classList.toggle('activo', nav === visible);
        $(section).classList.toggle('activa', nav === visible);
    }
    if (navId === 'nav-songs') loadSongs();
    if (visible === 'nav-presentations') openPresentationsSection();
    reportWebRect();
}
Object.keys(sections).forEach(navId => $(navId).addEventListener('click', () => showSection(navId)));
$('nav-pro').addEventListener('click', () => showSection('nav-pro'));

// ==========================================
// AJUSTES: DISEÑO DEL PANEL Y TEMA
// ==========================================
// "Todo en pantalla" no duplica nada: mueve los mismos paneles (con todo su funcionamiento)
// a una cuadrícula donde se ven a la vez. Al volver a "Por secciones" regresan a su lugar.
const PRO_GRID_PANELS = ['col-songs', 'col-stanzas', 'col-books', 'col-chapters', 'col-verses', 'panel-media'];
const PRO_TOOLS_PANELS = ['panel-logos', 'panel-logo-settings', 'panel-timer', 'panel-notes'];
const panelHomes = [...PRO_GRID_PANELS, ...PRO_TOOLS_PANELS].map(id => [$(id), $(id).parentElement]);

function applyLayout(layout) {
    const completo = layout === 'completo';
    document.body.classList.toggle('layout-completo', completo);
    if (completo) {
        PRO_GRID_PANELS.forEach(id => $('proGrid').insertBefore($(id), $('proTools')));
        PRO_TOOLS_PANELS.forEach(id => $('proTools').appendChild($(id)));
        loadSongs();
        showSection(GLOBAL_NAVS.includes(currentNav) ? currentNav : 'nav-pro');
    } else {
        panelHomes.forEach(([panel, home]) => home.appendChild(panel)); // en su orden original
        document.body.classList.remove('vista-global');
        showSection(currentGlobal || currentNav);
    }
    localStorage.setItem('disenoPanel', layout);
    document.querySelectorAll('.layout-option').forEach(opt => opt.classList.toggle('activo', opt.dataset.layout === layout));
}

function applyTheme(theme) {
    document.body.classList.toggle('tema-oscuro', theme === 'oscuro');
    localStorage.setItem('tema', theme);
    document.querySelectorAll('#themeSelector button').forEach(btn => btn.classList.toggle('activo', btn.dataset.theme === theme));
}

const modalSettings = $('modalSettings');
$('nav-settings').addEventListener('click', () => modalSettings.style.display = 'flex');
$('btnCloseAppSettings').addEventListener('click', () => modalSettings.style.display = 'none');
document.querySelectorAll('.layout-option').forEach(opt => opt.addEventListener('click', () => applyLayout(opt.dataset.layout)));
document.querySelectorAll('#themeSelector button').forEach(btn => btn.addEventListener('click', () => applyTheme(btn.dataset.theme)));

applyTheme(localStorage.getItem('tema') || 'claro');

// Marca un elemento como seleccionado dentro de su lista
function markSelected(element) {
    element.parentElement.querySelectorAll(':scope > .seleccionado').forEach(node => node.classList.remove('seleccionado'));
    element.classList.add('seleccionado');
}

// ==========================================
// BIBLIA
// ==========================================
const versionSelect = $('versionSelect');
const bookFilter = $('bookFilter');
const booksList = $('books-list');
const chaptersList = $('chapters-list');
const versesList = $('verses-list');

const TESTAMENTOS = { AT: 'Antiguo Testamento', NT: 'Nuevo Testamento', DC: 'Deuterocanónicos' };
const normalize = (text) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

let versions = [];
let currentVersionId = null;
let currentBookId = null;
let currentBookName = '';
let currentChapter = null;

function resetChapters() {
    $('chaptersTitle').textContent = 'Capítulos';
    chaptersList.innerHTML = '';
}
function resetVerses() {
    $('versesTitle').textContent = 'Versículos';
    versesList.innerHTML = '';
    versesList.appendChild(emptyState('📖', currentBookId ? 'Elige un capítulo' : 'Elige un libro y un capítulo'));
}

async function loadVersions() {
    try {
        versions = await window.electronAPI.getVersions();
        versionSelect.innerHTML = '';
        versions.forEach(v => {
            const option = el('option', '', `${v.abreviatura} · ${v.nombre}`);
            option.value = v.id;
            versionSelect.appendChild(option);
        });
        currentVersionId = versionSelect.value;
        await loadBooks();
    } catch (error) { console.error('Error al cargar versiones:', error); }
}

// Al cambiar de versión se mantiene el mismo libro y capítulo (para comparar traducciones)
versionSelect.addEventListener('change', async () => {
    currentVersionId = versionSelect.value;
    const books = await loadBooks();
    if (currentBookId && books.some(b => b.id === currentBookId)) {
        await loadChapters(currentBookId);
        if (currentChapter) await loadVerses(currentBookId, currentChapter);
    } else {
        currentBookId = null;
        currentChapter = null;
        resetChapters();
        resetVerses();
    }
    if (verseSearchInput.value.trim()) runVerseSearch();
});

async function loadBooks() {
    try {
        const books = await window.electronAPI.getBooks(currentVersionId);
        booksList.innerHTML = '';
        let lastGroup = null;
        books.forEach(book => {
            if (book.testamento !== lastGroup) {
                lastGroup = book.testamento;
                booksList.appendChild(el('div', 'group-label', TESTAMENTOS[book.testamento] || book.testamento));
            }
            const item = el('div', 'item-lista', book.name);
            item.dataset.search = normalize(book.name);
            if (book.id === currentBookId) item.classList.add('seleccionado');
            item.addEventListener('click', () => {
                currentBookId = book.id;
                currentBookName = book.name;
                currentChapter = null;
                markSelected(item);
                resetVerses();
                loadChapters(book.id);
            });
            booksList.appendChild(item);
        });
        filterBooks();
        return books;
    } catch (error) {
        console.error('Error al cargar libros:', error);
        return [];
    }
}

// Buscador de libros: oculta los que no coinciden y los títulos de grupo vacíos
function filterBooks() {
    const query = normalize(bookFilter.value.trim());
    let label = null, visibles = 0;
    const flush = () => { if (label) label.hidden = visibles === 0; };
    for (const node of booksList.children) {
        if (node.classList.contains('group-label')) {
            flush();
            label = node;
            visibles = 0;
        } else {
            node.hidden = query && !node.dataset.search.includes(query);
            if (!node.hidden) visibles++;
        }
    }
    flush();
}
bookFilter.addEventListener('input', filterBooks);
bookFilter.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const first = [...booksList.querySelectorAll('.item-lista')].find(node => !node.hidden);
    if (first) first.click();
});

async function loadChapters(bookId) {
    try {
        const chapters = await window.electronAPI.getChapters(currentVersionId, bookId);
        $('chaptersTitle').textContent = currentBookName;
        chaptersList.innerHTML = '';
        chaptersList.scrollTop = 0;
        chapters.forEach(chapter => {
            const chip = el('div', 'chip', chapter.number);
            if (chapter.number === currentChapter) chip.classList.add('seleccionado');
            chip.addEventListener('click', () => {
                currentChapter = chapter.number;
                markSelected(chip);
                showVerseView('chapter');
                loadVerses(bookId, chapter.number);
            });
            chaptersList.appendChild(chip);
        });
    } catch (error) { console.error('Error al cargar capítulos:', error); }
}

async function loadVerses(bookId, chapterNumber) {
    try {
        const verses = await window.electronAPI.getVerses(currentVersionId, bookId, chapterNumber);
        const version = versions.find(v => String(v.id) === String(currentVersionId));
        const bookName = currentBookName;
        $('versesTitle').textContent = `${bookName} ${chapterNumber}`;
        versesList.innerHTML = '';
        versesList.scrollTop = 0;

        verses.forEach(verse => {
            const item = el('div', 'verse navegable');
            item.appendChild(el('span', 'num', verse.number));
            item.appendChild(el('span', 'txt', verse.text));
            item.addEventListener('click', () => projectVerse({
                versionId: Number(currentVersionId), bookId, bookName, chapter: chapterNumber,
                number: verse.number, text: verse.text,
                cita: `${bookName} ${chapterNumber}:${verse.number} (${version ? version.abreviatura : ''})`
            }, item));
            versesList.appendChild(item);
        });
    } catch (error) { console.error('Error al cargar versículos:', error); }
}

// Proyecta un versículo y lo guarda en el historial
// verse: { versionId, bookId, bookName, chapter, number, text, cita }
function projectVerse(verse, item) {
    projectText({ texto: verse.text, cita: verse.cita }, verse.cita, 'biblia');
    markProjected(item);
    // (el historial se vuelve a leer al abrir su pestaña, así no se reordena mientras se usa)
    window.electronAPI.addBibleHistory(verse)
        .catch(error => console.error('Error al guardar el historial:', error));
}

// Abre en la pestaña "Capítulo" el capítulo de un versículo (de la búsqueda o del historial)
async function openVerseChapter(verse) {
    if (String(verse.versionId) !== String(currentVersionId) && versions.some(v => v.id === verse.versionId)) {
        versionSelect.value = verse.versionId;
        currentVersionId = versionSelect.value;
        await loadBooks();
    }
    currentBookId = verse.bookId;
    currentBookName = verse.bookName;
    currentChapter = verse.chapter;
    booksList.querySelectorAll('.item-lista').forEach(node =>
        node.classList.toggle('seleccionado', node.textContent === verse.bookName));
    showVerseView('chapter');
    await loadChapters(verse.bookId);
    await loadVerses(verse.bookId, verse.chapter);
    const target = [...versesList.querySelectorAll('.verse')]
        .find(node => node.querySelector('.num').textContent === String(verse.number));
    if (target) target.scrollIntoView({ block: 'center' });
}

// PESTAÑAS DEL PANEL DE VERSÍCULOS: Capítulo / Buscar / Historial
const verseViews = { chapter: versesList, search: $('verseSearchView'), history: $('verseHistoryView') };
let currentVerseView = 'chapter';

function showVerseView(view) {
    currentVerseView = view;
    for (const [name, node] of Object.entries(verseViews)) node.hidden = name !== view;
    $('verseTabs').querySelectorAll('button').forEach(btn => btn.classList.toggle('activo', btn.dataset.view === view));
    if (view === 'search') verseSearchInput.focus();
    if (view === 'history') loadHistory();
}
$('verseTabs').querySelectorAll('button').forEach(btn => btn.addEventListener('click', () => showVerseView(btn.dataset.view)));

// Resalta en el texto las palabras buscadas (sin importar acentos ni mayúsculas)
function highlightText(text, query) {
    const fragment = document.createDocumentFragment();
    const terms = normalize(query).split(/[^a-z0-9]+/).filter(Boolean);
    // Texto normalizado letra por letra (la "á" sigue ocupando una posición), para ubicar las coincidencias
    const norm = [...text].map(ch => normalize(ch).charAt(0) || ch).join('');
    const marked = new Array(norm.length).fill(false);
    for (const term of terms) {
        for (let i = norm.indexOf(term); i !== -1; i = norm.indexOf(term, i + term.length)) {
            marked.fill(true, i, i + term.length);
        }
    }
    const chars = [...text];
    let i = 0;
    while (i < chars.length) {
        let j = i;
        while (j < chars.length && marked[j] === marked[i]) j++;
        const part = chars.slice(i, j).join('');
        fragment.appendChild(marked[i] ? el('mark', '', part) : document.createTextNode(part));
        i = j;
    }
    return fragment;
}

// Fila con la cita arriba y el texto abajo (resultados de búsqueda e historial)
function verseHitRow(verse, { query, time, actions = [] } = {}) {
    const item = el('div', 'verse verse-hit navegable');
    const head = el('div', 'hit-head');
    head.appendChild(el('span', 'hit-ref', verse.cita));
    if (time) head.appendChild(el('span', 'hit-time', time));
    const actionsDiv = el('div', 'row-actions');
    actions.forEach(a => actionsDiv.appendChild(a));
    head.appendChild(actionsDiv);
    item.appendChild(head);
    const txt = el('span', 'txt');
    if (query) txt.appendChild(highlightText(verse.text, query));
    else txt.textContent = verse.text;
    item.appendChild(txt);
    item.addEventListener('click', () => projectVerse(verse, item));
    return item;
}

// BÚSQUEDA POR TEXTO
const verseSearchInput = $('verseSearchInput');
const verseSearchResults = $('verseSearchResults');
const verseSearchInfo = $('verseSearchInfo');
const SEARCH_HINT = verseSearchInfo.textContent;
let searchTimer = null;
let searchSeq = 0; // descarta respuestas de búsquedas anteriores

async function runVerseSearch() {
    clearTimeout(searchTimer);
    const query = verseSearchInput.value.trim();
    const seq = ++searchSeq;
    verseSearchResults.innerHTML = '';
    if (normalize(query).replace(/[^a-z0-9]/g, '').length < 3) {
        verseSearchInfo.textContent = SEARCH_HINT;
        return;
    }
    const version = versions.find(v => String(v.id) === String(currentVersionId));
    const abbr = version ? version.abreviatura : '';
    verseSearchInfo.textContent = 'Buscando…';
    try {
        const { total, results } = await window.electronAPI.searchVerses(currentVersionId, query);
        if (seq !== searchSeq) return;
        verseSearchInfo.textContent = total === 0
            ? `Sin resultados en ${abbr}.`
            : `${total} versículo${total === 1 ? '' : 's'} en ${abbr}` + (total > results.length ? ` (se muestran los primeros ${results.length})` : '');
        if (total === 0) {
            verseSearchResults.appendChild(emptyState('🔍', 'Prueba con menos palabras o con otra versión.'));
            return;
        }
        results.forEach(r => {
            const verse = {
                versionId: Number(currentVersionId), bookId: r.bookId, bookName: r.bookName,
                chapter: r.chapter, number: r.number, text: r.text,
                cita: `${r.bookName} ${r.chapter}:${r.number} (${abbr})`
            };
            verseSearchResults.appendChild(verseHitRow(verse, {
                query,
                actions: [iconButton('📖', 'Abrir el capítulo', () => openVerseChapter(verse))]
            }));
        });
    } catch (error) {
        console.error('Error al buscar versículos:', error);
        if (seq === searchSeq) verseSearchInfo.textContent = 'No se pudo realizar la búsqueda.';
    }
}

verseSearchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(runVerseSearch, 250);
});
verseSearchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') runVerseSearch();
    if (e.key === 'ArrowDown') {
        const first = verseSearchResults.querySelector('.navegable');
        if (first) { e.preventDefault(); verseSearchInput.blur(); first.click(); }
    }
});

// HISTORIAL
const verseHistoryList = $('verseHistoryList');
const verseHistoryFilter = $('verseHistoryFilter');
let bibleHistory = [];

function historyTime(fecha) {
    const date = new Date(String(fecha).replace(' ', 'T') + 'Z'); // SQLite guarda la hora en UTC
    const time = date.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
    if (date.toDateString() === new Date().toDateString()) return time;
    return `${date.toLocaleDateString('es', { day: 'numeric', month: 'short' })} ${time}`;
}

async function loadHistory() {
    try {
        bibleHistory = await window.electronAPI.getBibleHistory();
        renderHistory();
    } catch (error) { console.error('Error al cargar el historial:', error); }
}

function renderHistory() {
    const query = normalize(verseHistoryFilter.value.trim());
    const items = query
        ? bibleHistory.filter(h => normalize(h.cita).includes(query) || normalize(h.text).includes(query))
        : bibleHistory;
    const projectedCita = verseHistoryList.querySelector('.proyectado .hit-ref')?.textContent;
    verseHistoryList.innerHTML = '';
    if (items.length === 0) {
        verseHistoryList.appendChild(emptyState('🕘', bibleHistory.length
            ? 'Ningún versículo coincide con el filtro.'
            : 'Aquí aparecerán los versículos que proyectes.'));
        return;
    }
    let lastDay = null;
    items.forEach(h => {
        const day = new Date(String(h.fecha).replace(' ', 'T') + 'Z').toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' });
        if (day !== lastDay) {
            lastDay = day;
            verseHistoryList.appendChild(el('div', 'group-label', day));
        }
        const row = verseHitRow(h, {
            time: historyTime(h.fecha),
            actions: [
                iconButton('📖', 'Abrir el capítulo', () => openVerseChapter(h)),
                iconButton('✕', 'Quitar del historial', async () => {
                    await window.electronAPI.removeBibleHistory(h.id);
                    loadHistory();
                })
            ]
        });
        if (h.cita === projectedCita) {
            row.classList.add('proyectado');
            activeList = verseHistoryList;
        }
        verseHistoryList.appendChild(row);
    });
}

verseHistoryFilter.addEventListener('input', renderHistory);
$('btnClearHistory').addEventListener('click', async () => {
    if (!bibleHistory.length || !confirm('¿Borrar todo el historial de versículos?')) return;
    await window.electronAPI.clearBibleHistory();
    loadHistory();
});

// ==========================================
// CANCIONES
// ==========================================
const modalAddSong = $('modalAddSong');
const songTitleInput = $('songTitleInput');
const songLyricsInput = $('songLyricsInput');
const songsList = $('songsList');
const searchSong = $('searchSong');
const stanzasList = $('stanzas-list');
const songTitleDisplay = $('songTitleDisplay');

let allSongs = [];

$('btnNewSong').addEventListener('click', () => {
    modalAddSong.style.display = 'flex';
    songTitleInput.focus();
});
function closeAddSongModal() {
    modalAddSong.style.display = 'none';
    songTitleInput.value = '';
    songLyricsInput.value = '';
}
$('btnCancelSong').addEventListener('click', closeAddSongModal);

$('btnSaveSong').addEventListener('click', async () => {
    const titulo = songTitleInput.value.trim();
    const letra = songLyricsInput.value.trim();
    if (!titulo || !letra) {
        alert('Por favor, escribe un título y la letra.');
        return;
    }
    await window.electronAPI.addSong({ titulo, letra });
    closeAddSongModal();
    loadSongs();
});

async function loadSongs() {
    allSongs = await window.electronAPI.getSongs();
    renderSongs();
}

// Fila de canción (se usa en "Canciones" y dentro de cada agenda)
function songRow(song, { onSelect, actions = [], prefix } = {}) {
    const row = el('div', 'song-row');
    if (stanzasList.dataset.songId === String(song.id)) row.classList.add('seleccionado');
    if (prefix !== undefined) row.appendChild(el('span', 'order', prefix));
    row.appendChild(el('span', 'song-title', song.titulo));
    const actionsDiv = el('div', 'row-actions');
    actions.forEach(a => actionsDiv.appendChild(a));
    row.appendChild(actionsDiv);
    row.addEventListener('click', () => {
        document.querySelectorAll('.song-row.seleccionado').forEach(r => r.classList.remove('seleccionado'));
        row.classList.add('seleccionado');
        (onSelect || showStanzas)(song);
    });
    return row;
}

// Lista filtrada por el buscador (título o letra, sin importar acentos)
function renderSongs() {
    const query = normalize(searchSong.value.trim());
    const songs = query
        ? allSongs.filter(s => normalize(s.titulo).includes(query) || normalize(s.letra).includes(query))
        : allSongs;

    songsList.innerHTML = '';
    if (songs.length === 0) {
        songsList.appendChild(emptyState('🎵', query ? 'No se encontraron canciones.' : 'Aún no hay canciones. Usa "+ Nueva".'));
        return;
    }
    songs.forEach(song => songsList.appendChild(songRow(song, {
        actions: [
            iconButton('📋', 'Agregar a agenda', () => openAgendaModal(song)),
            iconButton('✏️', 'Editar canción', () => openEditModal(song))
        ]
    })));
}
searchSong.addEventListener('input', renderSongs);

// Separar en estrofas (línea en blanco) y proyectar
function showStanzas(song) {
    stanzasList.innerHTML = '';
    stanzasList.dataset.songId = song.id;
    songTitleDisplay.textContent = song.titulo;

    song.letra.split(/\n\s*\n/)
        .map(estrofa => estrofa.trim())
        .filter(Boolean)
        .forEach((estrofa, index) => {
            const card = el('div', 'stanza navegable');
            card.appendChild(el('span', 'stanza-label', `Estrofa ${index + 1}`));
            card.appendChild(document.createTextNode(estrofa));
            card.addEventListener('click', () => {
                projectText({ texto: estrofa, cita: song.titulo }, `${song.titulo} · estrofa ${index + 1}`, 'canciones');
                markProjected(card);
            });
            stanzasList.appendChild(card);
        });
}

function clearStanzas() {
    stanzasList.innerHTML = '';
    delete stanzasList.dataset.songId;
    songTitleDisplay.textContent = 'Letra';
    const empty = emptyState('🎵', 'Elige una canción para ver sus estrofas');
    empty.style.gridColumn = '1 / -1';
    stanzasList.appendChild(empty);
}

// EDITAR Y ELIMINAR
const modalEditSong = $('modalEditSong');
const editSongId = $('editSongId');
const editSongTitle = $('editSongTitle');
const editSongLyrics = $('editSongLyrics');

function openEditModal(song) {
    editSongId.value = song.id;
    editSongTitle.value = song.titulo;
    editSongLyrics.value = song.letra || '';
    modalEditSong.style.display = 'flex';
}
$('btnCancelEdit').addEventListener('click', () => modalEditSong.style.display = 'none');

$('btnUpdateSong').addEventListener('click', async () => {
    const song = { id: Number(editSongId.value), titulo: editSongTitle.value.trim(), letra: editSongLyrics.value.trim() };
    if (!song.titulo || !song.letra) {
        alert('Por favor, escribe un título y la letra.');
        return;
    }
    await window.electronAPI.updateSong(song);
    modalEditSong.style.display = 'none';
    await loadSongs();
    if (viewAgendas.style.display !== 'none') loadAgendas();
    if (stanzasList.dataset.songId === String(song.id)) showStanzas(song);
});

$('btnDeleteSong').addEventListener('click', async () => {
    const id = Number(editSongId.value);
    if (!confirm(`¿Eliminar la canción "${editSongTitle.value}"? También se quitará de todas las agendas.`)) return;
    await window.electronAPI.deleteSong(id);
    modalEditSong.style.display = 'none';
    await loadSongs();
    if (viewAgendas.style.display !== 'none') loadAgendas();
    if (stanzasList.dataset.songId === String(id)) clearStanzas();
});

// PESTAÑAS CANCIONES / AGENDAS
const tabAllSongs = $('tabAllSongs');
const tabAgendas = $('tabAgendas');
const viewAllSongs = $('viewAllSongs');
const viewAgendas = $('viewAgendas');

tabAllSongs.addEventListener('click', () => {
    viewAllSongs.style.display = 'flex';
    viewAgendas.style.display = 'none';
    tabAllSongs.classList.add('activo');
    tabAgendas.classList.remove('activo');
});
tabAgendas.addEventListener('click', () => {
    viewAllSongs.style.display = 'none';
    viewAgendas.style.display = 'flex';
    tabAgendas.classList.add('activo');
    tabAllSongs.classList.remove('activo');
    loadAgendas();
});

// AGENDAS
const agendasList = $('agendasList');
const newAgendaName = $('newAgendaName');
let expandedAgendaId = null; // agenda abierta mostrando sus canciones

async function createAgenda() {
    const name = newAgendaName.value.trim();
    if (!name) return;
    expandedAgendaId = await window.electronAPI.createAgenda(name);
    newAgendaName.value = '';
    loadAgendas();
}
$('btnCreateAgenda').addEventListener('click', createAgenda);
newAgendaName.addEventListener('keydown', (e) => { if (e.key === 'Enter') createAgenda(); });

async function loadAgendas() {
    const agendas = await window.electronAPI.getAgendas();
    agendasList.innerHTML = '';
    if (agendas.length === 0) {
        agendasList.appendChild(emptyState('📋', 'Aún no hay agendas. Crea una arriba.'));
        return;
    }

    for (const ag of agendas) {
        const isOpen = ag.id === expandedAgendaId;
        const card = el('div', 'agenda-card');
        const head = el('div', 'agenda-head');
        head.appendChild(el('strong', '', `${isOpen ? '▾' : '▸'}  ${ag.nombre}`));
        head.appendChild(el('span', 'badge', `${ag.total} ${ag.total === 1 ? 'canción' : 'canciones'}`));
        head.appendChild(iconButton('🗑️', 'Eliminar agenda', async () => {
            if (!confirm(`¿Eliminar la agenda "${ag.nombre}"? Las canciones no se borran del cancionero.`)) return;
            await window.electronAPI.deleteAgenda(ag.id);
            loadAgendas();
        }));
        head.addEventListener('click', () => {
            expandedAgendaId = isOpen ? null : ag.id;
            loadAgendas();
        });
        card.appendChild(head);
        if (isOpen) card.appendChild(await renderAgendaSongs(ag.id));
        agendasList.appendChild(card);
    }
}

// Canciones de una agenda con botones para subir, bajar y quitar
async function renderAgendaSongs(agendaId) {
    const songs = await window.electronAPI.getAgendaSongs(agendaId);
    const list = el('div', 'agenda-songs');
    if (songs.length === 0) {
        list.appendChild(emptyState('', 'Agrega canciones con el botón 📋 en la pestaña "Canciones".'));
        return list;
    }

    const move = async (from, to) => {
        const ids = songs.map(s => s.id);
        [ids[from], ids[to]] = [ids[to], ids[from]];
        await window.electronAPI.reorderAgenda({ agenda_id: agendaId, cancion_ids: ids });
        loadAgendas();
    };

    songs.forEach((song, index) => {
        const actions = [];
        if (index > 0) actions.push(iconButton('▲', 'Subir', () => move(index, index - 1)));
        if (index < songs.length - 1) actions.push(iconButton('▼', 'Bajar', () => move(index, index + 1)));
        actions.push(iconButton('✖', 'Quitar de la agenda', async () => {
            await window.electronAPI.removeSongFromAgenda({ agenda_id: agendaId, cancion_id: song.id });
            loadAgendas();
        }));
        list.appendChild(songRow(song, { actions, prefix: index + 1 }));
    });
    return list;
}

// MODAL "AGREGAR A AGENDA"
const modalAddToAgenda = $('modalAddToAgenda');
const agendaSelectBox = $('agendaSelectBox');

async function openAgendaModal(song) {
    $('agendaSongId').value = song.id;
    $('agendaSongTitleName').textContent = song.titulo;
    const agendas = await window.electronAPI.getAgendas();
    agendaSelectBox.innerHTML = '';
    if (agendas.length === 0) agendaSelectBox.appendChild(el('option', '', '(No hay agendas, crea una primero)')).value = '';
    agendas.forEach(ag => {
        const option = el('option', '', ag.nombre);
        option.value = ag.id;
        agendaSelectBox.appendChild(option);
    });
    modalAddToAgenda.style.display = 'flex';
}
$('btnCancelAgenda').addEventListener('click', () => modalAddToAgenda.style.display = 'none');

$('btnConfirmAddToAgenda').addEventListener('click', async () => {
    const agenda_id = Number(agendaSelectBox.value);
    const cancion_id = Number($('agendaSongId').value);
    if (!agenda_id) {
        alert('Por favor, crea una agenda primero en la pestaña "Agendas".');
        return;
    }
    const added = await window.electronAPI.addSongToAgenda({ agenda_id, cancion_id }); // 0 si ya estaba
    modalAddToAgenda.style.display = 'none';
    if (!added) alert('Esa canción ya está en la agenda seleccionada.');
});

// ==========================================
// FONDO (panel derecho) Y MULTIMEDIA
// ==========================================
const bgColorInput = $('bgColor');
const bgLabel = $('bgLabel');
const asidePlayPause = $('asidePlayPause');
const mediaPlayer = $('mediaPlayer');
const playerVideo = $('playerVideo');
const btnPlayPause = $('btnPlayPause');
const playerSeek = $('playerSeek');
const chkVideoLoop = $('chkVideoLoop');

let mediaItems = [];
let currentBackground = { tipo: 'color' }; // { tipo: 'color' | 'imagen' | 'video', item }

function setBackground(tipo, item) {
    currentBackground = { tipo, item };
    if (tipo === 'video') window.electronAPI.changeBgVideo(item.url);
    else if (tipo === 'imagen') window.electronAPI.changeBgImage(item.url);
    else window.electronAPI.changeBgColor(bgColorInput.value);

    bgLabel.textContent = item ? item.nombre : 'Color sólido';
    bgLabel.title = item ? item.ruta : '';
    asidePlayPause.hidden = tipo !== 'video';
    $('bgFitBlock').hidden = tipo === 'color';
    updatePlayer();
    renderMedia();
}

bgColorInput.addEventListener('input', () => setBackground('color'));
$('clearBgButton').addEventListener('click', () => setBackground('color'));
$('btnStopVideo').addEventListener('click', () => setBackground('color'));

// AJUSTE DE LA IMAGEN O VIDEO: rellenar, ajustar, estirar… (se guarda en este equipo)
const bgFitSelect = $('bgFitSelect');
bgFitSelect.value = localStorage.getItem('ajusteFondo') || 'rellenar';
bgFitSelect.addEventListener('change', () => {
    localStorage.setItem('ajusteFondo', bgFitSelect.value);
    window.electronAPI.changeBgFit(bgFitSelect.value);
});

// OSCURECER FONDO
const dimmerSlider = $('dimmerSlider');
dimmerSlider.addEventListener('input', (e) => {
    $('dimmerValue').textContent = Math.round(e.target.value * 100) + '%';
    window.electronAPI.changeDimmer(e.target.value);
});

// --- Reproductor: una copia silenciada del video que se ve en pantalla ---
function updatePlayer() {
    const isVideo = currentBackground.tipo === 'video';
    mediaPlayer.hidden = !isVideo;
    if (!isVideo) {
        playerVideo.pause();
        playerVideo.removeAttribute('src');
        playerVideo.load();
        return;
    }
    $('playerTitle').textContent = currentBackground.item.nombre;
    playerVideo.loop = chkVideoLoop.checked;
    playerVideo.src = currentBackground.item.url;
    playerVideo.play().catch(() => {});
}

function setPlaying(playing) {
    window.electronAPI.videoControl({ accion: playing ? 'play' : 'pause' });
    if (playing) playerVideo.play().catch(() => {});
    else playerVideo.pause();
}
const togglePlay = () => setPlaying(playerVideo.paused);
btnPlayPause.addEventListener('click', togglePlay);
asidePlayPause.addEventListener('click', togglePlay);

function refreshPlayButtons() {
    const icon = playerVideo.paused ? '▶' : '⏸';
    btnPlayPause.textContent = icon;
    asidePlayPause.textContent = icon;
}
['play', 'pause', 'ended'].forEach(evt => playerVideo.addEventListener(evt, refreshPlayButtons));

let seeking = false;
playerVideo.addEventListener('loadedmetadata', () => { $('playerDuration').textContent = formatTime(playerVideo.duration); });
playerVideo.addEventListener('timeupdate', () => {
    $('playerCurrent').textContent = formatTime(playerVideo.currentTime);
    if (!seeking && playerVideo.duration) playerSeek.value = (playerVideo.currentTime / playerVideo.duration) * 1000;
});
playerSeek.addEventListener('input', () => {
    seeking = true;
    if (playerVideo.duration) $('playerCurrent').textContent = formatTime((playerSeek.value / 1000) * playerVideo.duration);
});
playerSeek.addEventListener('change', () => {
    seeking = false;
    if (!playerVideo.duration) return;
    const tiempo = (playerSeek.value / 1000) * playerVideo.duration;
    playerVideo.currentTime = tiempo;
    window.electronAPI.videoControl({ accion: 'seek', tiempo });
});

// La proyección manda la posición real del video: si la copia del panel se desfasa, la corregimos
window.electronAPI.onVideoStatus((status) => {
    if (currentBackground.tipo !== 'video' || !status.src || seeking) return;
    if (Math.abs(playerVideo.currentTime - status.currentTime) > 0.6) playerVideo.currentTime = status.currentTime;
    if (status.paused && !playerVideo.paused) playerVideo.pause();
    if (!status.paused && playerVideo.paused) playerVideo.play().catch(() => {});
});

chkVideoLoop.addEventListener('change', () => {
    playerVideo.loop = chkVideoLoop.checked;
    window.electronAPI.setVideoLoop(chkVideoLoop.checked);
});

// --- Galería: se agrupa sola en Videos e Imágenes ---
async function loadMedia() {
    mediaItems = await window.electronAPI.getMedia('fondo');
    renderMedia();
}

$('btnAddMedia').addEventListener('click', async () => {
    mediaItems = await window.electronAPI.importMedia('fondo');
    renderMedia();
});

function mediaCard(item, { selected, onClick, onRemove, contain }) {
    const card = el('div', 'media-card');
    if (selected) card.classList.add(selected);
    if (!item.existe) {
        card.classList.add('faltante');
        card.title = 'No se encuentra el archivo: ' + item.ruta;
    }

    let thumb;
    if (item.tipo === 'video') {
        thumb = document.createElement('video');
        thumb.muted = true;
        thumb.preload = 'metadata';
        const duration = el('span', 'duration', '');
        thumb.addEventListener('loadedmetadata', () => {
            duration.textContent = formatTime(thumb.duration);
            thumb.currentTime = Math.min(1, thumb.duration / 10); // primer cuadro útil como miniatura
        });
        card.addEventListener('mouseenter', () => thumb.play().catch(() => {}));
        card.addEventListener('mouseleave', () => thumb.pause());
        card.appendChild(duration);
    } else {
        thumb = document.createElement('img');
        thumb.alt = '';
        thumb.loading = 'lazy';
    }
    thumb.className = 'thumb' + (contain ? ' contain' : '');
    if (item.existe) thumb.src = item.url;
    card.prepend(thumb);

    card.appendChild(el('span', 'badge badge-live on-air', 'EN PANTALLA'));
    const meta = el('div', 'meta');
    meta.appendChild(el('span', 'name', item.nombre));
    if (!item.existe) meta.appendChild(el('span', 'badge', 'no encontrado'));
    card.appendChild(meta);
    card.appendChild(iconButton('✕', 'Quitar de la galería', onRemove, 'remove'));

    card.addEventListener('click', () => {
        if (!item.existe) {
            alert('No se encuentra el archivo. Quizás se movió o se borró:\n' + item.ruta);
            return;
        }
        onClick();
    });
    return card;
}

function renderMedia() {
    const groups = { video: [$('galleryVideos'), $('groupVideos'), $('countVideos')], imagen: [$('galleryImages'), $('groupImages'), $('countImages')] };
    for (const [tipo, [grid, group, count]] of Object.entries(groups)) {
        const items = mediaItems.filter(m => m.tipo === tipo);
        grid.innerHTML = '';
        group.hidden = items.length === 0;
        count.textContent = items.length;
        items.forEach(item => grid.appendChild(mediaCard(item, {
            selected: currentBackground.item && currentBackground.item.id === item.id ? 'activo' : '',
            onClick: () => setBackground(item.tipo, item),
            onRemove: async () => {
                if (currentBackground.item && currentBackground.item.id === item.id) setBackground('color');
                await window.electronAPI.removeMedia(item.id);
                loadMedia();
            }
        })));
    }
    $('mediaEmpty').hidden = mediaItems.length > 0;
}

// ==========================================
// LOGO
// ==========================================
const toggleLogo = $('toggleLogo');
const logoSize = $('logoSize');
const posButtons = [...document.querySelectorAll('#logoPosition .pos-btn')];

let logos = [];
let selectedLogoId = Number(localStorage.getItem('logoSeleccionado')) || null;
let logoPosition = localStorage.getItem('logoPosicion') || 'top-right';

const selectedLogo = () => logos.find(l => l.id === selectedLogoId && l.existe);

async function loadLogos() {
    logos = await window.electronAPI.getMedia('logo');
    renderLogos();
}

$('btnAddLogos').addEventListener('click', async () => {
    logos = await window.electronAPI.importMedia('logo');
    if (!selectedLogo() && logos.length) selectLogo(logos[logos.length - 1]);
    else renderLogos();
});

function selectLogo(logo) {
    selectedLogoId = logo ? logo.id : null;
    localStorage.setItem('logoSeleccionado', selectedLogoId || '');
    renderLogos();
    sendLogoUpdate();
}

function renderLogos() {
    const gallery = $('logoGallery');
    gallery.innerHTML = '';
    $('logoEmpty').hidden = logos.length > 0;
    logos.forEach(logo => gallery.appendChild(mediaCard(logo, {
        selected: logo.id === selectedLogoId ? 'seleccionado' : '',
        contain: true,
        onClick: () => selectLogo(logo),
        onRemove: async () => {
            await window.electronAPI.removeMedia(logo.id);
            if (logo.id === selectedLogoId) selectedLogoId = null;
            await loadLogos();
            sendLogoUpdate();
        }
    })));

    const current = selectedLogo();
    $('logoPathDisplay').textContent = current ? current.ruta : 'Ningún logo seleccionado';
    posButtons.forEach(btn => {
        btn.classList.toggle('activo', btn.dataset.pos === logoPosition);
        const img = btn.querySelector('img');
        if (current) img.src = current.url;
        else img.removeAttribute('src');
    });
}

posButtons.forEach(btn => btn.addEventListener('click', () => {
    logoPosition = btn.dataset.pos;
    localStorage.setItem('logoPosicion', logoPosition);
    renderLogos();
    sendLogoUpdate();
}));

function sendLogoUpdate() {
    const current = selectedLogo();
    window.electronAPI.changeLogo({
        src: current ? current.url : '',
        visible: toggleLogo.checked && !!current,
        size: logoSize.value,
        position: logoPosition
    });
}

toggleLogo.addEventListener('change', () => {
    if (toggleLogo.checked && !selectedLogo()) alert('Primero agrega y elige un logo.');
    sendLogoUpdate();
});
logoSize.addEventListener('input', (e) => {
    $('logoSizeVal').textContent = e.target.value + '%';
    sendLogoUpdate();
});

// ==========================================
// CUENTA REGRESIVA
// ==========================================
const countdownMinutes = $('countdownMinutes');
const countdownSeconds = $('countdownSeconds');
const countdownUntil = $('countdownUntil');
const timerStatus = $('timerStatus');

let untilTarget = null;     // hora exacta elegida en "hasta una hora"
let timerEnd = null;        // cuándo termina la cuenta que está en pantalla
let timerStatusInterval = null;

function setTimerDigits(totalSeconds) {
    const s = Math.max(0, Math.round(totalSeconds));
    countdownMinutes.value = Math.floor(s / 60);
    countdownSeconds.value = String(s % 60).padStart(2, '0');
}
const digitsSeconds = () => (parseInt(countdownMinutes.value, 10) || 0) * 60 + (parseInt(countdownSeconds.value, 10) || 0);

// Si el usuario cambia los números a mano, deja de usarse "hasta una hora"
function manualTime(totalSeconds) {
    untilTarget = null;
    setTimerDigits(totalSeconds);
}

$('btnTimerPlus').addEventListener('click', () => manualTime(digitsSeconds() + 60));
$('btnTimerMinus').addEventListener('click', () => manualTime(digitsSeconds() - 60));
[countdownMinutes, countdownSeconds].forEach(input => input.addEventListener('change', () => manualTime(digitsSeconds())));
document.querySelectorAll('#timerPresets [data-min]').forEach(btn =>
    btn.addEventListener('click', () => manualTime(Number(btn.dataset.min) * 60)));

// Hasta una hora exacta (si ya pasó hoy, se toma la de mañana)
function nextOccurrence(hhmm) {
    const [h, m] = hhmm.split(':').map(Number);
    const target = new Date();
    target.setHours(h, m, 0, 0);
    if (target <= new Date()) target.setDate(target.getDate() + 1);
    return target.getTime();
}
$('btnUseUntil').addEventListener('click', () => {
    if (!countdownUntil.value) return countdownUntil.focus();
    untilTarget = nextOccurrence(countdownUntil.value);
    setTimerDigits((untilTarget - Date.now()) / 1000);
});

$('btnStartTimer').addEventListener('click', () => {
    const totalSeconds = untilTarget ? (untilTarget - Date.now()) / 1000 : digitsSeconds();
    if (totalSeconds <= 0) {
        alert('Elige un tiempo mayor que cero.');
        return;
    }
    const prefix = $('countdownPrefix').value.trim();
    window.electronAPI.startCountdown({ prefix, minutes: totalSeconds / 60 });
    if (textHidden) setTextHidden(false);
    presentingEnded();
    clearProjectedMark();
    setOnAir(`Cuenta regresiva${prefix ? ' · ' + prefix : ''}`);

    timerEnd = Date.now() + totalSeconds * 1000;
    clearInterval(timerStatusInterval);
    const tick = () => {
        const remaining = (timerEnd - Date.now()) / 1000;
        timerStatus.classList.toggle('en-curso', remaining > 0);
        timerStatus.textContent = remaining > 0 ? `En pantalla · quedan ${formatTime(Math.ceil(remaining))}` : 'Terminó la cuenta regresiva';
        if (remaining <= 0) clearInterval(timerStatusInterval);
    };
    tick();
    timerStatusInterval = setInterval(tick, 500);
});

function stopTimerStatus() {
    clearInterval(timerStatusInterval);
    timerEnd = null;
    timerStatus.textContent = '';
    timerStatus.classList.remove('en-curso');
}

$('btnStopTimer').addEventListener('click', () => {
    window.electronAPI.stopCountdown();
    stopTimerStatus();
    setOnAir('');
});

// ==========================================
// NOTAS Y TEXTOS (se guardan en este equipo)
// ==========================================
const notesList = $('notesList');
const NOTES_KEY = 'notasRapidas';

let notes = JSON.parse(localStorage.getItem(NOTES_KEY) || 'null') || [
    { id: 1, titulo: '', texto: '', alineacion: 'center' },
    { id: 2, titulo: '', texto: '', alineacion: 'center' }
];
const saveNotes = () => localStorage.setItem(NOTES_KEY, JSON.stringify(notes));

function renderNotes() {
    notesList.innerHTML = '';
    notes.forEach(note => {
        const card = el('div', 'note-card');

        const title = el('input', 'input note-title');
        title.placeholder = 'Título (opcional) · ej. "Tema de hoy", "Aviso"';
        title.value = note.titulo;
        title.addEventListener('input', () => { note.titulo = title.value; saveNotes(); });

        const body = el('textarea', 'input');
        body.placeholder = 'Escribe el aviso, tema, definición o texto a proyectar…';
        body.value = note.texto;
        body.addEventListener('input', () => { note.texto = body.value; saveNotes(); });

        const footer = el('div', 'note-footer');
        const align = el('div', 'segmented');
        [['center', 'Centrado'], ['left', 'A la izquierda']].forEach(([value, label]) => {
            const btn = el('button', note.alineacion === value ? 'activo' : '', label);
            btn.addEventListener('click', () => {
                note.alineacion = value;
                saveNotes();
                align.querySelectorAll('button').forEach(b => b.classList.toggle('activo', b === btn));
            });
            align.appendChild(btn);
        });
        footer.appendChild(align);
        footer.appendChild(el('span', 'grow'));
        footer.appendChild(iconButton('🗑️', 'Eliminar nota', () => {
            if ((note.titulo || note.texto) && !confirm('¿Eliminar esta nota?')) return;
            notes = notes.filter(n => n !== note);
            saveNotes();
            renderNotes();
        }));
        const btnProject = el('button', 'btn btn-primary btn-sm', 'Proyectar');
        btnProject.addEventListener('click', () => {
            if (!note.titulo.trim() && !note.texto.trim()) return body.focus();
            projectText({ texto: note.texto.trim(), titulo: note.titulo.trim(), alineacion: note.alineacion },
                note.titulo.trim() || note.texto.trim().slice(0, 60), 'notas');
            markProjected(card);
        });
        footer.appendChild(btnProject);

        card.appendChild(title);
        card.appendChild(body);
        card.appendChild(footer);
        notesList.appendChild(card);
    });
}

$('btnAddNote').addEventListener('click', () => {
    notes.push({ id: Date.now(), titulo: '', texto: '', alineacion: 'center' });
    saveNotes();
    renderNotes();
    notesList.lastElementChild.querySelector('textarea').focus();
});

// ==========================================
// AJUSTES DE TEXTO
// ==========================================
const modalTextSettings = $('modalTextSettings');
const fontSizeSlider = $('fontSizeSlider');
const textColorPicker = $('textColorPicker');
const textShadowSlider = $('textShadowSlider');
const textAlignSelect = $('textAlignSelect');
const chkAutoFit = $('chkAutoFit');
const citationSizeSlider = $('citationSizeSlider');
const citationAlignSelect = $('citationAlignSelect');

$('btnTextSettings').addEventListener('click', () => modalTextSettings.style.display = 'flex');
$('btnCloseSettings').addEventListener('click', () => modalTextSettings.style.display = 'none');

// Color, borde y ubicación del texto (el tamaño va por separado: changeFontSize)
function sendStyleUpdate() {
    window.electronAPI.changeTextStyle({
        color: textColorPicker.value,
        shadowSize: textShadowSlider.value,
        align: textAlignSelect.value
    });
}
textColorPicker.addEventListener('input', sendStyleUpdate);
textShadowSlider.addEventListener('input', sendStyleUpdate);
textAlignSelect.addEventListener('change', sendStyleUpdate);

fontSizeSlider.addEventListener('input', (e) => {
    $('fontSizeValue').textContent = e.target.value;
    window.electronAPI.changeFontSize(e.target.value);
});

// Auto-ajuste: si está activo, el slider manual se deshabilita
function applyAutoFit() {
    fontSizeSlider.disabled = chkAutoFit.checked;
    fontSizeSlider.style.opacity = chkAutoFit.checked ? '0.4' : '1';
    window.electronAPI.toggleAutoFit(chkAutoFit.checked);
}
chkAutoFit.addEventListener('change', applyAutoFit);

citationSizeSlider.addEventListener('input', (e) => {
    $('citationSizeValue').textContent = e.target.value;
    window.electronAPI.changeCitationSize(e.target.value);
});
citationAlignSelect.addEventListener('change', (e) => window.electronAPI.changeCitationAlign(e.target.value));

// Transiciones del texto (se guardan en este equipo)
const transDuracion = $('transDuracion');
document.querySelectorAll('[data-categoria]').forEach(select => {
    Object.entries(window.SlideRenderer.TRANSICIONES).forEach(([value, label]) => {
        const option = el('option', '', label);
        option.value = value;
        select.appendChild(option);
    });
    select.value = textTransitions[select.dataset.categoria];
    select.addEventListener('change', () => {
        textTransitions[select.dataset.categoria] = select.value;
        localStorage.setItem(TEXT_TRANSITIONS_KEY, JSON.stringify(textTransitions));
    });
});
transDuracion.value = textTransitions.duracion;
$('transDuracionVal').textContent = (textTransitions.duracion / 1000).toFixed(1) + ' s';
transDuracion.addEventListener('input', () => {
    textTransitions.duracion = Number(transDuracion.value);
    $('transDuracionVal').textContent = (textTransitions.duracion / 1000).toFixed(1) + ' s';
    localStorage.setItem(TEXT_TRANSITIONS_KEY, JSON.stringify(textTransitions));
});

// ==========================================
// INICIO
// ==========================================
// Enviamos los ajustes iniciales para que la proyección arranque igual que el panel
function sendInitialSettings() {
    sendStyleUpdate();
    window.electronAPI.changeFontSize(fontSizeSlider.value);
    applyAutoFit();
    window.electronAPI.changeCitationSize(citationSizeSlider.value);
    window.electronAPI.changeCitationAlign(citationAlignSelect.value);
    window.electronAPI.changeDimmer(dimmerSlider.value);
    window.electronAPI.changeBgFit(bgFitSelect.value);
    window.electronAPI.setVideoLoop(chkVideoLoop.checked);
}

// Arranca cuando ya se cargaron todos los scripts (presentaciones.js y web.js incluidos)
document.addEventListener('DOMContentLoaded', () => {
    applyLayout(localStorage.getItem('disenoPanel') || 'secciones');
    loadVersions();
    loadMedia();
    loadLogos().then(sendLogoUpdate);
    renderNotes();
    sendInitialSettings();
});

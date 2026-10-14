// presentaciones.js
// Módulo de presentaciones (estilo PowerPoint): editor, estilos, transiciones y modo presentador.
// Usa las funciones comunes de renderer.js ($, el, iconButton, setOnAir…) y SlideRenderer (slide-renderer.js).

const SR = window.SlideRenderer;

const presSelect = $('presSelect');
const slideThumbs = $('slideThumbs');
const editorStage = $('editorStage');
const editorFrame = $('slideEditorPreview');

let pres = null;            // { id, nombre, datos: { estilo, estiloNombre, transicion, diapositivas } }
let presIndex = 0;          // diapositiva seleccionada en el editor
let presenting = null;      // { indice, paso } mientras se presenta
let userStyles = [];
let presLoaded = false;
let saveTimer = null;

const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const clone = (obj) => JSON.parse(JSON.stringify(obj));
const currentSlide = () => pres.datos.diapositivas[presIndex];

// ---------- Plantillas ----------
const EJEMPLOS = {
    'titulo': { titulo: 'Título de la presentación', subtitulo: 'Subtítulo o nombre del presentador' },
    'titulo-contenido': { titulo: 'Nuevo tema', contenido: 'Primer punto\nSegundo punto\nTercer punto' },
    'seccion': { titulo: 'Nueva sección', subtitulo: 'Una breve descripción' },
    'dos-columnas': { titulo: 'Comparación', contenido: 'Ventaja uno\nVentaja dos', contenido2: 'Desventaja uno\nDesventaja dos' },
    'imagen-texto': { titulo: 'Título', contenido: 'Describe la imagen\nAgrega detalles' },
    'imagen': { titulo: '' },
    'cita': { titulo: 'La mejor manera de predecir el futuro es crearlo.', subtitulo: 'Peter Drucker' }
};

function newSlide(diseno = 'titulo-contenido') {
    return {
        id: newId(), diseno, titulo: '', subtitulo: '', contenido: '', contenido2: '', imagen: null, notas: '',
        animacion: { tipo: 'subir', pasoAPaso: false }, transicion: null,
        ...EJEMPLOS[diseno]
    };
}

function newPresentation(nombre) {
    const estilo = SR.ESTILOS_PREDEFINIDOS[0];
    return {
        nombre,
        datos: {
            estilo: clone(estilo.datos), estiloNombre: estilo.nombre,
            transicion: { tipo: 'desvanecer', duracion: 600 },
            diapositivas: [newSlide('titulo'), newSlide('titulo-contenido')]
        }
    };
}

// ---------- Dibujar diapositivas en marcos 16:9 ----------
// Cada marco se vuelve a escalar solo cuando cambia de tamaño (también al mostrarse una sección oculta)
const frameObserver = new ResizeObserver(entries => entries.forEach(entry => {
    const sl = entry.target.querySelector(':scope > .sl');
    if (sl) { SR.escalar(sl); SR.ajustarTexto(sl); }
}));

function mountSlide(frame, slide, estilo, opciones) {
    frame.innerHTML = '';
    SR.montarDiapositiva(frame, SR.crearDiapositiva(slide, estilo || pres.datos.estilo, opciones));
    frameObserver.observe(frame);
}

function slideFrame(slide, estilo, opciones) {
    const frame = el('div', 'slide-frame');
    // Se monta después de agregarlo al documento (necesita tener tamaño)
    requestAnimationFrame(() => mountSlide(frame, slide, estilo, opciones));
    return frame;
}

// El editor muestra la diapositiva lo más grande posible sin salirse
new ResizeObserver(() => {
    const w = editorStage.clientWidth, h = editorStage.clientHeight;
    if (!w || !h) return;
    let fw = w, fh = w * 9 / 16;
    if (fh > h) { fh = h; fw = h * 16 / 9; }
    Object.assign(editorFrame.style, { width: fw + 'px', height: fh + 'px', left: (w - fw) / 2 + 'px', top: (h - fh) / 2 + 'px' });
}).observe(editorStage);

// ---------- Cargar, abrir y guardar ----------
async function openPresentationsSection() {
    if (!presLoaded) {
        presLoaded = true;
        userStyles = await window.electronAPI.getPresentationStyles();
        fillStaticSelects();
        await loadPresentationList();
    }
}

async function loadPresentationList(selectId) {
    let list = await window.electronAPI.getPresentations();
    if (list.length === 0) {
        const first = newPresentation('Mi primera presentación');
        await window.electronAPI.savePresentation(first);
        list = await window.electronAPI.getPresentations();
    }
    presSelect.innerHTML = '';
    list.forEach(p => {
        const option = el('option', '', `${p.nombre} (${p.total})`);
        option.value = p.id;
        presSelect.appendChild(option);
    });
    const id = selectId || (pres && pres.id) || list[0].id;
    presSelect.value = id;
    if (!pres || pres.id !== Number(id)) await openPresentation(Number(id));
}

async function openPresentation(id) {
    if (presenting) stopPresenting();
    pres = await window.electronAPI.getPresentation(id);
    presIndex = 0;
    renderPresentation();
}

presSelect.addEventListener('change', () => openPresentation(Number(presSelect.value)));

function savePresentation() {
    $('presSaved').textContent = 'Guardando…';
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
        await window.electronAPI.savePresentation({ id: pres.id, nombre: pres.nombre, datos: pres.datos });
        $('presSaved').textContent = 'Guardado ✓';
        const option = presSelect.querySelector(`option[value="${pres.id}"]`);
        if (option) option.textContent = `${pres.nombre} (${pres.datos.diapositivas.length})`;
    }, 500);
}

$('btnNewPresentation').addEventListener('click', async () => {
    const id = await window.electronAPI.savePresentation(newPresentation('Nueva presentación'));
    pres = null;
    await loadPresentationList(id);
    $('presName').select();
});

$('btnDeletePresentation').addEventListener('click', async () => {
    if (!confirm(`¿Eliminar la presentación "${pres.nombre}"? No se puede deshacer.`)) return;
    if (presenting) stopPresenting();
    await window.electronAPI.deletePresentation(pres.id);
    pres = null;
    await loadPresentationList();
});

$('presName').addEventListener('input', (e) => {
    pres.nombre = e.target.value.trim() || 'Sin nombre';
    savePresentation();
});

// ---------- Dibujar toda la presentación ----------
function renderPresentation() {
    $('presName').value = pres.nombre;
    $('presSaved').textContent = '';
    renderThumbs();
    renderEditor();
    renderSlideProps();
    renderStyleProps();
    updatePresentingUI();
}

function renderThumbs() {
    slideThumbs.innerHTML = '';
    $('slideCount').textContent = pres.datos.diapositivas.length;
    pres.datos.diapositivas.forEach((slide, i) => slideThumbs.appendChild(createThumb(slide, i)));
}

function createThumb(slide, i) {
    const thumb = el('div', 'slide-thumb');
    thumb.draggable = true;
    thumb.dataset.index = i;
    if (i === presIndex) thumb.classList.add('seleccionado');
    if (presenting && presenting.indice === i) thumb.classList.add('proyectado');
    thumb.appendChild(el('span', 'num', i + 1));
    thumb.appendChild(slideFrame(slide));
    thumb.addEventListener('click', () => {
        if (presenting) goToSlide(i);
        else selectSlide(i);
    });

    // Arrastrar para reordenar
    thumb.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', String(i));
        e.dataTransfer.effectAllowed = 'move';
        thumb.classList.add('arrastrando');
    });
    thumb.addEventListener('dragend', () => thumb.classList.remove('arrastrando'));
    thumb.addEventListener('dragover', (e) => {
        e.preventDefault();
        const after = e.offsetY > thumb.clientHeight / 2;
        thumb.classList.toggle('soltar-antes', !after);
        thumb.classList.toggle('soltar-despues', after);
    });
    thumb.addEventListener('dragleave', () => thumb.classList.remove('soltar-antes', 'soltar-despues'));
    thumb.addEventListener('drop', (e) => {
        e.preventDefault();
        const after = thumb.classList.contains('soltar-despues');
        thumb.classList.remove('soltar-antes', 'soltar-despues');
        const from = Number(e.dataTransfer.getData('text/plain'));
        let to = i + (after ? 1 : 0);
        if (Number.isNaN(from) || from === to || from + 1 === to) return;
        moveSlide(from, to > from ? to - 1 : to);
    });
    return thumb;
}

function updateThumb(i) {
    const old = slideThumbs.children[i];
    if (old) slideThumbs.replaceChild(createThumb(pres.datos.diapositivas[i], i), old);
}

function renderEditor() {
    mountSlide(editorFrame, currentSlide(), null, { editor: true });
    $('slideNotes').value = currentSlide().notas || '';
}

function selectSlide(i) {
    presIndex = Math.max(0, Math.min(i, pres.datos.diapositivas.length - 1));
    slideThumbs.querySelectorAll('.slide-thumb').forEach((t, n) => t.classList.toggle('seleccionado', n === presIndex));
    const selected = slideThumbs.children[presIndex];
    if (selected) selected.scrollIntoView({ block: 'nearest' });
    renderEditor();
    renderSlideProps();
}

// ---------- Operaciones con diapositivas ----------
function addSlide(slide, at = presIndex + 1) {
    pres.datos.diapositivas.splice(at, 0, slide);
    presIndex = at;
    renderThumbs();
    selectSlide(at);
    savePresentation();
}

function moveSlide(from, to) {
    const list = pres.datos.diapositivas;
    const current = list[presIndex];
    const live = presenting && list[presenting.indice];
    const [moved] = list.splice(from, 1);
    list.splice(to, 0, moved);
    presIndex = list.indexOf(current);
    if (live) presenting.indice = list.indexOf(live);
    renderThumbs();
    savePresentation();
}

$('btnAddSlide').addEventListener('click', () => addSlide(newSlide($('newSlideLayout').value)));
$('btnDuplicateSlide').addEventListener('click', () => addSlide({ ...clone(currentSlide()), id: newId() }));
$('btnDeleteSlide').addEventListener('click', () => {
    const list = pres.datos.diapositivas;
    if (list.length === 1) return alert('La presentación necesita al menos una diapositiva.');
    if (!confirm('¿Eliminar esta diapositiva?')) return;
    list.splice(presIndex, 1);
    presIndex = Math.min(presIndex, list.length - 1);
    renderThumbs();
    selectSlide(presIndex);
    savePresentation();
});

// Cuando cambia el contenido de la diapositiva actual
function slideEdited({ props = false } = {}) {
    renderEditor();
    updateThumb(presIndex);
    if (props) renderSlideProps();
    savePresentation();
}

// ---------- Panel "Diapositiva" ----------
function fillStaticSelects() {
    const fill = (select, entries) => {
        select.innerHTML = '';
        entries.forEach(([value, label]) => {
            const option = el('option', '', label);
            option.value = value;
            select.appendChild(option);
        });
    };
    fill($('newSlideLayout'), Object.entries(SR.DISENOS));
    fill($('propAnimacion'), Object.entries(SR.ANIMACIONES));
    fill($('presTransicion'), Object.entries(SR.TRANSICIONES));
    fill($('stFuenteTitulo'), SR.FUENTES.map(f => [f, f]));
    fill($('stFuenteTexto'), SR.FUENTES.map(f => [f, f]));
    [...$('stFuenteTitulo').options, ...$('stFuenteTexto').options].forEach(o => o.style.fontFamily = o.value);
}

const ETIQUETAS = {
    titulo: { 'cita': 'Frase', 'imagen': 'Pie de foto (opcional)' },
    subtitulo: { 'cita': 'Autor', 'imagen': 'Texto secundario (opcional)' }
};

function renderSlideProps() {
    const slide = currentSlide();

    // Diseños con miniatura usando el estilo de esta presentación
    const picker = $('layoutPicker');
    picker.innerHTML = '';
    Object.entries(SR.DISENOS).forEach(([diseno, nombre]) => {
        const card = el('button', 'pick-card' + (slide.diseno === diseno ? ' activo' : ''));
        card.title = nombre;
        card.appendChild(slideFrame({ ...newSlide(diseno), imagen: null }, null, { editor: true }));
        card.appendChild(el('span', 'pick-label', nombre));
        card.addEventListener('click', () => {
            slide.diseno = diseno;
            slideEdited({ props: true });
        });
        picker.appendChild(card);
    });

    // Mostrar solo los campos que usa este diseño
    document.querySelectorAll('#slideProps [data-para]').forEach(field => {
        field.hidden = !field.dataset.para.split(' ').includes(slide.diseno);
    });
    $('lblTitulo').textContent = ETIQUETAS.titulo[slide.diseno] || 'Título';
    $('lblSubtitulo').textContent = ETIQUETAS.subtitulo[slide.diseno] || 'Subtítulo';
    $('btnSlideImage').textContent = slide.imagen ? `🖼️ ${slide.imagen.nombre}` : '🖼️ Elegir imagen…';

    $('propTitulo').value = slide.titulo || '';
    $('propSubtitulo').value = slide.subtitulo || '';
    $('propContenido').value = slide.contenido || '';
    $('propContenido2').value = slide.contenido2 || '';
    $('propAnimacion').value = slide.animacion.tipo;
    $('propPasoAPaso').checked = !!slide.animacion.pasoAPaso;

    const general = SR.TRANSICIONES[pres.datos.transicion.tipo];
    const trans = $('propTransicion');
    trans.innerHTML = '';
    [['', `Usar la general (${general})`], ...Object.entries(SR.TRANSICIONES)].forEach(([value, label]) => {
        const option = el('option', '', label);
        option.value = value;
        trans.appendChild(option);
    });
    trans.value = slide.transicion || '';
}

// Campos de texto: se actualizan al escribir
[['propTitulo', 'titulo'], ['propSubtitulo', 'subtitulo'], ['propContenido', 'contenido'], ['propContenido2', 'contenido2']]
    .forEach(([id, key]) => $(id).addEventListener('input', (e) => {
        currentSlide()[key] = e.target.value;
        slideEdited();
    }));

$('slideNotes').addEventListener('input', (e) => {
    currentSlide().notas = e.target.value;
    savePresentation();
});
$('propAnimacion').addEventListener('change', (e) => { currentSlide().animacion.tipo = e.target.value; savePresentation(); });
$('propPasoAPaso').addEventListener('change', (e) => { currentSlide().animacion.pasoAPaso = e.target.checked; slideEdited(); });
$('propTransicion').addEventListener('change', (e) => { currentSlide().transicion = e.target.value || null; savePresentation(); });

$('btnSlideImage').addEventListener('click', async () => {
    const image = await window.electronAPI.pickImage();
    if (!image) return;
    currentSlide().imagen = image;
    slideEdited({ props: true });
});
$('btnSlideImageClear').addEventListener('click', () => {
    currentSlide().imagen = null;
    slideEdited({ props: true });
});

// Pestañas Diapositiva / Estilo
$('tabSlideProps').addEventListener('click', () => {
    $('slideProps').hidden = false;
    $('styleProps').hidden = true;
    $('tabSlideProps').classList.add('activo');
    $('tabStyleProps').classList.remove('activo');
});
$('tabStyleProps').addEventListener('click', () => {
    $('slideProps').hidden = true;
    $('styleProps').hidden = false;
    $('tabStyleProps').classList.add('activo');
    $('tabSlideProps').classList.remove('activo');
});

// ---------- Panel "Estilo y transición" ----------
let styleTimer = null;
function styleEdited() {
    pres.datos.estiloNombre = '';
    clearTimeout(styleTimer);
    styleTimer = setTimeout(() => {
        renderThumbs();
        renderEditor();
        renderStyleProps();
        renderSlideProps();
    }, 120);
    savePresentation();
}

function renderStyleProps() {
    const estilo = pres.datos.estilo;

    // Galería de estilos (predefinidos + los del usuario)
    const picker = $('stylePicker');
    picker.innerHTML = '';
    const all = [
        ...SR.ESTILOS_PREDEFINIDOS.map(s => ({ ...s, propio: false })),
        ...userStyles.map(s => ({ ...s, propio: true }))
    ];
    all.forEach(style => {
        const card = el('button', 'pick-card' + (pres.datos.estiloNombre === style.nombre ? ' activo' : ''));
        card.title = style.nombre;
        card.appendChild(slideFrame({ ...newSlide('titulo'), titulo: 'Título', subtitulo: style.nombre }, style.datos));
        card.appendChild(el('span', 'pick-label', (style.propio ? '★ ' : '') + style.nombre));
        card.addEventListener('click', () => {
            pres.datos.estilo = clone(style.datos);
            pres.datos.estiloNombre = style.nombre;
            renderThumbs();
            renderEditor();
            renderStyleProps();
            renderSlideProps();
            savePresentation();
        });
        if (style.propio) {
            card.appendChild(iconButton('✕', 'Eliminar este estilo', async () => {
                if (!confirm(`¿Eliminar el estilo "${style.nombre}"?`)) return;
                await window.electronAPI.deletePresentationStyle(style.id);
                userStyles = await window.electronAPI.getPresentationStyles();
                renderStyleProps();
            }, 'pick-remove'));
        }
        picker.appendChild(card);
    });

    // Controles
    const f = estilo.fondo;
    document.querySelectorAll('#bgTypeSel button').forEach(b => b.classList.toggle('activo', b.dataset.v === f.tipo));
    document.querySelectorAll('#styleProps [data-fondo]').forEach(n => { n.hidden = n.dataset.fondo !== f.tipo; });
    $('stColor1').value = f.color1;
    $('stColor2').value = f.color2;
    $('stAngulo').value = f.angulo;
    $('stOscurecer').value = f.oscurecer;
    $('stOscurecerVal').textContent = Math.round(f.oscurecer * 100) + '%';
    $('btnStyleImage').textContent = f.imagen ? `🖼️ ${f.imagen.nombre}` : '🖼️ Imagen de fondo…';
    $('stColTitulo').value = estilo.colorTitulo;
    $('stColTexto').value = estilo.colorTexto;
    $('stColAcento').value = estilo.colorAcento;
    $('stFuenteTitulo').value = estilo.fuenteTitulo;
    $('stFuenteTexto').value = estilo.fuenteTexto;
    document.querySelectorAll('#alignSel button').forEach(b => b.classList.toggle('activo', b.dataset.v === estilo.alineacion));
    $('stVineta').value = estilo.vineta;
    $('stEscala').value = Math.round((estilo.escala || 1) * 100);
    $('stEscalaVal').textContent = $('stEscala').value + '%';
    $('presTransicion').value = pres.datos.transicion.tipo;
    $('presDuracion').value = pres.datos.transicion.duracion;
    $('presDuracionVal').textContent = (pres.datos.transicion.duracion / 1000).toFixed(1) + ' s';
}

document.querySelectorAll('#bgTypeSel button').forEach(btn => btn.addEventListener('click', () => {
    pres.datos.estilo.fondo.tipo = btn.dataset.v;
    styleEdited();
}));
document.querySelectorAll('#alignSel button').forEach(btn => btn.addEventListener('click', () => {
    pres.datos.estilo.alineacion = btn.dataset.v;
    styleEdited();
}));

const styleInputs = {
    stColor1: (v) => { pres.datos.estilo.fondo.color1 = v; },
    stColor2: (v) => { pres.datos.estilo.fondo.color2 = v; },
    stAngulo: (v) => { pres.datos.estilo.fondo.angulo = Number(v); },
    stOscurecer: (v) => { pres.datos.estilo.fondo.oscurecer = Number(v); },
    stColTitulo: (v) => { pres.datos.estilo.colorTitulo = v; },
    stColTexto: (v) => { pres.datos.estilo.colorTexto = v; },
    stColAcento: (v) => { pres.datos.estilo.colorAcento = v; },
    stFuenteTitulo: (v) => { pres.datos.estilo.fuenteTitulo = v; },
    stFuenteTexto: (v) => { pres.datos.estilo.fuenteTexto = v; },
    stVineta: (v) => { pres.datos.estilo.vineta = v; },
    stEscala: (v) => { pres.datos.estilo.escala = Number(v) / 100; }
};
Object.entries(styleInputs).forEach(([id, apply]) => $(id).addEventListener('input', (e) => {
    apply(e.target.value);
    styleEdited();
}));

$('btnStyleImage').addEventListener('click', async () => {
    const image = await window.electronAPI.pickImage();
    if (!image) return;
    pres.datos.estilo.fondo.imagen = image;
    pres.datos.estilo.fondo.tipo = 'imagen';
    styleEdited();
});

$('btnSaveStyle').addEventListener('click', async () => {
    const nombre = $('newStyleName').value.trim();
    if (!nombre) return $('newStyleName').focus();
    await window.electronAPI.savePresentationStyle({ nombre, datos: pres.datos.estilo });
    userStyles = await window.electronAPI.getPresentationStyles();
    pres.datos.estiloNombre = nombre;
    $('newStyleName').value = '';
    renderStyleProps();
    savePresentation();
});

$('presTransicion').addEventListener('change', (e) => {
    pres.datos.transicion.tipo = e.target.value;
    renderSlideProps();
    savePresentation();
});
$('presDuracion').addEventListener('input', (e) => {
    pres.datos.transicion.duracion = Number(e.target.value);
    $('presDuracionVal').textContent = (e.target.value / 1000).toFixed(1) + ' s';
    savePresentation();
});

// ---------- Presentar ----------
function effectiveTransition(slide) {
    return { tipo: slide.transicion || pres.datos.transicion.tipo, duracion: pres.datos.transicion.duracion };
}

function sendCurrentSlide({ animarEntrada = true } = {}) {
    const slide = pres.datos.diapositivas[presenting.indice];
    window.electronAPI.showSlide({
        diapositiva: slide,
        estilo: pres.datos.estilo,
        transicion: effectiveTransition(slide),
        paso: presenting.paso,
        presentacionId: pres.id,
        animarEntrada
    });
    updatePresentingUI();
}

function startPresenting(indice) {
    if (!pres) return;
    clearProjectedMark();
    stopTimerStatus();
    presenting = { indice, paso: 0 };
    sendCurrentSlide();
}

function goToSlide(indice) {
    presenting = { indice, paso: 0 };
    sendCurrentSlide();
}

// Siguiente: primero muestra los puntos pendientes ("uno por uno"), luego pasa de diapositiva
function nextStep() {
    const slide = pres.datos.diapositivas[presenting.indice];
    if (presenting.paso < SR.contarPasos(slide)) {
        presenting.paso++;
        sendCurrentSlide();
    } else if (presenting.indice < pres.datos.diapositivas.length - 1) {
        presenting = { indice: presenting.indice + 1, paso: 0 };
        sendCurrentSlide();
    }
}

function prevStep() {
    if (presenting.paso > 0) {
        presenting.paso--;
        sendCurrentSlide();
    } else if (presenting.indice > 0) {
        const indice = presenting.indice - 1;
        presenting = { indice, paso: SR.contarPasos(pres.datos.diapositivas[indice]) };
        sendCurrentSlide({ animarEntrada: false }); // al regresar, la diapositiva aparece completa
    }
}

function stopPresenting() {
    window.electronAPI.clearSlide();
    presentingEnded();
}

// Se llama también cuando otra cosa ocupa la pantalla (texto, versículo, cuenta regresiva, web)
function presentingEnded() {
    if (!presenting) return;
    presenting = null;
    updatePresentingUI();
    setOnAir('');
}

function updatePresentingUI() {
    const live = !!presenting && !!pres;
    $('presIdleControls').hidden = live;
    $('presLiveControls').hidden = !live;
    $('nextSlideBox').hidden = !live;
    slideThumbs.querySelectorAll('.slide-thumb').forEach((t, i) => t.classList.toggle('proyectado', live && presenting.indice === i));
    if (!live) return;

    const total = pres.datos.diapositivas.length;
    const pasos = SR.contarPasos(pres.datos.diapositivas[presenting.indice]);
    $('presCounter').textContent = `${presenting.indice + 1} / ${total}` + (pasos ? ` · ${presenting.paso}/${pasos}` : '');
    $('btnPrevSlide').disabled = presenting.indice === 0 && presenting.paso === 0;
    $('btnNextSlide').disabled = presenting.indice === total - 1 && presenting.paso >= pasos;

    // El editor sigue a la diapositiva que está en pantalla (vista del presentador)
    if (presIndex !== presenting.indice) selectSlide(presenting.indice);
    const next = pres.datos.diapositivas[presenting.indice + 1];
    if (next) mountSlide($('nextSlidePreview'), next);
    else $('nextSlidePreview').innerHTML = '<div class="empty" style="color:#9ca3af">Fin de la presentación</div>';
    setOnAir(`${pres.nombre} · diapositiva ${presenting.indice + 1} de ${total}`);
}

$('btnPresent').addEventListener('click', () => startPresenting(presIndex));
$('btnPresentFromStart').addEventListener('click', () => startPresenting(0));
$('btnNextSlide').addEventListener('click', nextStep);
$('btnPrevSlide').addEventListener('click', prevStep);
$('btnStopPresenting').addEventListener('click', stopPresenting);

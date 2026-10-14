// projection-renderer.js
// Pantalla de proyección: solo muestra lo que le manda el Panel de Control.

const container = document.getElementById('text-container');
const content = document.getElementById('content');
const citationDiv = document.getElementById('citation');
const titleDiv = document.getElementById('title');
const bgVideo = document.getElementById('bgVideo');
const dimmerOverlay = document.getElementById('dimmerOverlay');
const logo = document.getElementById('logoOverlay');

// Ajustes actuales (se actualizan desde el panel)
let isAutoFitEnabled = false;
let manualFontSizeVW = 6;          // valor del slider "Tamaño manual"
let currentCitationSize = '40px';
let countdownInterval = null;

// ==========================================
// AJUSTE DEL TAMAÑO DEL TEXTO
// ==========================================
// Alto que ocupa un elemento opcional (título o cita), contando su margen
function extraHeight(el) {
    if (el.style.display === 'none' || !el.textContent) return 0;
    const style = getComputedStyle(el);
    return el.offsetHeight + parseFloat(style.marginTop) + parseFloat(style.marginBottom);
}

// ¿Cabe el texto (más título y cita) dentro del área visible?
function textFits() {
    const style = getComputedStyle(container);
    const availableHeight = container.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
    const fitsHeight = content.offsetHeight + extraHeight(titleDiv) + extraHeight(citationDiv) <= availableHeight;
    const fitsWidth = content.scrollWidth <= content.clientWidth + 1 // ninguna palabra se sale por los lados
                   && titleDiv.scrollWidth <= titleDiv.clientWidth + 1;
    return fitsHeight && fitsWidth;
}

// El título de las notas crece y se achica junto con el texto
function setTextSize(px) {
    content.style.fontSize = px + 'px';
    titleDiv.style.fontSize = (px * 0.8) + 'px';
}

function updateTextLayout() {
    citationDiv.style.fontSize = currentCitationSize;
    if (!content.textContent.trim() && !titleDiv.textContent.trim()) return;

    if (isAutoFitEnabled) {
        // MODO AUTOMÁTICO: busca el tamaño más grande que quepa (búsqueda binaria)
        let minSize = 16, maxSize = 400, bestFit = minSize;
        while (minSize <= maxSize) {
            const midSize = Math.floor((minSize + maxSize) / 2);
            setTextSize(midSize);
            if (textFits()) { bestFit = midSize; minSize = midSize + 1; }
            else maxSize = midSize - 1;
        }
        setTextSize(bestFit);
    } else {
        // MODO MANUAL: usa el slider, pero si el texto no cabe lo reduce hasta que quepa
        let sizePx = (window.innerWidth * manualFontSizeVW) / 100;
        setTextSize(sizePx);
        while (!textFits() && sizePx > 12) {
            sizePx -= 2;
            setTextSize(sizePx);
        }
    }
}

window.addEventListener('resize', updateTextLayout);

// titulo: encabezado opcional (notas, temas). alineacion: 'center' | 'left'
function showText(texto, cita, titulo = '', alineacion = 'center') {
    content.textContent = texto || '';
    content.style.textAlign = alineacion;
    titleDiv.textContent = titulo || '';
    titleDiv.style.textAlign = alineacion;
    titleDiv.style.display = titulo ? 'block' : 'none';
    citationDiv.textContent = cita || '';
    citationDiv.style.display = cita ? 'block' : 'none';
    updateTextLayout();
}

// ==========================================
// TEXTO (versículos, estrofas, notas)
// ==========================================
window.electronAPI.onReceiveText((data) => {
    stopCountdown();
    hideSlides();
    if (!data || typeof data !== 'object') return showText(data, '');

    const ghost = data.transicion && data.transicion.tipo !== 'ninguna' ? snapshotText() : null;
    showText(data.texto, data.cita, data.titulo, data.alineacion);
    if (ghost) animateTextChange(ghost, data.transicion.tipo, data.transicion.duracion || 500);
});

// Mostrar / ocultar el texto sin quitarlo
const textLayer = document.getElementById('textLayer');
window.electronAPI.onSetTextVisible((visible) => {
    textLayer.classList.toggle('oculto', !visible);
});

// ==========================================
// TRANSICIONES DEL TEXTO
// ==========================================
// El texto no tiene fondo propio: para que no se vean encimados, primero sale el anterior y luego
// entra el nuevo ("mitades"). Solo "empujar" es simultáneo, porque los textos se separan al moverse.
// Para eso se usa una copia "fantasma" del texto que estaba.
const TEXT_TRANSITIONS = {
    desvanecer: { mitades: true, viejo: [{ opacity: 1 }, { opacity: 0 }], nuevo: [{ opacity: 0 }, { opacity: 1 }] },
    deslizar: { mitades: true, viejo: [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateX(-12%)' }], nuevo: [{ opacity: 0, transform: 'translateX(12%)' }, { opacity: 1, transform: 'none' }] },
    empujar: { viejo: [{ transform: 'none' }, { transform: 'translateX(-100%)' }], nuevo: [{ transform: 'translateX(100%)' }, { transform: 'none' }] },
    zoom: { mitades: true, viejo: [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(.9)' }], nuevo: [{ opacity: 0, transform: 'scale(1.12)' }, { opacity: 1, transform: 'none' }] },
    subir: { mitades: true, viejo: [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-8%)' }], nuevo: [{ opacity: 0, transform: 'translateY(8%)' }, { opacity: 1, transform: 'none' }] },
    voltear: { mitades: true,
        viejo: [{ transform: 'perspective(1600px) rotateX(0deg)' }, { transform: 'perspective(1600px) rotateX(90deg)' }],
        nuevo: [{ transform: 'perspective(1600px) rotateX(-90deg)' }, { transform: 'none' }] }
};

let textGhost = null;

// Copia del texto que está en pantalla (sin ids, con clases equivalentes para conservar el estilo)
function snapshotText() {
    finishTextTransition();
    if (!content.textContent.trim() && !titleDiv.textContent.trim()) return null; // no había nada que sacar
    const copy = container.cloneNode(true);
    copy.removeAttribute('id');
    copy.classList.add('text-ghost');
    for (const [id, cls] of [['content', 'g-content'], ['title', 'g-title'], ['citation', 'g-citation']]) {
        const node = copy.querySelector('#' + id);
        if (node) { node.removeAttribute('id'); node.classList.add(cls); }
    }
    container.after(copy);
    return copy;
}

function animateTextChange(ghost, tipo, duracion) {
    const t = TEXT_TRANSITIONS[tipo] || TEXT_TRANSITIONS.desvanecer;
    const opts = { duration: t.mitades ? duracion / 2 : duracion, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'both' };
    textGhost = ghost;
    ghost.animate(t.viejo, opts).finished.then(() => { if (textGhost === ghost) finishTextTransition(); }).catch(() => {});
    container.animate(t.nuevo, { ...opts, delay: t.mitades ? duracion / 2 : 0 });
}

// Si llega otro texto a mitad de una transición, se termina la anterior de inmediato
function finishTextTransition() {
    if (textGhost) textGhost.remove();
    textGhost = null;
    container.getAnimations().forEach(a => a.cancel());
}

// ==========================================
// FONDOS
// ==========================================
function stopVideo() {
    bgVideo.pause();
    bgVideo.removeAttribute('src');
    bgVideo.load(); // libera el archivo
    bgVideo.style.display = 'none';
}

window.electronAPI.onReceiveBgColor((color) => {
    stopVideo();
    document.body.style.backgroundImage = 'none';
    document.body.style.backgroundColor = color;
});

window.electronAPI.onReceiveBgImage((url) => {
    stopVideo();
    document.body.style.backgroundColor = 'black';
    document.body.style.backgroundImage = `url(${JSON.stringify(url)})`;
});

window.electronAPI.onReceiveBgVideo((url) => {
    document.body.style.backgroundImage = 'none';
    document.body.style.backgroundColor = 'black';
    bgVideo.src = url;
    bgVideo.style.display = 'block';
    bgVideo.play().catch(err => console.error('No se pudo reproducir el video:', err));
});

// AJUSTE DE LA IMAGEN O VIDEO DE FONDO (el video se ajusta con CSS según data-ajuste)
const BG_IMAGE_SIZES = {
    rellenar: 'cover', ajustar: 'contain', estirar: '100% 100%',
    ancho: '100% auto', alto: 'auto 100%', original: 'auto'
};
window.electronAPI.onUpdateBgFit((fit) => {
    document.body.style.backgroundSize = BG_IMAGE_SIZES[fit] || 'cover';
    bgVideo.dataset.ajuste = fit;
});

window.electronAPI.onUpdateVideoLoop((isLoop) => {
    bgVideo.loop = isLoop;
});

// REPRODUCTOR: órdenes desde el panel
window.electronAPI.onVideoControl(({ accion, tiempo }) => {
    if (!bgVideo.getAttribute('src')) return;
    if (accion === 'play') bgVideo.play().catch(() => {});
    if (accion === 'pause') bgVideo.pause();
    if (accion === 'seek' && Number.isFinite(tiempo)) bgVideo.currentTime = tiempo;
});

// Le contamos al panel en qué segundo va el video (para su barra de reproducción)
let lastStatusSent = 0;
function sendVideoStatus(force = false) {
    const now = Date.now();
    if (!force && now - lastStatusSent < 250) return;
    lastStatusSent = now;
    window.electronAPI.sendVideoStatus({
        src: bgVideo.getAttribute('src'),
        currentTime: bgVideo.currentTime || 0,
        duration: Number.isFinite(bgVideo.duration) ? bgVideo.duration : 0,
        paused: bgVideo.paused,
        ended: bgVideo.ended
    });
}
bgVideo.addEventListener('timeupdate', () => sendVideoStatus());
['play', 'pause', 'loadedmetadata', 'seeked', 'ended', 'emptied'].forEach(evt =>
    bgVideo.addEventListener(evt, () => sendVideoStatus(true)));

window.electronAPI.onUpdateDimmer((opacity) => {
    dimmerOverlay.style.opacity = opacity;
});

// ==========================================
// ESTILOS DEL TEXTO (desde Ajustes Rápidos)
// ==========================================
window.electronAPI.onUpdateTextStyle((data) => {
    // Ubicación vertical: flex-start (Arriba) / center (Medio) / flex-end (Abajo)
    if (data.align) container.style.justifyContent = data.align;

    if (data.color) content.style.color = data.color;

    // Borde negro alrededor de las letras
    if (data.shadowSize !== undefined) {
        const s = parseInt(data.shadowSize, 10) || 0;
        content.style.textShadow = s === 0 ? 'none' : `
            -${s}px -${s}px 0 #000,
             ${s}px -${s}px 0 #000,
            -${s}px  ${s}px 0 #000,
             ${s}px  ${s}px 0 #000,
             0px ${s + 4}px 10px rgba(0,0,0,0.8)`;
    }
    updateTextLayout();
});

window.electronAPI.onToggleAutoFit((isAuto) => {
    isAutoFitEnabled = isAuto;
    updateTextLayout();
});

window.electronAPI.onUpdateFontSize((size) => {
    manualFontSizeVW = parseFloat(size);
    if (!isAutoFitEnabled) updateTextLayout();
});

// ESTILOS DE LA CITA BÍBLICA
window.electronAPI.onUpdateCitationSize((size) => {
    currentCitationSize = size + 'px';
    updateTextLayout();
});

window.electronAPI.onUpdateCitationAlign((align) => {
    citationDiv.style.textAlign = align;
});

// ==========================================
// LOGO
// ==========================================
window.electronAPI.onUpdateLogo((data) => {
    if (data.src) logo.src = data.src;
    logo.style.display = (data.visible && data.src) ? 'block' : 'none';
    logo.style.width = data.size + 'vw';

    // Posición: limpiamos todas y aplicamos la elegida
    const margen = '30px'; // distancia del borde de la pantalla
    logo.style.top = logo.style.bottom = logo.style.left = logo.style.right = 'auto';
    const [vertical, horizontal] = (data.position || 'top-right').split('-');
    logo.style[vertical] = margen;
    logo.style[horizontal] = margen;
});

// ==========================================
// CUENTA REGRESIVA
// ==========================================
function stopCountdown() {
    clearInterval(countdownInterval);
    countdownInterval = null;
}

// data.endTime es la hora exacta (en ms) en que termina
window.electronAPI.onStartCountdown((data) => {
    stopCountdown();
    hideSlides();
    showText('', '');

    function updateTimer() {
        const remaining = Math.max(0, data.endTime - Date.now());
        const mins = Math.floor(remaining / 60000).toString().padStart(2, '0');
        const secs = Math.floor((remaining % 60000) / 1000).toString().padStart(2, '0');
        content.textContent = `${(data.prefix || '').trim()} ${mins}:${secs}`.trim();
        updateTextLayout();
        if (remaining === 0) stopCountdown();
    }

    updateTimer(); // la primera vez inmediatamente
    countdownInterval = setInterval(updateTimer, 1000);
});

window.electronAPI.onStopCountdown(() => {
    stopCountdown();
    showText('', '');
});

// ==========================================
// PRESENTACIONES
// ==========================================
const slideStage = document.getElementById('slideStage');
let currentSlide = null; // { clave, holder, sl, data }

function hideSlides() {
    slideStage.hidden = true;
    slideStage.innerHTML = '';
    currentSlide = null;
}

window.electronAPI.onShowSlide((data) => {
    const SR = window.SlideRenderer;
    stopCountdown();
    showText('', '');
    slideStage.hidden = false;

    const animacion = (data.diapositiva.animacion && data.diapositiva.animacion.tipo) || 'ninguna';
    const clave = `${data.presentacionId}:${data.diapositiva.id}`;

    // Misma diapositiva: solo cambia cuántos puntos se ven (modo "uno por uno")
    if (currentSlide && currentSlide.clave === clave && !data.redibujar) {
        SR.mostrarPaso(currentSlide.sl, data.paso, animacion);
        currentSlide.data = data;
        return;
    }

    const holder = document.createElement('div');
    holder.className = 'sl-holder';
    slideStage.appendChild(holder);
    const sl = SR.crearDiapositiva(data.diapositiva, data.estilo, { paso: data.paso });
    SR.montarDiapositiva(holder, sl);

    const transicion = data.transicion || { tipo: 'ninguna', duracion: 0 };
    const anterior = currentSlide && currentSlide.holder;
    const animarEntrada = data.animarEntrada !== false;
    currentSlide = { clave, holder, sl, data };

    if (anterior && transicion.tipo !== 'ninguna') {
        SR.transicionar(holder, anterior, transicion.tipo, transicion.duracion);
        if (animarEntrada) SR.animarEntrada(sl, animacion, transicion.duracion * 0.6);
    } else {
        if (anterior) anterior.remove();
        if (!anterior && transicion.tipo !== 'ninguna') holder.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 400 });
        if (animarEntrada) SR.animarEntrada(sl, animacion, 150);
    }
});

window.electronAPI.onClearSlide(() => {
    if (!currentSlide) return hideSlides();
    const holder = currentSlide.holder;
    currentSlide = null;
    holder.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300 }).finished
        .then(() => { if (!currentSlide) hideSlides(); });
});

// Al cambiar el tamaño de la ventana, las diapositivas se vuelven a escalar
window.addEventListener('resize', () => {
    slideStage.querySelectorAll('.sl').forEach(sl => window.SlideRenderer.escalar(sl));
});

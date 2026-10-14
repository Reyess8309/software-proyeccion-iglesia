// web.js
// Módulo de página web. La página se abre primero en privado dentro del panel (vista nativa de Electron,
// se usa normal). Al proyectarla pasa a la pantalla de proyección y aquí queda un espejo en vivo:
// los clics, la rueda del mouse y el teclado sobre el espejo se envían a la página proyectada.

const webArea = $('webArea');
const webScreen = $('webScreen');
const webUrl = $('webUrl');
let webState = { abierta: false, host: 'none' };

// ---------- Dónde dibujar la página dentro del panel ----------
// La vista nativa queda por encima del HTML, por eso se oculta cuando hay un modal abierto
// o cuando el usuario está en otra sección.
function reportWebRect() {
    const visible = webState.host === 'panel' && webArea.offsetParent !== null && !isModalOpen();
    if (!visible) return window.electronAPI.webPanelRect(null);
    const r = webArea.getBoundingClientRect();
    window.electronAPI.webPanelRect({ x: r.left, y: r.top, width: r.width, height: r.height });
}
new ResizeObserver(reportWebRect).observe(webArea);
window.addEventListener('resize', reportWebRect);
const modalObserver = new MutationObserver(reportWebRect);
document.querySelectorAll('.modal').forEach(m => modalObserver.observe(m, { attributes: true, attributeFilter: ['style'] }));

// ---------- Estado que informa main.js ----------
window.electronAPI.onWebStatus((status) => {
    const wasLive = webState.host === 'projection';
    webState = status;
    const live = status.host === 'projection';

    if (document.activeElement !== webUrl && status.url) webUrl.value = status.url;
    $('webZoomVal').textContent = (status.zoom || 100) + '%';
    $('webBack').disabled = !status.puedeAtras;
    $('webForward').disabled = !status.puedeAdelante;
    $('webReload').textContent = status.cargando ? '✕' : '⟳';
    $('webReload').title = status.cargando ? 'Detener' : 'Recargar';
    $('webProjectBtn').disabled = !status.abierta;
    $('webCloseBtn').disabled = !status.abierta;
    $('webProjectBtn').textContent = live ? 'Dejar de proyectar' : 'Proyectar';
    $('webProjectBtn').classList.toggle('btn-danger', live);
    $('webProjectBtn').classList.toggle('btn-primary', !live);

    const badge = $('webModeBadge');
    badge.className = 'badge' + (live ? ' badge-live' : '');
    badge.textContent = live ? 'EN PANTALLA' : status.abierta ? 'Vista privada' : 'Sin página';
    $('webModeHint').style.color = '';
    $('webModeHint').textContent = live
        ? 'Todos la ven. Haz clic en la imagen para controlarla: clic, rueda del mouse y teclado.'
        : status.abierta ? 'Solo tú la ves. Úsala normalmente y presiona Proyectar cuando esté lista.' : '';

    $('webEmpty').hidden = status.abierta;
    webScreen.hidden = !live;
    if (!live) webScreen.removeAttribute('src');

    if (live) {
        clearProjectedMark();
        presentingEnded();
        stopTimerStatus();
        setOnAir('Página web · ' + (status.titulo || status.url));
    } else if (wasLive) {
        setOnAir('');
    }
    reportWebRect();
});

window.electronAPI.onWebFrame((src) => { webScreen.src = src; });

window.electronAPI.onWebError((message) => {
    $('webModeHint').textContent = message;
    $('webModeHint').style.color = 'var(--danger)';
});

// ---------- Barra de herramientas ----------
function loadWeb(text) {
    if (!String(text || '').trim()) return;
    window.electronAPI.webLoad(text);
    webUrl.blur();
}
webUrl.addEventListener('keydown', (e) => { if (e.key === 'Enter') loadWeb(webUrl.value); });
webUrl.addEventListener('focus', () => webUrl.select());
$('webBack').addEventListener('click', () => window.electronAPI.webNav('atras'));
$('webForward').addEventListener('click', () => window.electronAPI.webNav('adelante'));
$('webReload').addEventListener('click', () => window.electronAPI.webNav(webState.cargando ? 'detener' : 'recargar'));
$('webZoomOut').addEventListener('click', () => window.electronAPI.webZoom((webState.zoom || 100) - 10));
$('webZoomIn').addEventListener('click', () => window.electronAPI.webZoom((webState.zoom || 100) + 10));
$('webProjectBtn').addEventListener('click', () => window.electronAPI.webProject(webState.host !== 'projection'));
$('webCloseBtn').addEventListener('click', () => window.electronAPI.webClose());

// ---------- Sitios guardados ----------
const SITES_KEY = 'sitiosWeb';
let sites = JSON.parse(localStorage.getItem(SITES_KEY) || 'null') || [
    { nombre: 'Google', url: 'https://www.google.com' },
    { nombre: 'YouTube', url: 'https://www.youtube.com' },
    { nombre: 'Wikipedia', url: 'https://es.wikipedia.org' }
];

function renderSites() {
    const box = $('webSites');
    box.innerHTML = '';
    sites.forEach(site => {
        const chip = el('button', 'site-chip', site.nombre);
        chip.title = site.url;
        chip.addEventListener('click', () => loadWeb(site.url));
        chip.appendChild(iconButton('✕', 'Quitar de sitios', () => {
            sites = sites.filter(s => s !== site);
            localStorage.setItem(SITES_KEY, JSON.stringify(sites));
            renderSites();
        }, 'x'));
        box.appendChild(chip);
    });
}

$('webSaveSite').addEventListener('click', () => {
    if (!webState.abierta || !webState.url || sites.some(s => s.url === webState.url)) return;
    const nombre = (webState.titulo || new URL(webState.url).hostname).slice(0, 28);
    sites.push({ nombre, url: webState.url });
    localStorage.setItem(SITES_KEY, JSON.stringify(sites));
    renderSites();
});
renderSites();

// ---------- Espejo interactivo (cuando la página está en pantalla) ----------
// Convierte la posición del mouse en una proporción (0 a 1) de la página, descontando las franjas negras
function webPoint(e) {
    const r = webScreen.getBoundingClientRect();
    const nw = webScreen.naturalWidth, nh = webScreen.naturalHeight;
    if (!nw || !nh) return null;
    const s = Math.min(r.width / nw, r.height / nh);
    const dw = nw * s, dh = nh * s;
    const x = (e.clientX - r.left - (r.width - dw) / 2) / dw;
    const y = (e.clientY - r.top - (r.height - dh) / 2) / dh;
    if (x < 0 || y < 0 || x > 1 || y > 1) return null;
    return { x, y };
}

const BUTTONS = ['left', 'middle', 'right'];
const modifiers = (e) => [
    e.shiftKey && 'shift', e.ctrlKey && 'control', e.altKey && 'alt', e.metaKey && 'meta',
    (e.buttons & 1) && 'leftButtonDown', (e.buttons & 4) && 'middleButtonDown', (e.buttons & 2) && 'rightButtonDown'
].filter(Boolean);

function sendMouse(type, e, extra = {}) {
    const p = webPoint(e);
    if (!p) return;
    window.electronAPI.webInput({ type, ...p, modifiers: modifiers(e), ...extra });
}

webScreen.addEventListener('mousedown', (e) => {
    e.preventDefault();
    webScreen.focus();
    sendMouse('mouseDown', e, { button: BUTTONS[e.button] || 'left', clickCount: e.detail || 1 });
});
webScreen.addEventListener('mouseup', (e) => sendMouse('mouseUp', e, { button: BUTTONS[e.button] || 'left', clickCount: e.detail || 1 }));

let lastMove = 0;
webScreen.addEventListener('mousemove', (e) => {
    const now = performance.now();
    if (now - lastMove < 30) return;
    lastMove = now;
    sendMouse('mouseMove', e);
});

webScreen.addEventListener('wheel', (e) => {
    e.preventDefault();
    sendMouse('mouseWheel', e, { deltaX: -e.deltaX, deltaY: -e.deltaY, canScroll: true });
}, { passive: false });

webScreen.addEventListener('contextmenu', (e) => e.preventDefault());

// Teclado: nombres de teclas que entiende Electron
const KEY_NAMES = {
    ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right', ' ': 'Space',
    Enter: 'Enter', Backspace: 'Backspace', Tab: 'Tab', Escape: 'Escape', Delete: 'Delete',
    Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown'
};
const keyName = (key) => KEY_NAMES[key] || (key.length === 1 ? key : /^F\d{1,2}$/.test(key) ? key : null);
const keyMods = (e) => [e.shiftKey && 'shift', e.ctrlKey && 'control', e.altKey && 'alt', e.metaKey && 'meta'].filter(Boolean);

webScreen.addEventListener('keydown', (e) => {
    const name = keyName(e.key);
    if (!name) return;
    e.preventDefault();
    window.electronAPI.webInput({ type: 'keyDown', keyCode: name, modifiers: keyMods(e) });
    // Los caracteres se escriben con un evento "char" aparte
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) window.electronAPI.webInput({ type: 'char', keyCode: e.key, modifiers: keyMods(e) });
    if (e.key === 'Enter') window.electronAPI.webInput({ type: 'char', keyCode: '\r' });
});
webScreen.addEventListener('keyup', (e) => {
    const name = keyName(e.key);
    if (!name) return;
    e.preventDefault();
    window.electronAPI.webInput({ type: 'keyUp', keyCode: name, modifiers: keyMods(e) });
});

window.electronAPI.webStatusRequest();

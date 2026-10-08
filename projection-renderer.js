const container = document.getElementById('text-container');
const content = document.getElementById('content');
const citationDiv = document.getElementById('citation');
const bgVideo = document.getElementById('bgVideo');

// Bandera para saber si el usuario cambió el tamaño manualmente
let usoManualDeTamaño = false; 

function fitText() {
    // Si el usuario fijó el tamaño manualmente en el panel de control, ignoramos el auto-ajuste
    if (usoManualDeTamaño) return; 

    let fontSize = 25; 
    content.style.fontSize = fontSize + 'vw';
    citationDiv.style.fontSize = (fontSize * 0.3) + 'vw'; 

    const maxHeight = window.innerHeight * 0.90; 
    const maxWidth = window.innerWidth * 0.95;

    while ((container.scrollHeight > maxHeight || container.scrollWidth > maxWidth) && fontSize > 2) {
        fontSize -= 0.5; 
        content.style.fontSize = fontSize + 'vw';
        citationDiv.style.fontSize = (fontSize * 0.3) + 'vw'; 
    }
}

window.electronAPI.onReceiveText((data) => {
    if (typeof data === 'object') {
        content.textContent = data.texto;
        citationDiv.textContent = data.cita;
        citationDiv.style.display = data.cita ? 'block' : 'none'; 
    } else {
        content.textContent = data;
        citationDiv.style.display = 'none';
    }
    fitText();
});

window.electronAPI.onReceiveBgColor((color) => {
    document.body.style.backgroundImage = 'none'; 
    document.body.style.backgroundColor = color;  
    bgVideo.style.display = 'none';
    bgVideo.pause();
});

window.electronAPI.onReceiveBgImage((imageData) => {
    document.body.style.backgroundColor = 'transparent';
    document.body.style.backgroundImage = `url('${imageData}')`;
    document.body.style.backgroundSize = 'cover';
    bgVideo.style.display = 'none';
    bgVideo.pause();
});

window.electronAPI.onReceiveBgVideo((videoPath) => {
    document.body.style.backgroundImage = 'none';
    document.body.style.backgroundColor = 'black'; 
    
    bgVideo.src = videoPath;
    bgVideo.style.display = 'block';
    bgVideo.play();
});

window.addEventListener('resize', fitText);

// --- LOS CAMBIOS EN TIEMPO REAL DESDE EL MODAL ---
window.electronAPI.onUpdateTextStyle((data) => {
    const textContainer = document.getElementById('text-container'); 
    const mainText = document.getElementById('content'); 
    const citaText = document.getElementById('citation');

    // 1. Alinear Arriba / Medio / Abajo
    if (data.align && textContainer) {
        textContainer.style.justifyContent = data.align; 
    }

    // 2. Tamaño de fuente 
    if (data.fontSize && mainText && citaText) {
        usoManualDeTamaño = true; // Desactivamos el auto-ajuste temporalmente
        mainText.style.fontSize = data.fontSize;
        const sizeNum = parseFloat(data.fontSize); 
        citaText.style.fontSize = (sizeNum * 0.4) + 'vw'; 
    }

    // 3. Color de texto
    if (data.color && mainText && citaText) {
        mainText.style.color = data.color;
        citaText.style.color = data.color;
    }

    // 4. Grosor de la sombra
    if (data.shadowSize !== undefined && mainText && citaText) {
        const s = data.shadowSize;
        const shadow = `
            -${s}px -${s}px 0 #000,  
             ${s}px -${s}px 0 #000,
            -${s}px  ${s}px 0 #000,
             ${s}px  ${s}px 0 #000,
             0px ${parseInt(s) + 4}px 10px rgba(0,0,0,0.8)
        `;
        mainText.style.textShadow = shadow;
        citaText.style.textShadow = shadow;
    }
});

// Escuchar los cambios del Dimmer
window.electronAPI.onUpdateDimmer((opacity) => {
    const dimmerOverlay = document.getElementById('dimmerOverlay');
    if (dimmerOverlay) {
        dimmerOverlay.style.opacity = opacity;
    }
});

// ==========================================
// CONTROL DEL LOGO
// ==========================================
window.electronAPI.onUpdateLogo((data) => {
    const logo = document.getElementById('logoOverlay');
    if (!logo) return;
    
    // 1. Asignar imagen y visibilidad
    if (data.src) logo.src = data.src;
    logo.style.display = (data.visible && data.src) ? 'block' : 'none';
    
    // 2. Tamaño
    logo.style.width = data.size + 'vw';
    
    // 3. Posición (Limpiamos todas primero)
    logo.style.top = 'auto';
    logo.style.bottom = 'auto';
    logo.style.left = 'auto';
    logo.style.right = 'auto';
    
    const margen = '30px'; // Distancia del borde de la pantalla
    
    if (data.position === 'top-left') {
        logo.style.top = margen;
        logo.style.left = margen;
    } else if (data.position === 'top-right') {
        logo.style.top = margen;
        logo.style.right = margen;
    } else if (data.position === 'bottom-left') {
        logo.style.bottom = margen;
        logo.style.left = margen;
    } else if (data.position === 'bottom-right') {
        logo.style.bottom = margen;
        logo.style.right = margen;
    }
});
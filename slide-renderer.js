// slide-renderer.js
// Dibuja las diapositivas de las presentaciones. Lo usan el Panel de Control (editor y miniaturas)
// y la Pantalla de Proyección, así lo que se ve al editar es exactamente lo que se proyecta.
// Cada diapositiva mide 1920×1080 y se escala para caber en su contenedor.

(function () {
    const ANCHO = 1920;
    const ALTO = 1080;

    const DISENOS = {
        'titulo': 'Título',
        'titulo-contenido': 'Título y contenido',
        'seccion': 'Encabezado de sección',
        'dos-columnas': 'Dos columnas',
        'imagen-texto': 'Imagen y texto',
        'imagen': 'Imagen completa',
        'cita': 'Cita'
    };

    const ANIMACIONES = {
        'ninguna': 'Ninguna',
        'desvanecer': 'Desvanecer',
        'subir': 'Subir',
        'zoom': 'Acercar',
        'izquierda': 'Desde la izquierda'
    };

    const TRANSICIONES = {
        'ninguna': 'Ninguna',
        'desvanecer': 'Desvanecer',
        'deslizar': 'Deslizar',
        'empujar': 'Empujar',
        'zoom': 'Acercar',
        'voltear': 'Voltear',
        'subir': 'Cubrir desde abajo'
    };

    const FUENTES = ['Segoe UI', 'Arial', 'Calibri', 'Cambria', 'Georgia', 'Times New Roman', 'Verdana',
        'Trebuchet MS', 'Tahoma', 'Century Gothic', 'Garamond', 'Palatino Linotype', 'Impact', 'Segoe Print'];

    const base = (extra) => ({
        fondo: { tipo: 'color', color1: '#111827', color2: '#1f2937', angulo: 135, imagen: null, oscurecer: 0.4 },
        fuenteTitulo: 'Segoe UI', fuenteTexto: 'Segoe UI',
        colorTitulo: '#ffffff', colorTexto: '#e5e7eb', colorAcento: '#f59e0b',
        alineacion: 'izquierda', vineta: 'punto', escala: 1,
        ...extra
    });

    const ESTILOS_PREDEFINIDOS = [
        { id: 'pre-noche', nombre: 'Noche elegante', datos: base({
            fondo: { tipo: 'degradado', color1: '#0f172a', color2: '#1e293b', angulo: 135, imagen: null, oscurecer: 0.4 },
            fuenteTitulo: 'Georgia', colorTexto: '#cbd5e1', colorAcento: '#f59e0b' }) },
        { id: 'pre-claro', nombre: 'Claro minimalista', datos: base({
            fondo: { tipo: 'color', color1: '#ffffff', color2: '#f3f4f6', angulo: 135, imagen: null, oscurecer: 0.4 },
            colorTitulo: '#111827', colorTexto: '#374151', colorAcento: '#2563eb' }) },
        { id: 'pre-azul', nombre: 'Azul corporativo', datos: base({
            fondo: { tipo: 'degradado', color1: '#1e3a8a', color2: '#2563eb', angulo: 120, imagen: null, oscurecer: 0.4 },
            fuenteTitulo: 'Calibri', fuenteTexto: 'Calibri', colorTexto: '#dbeafe', colorAcento: '#fbbf24' }) },
        { id: 'pre-atardecer', nombre: 'Atardecer', datos: base({
            fondo: { tipo: 'degradado', color1: '#7c2d12', color2: '#be185d', angulo: 135, imagen: null, oscurecer: 0.4 },
            fuenteTitulo: 'Trebuchet MS', fuenteTexto: 'Trebuchet MS', colorTexto: '#ffe4e6', colorAcento: '#fde68a' }) },
        { id: 'pre-bosque', nombre: 'Bosque', datos: base({
            fondo: { tipo: 'degradado', color1: '#052e16', color2: '#065f46', angulo: 160, imagen: null, oscurecer: 0.4 },
            fuenteTitulo: 'Cambria', fuenteTexto: 'Cambria', colorTexto: '#d1fae5', colorAcento: '#6ee7b7' }) },
        { id: 'pre-pizarra', nombre: 'Pizarra', datos: base({
            fondo: { tipo: 'color', color1: '#1f2a24', color2: '#111827', angulo: 135, imagen: null, oscurecer: 0.4 },
            fuenteTitulo: 'Segoe Print', fuenteTexto: 'Segoe Print', colorTexto: '#f1f5f9', colorAcento: '#fde047', vineta: 'numero' }) },
        { id: 'pre-papel', nombre: 'Papel clásico', datos: base({
            fondo: { tipo: 'color', color1: '#faf6ee', color2: '#f3ead8', angulo: 135, imagen: null, oscurecer: 0.4 },
            fuenteTitulo: 'Palatino Linotype', fuenteTexto: 'Palatino Linotype', colorTitulo: '#3b2f2f', colorTexto: '#4b3f36',
            colorAcento: '#b45309', alineacion: 'centro' }) }
    ];

    // --- Estilos de las diapositivas (se agregan una sola vez a la página) ---
    const CSS = `
    .sl { position: absolute; left: 0; top: 0; width: ${ANCHO}px; height: ${ALTO}px; transform-origin: 0 0; overflow: hidden;
          box-sizing: border-box; color: var(--c-texto); font-family: var(--f-texto); line-height: 1.25; --k: 1; }
    .sl * { box-sizing: border-box; }
    .sl-velo { position: absolute; inset: 0; background: #000; }
    .sl-inner { position: absolute; inset: 110px 150px; display: flex; flex-direction: column; justify-content: center; min-height: 0; }
    .sl-titulo { margin: 0; font-family: var(--f-titulo); color: var(--c-titulo); font-weight: 700; font-size: calc(84px * var(--k)); line-height: 1.1; }
    .sl-sub { margin: calc(24px * var(--k)) 0 0; font-size: calc(46px * var(--k)); opacity: .85; }
    .sl-barra { width: 150px; height: 8px; border-radius: 4px; background: var(--c-acento); margin: calc(34px * var(--k)) 0; flex-shrink: 0; }
    .sl-lista { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: calc(26px * var(--k)); font-size: calc(50px * var(--k)); }
    .sl-li { position: relative; padding-left: 1.3em; }
    .vin-punto .sl-li::before { content: ""; position: absolute; left: .2em; top: .62em; width: .36em; height: .36em; border-radius: 50%;
          background: var(--c-acento); transform: translateY(-50%); }
    .vin-numero .sl-lista { counter-reset: n; }
    .vin-numero .sl-li { counter-increment: n; padding-left: 1.6em; }
    .vin-numero .sl-li::before { content: counter(n) "."; position: absolute; left: 0; color: var(--c-acento); font-weight: 700; }
    .vin-ninguna .sl-li { padding-left: 0; }
    .sl-li.oculto { visibility: hidden; }
    .sl-vacio { opacity: .35; font-style: italic; }

    .sl-d-titulo .sl-titulo { font-size: calc(128px * var(--k)); }
    .sl-d-titulo .sl-sub { font-size: calc(54px * var(--k)); }
    .sl-d-titulo-contenido .sl-inner, .sl-d-dos-columnas .sl-inner { justify-content: flex-start; }
    .sl-d-seccion .sl-bloque { border-left: 16px solid var(--c-acento); padding-left: 60px; }
    .sl-d-seccion .sl-titulo { font-size: calc(118px * var(--k)); }
    .sl-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 90px; }
    .sl-d-imagen-texto .sl-inner { display: grid; grid-template-columns: 1fr 1fr; gap: 90px; align-items: stretch; }
    .sl-d-imagen-texto .sl-medir { display: flex; flex-direction: column; justify-content: center; min-height: 0; overflow: hidden; }
    .sl-img { width: 100%; height: 100%; min-height: 0; object-fit: cover; border-radius: 28px; display: block; background: rgba(127,127,127,.15); }
    .sl-img-vacia { display: flex; align-items: center; justify-content: center; font-size: 46px; opacity: .5; border: 4px dashed currentColor; }
    .sl-d-imagen .sl-img-full { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
    .sl-d-imagen .sl-pie { position: absolute; left: 0; right: 0; bottom: 0; padding: 170px 150px 90px; background: linear-gradient(transparent, rgba(0,0,0,.78)); }
    .sl-d-imagen .sl-titulo { color: #fff; font-size: calc(80px * var(--k)); }
    .sl-d-imagen .sl-sub { color: #fff; }
    .sl-comillas { font-family: Georgia, serif; font-size: 320px; line-height: .8; height: 150px; color: var(--c-acento); }
    .sl-frase { margin: 0; font-family: var(--f-titulo); font-size: calc(74px * var(--k)); font-style: italic; color: var(--c-titulo); line-height: 1.25; }
    .sl-autor { margin-top: calc(50px * var(--k)); font-size: calc(44px * var(--k)); color: var(--c-acento); font-weight: 600; }
    .alin-centro:not(.sl-d-imagen-texto) .sl-inner { text-align: center; align-items: center; }
    .alin-centro .sl-pie { text-align: center; }
    .alin-centro.sl-d-imagen-texto .sl-medir { text-align: center; align-items: center; }
    .sl-holder { position: absolute; inset: 0; overflow: hidden; backface-visibility: hidden; }
    `;

    function inyectarCss() {
        if (document.getElementById('slide-renderer-css')) return;
        const style = document.createElement('style');
        style.id = 'slide-renderer-css';
        style.textContent = CSS;
        document.head.appendChild(style);
    }

    function nodo(tag, clase, texto) {
        const n = document.createElement(tag);
        if (clase) n.className = clase;
        if (texto !== undefined) n.textContent = texto;
        return n;
    }

    const lineas = (texto) => (texto || '').split('\n').map(s => s.trim()).filter(Boolean);

    function fondoCss(fondo) {
        if (fondo.tipo === 'degradado') return `linear-gradient(${fondo.angulo || 135}deg, ${fondo.color1}, ${fondo.color2})`;
        if (fondo.tipo === 'imagen' && fondo.imagen) return `center / cover no-repeat url(${JSON.stringify(fondo.imagen.url)}), ${fondo.color1}`;
        return fondo.color1;
    }

    /**
     * Crea el elemento de una diapositiva.
     * opciones.paso: cuántos puntos se muestran cuando la diapositiva es "uno por uno"
     * opciones.editor: muestra textos de ayuda en los campos vacíos
     */
    function crearDiapositiva(d, estilo, opciones = {}) {
        inyectarCss();
        const { paso = Infinity, editor = false } = opciones;
        const e = estilo || ESTILOS_PREDEFINIDOS[0].datos;
        const diseno = DISENOS[d.diseno] ? d.diseno : 'titulo-contenido';
        const pasoAPaso = !!(d.animacion && d.animacion.pasoAPaso);

        const sl = nodo('div', `sl sl-d-${diseno} alin-${e.alineacion} vin-${e.vineta}`);
        sl.style.background = fondoCss(e.fondo);
        sl.style.setProperty('--f-titulo', `"${e.fuenteTitulo}", "Segoe UI", sans-serif`);
        sl.style.setProperty('--f-texto', `"${e.fuenteTexto}", "Segoe UI", sans-serif`);
        sl.style.setProperty('--c-titulo', e.colorTitulo);
        sl.style.setProperty('--c-texto', e.colorTexto);
        sl.style.setProperty('--c-acento', e.colorAcento);
        sl.dataset.escala = e.escala || 1;
        sl.style.setProperty('--k', e.escala || 1);

        if (e.fondo.tipo === 'imagen' && e.fondo.imagen && e.fondo.oscurecer > 0) {
            const velo = nodo('div', 'sl-velo');
            velo.style.opacity = e.fondo.oscurecer;
            sl.appendChild(velo);
        }

        // Texto con ayuda en el editor si está vacío
        const texto = (tag, clase, valor, ayuda) => {
            if (valor) return nodo(tag, clase + ' anim', valor);
            return editor ? nodo(tag, clase + ' sl-vacio', ayuda) : null;
        };
        const agregar = (padre, ...hijos) => hijos.filter(Boolean).forEach(h => padre.appendChild(h));

        let contadorPaso = 0;
        const lista = (contenido) => {
            const items = lineas(contenido);
            if (!items.length) return editor ? nodo('div', 'sl-vacio sl-lista', 'Escribe los puntos (uno por línea)') : null;
            const ul = nodo('ul', 'sl-lista');
            items.forEach(item => {
                const li = nodo('li', 'sl-li anim', item);
                if (pasoAPaso) {
                    contadorPaso++;
                    li.dataset.paso = contadorPaso;
                    if (contadorPaso > paso) li.classList.add('oculto');
                }
                ul.appendChild(li);
            });
            return ul;
        };
        const imagen = (clase) => {
            if (d.imagen && d.imagen.url) {
                const img = nodo('img', clase + ' anim');
                img.src = d.imagen.url;
                img.alt = '';
                return img;
            }
            return editor ? nodo('div', clase + ' sl-img-vacia', '🖼️  Elige una imagen') : null;
        };

        const inner = nodo('div', 'sl-inner');
        const titulo = () => texto('h1', 'sl-titulo', d.titulo, 'Título');

        switch (diseno) {
            case 'titulo':
                agregar(inner, titulo(), (d.titulo || editor) ? nodo('div', 'sl-barra anim') : null,
                    texto('p', 'sl-sub', d.subtitulo, 'Subtítulo'));
                break;
            case 'titulo-contenido':
                agregar(inner, titulo(), nodo('div', 'sl-barra anim'), lista(d.contenido));
                break;
            case 'seccion': {
                const bloque = nodo('div', 'sl-bloque');
                agregar(bloque, titulo(), texto('p', 'sl-sub', d.subtitulo, 'Subtítulo'));
                inner.appendChild(bloque);
                break;
            }
            case 'dos-columnas': {
                const cols = nodo('div', 'sl-cols');
                agregar(cols, lista(d.contenido) || nodo('div'), lista(d.contenido2) || nodo('div'));
                agregar(inner, titulo(), nodo('div', 'sl-barra anim'), cols);
                break;
            }
            case 'imagen-texto': {
                const col = nodo('div', 'sl-medir');
                agregar(col, titulo(), nodo('div', 'sl-barra anim'), lista(d.contenido));
                agregar(inner, imagen('sl-img'), col);
                break;
            }
            case 'imagen': {
                agregar(sl, imagen('sl-img-full'));
                if (d.titulo || d.subtitulo || editor) {
                    const pie = nodo('div', 'sl-pie');
                    agregar(pie, texto('h1', 'sl-titulo', d.titulo, 'Pie de foto (opcional)'), texto('p', 'sl-sub', d.subtitulo, ''));
                    sl.appendChild(pie);
                }
                return sl;
            }
            case 'cita':
                agregar(inner, nodo('div', 'sl-comillas anim', '“'), texto('p', 'sl-frase', d.titulo, 'Escribe la frase'),
                    texto('div', 'sl-autor', d.subtitulo ? '— ' + d.subtitulo : '', '— Autor'));
                break;
        }
        sl.appendChild(inner);
        return sl;
    }

    // Escala la diapositiva para que quepa centrada en su contenedor
    function escalar(sl) {
        const cont = sl.parentElement && sl.parentElement.classList.contains('sl-holder') ? sl.parentElement.parentElement : sl.parentElement;
        if (!cont) return;
        const w = cont.clientWidth, h = cont.clientHeight;
        if (!w || !h) return;
        const s = Math.min(w / ANCHO, h / ALTO);
        sl.style.transform = `scale(${s})`;
        sl.style.left = (w - ANCHO * s) / 2 + 'px';
        sl.style.top = (h - ALTO * s) / 2 + 'px';
    }

    // Si el texto no cabe, lo achica poco a poco
    function ajustarTexto(sl) {
        const medir = sl.querySelector('.sl-medir') || sl.querySelector('.sl-inner');
        if (!medir || !medir.clientHeight) return;
        let k = parseFloat(sl.dataset.escala) || 1;
        sl.style.setProperty('--k', k);
        while (medir.scrollHeight > medir.clientHeight + 2 && k > 0.45) {
            k -= 0.05;
            sl.style.setProperty('--k', k);
        }
    }

    // Coloca una diapositiva dentro de un contenedor (que debe tener position: relative y un tamaño)
    function montarDiapositiva(contenedor, sl) {
        contenedor.appendChild(sl);
        escalar(sl);
        ajustarTexto(sl);
        return sl;
    }

    // --- Animaciones de entrada ---
    const ENTRADAS = {
        desvanecer: [{ opacity: 0 }, { opacity: 1 }],
        subir: [{ opacity: 0, transform: 'translateY(50px)' }, { opacity: 1, transform: 'none' }],
        zoom: [{ opacity: 0, transform: 'scale(.85)' }, { opacity: 1, transform: 'none' }],
        izquierda: [{ opacity: 0, transform: 'translateX(-90px)' }, { opacity: 1, transform: 'none' }]
    };
    const animar = (el, tipo, delay = 0) => {
        if (!ENTRADAS[tipo]) return;
        el.animate(ENTRADAS[tipo], { duration: 550, delay, easing: 'cubic-bezier(.2,.7,.2,1)', fill: 'backwards' });
    };

    function animarEntrada(sl, tipo, retraso = 0) {
        sl.querySelectorAll('.anim:not(.oculto)').forEach((el, i) => animar(el, tipo, retraso + i * 130));
    }

    // Muestra/oculta los puntos según el paso actual (modo "uno por uno")
    function mostrarPaso(sl, paso, tipo) {
        sl.querySelectorAll('[data-paso]').forEach(li => {
            const visible = Number(li.dataset.paso) <= paso;
            if (visible && li.classList.contains('oculto')) {
                li.classList.remove('oculto');
                animar(li, tipo === 'ninguna' ? 'desvanecer' : tipo);
            } else if (!visible) {
                li.classList.add('oculto');
            }
        });
    }

    const contarPasos = (d) => (d.animacion && d.animacion.pasoAPaso)
        ? lineas(d.contenido).length + (d.diseno === 'dos-columnas' ? lineas(d.contenido2).length : 0)
        : 0;

    // --- Transiciones entre diapositivas (nuevo y viejo son .sl-holder) ---
    const TRANS = {
        desvanecer: { nuevo: [{ opacity: 0 }, { opacity: 1 }] },
        deslizar: { nuevo: [{ transform: 'translateX(100%)' }, { transform: 'none' }] },
        empujar: { nuevo: [{ transform: 'translateX(100%)' }, { transform: 'none' }], viejo: [{ transform: 'none' }, { transform: 'translateX(-100%)' }] },
        zoom: { nuevo: [{ opacity: 0, transform: 'scale(1.12)' }, { opacity: 1, transform: 'none' }], viejo: [{ opacity: 1 }, { opacity: 0 }] },
        subir: { nuevo: [{ transform: 'translateY(100%)' }, { transform: 'none' }] },
        voltear: { mitades: true,
            viejo: [{ transform: 'perspective(2400px) rotateY(0deg)' }, { transform: 'perspective(2400px) rotateY(90deg)' }],
            nuevo: [{ transform: 'perspective(2400px) rotateY(-90deg)' }, { transform: 'none' }] }
    };

    function transicionar(nuevo, viejo, tipo, duracion = 600) {
        const t = TRANS[tipo];
        if (!t || !viejo) {
            if (viejo) viejo.remove();
            return Promise.resolve();
        }
        const opts = { duration: t.mitades ? duracion / 2 : duracion, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'both' };
        const anims = [];
        if (t.viejo) anims.push(viejo.animate(t.viejo, opts));
        if (t.nuevo) anims.push(nuevo.animate(t.nuevo, { ...opts, delay: t.mitades ? duracion / 2 : 0 }));
        return Promise.all(anims.map(a => a.finished.catch(() => {}))).then(() => {
            viejo.remove();
            anims.forEach(a => a.cancel());
        });
    }

    window.SlideRenderer = {
        ANCHO, ALTO, DISENOS, ANIMACIONES, TRANSICIONES, FUENTES, ESTILOS_PREDEFINIDOS,
        crearDiapositiva, montarDiapositiva, escalar, ajustarTexto,
        animarEntrada, mostrarPaso, contarPasos, transicionar
    };
})();

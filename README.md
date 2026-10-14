# Proyección Iglesia

Software de proyección para iglesias con dos pantallas (*dual-screen*): un **Panel de Control** para el operador y una **Pantalla de Proyección** para el proyector o TV. Proyecta biblias, canciones, multimedia, presentaciones y páginas web en tiempo real. Es **100 % local**: funciona sin internet (excepto el módulo web).

> La documentación técnica completa (arquitectura, base de datos, patrones de diseño, seguridad y canales IPC) está en [DOCUMENTACION.md](DOCUMENTACION.md).

## Funcionalidades

- 📖 **Biblia**: RVR1960, NVI1999, KJV y DHH (con deuterocanónicos). Navegación por libro, capítulo y versículo, búsqueda por texto sin importar acentos e historial de versículos proyectados.
- 🎵 **Canciones y agendas**: biblioteca de canciones divididas automáticamente en estrofas, buscador por título o letra, y agendas ordenables para cada servicio.
- 🎬 **Multimedia**: fondos de color, imagen o video, con modos de ajuste, bucle, reproductor sincronizado y atenuador (dimmer).
- 🖼️ **Logo**: marca de agua con 9 posiciones y tamaño ajustable.
- 🛠️ **Utilidades**: cuenta regresiva (por duración o hasta una hora), notas rápidas y texto rápido.
- 📊 **Presentaciones**: editor estilo PowerPoint con 7 diseños, animaciones, transiciones, estilos reutilizables y modo presentador.
- 🌐 **Web**: navegación privada y proyección de páginas con un espejo interactivo desde el panel.
- ⚙️ **Ajustes**: fuente, colores, tamaño automático del texto, transiciones, tema claro/oscuro y diseño del panel.
- 👁️ **Vista previa en vivo** de lo que se está proyectando.

## Cómo funciona

- **Panel de Control** (`index.html`): menú lateral para cambiar de módulo, área de trabajo central y controles de pantalla siempre visibles (vista previa, limpiar texto, mostrar/ocultar texto, fondo y atenuador).
- **Pantalla de Proyección** (`projection.html`): ventana limpia. Si hay un segundo monitor, se abre ahí en pantalla completa.
- Toda la comunicación entre las dos ventanas pasa por el proceso principal de Electron mediante **IPC**, sin red ni latencia. Si la proyección se cierra y se vuelve a abrir, recupera el mismo texto, fondo, logo y estilos.

## Almacenamiento

- **Biblias**: `bibles.sqlite`, de solo lectura. Usa un esquema de 4 tablas (`versiones`, `libros`, `version_libro_link`, `versiculos`) que admite versiones con distinta cantidad de libros (66 canónicos o 78 con deuterocanónicos).
- **Datos del usuario**: `userdata.db` (canciones, agendas, galería, presentaciones e historial), guardada en la carpeta de datos de la app (`%APPDATA%\proyecto` en Windows).
- **Multimedia**: la galería guarda la **ruta** de cada imagen o video, no una copia. Si un archivo se mueve o se borra, aparece como no disponible y hay que volver a agregarlo.
- **Preferencias de interfaz** (tema, logo, notas, sitios web): `localStorage`.

## Requisitos

- [Node.js](https://nodejs.org/) 18 o superior
- npm

## Instalación y uso

```bash
npm install     # instala dependencias
npm start       # abre la aplicación
```

Para generar el instalador:

```bash
npm run dist:win     # Windows (instalador NSIS)
npm run dist:linux   # Linux (AppImage y .deb)
```

## Atajos de teclado

| Atajo | Acción |
|---|---|
| `F1` | Limpiar todo |
| `F2` | Quitar el texto |
| `F3` | Fondo negro |
| `F4` | Mostrar/ocultar logo |
| `T` | Mostrar/ocultar texto |
| `F11` | Pantalla completa de la proyección |
| `Ctrl + 1…8` | Cambiar de sección |
| `Ctrl + F` | Buscar |
| `Ctrl + P` | Abrir la proyección |
| `Ctrl + ,` | Ajustes |
| Flechas, `RePág`, `AvPág` | Versículo, estrofa o diapositiva anterior/siguiente |

## Tecnologías

Electron 38 · Node.js · JavaScript · HTML5 · CSS3 · SQLite (`sqlite3`) · electron-builder

## Autor

Pedro Reyes

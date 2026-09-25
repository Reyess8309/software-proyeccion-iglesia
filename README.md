Software de Proyección para Iglesias (Dual-Screen)
1. Concepto Central y Arquitectura
Objetivo: Un software de proyección para presentaciones en vivo (letras, biblias, multimedia) que sea 100% local, rápido y sin dependencias de internet.

Tecnología Base: Aplicación de escritorio construida con Node.js y Electron.

Estructura de Ventanas:

Panel de Control (index.html): La interfaz principal del operador.

Pantalla de Proyección (projection.html): Ventana secundaria y limpia que se arrastra al proyector/pantalla extendida.

Rendimiento (Cero Lag): Toda la comunicación entre el Panel y la Proyección se hace internamente mediante IPC (Inter-Process Communication). Los cambios (textos, estilos, fondos) se reflejan en tiempo real sin latencia de red.

2. Sistema de Persistencia de Datos (Almacenamiento)
Textos y Configuraciones: Se utiliza una base de datos local SQLite (o JSON en su defecto para configuraciones menores) para almacenar canciones, agendas y biblias.

Manejo de Multimedia (Videos e Imágenes): Se utiliza el Método de Importación. La aplicación no guarda rutas a los archivos originales del usuario (lo cual rompería el programa si el usuario mueve el archivo). Al añadir un video/imagen, la app copia el archivo a una carpeta interna segura (AppData o dentro del proyecto) y lee desde ahí.

Esquema de Base de Datos para Biblias: Diseño de 4 tablas para soportar versiones con diferentes cantidades de libros (ej. Canónicas vs. Deuterocanónicas):

versiones (id, nombre, abreviatura).

libros (Catálogo maestro de todos los libros posibles).

version_libro_link (Tabla puente que asocia qué libros pertenecen a qué versión).

versiculos (id_version, id_libro, capitulo, versiculo, texto).

3. Diseño de Interfaz General (Layout)
La ventana del Panel de Control se divide en 3 zonas principales:

Menú Lateral (Izquierda): Navegación entre módulos.

Área de Trabajo (Centro/Arriba): Cambia dinámicamente según el módulo seleccionado.

Barra Inferior Global (Abajo): Controles persistentes que siempre están visibles sin importar en qué módulo se esté trabajando.

4. Detalles de los Módulos (Menú Lateral)
📖 1. Módulo de Biblias
Interfaz de 4 columnas para búsqueda rápida:

Columna 1: Selector dinámico de Versión (RVR1960, DHH, etc.) y Lista de Libros correspondientes.

Columna 2: Lista de Capítulos (se actualiza al tocar un libro).

Columna 3: Lista de Versículos (se actualiza al tocar un capítulo). Al hacer clic en uno, se proyecta inmediatamente.

Columna 4: Selector de Fondo (imagen/video local) con un checkbox para decidir si al proyectar el texto, también se cambia el fondo o se mantiene el actual.

🎶 2. Módulo de Canciones
Interfaz de 3 columnas:

Columna 1 (Biblioteca / Agenda):

Pestañas para ver "Todas las canciones" o "Agendas" (listas de reproducción para un evento).

Botón "Agregar Nueva": Abre un modal para pegar la letra. El sistema divide automáticamente la canción en bloques o estrofas guiándose por los saltos de línea.

Columna 2 (Letra Activa): Muestra los párrafos separados en bloques de la canción seleccionada. Al hacer clic en un bloque, se proyecta.

Columna 3: Selector de Fondo (igual que en Biblias).

🎬 3. Módulo de Multimedia
Gestor del banco de medios importados (2 columnas):

Columna 1 (Videos): Galería de miniaturas de videos.

Columna 2 (Imágenes): Galería de miniaturas de imágenes.

Regla de Proyección: Al hacer clic en un medio, este se envía directamente a la pantalla reemplazando todo el fondo y limpiando el texto.

Controles Integrados: Checkbox general de [ ] Loop (Bucle) para videos y selector de transición.

📌 4. Módulo de Logo (Superposición)
Control independiente para un logo o marca de agua.

Carga de imagen (PNG transparente recomendado).

Cuadrícula de Posición (9 puntos: esquinas, centros).

Slider de Tamaño (escalado en tiempo real).

Interruptor Mostrar/Ocultar: Se proyecta por encima del texto y el fondo.

📂 5. Módulo de Recursos
Herramientas extra de 3 columnas:

Columna 1 (Cuenta Regresiva): Modo "Duración" (ej. 5 min) o "Hasta la Hora" (ej. 10:00 AM). Campos opcionales para texto arriba/abajo del reloj.

Columna 2 (Notas Rápidas): 4 bloques de texto independientes para anuncios urgentes ("Auto con placas XYZ mal estacionado").

Columna 3: Selector de fondo para estos recursos.

5. Barra Inferior Global (Controles Persistentes)
Sección fija en la parte inferior de la pantalla del operador:

Previsualización en Vivo: Una miniatura que muestra un espejo exacto de lo que está saliendo en la Ventana de Proyección.

Botón "Limpiar Texto": Quita el versículo/canción de la pantalla de proyección, pero deja el video o imagen de fondo reproduciéndose normalmente.

Botón "Ajustes Rápidos": Abre un modal para modificar el CSS en tiempo real (Fuente, Tamaño, Negrita, Colores de Letra y Sombra, Mayúsculas automáticas y Márgenes/Área segura).

Slider de Iluminación (Dimmer): Un deslizador del 0% al 100% que aplica una capa oscura translúcida sobre el video de fondo para hacer que las letras blancas resalten más.

Botón "Fondos Favoritos": Acceso rápido a 3 o 4 fondos (incluido el negro por defecto) sin tener que cambiar de módulo.
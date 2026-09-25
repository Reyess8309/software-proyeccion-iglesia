// migrar.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// 1. Rutas de tus bases de datos
const MASTER_DB_PATH = path.join(__dirname, 'bibles_master.sqlite');
const RVR_DB_PATH = path.join(__dirname, 'rvr1960.sqlite');
const DHH_DB_PATH = path.join(__dirname, 'DHHDC.sqlite');
const KJV_DB_PATH = path.join(__dirname, 'kjv.sqlite');
const NVI_DB_PATH = path.join(__dirname, 'NVI1999.sqlite');

const masterDb = new sqlite3.Database(MASTER_DB_PATH);

// Función auxiliar para registrar la versión y obtener su ID
function insertarVersion(nombre, abreviatura) {
    return new Promise((resolve, reject) => {
        masterDb.run(
            `INSERT OR IGNORE INTO versiones (nombre, abreviatura) VALUES (?, ?)`,
            [nombre, abreviatura],
            function(err) {
                if (err) reject(err);
                masterDb.get(`SELECT id FROM versiones WHERE abreviatura = ?`, [abreviatura], (err, row) => {
                    if (err) reject(err);
                    resolve(row.id);
                });
            }
        );
    });
}

// Función auxiliar para registrar los libros (del 1 al 66) para biblias que no tienen tabla de libros (KJV, NVI)
function vincularLibrosEstandar(idVersion, maxLibros = 66) {
    return new Promise((resolve) => {
        masterDb.serialize(() => {
            for (let i = 1; i <= maxLibros; i++) {
                masterDb.run(`INSERT OR IGNORE INTO version_libro_link (id_version, id_libro) VALUES (?, ?)`, [idVersion, i]);
            }
            resolve();
        });
    });
}

// ============================================================================
// 1. MIGRACIÓN RVR1960 (Tablas: book, verse)
// ============================================================================
function migrarRVR() {
    return new Promise(async (resolve, reject) => {
        const idVersion = await insertarVersion("Reina-Valera 1960", "RVR1960");
        const sourceDb = new sqlite3.Database(RVR_DB_PATH);
        console.log("Iniciando RVR1960...");

        await vincularLibrosEstandar(idVersion, 66); // Vincula 66 libros

        sourceDb.all(`SELECT book_id, chapter, verse, text FROM verse`, [], (err, verses) => {
            if (err) return reject(err);
            masterDb.serialize(() => {
                masterDb.run("BEGIN TRANSACTION");
                const stmt = masterDb.prepare(`INSERT INTO versiculos (id_version, id_libro, capitulo, versiculo, texto) VALUES (?, ?, ?, ?, ?)`);
                verses.forEach(v => stmt.run([idVersion, v.book_id, v.chapter, v.verse, v.text]));
                stmt.finalize();
                masterDb.run("COMMIT", () => { sourceDb.close(); console.log("✅ RVR1960 lista!"); resolve(); });
            });
        });
    });
}

// ============================================================================
// 2. MIGRACIÓN DHHDC (Tablas: livros, versiculos_fts | Filtro: is_title = 0)
// ============================================================================
function migrarDHH() {
    return new Promise(async (resolve, reject) => {
        const idVersion = await insertarVersion("Dios Habla Hoy (Deuterocanónica)", "DHHDC");
        const sourceDb = new sqlite3.Database(DHH_DB_PATH);
        console.log("Iniciando DHHDC (excluyendo títulos)...");

        // DHH tiene libros extra, leemos su tabla 'livros'
        sourceDb.all(`SELECT id FROM livros`, [], (err, books) => {
            if (err) return reject(err);
            books.forEach(b => masterDb.run(`INSERT OR IGNORE INTO version_libro_link (id_version, id_libro) VALUES (?, ?)`, [idVersion, b.id]));

            // NOTA: Asumí que escribiste dos veces numero_capitulo por error tipográfico y el otro es numero_versiculo
            const query = `SELECT id_livro, numero_capitulo, numero_versiculo, texto FROM versiculos_fts WHERE is_title = 0`;
            
            sourceDb.all(query, [], (err, verses) => {
                if (err) return reject(err);
                masterDb.serialize(() => {
                    masterDb.run("BEGIN TRANSACTION");
                    const stmt = masterDb.prepare(`INSERT INTO versiculos (id_version, id_libro, capitulo, versiculo, texto) VALUES (?, ?, ?, ?, ?)`);
                    verses.forEach(v => stmt.run([idVersion, v.id_livro, v.numero_capitulo, v.numero_versiculo, v.texto]));
                    stmt.finalize();
                    masterDb.run("COMMIT", () => { sourceDb.close(); console.log("✅ DHHDC lista!"); resolve(); });
                });
            });
        });
    });
}

// ============================================================================
// 3. MIGRACIÓN KJV (Tablas: verses | Columna libro se llama 'book')
// ============================================================================
function migrarKJV() {
    return new Promise(async (resolve, reject) => {
        const idVersion = await insertarVersion("King James Version", "KJV");
        const sourceDb = new sqlite3.Database(KJV_DB_PATH);
        console.log("Iniciando KJV...");

        await vincularLibrosEstandar(idVersion, 66);

        sourceDb.all(`SELECT book, chapter, verse, text FROM verses`, [], (err, verses) => {
            if (err) return reject(err);
            masterDb.serialize(() => {
                masterDb.run("BEGIN TRANSACTION");
                const stmt = masterDb.prepare(`INSERT INTO versiculos (id_version, id_libro, capitulo, versiculo, texto) VALUES (?, ?, ?, ?, ?)`);
                verses.forEach(v => stmt.run([idVersion, v.book, v.chapter, v.verse, v.text]));
                stmt.finalize();
                masterDb.run("COMMIT", () => { sourceDb.close(); console.log("✅ KJV lista!"); resolve(); });
            });
        });
    });
}

// ============================================================================
// 4. MIGRACIÓN NVI1999 (Tablas: verse | Columna libro se llama 'book_id')
// ============================================================================
function migrarNVI() {
    return new Promise(async (resolve, reject) => {
        const idVersion = await insertarVersion("Nueva Versión Internacional 1999", "NVI1999");
        const sourceDb = new sqlite3.Database(NVI_DB_PATH);
        console.log("Iniciando NVI1999...");

        await vincularLibrosEstandar(idVersion, 66);

        sourceDb.all(`SELECT book_id, chapter, verse, text FROM verse`, [], (err, verses) => {
            if (err) return reject(err);
            masterDb.serialize(() => {
                masterDb.run("BEGIN TRANSACTION");
                const stmt = masterDb.prepare(`INSERT INTO versiculos (id_version, id_libro, capitulo, versiculo, texto) VALUES (?, ?, ?, ?, ?)`);
                verses.forEach(v => stmt.run([idVersion, v.book_id, v.chapter, v.verse, v.text]));
                stmt.finalize();
                masterDb.run("COMMIT", () => { sourceDb.close(); console.log("✅ NVI1999 lista!"); resolve(); });
            });
        });
    });
}

// ============================================================================
// ORQUESTADOR PRINCIPAL
// ============================================================================
async function ejecutarTodo() {
    try {
        console.log("=== INICIANDO MIGRACIÓN DE BIBLIAS ===");
        
        // Ejecutamos una por una para no sobrecargar la memoria
        await migrarRVR();
        await migrarKJV();
        await migrarNVI();
        await migrarDHH();

        console.log("=== ¡MIGRACIÓN COMPLETADA CON ÉXITO! ===");
        masterDb.close();
    } catch (error) {
        console.error("❌ Error en la migración:", error);
    }
}

// Iniciar el proceso
ejecutarTodo();
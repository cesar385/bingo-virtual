/* Bingo Virtual — lógica compartida entre el bolillero y los cartones.
   Guarda todo en localStorage con las mismas claves de la versión anterior
   ("cartones" y "bingoState"), así los datos ya cargados siguen funcionando. */
(function (global) {
    const KEY_CARTONES = 'cartones';
    const KEY_ESTADO = 'bingoState';

    function leer(clave, porDefecto) {
        try {
            const v = JSON.parse(localStorage.getItem(clave));
            return v == null ? porDefecto : v;
        } catch (e) { return porDefecto; }
    }
    function guardar(clave, valor) {
        try { localStorage.setItem(clave, JSON.stringify(valor)); } catch (e) { /* sin almacenamiento */ }
    }

    function nuevoId() {
        return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    }

    /* ---------- Cartones ---------- */
    function cargarCartones() {
        const lista = leer(KEY_CARTONES, []);
        let cambio = false;
        let maxNum = lista.reduce((m, c) => Math.max(m, parseInt(c.numero) || 0), 0);
        lista.forEach(c => {
            if (!c.id) { c.id = nuevoId(); cambio = true; }
            if (!c.numero) { c.numero = ++maxNum; cambio = true; }
            c.numeros = (c.numeros || []).map(n => parseInt(n)).filter(n => !isNaN(n));
        });
        if (cambio) guardar(KEY_CARTONES, lista);
        return lista;
    }
    function guardarCartones(lista) { guardar(KEY_CARTONES, lista); }

    function proximoNumero(lista) {
        return lista.reduce((m, c) => Math.max(m, parseInt(c.numero) || 0), 0) + 1;
    }

    // Columna del cartón de 90 bolillas: 1-9 | 10-19 | ... | 80-90
    function columna(n) { return n >= 90 ? 8 : Math.floor(n / 10); }
    function rangoColumna(c) {
        return { min: c === 0 ? 1 : c * 10, max: c === 8 ? 90 : c * 10 + 9 };
    }

    // Filas del cartón (3 filas de 5 números)
    function filas(numeros) {
        return [numeros.slice(0, 5), numeros.slice(5, 10), numeros.slice(10, 15)];
    }

    // Devuelve una matriz 3x9 (null = casillero vacío) o null si el cartón
    // no respeta el formato clásico (dos números de la misma decena en una fila).
    function grilla(numeros) {
        const g = [];
        for (const fila of filas(numeros)) {
            const f = Array(9).fill(null);
            for (const n of fila) {
                const c = columna(n);
                if (f[c] !== null) return null;
                f[c] = n;
            }
            g.push(f);
        }
        return g;
    }

    function azar(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
    function mezclar(arr) {
        const a = arr.slice();
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    }

    // Genera un cartón válido: 3 filas x 5 números, todas las columnas usadas,
    // números ordenados de arriba hacia abajo en cada columna.
    function generarCarton() {
        for (let intento = 0; intento < 500; intento++) {
            const cols = [0, 1, 2, 3, 4, 5, 6, 7, 8];
            const filasCols = [0, 1, 2].map(() => mezclar(cols).slice(0, 5).sort((a, b) => a - b));
            const usados = new Set(filasCols.flat());
            if (usados.size < 9) continue;
            const porCol = {};
            filasCols.forEach((fc, fi) => fc.forEach(c => { (porCol[c] = porCol[c] || []).push(fi); }));
            const valores = {};
            let ok = true;
            for (const c in porCol) {
                const r = rangoColumna(+c);
                const pool = [];
                for (let n = r.min; n <= r.max; n++) pool.push(n);
                const elegidos = mezclar(pool).slice(0, porCol[c].length).sort((a, b) => a - b);
                if (elegidos.length < porCol[c].length) { ok = false; break; }
                porCol[c].forEach((fi, k) => { valores[fi + '-' + c] = elegidos[k]; });
            }
            if (!ok) continue;
            return filasCols.flatMap((fc, fi) => fc.map(c => valores[fi + '-' + c]));
        }
        throw new Error('No se pudo generar el cartón');
    }

    // Valida una lista de 15 números. Devuelve { errores: [], avisos: [] }
    function validar(numeros) {
        const errores = [], avisos = [];
        if (numeros.length !== 15) errores.push(`El cartón tiene ${numeros.length} números; debe tener 15 (3 filas de 5).`);
        if (numeros.some(n => isNaN(n) || n < 1 || n > 90)) errores.push('Todos los números deben estar entre 1 y 90.');
        const rep = numeros.filter((n, i) => numeros.indexOf(n) !== i);
        if (rep.length) errores.push('Números repetidos: ' + [...new Set(rep)].join(', ') + '.');
        if (!errores.length && !grilla(numeros)) avisos.push('Alguna fila tiene dos números de la misma decena: se mostrará en formato simple.');
        return { errores, avisos };
    }

    function mismaCombinacion(a, b) {
        if (a.length !== b.length) return false;
        const sa = a.slice().sort((x, y) => x - y), sb = b.slice().sort((x, y) => x - y);
        return sa.every((n, i) => n === sb[i]);
    }

    /* ---------- Estado del juego ---------- */
    function estadoVacio() {
        return {
            numbers: Array.from({ length: 90 }, (_, i) => i + 1),
            drawnNumbers: [],
            cuaternoGanado: false,
            lineaGanada: false,
            bingoGanado: false,
            ganadores: []
        };
    }
    function cargarEstado() {
        const e = leer(KEY_ESTADO, null);
        if (!e || !Array.isArray(e.drawnNumbers)) return estadoVacio();
        const base = estadoVacio();
        const sacadas = new Set(e.drawnNumbers);
        return Object.assign(base, e, {
            numbers: base.numbers.filter(n => !sacadas.has(n)),
            ganadores: e.ganadores || [],
            // partidas guardadas antes de existir el cuaterno
            cuaternoGanado: e.cuaternoGanado != null ? e.cuaternoGanado : !!e.lineaGanada
        });
    }
    function guardarEstado(e) { guardar(KEY_ESTADO, e); }
    function borrarEstado() { try { localStorage.removeItem(KEY_ESTADO); } catch (e) { } }

    // Progreso de un cartón frente a las bolillas sacadas
    function progreso(carton, sacadas) {
        const set = sacadas instanceof Set ? sacadas : new Set(sacadas);
        const fs = filas(carton.numeros).map(f => {
            const faltan = f.filter(n => !set.has(n));
            return { numeros: f, faltan, marcados: f.length - faltan.length, completa: faltan.length === 0 };
        });
        const faltanTotal = carton.numeros.filter(n => !set.has(n));
        return {
            filas: fs,
            marcados: carton.numeros.length - faltanTotal.length,
            faltan: faltanTotal,
            maxFila: Math.max(...fs.map(f => f.marcados)),
            cuaterno: fs.some(f => f.marcados >= 4),
            linea: fs.some(f => f.completa),
            minFaltaLinea: Math.min(...fs.map(f => f.faltan.length)),
            bingo: faltanTotal.length === 0
        };
    }

    function escapar(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
    }

    // Color de la bolilla según la decena (como un bolillero real)
    const COLORES = ['#e53935', '#fb8c00', '#fdd835', '#43a047', '#1e88e5', '#3949ab', '#8e24aa', '#d81b60', '#00897b'];
    function colorBola(n) { return COLORES[Math.min(8, Math.floor((n - 1) / 10))]; }

    // HTML de un cartón con los números sacados marcados
    function htmlCarton(carton, sacadas, ultima, pieExtra) {
        const set = sacadas instanceof Set ? sacadas : new Set(sacadas || []);
        const p = progreso(carton, set);
        const g = grilla(carton.numeros);
        const celda = n => {
            if (n == null) return '<div class="celda vacia"></div>';
            const cls = ['celda'];
            if (set.has(n)) cls.push('marcada');
            if (n === ultima) cls.push('ultima');
            return `<div class="${cls.join(' ')}">${n}</div>`;
        };
        const claseFila = i => p.filas[i].completa ? 'fila-completa' : p.filas[i].marcados >= 4 ? 'fila-cuaterno' : '';
        let cuerpo;
        if (g) {
            cuerpo = g.map((f, i) => `<div style="display:contents" class="${claseFila(i)}">${f.map(celda).join('')}</div>`).join('');
        } else {
            cuerpo = filas(carton.numeros).map((f, i) => `<div style="display:contents" class="${claseFila(i)}">${f.map(celda).join('')}</div>`).join('');
        }
        let estado = '';
        if (p.bingo) estado = '<span class="badge badge-bingo">¡BINGO!</span>';
        else if (p.linea) estado = '<span class="badge badge-linea">LÍNEA</span>';
        else if (p.cuaterno) estado = '<span class="badge badge-cuaterno">CUATERNO</span> <span class="badge badge-cerca">a 1 de línea</span>';
        else if (p.maxFila === 3) estado = '<span class="badge badge-cerca">a 1 de cuaterno</span>';
        if (!p.bingo && p.faltan.length === 1) estado += ' <span class="badge badge-cerca">¡a 1 de bingo!</span>';
        const pct = Math.round(p.marcados / 15 * 100);
        return `<div class="carton" data-id="${escapar(carton.id)}">
            <div class="carton-cab"><span class="comp">${escapar(carton.comprador) || 'Sin nombre'}</span><span class="nro">N° ${escapar(carton.numero)}</span></div>
            <div class="carton-grid ${g ? '' : 'simple'}">${cuerpo}</div>
            <div class="carton-pie"><span>${p.marcados}/15</span><span class="barra"><i style="width:${pct}%"></i></span>${estado}${pieExtra || ''}</div>
        </div>`;
    }

    global.Bingo = {
        htmlCarton,
        cargarCartones, guardarCartones, proximoNumero, nuevoId,
        columna, rangoColumna, filas, grilla, generarCarton, validar, mismaCombinacion,
        estadoVacio, cargarEstado, guardarEstado, borrarEstado, progreso,
        escapar, colorBola
    };
})(window);

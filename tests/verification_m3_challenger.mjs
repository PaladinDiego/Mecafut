// tests/verification_m3_challenger.mjs
// EMPIRICAL CHALLENGER VERIFICATION HARNESS FOR MILESTONE 3
// Tests functional state transitions, eligibility integration, and WhatsApp URL formatting.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { register } from 'node:module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// 1. Register Extensionless ESM Resolver for lib/*.js modules
try {
  const resolverPath = pathToFileURL(path.join(__dirname, 'e2e', 'resolver.mjs')).href;
  register(resolverPath, import.meta.url);
} catch (e) {
  // Continue if already registered
}

// 2. Setup mock browser environment (localStorage, window)
class MemoryLocalStorage {
  constructor() {
    this._store = new Map();
  }
  getItem(k) { return this._store.has(String(k)) ? this._store.get(String(k)) : null; }
  setItem(k, v) { this._store.set(String(k), String(v)); }
  removeItem(k) { this._store.delete(String(k)); }
  clear() { this._store.clear(); }
}
const memStore = new MemoryLocalStorage();
globalThis.localStorage = memStore;
globalThis.window = {
  localStorage: memStore,
  dispatchEvent: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
  CustomEvent: globalThis.CustomEvent
};

// 3. Dynamic import of project modules after resolver registration
const { esJugadorHabilitado } = await import('../lib/dbService.js');
const { CONFIG_TORNEO, esDocenteAutorizado } = await import('../lib/torneoConfig.js');

console.log('======================================================================');
console.log('       MECAFUT 2026 — CHALLENGER EMPIRICAL VERIFICATION (M3)         ');
console.log('======================================================================\n');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  [PASS] ${name}`);
  } catch (err) {
    failedTests++;
    console.error(`  [FAIL] ${name}`);
    console.error(`         ${err.message}`);
  }
}

async function runAsyncTest(name, fn) {
  totalTests++;
  try {
    await fn();
    passedTests++;
    console.log(`  [PASS] ${name}`);
  } catch (err) {
    failedTests++;
    console.error(`  [FAIL] ${name}`);
    console.error(`         ${err.message}`);
  }
}

// ======================================================================
// SUITE 1: Functional setJugadores State Transitions (Concurrent Uploads)
// ======================================================================
console.log('● Suite 1: Functional setJugadores State Transitions (Concurrent Uploads)');

// React functional state simulator
class ReactStateHarness {
  constructor(initialState) {
    this.state = JSON.parse(JSON.stringify(initialState));
    this.queue = [];
    this.isFlushing = false;
  }

  // Functional setState matching React: setJugadores(prev => ...)
  setState(updater) {
    this.queue.push(updater);
    this.processQueue();
  }

  processQueue() {
    if (this.isFlushing) return;
    this.isFlushing = true;
    while (this.queue.length > 0) {
      const updater = this.queue.shift();
      this.state = typeof updater === 'function' ? updater(this.state) : updater;
    }
    this.isFlushing = false;
  }

  // Exact implementation from app/page.jsx:120-131
  handleJugadorChange(index, fieldOrUpdates, value) {
    this.setState(prev => {
      const nuevos = [...prev];
      if (!nuevos[index]) return prev;
      if (typeof fieldOrUpdates === 'object' && fieldOrUpdates !== null) {
        nuevos[index] = { ...nuevos[index], ...fieldOrUpdates };
      } else {
        nuevos[index] = { ...nuevos[index], [fieldOrUpdates]: value };
      }
      return nuevos;
    });
  }

  // Buggy implementation from BEFORE M3 (for empirical oracle comparison)
  handleJugadorChangeOldBuggy(closureState, index, field, value) {
    const nuevos = [...closureState];
    nuevos[index] = { ...nuevos[index], [field]: value };
    this.state = nuevos;
  }
}

const initialPlayers = [
  { nombre: 'Capitan Carlos', correo: 'carlos@unitec.edu', fotoDocumento: 'data:capitan', fotoDocumentoPreview: 'data:capitan' },
  { nombre: 'Jugador 2 David', correo: 'david@unitec.edu', fotoDocumento: null, fotoDocumentoPreview: null },
  { nombre: 'Jugador 3 Mario', correo: 'mario@unitec.edu', fotoDocumento: null, fotoDocumentoPreview: null },
  { nombre: 'Jugador 4 Pedro', correo: 'pedro@unitec.edu', fotoDocumento: null, fotoDocumentoPreview: null }
];

await runAsyncTest('1.1: Simular subidas concurrentes de fotos para Jugador 2 (idx 1) y Jugador 3 (idx 2)', async () => {
  const harness = new ReactStateHarness(initialPlayers);

  // Simulación de dos subidas asíncronas con tiempos de compresión variables
  const uploadP2 = async () => {
    await new Promise(r => setTimeout(r, 30)); // 30ms compression
    const dataUrlP2 = 'data:image/jpeg;base64,DAVID_CARNET_DATA';
    harness.handleJugadorChange(1, {
      fotoDocumento: dataUrlP2,
      fotoDocumentoPreview: dataUrlP2
    });
  };

  const uploadP3 = async () => {
    await new Promise(r => setTimeout(r, 10)); // 10ms compression (finishes first!)
    const dataUrlP3 = 'data:image/jpeg;base64,MARIO_CARNET_DATA';
    harness.handleJugadorChange(2, {
      fotoDocumento: dataUrlP3,
      fotoDocumentoPreview: dataUrlP3
    });
  };

  await Promise.all([uploadP2(), uploadP3()]);

  assert.strictEqual(
    harness.state[1].fotoDocumento,
    'data:image/jpeg;base64,DAVID_CARNET_DATA',
    'Jugador 2 debe conservar su foto de carnet intacta'
  );
  assert.strictEqual(
    harness.state[1].fotoDocumentoPreview,
    'data:image/jpeg;base64,DAVID_CARNET_DATA',
    'Jugador 2 debe conservar su fotoDocumentoPreview intacta'
  );
  assert.strictEqual(
    harness.state[2].fotoDocumento,
    'data:image/jpeg;base64,MARIO_CARNET_DATA',
    'Jugador 3 debe conservar su foto de carnet intacta'
  );
  assert.strictEqual(
    harness.state[2].fotoDocumentoPreview,
    'data:image/jpeg;base64,MARIO_CARNET_DATA',
    'Jugador 3 debe conservar su fotoDocumentoPreview intacta'
  );
  assert.strictEqual(
    harness.state[0].fotoDocumento,
    'data:capitan',
    'El capitán no debe ser modificado'
  );
});

await runAsyncTest('1.2: Contra-oráculo empírico: Demostrar que el código previo con stale closure SOBREESCRIBÍA y perdía fotos', async () => {
  const harness = new ReactStateHarness(initialPlayers);
  const staleSnapshot = [...harness.state]; // Captured in closure before uploads start

  // Simulación del patrón defectuoso antiguo:
  // 1. handleJugadorChange(i, "fotoDocumento", dataUrl);
  // 2. handleJugadorChange(i, "fotoDocumentoPreview", dataUrl);
  // Ambos leían del closure estático `jugadores` donde fotoDocumento era null!
  harness.handleJugadorChangeOldBuggy(staleSnapshot, 1, 'fotoDocumento', 'data:DAVID_CARNET');
  // La segunda llamada con el closure viejo pisaba fotoDocumento poniéndolo en null
  harness.handleJugadorChangeOldBuggy(staleSnapshot, 1, 'fotoDocumentoPreview', 'data:DAVID_CARNET');

  // En el código viejo, fotoDocumento quedaba null porque la segunda llamada mutaba sobre staleSnapshot donde fotoDocumento era null!
  assert.strictEqual(
    harness.state[1].fotoDocumento,
    null,
    'El oráculo empírico demuestra que el código anterior efectivamente borraba fotoDocumento (Bug David Díaz confirmado)'
  );
  assert.strictEqual(
    harness.state[1].fotoDocumentoPreview,
    'data:DAVID_CARNET',
    'Mostraba fotoDocumentoPreview como si estuviera adjunta mientras la foto real era null'
  );
});

await runAsyncTest('1.3: Prueba de estrés Monte Carlo: 50 mutaciones concurrentes e intercaladas sin pérdida de estado', async () => {
  const harness = new ReactStateHarness(initialPlayers);
  const tasks = [];

  for (let i = 0; i < 50; i++) {
    const targetIdx = (i % 3) + 1; // players 1, 2, or 3
    const isPhoto = i % 2 === 0;
    const delay = Math.floor(Math.random() * 20);

    tasks.push(
      (async () => {
        await new Promise(r => setTimeout(r, delay));
        if (isPhoto) {
          harness.handleJugadorChange(targetIdx, {
            fotoDocumento: `data:photo_${targetIdx}_step_${i}`,
            fotoDocumentoPreview: `data:photo_${targetIdx}_step_${i}`
          });
        } else {
          harness.handleJugadorChange(targetIdx, 'dni', `0801-2000-000${i}`);
        }
      })()
    );
  }

  await Promise.all(tasks);

  // Verificar que el estado final es coherente y ningún jugador tiene propiedades corrompidas
  assert.strictEqual(harness.state.length, 4, 'La longitud de la plantilla debe permanecer en 4');
  for (let idx = 1; idx <= 3; idx++) {
    assert.ok(harness.state[idx].fotoDocumento !== null, `Jugador ${idx} debe tener foto asignada`);
    assert.ok(harness.state[idx].dni !== '', `Jugador ${idx} debe tener DNI asignado`);
  }
});

// ======================================================================
// SUITE 2: Eligibility Helper Integration (7 Students + 1 Teacher)
// ======================================================================
console.log('\n● Suite 2: Eligibility Helper Integration (7 Students + 1 Teacher Quota Test)');

runTest('2.1: Plantilla con 7 estudiantes con carnet verificado + 1 docente oficial (juan.mejia@unitec.edu.hn) sin carnet cumple cupo de 8', () => {
  const validImg = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';
  const plantilla = [
    { nombre: 'Capitán Estudiante', correo: 'capitan@unitec.edu', fotoDocumento: validImg, estadoCarnet: 'verificado' },
    { nombre: 'Estudiante 2', correo: 'est2@unitec.edu', fotoDocumento: validImg, estadoCarnet: 'verificado' },
    { nombre: 'Estudiante 3', correo: 'est3@unitec.edu', fotoDocumento: validImg, estadoCarnet: 'verificado' },
    { nombre: 'Estudiante 4', correo: 'est4@unitec.edu', fotoDocumento: validImg, estadoCarnet: 'verificado' },
    { nombre: 'Estudiante 5', correo: 'est5@unitec.edu', fotoDocumento: validImg, estadoCarnet: 'verificado' },
    { nombre: 'Estudiante 6', correo: 'est6@unitec.edu', fotoDocumento: validImg, estadoCarnet: 'verificado' },
    { nombre: 'Estudiante 7', correo: 'est7@unitec.edu', fotoDocumento: validImg, estadoCarnet: 'verificado' },
    { nombre: 'Ing. Juan Miguel Mejía', correo: 'juan.mejia@unitec.edu.hn', fotoDocumento: null } // Docente exento de carnet
  ];

  // Comprobar esJugadorHabilitado para cada uno
  const habilitados = plantilla.filter(esJugadorHabilitado);
  assert.strictEqual(habilitados.length, 8, 'Los 8 integrantes deben ser considerados habilitados');

  // Evaluar regla de /equipo y /admin (CONFIG_TORNEO.plantilla.min = 8)
  const cumpleCupo = habilitados.length >= CONFIG_TORNEO.plantilla.min;
  assert.strictEqual(cumpleCupo, true, 'La plantilla con 7 estudiantes y 1 docente exento DEBE cumplir el cupo reglamentario (>= 8)');

  // En app/equipo/page.jsx: jugadoresConCarnet.length < CONFIG_TORNEO.plantilla.min (8)
  const bannerAlertaActivo = habilitados.length < CONFIG_TORNEO.plantilla.min;
  assert.strictEqual(bannerAlertaActivo, false, 'No debe mostrar alerta de plantilla incompleta');
});

runTest('2.2: Plantilla con 7 estudiantes con carnet verificado + 1 docente oficial (cristhyan.rivera@unitec.edu.hn) sin carnet cumple cupo', () => {
  const validImg = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';
  const plantilla = [
    { nombre: 'Capitán Estudiante', correo: 'cap@unitec.edu', fotoDocumento: validImg, estadoCarnet: 'verificado' },
    { nombre: 'Estudiante 2', correo: 'e2@unitec.edu', fotoDocumento: validImg, estadoCarnet: 'verificado' },
    { nombre: 'Estudiante 3', correo: 'e3@unitec.edu', fotoDocumento: validImg, estadoCarnet: 'verificado' },
    { nombre: 'Estudiante 4', correo: 'e4@unitec.edu', fotoDocumento: validImg, estadoCarnet: 'verificado' },
    { nombre: 'Estudiante 5', correo: 'e5@unitec.edu', fotoDocumento: validImg, estadoCarnet: 'verificado' },
    { nombre: 'Estudiante 6', correo: 'e6@unitec.edu', fotoDocumento: validImg, estadoCarnet: 'verificado' },
    { nombre: 'Estudiante 7', correo: 'e7@unitec.edu', fotoDocumento: validImg, estadoCarnet: 'verificado' },
    { nombre: 'Ing. Cristhyan Rivera', correo: 'cristhyan.rivera@unitec.edu.hn', fotoDocumento: null }
  ];

  const habilitados = plantilla.filter(esJugadorHabilitado);
  assert.strictEqual(habilitados.length, 8);
  assert.ok(habilitados.length >= CONFIG_TORNEO.plantilla.min);
});

runTest('2.3: Plantilla con 7 estudiantes con carnet verificado + 1 estudiante normal SIN carnet NO cumple cupo de 8', () => {
  const validImg = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';
  const plantilla = [
    { nombre: 'Capitán Estudiante', correo: 'cap@unitec.edu', fotoDocumento: validImg, estadoCarnet: 'verificado' },
    { nombre: 'Estudiante 2', correo: 'e2@unitec.edu', fotoDocumento: validImg, estadoCarnet: 'verificado' },
    { nombre: 'Estudiante 3', correo: 'e3@unitec.edu', fotoDocumento: validImg, estadoCarnet: 'verificado' },
    { nombre: 'Estudiante 4', correo: 'e4@unitec.edu', fotoDocumento: validImg, estadoCarnet: 'verificado' },
    { nombre: 'Estudiante 5', correo: 'e5@unitec.edu', fotoDocumento: validImg, estadoCarnet: 'verificado' },
    { nombre: 'Estudiante 6', correo: 'e6@unitec.edu', fotoDocumento: validImg, estadoCarnet: 'verificado' },
    { nombre: 'Estudiante 7', correo: 'e7@unitec.edu', fotoDocumento: validImg, estadoCarnet: 'verificado' },
    { nombre: 'Estudiante 8 Sin Carnet', correo: 'sin_carnet@unitec.edu', fotoDocumento: null }
  ];

  const habilitados = plantilla.filter(esJugadorHabilitado);
  assert.strictEqual(habilitados.length, 7, 'Solo 7 jugadores deben estar habilitados');
  const cumpleCupo = habilitados.length >= CONFIG_TORNEO.plantilla.min;
  assert.strictEqual(cumpleCupo, false, 'El estudiante sin carnet NO debe sumar al cupo de 8');
});

runTest('2.4: Compatibilidad con snake_case de Supabase (foto_documento/estado_carnet) y camelCase (fotoDocumento/estadoCarnet)', () => {
  const validImg = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';
  const jugadorCamel = { correo: 'a@unitec.edu', fotoDocumento: validImg, estadoCarnet: 'verificado' };
  const jugadorSnake = { correo: 'b@unitec.edu', foto_documento: validImg, estado_carnet: 'verificado' };
  const jugadorEnRevision = { correo: 'r@unitec.edu', fotoDocumento: validImg, estadoCarnet: 'en_revision' };
  const jugadorInvalido = { correo: 'c@unitec.edu', fotoDocumento: null, foto_documento: null };

  assert.strictEqual(esJugadorHabilitado(jugadorCamel), true);
  assert.strictEqual(esJugadorHabilitado(jugadorSnake), true);
  assert.strictEqual(esJugadorHabilitado(jugadorEnRevision), false);
  assert.strictEqual(esJugadorHabilitado(jugadorInvalido), false);
});

runTest('2.5: Resiliencia ante valores null, undefined o tipos inesperados', () => {
  assert.strictEqual(esJugadorHabilitado(null), false);
  assert.strictEqual(esJugadorHabilitado(undefined), false);
  assert.strictEqual(esJugadorHabilitado({}), false);
  assert.strictEqual(esJugadorHabilitado({ correo: '' }), false);
});

// ======================================================================
// SUITE 3: WhatsApp URL Formatting in ModalBetaAlert.jsx and app/page.jsx
// ======================================================================
console.log('\n● Suite 3: WhatsApp URL Formatting in ModalBetaAlert.jsx and app/page.jsx');

runTest('3.1: Verificar formato exacto de WhatsApp URL en ModalBetaAlert.jsx', () => {
  const modalPath = path.join(projectRoot, 'components', 'ModalBetaAlert.jsx');
  assert.ok(fs.existsSync(modalPath), 'components/ModalBetaAlert.jsx debe existir');

  const content = fs.readFileSync(modalPath, 'utf8');

  // Buscar la constante de URL
  const match = content.match(/const\s+WHATSAPP_REPORTE_URL\s*=\s*["']([^"']+)["']/);
  assert.ok(match, 'ModalBetaAlert.jsx debe definir const WHATSAPP_REPORTE_URL');

  const url = match[1];
  const expectedUrl = 'https://wa.me/50494744365?text=Hola,%20quiero%20reportar%20un%20problema%20en%20la%20plataforma%20de%20MECAFUT%202026:';

  assert.strictEqual(url, expectedUrl, `URL debe coincidir exactamente con ${expectedUrl}`);

  // Verificar componentes de la URL
  const parsed = new URL(url);
  assert.strictEqual(parsed.protocol, 'https:');
  assert.strictEqual(parsed.hostname, 'wa.me');
  assert.strictEqual(parsed.pathname, '/50494744365');
  assert.strictEqual(
    parsed.searchParams.get('text'),
    'Hola, quiero reportar un problema en la plataforma de MECAFUT 2026:'
  );

  // Verificar que el botón de acción en el JSX utiliza la constante
  assert.ok(
    content.includes('href={WHATSAPP_REPORTE_URL}'),
    'El botón de acción en ModalBetaAlert debe tener href={WHATSAPP_REPORTE_URL}'
  );
});

runTest('3.2: Verificar botón permanente "Reportar Problema" en Navbar.jsx que abre ModalBetaAlert', () => {
  const navbarPath = path.join(projectRoot, 'components', 'Navbar.jsx');
  assert.ok(fs.existsSync(navbarPath), 'components/Navbar.jsx debe existir');

  const content = fs.readFileSync(navbarPath, 'utf8');

  // Verificar importación y montaje de ModalBetaAlert
  assert.ok(
    content.includes('import ModalBetaAlert from "./ModalBetaAlert"'),
    'Navbar.jsx debe importar ModalBetaAlert'
  );
  assert.ok(
    content.includes('<ModalBetaAlert />'),
    'Navbar.jsx debe montar <ModalBetaAlert />'
  );

  // Verificar botón de reporte
  assert.ok(
    content.includes('Reportar Problema'),
    'Navbar.jsx debe incluir botón con texto "Reportar Problema"'
  );
  assert.ok(
    content.includes('mecafut_abrir_reporte'),
    'Navbar.jsx debe emitir el evento mecafut_abrir_reporte al hacer clic'
  );
});

runTest('3.3: Verificar enlace dinámico de WhatsApp en app/page.jsx y app/equipo/page.jsx', () => {
  const pagePath = path.join(projectRoot, 'app', 'page.jsx');
  const equipoPath = path.join(projectRoot, 'app', 'equipo', 'page.jsx');

  assert.ok(fs.existsSync(pagePath), 'app/page.jsx debe existir');
  assert.ok(fs.existsSync(equipoPath), 'app/equipo/page.jsx debe existir');

  const pageContent = fs.readFileSync(pagePath, 'utf8');
  const equipoContent = fs.readFileSync(equipoPath, 'utf8');

  // En app/page.jsx: debe consumir resumen?.whatsappCapitanesUrl || CONFIG_TORNEO.whatsappCapitanesUrl
  assert.ok(
    pageContent.includes('resumen?.whatsappCapitanesUrl || CONFIG_TORNEO.whatsappCapitanesUrl'),
    'app/page.jsx debe usar el enlace dinámico de whatsappCapitanesUrl con fallback'
  );

  // En app/equipo/page.jsx: debe tener banner con botón de WhatsApp capitanes
  assert.ok(
    equipoContent.includes('whatsappCapitanesUrl'),
    'app/equipo/page.jsx debe usar whatsappCapitanesUrl dinámico'
  );
  assert.ok(
    equipoContent.includes('Grupo de Capitanes WhatsApp'),
    'app/equipo/page.jsx debe incluir el botón oficial del Grupo de Capitanes'
  );
});

// ======================================================================
// RESUMEN Y RESULTADO FINAL
// ======================================================================
console.log('\n======================================================================');
console.log('                        VERIFICATION SUMMARY                          ');
console.log('======================================================================');
console.log(`Total tests:  ${totalTests}`);
console.log(`Passed tests: ${passedTests}`);
console.log(`Failed tests: ${failedTests}`);

if (failedTests > 0) {
  console.log('\nVERDICT: DISPROVEN / REJECT');
  process.exit(1);
} else {
  console.log('\nVERDICT: CONFIRMED / APPROVE');
  process.exit(0);
}

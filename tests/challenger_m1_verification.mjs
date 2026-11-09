import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { register } from 'node:module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

try {
  const resolverPath = pathToFileURL(path.join(projectRoot, 'tests', 'e2e', 'resolver.mjs')).href;
  register(resolverPath, import.meta.url);
} catch (e) {
  // Ignore if already active
}

// --- 1. Polyfill Browser Environment for Node.js ---
class MemoryLocalStorage {
  constructor() {
    this._store = new Map();
  }
  getItem(key) {
    return this._store.has(String(key)) ? this._store.get(String(key)) : null;
  }
  setItem(key, value) {
    this._store.set(String(key), String(value));
  }
  removeItem(key) {
    this._store.delete(String(key));
  }
  clear() {
    this._store.clear();
  }
}

const memoryStorage = new MemoryLocalStorage();
const listeners = [];

globalThis.localStorage = memoryStorage;
globalThis.window = {
  localStorage: memoryStorage,
  dispatchEvent: (event) => {
    listeners.forEach(fn => fn(event));
  },
  addEventListener: (event, handler) => {
    listeners.push(handler);
  },
  removeEventListener: (event, handler) => {
    const idx = listeners.indexOf(handler);
    if (idx !== -1) listeners.splice(idx, 1);
  },
  CustomEvent: class CustomEvent {
    constructor(name, opts = {}) {
      this.type = name;
      this.detail = opts.detail || {};
    }
  }
};

// --- 2. Import Target Modules ---
const dbService = await import('../lib/dbService.js');
const torneoConfig = await import('../lib/torneoConfig.js');

if (torneoConfig.CONFIG_TORNEO?.fechas) {
  torneoConfig.CONFIG_TORNEO.fechas.finInscripciones = '2099-12-31T23:59:59-06:00';
}

const {
  esJugadorHabilitado,
  guardarConfiguracionGeneral,
  actualizarEnlaceWhatsapp,
  cambiarEstadoInscripciones,
  suscribirTorneoEnVivo,
  inscribirEquipo,
  obtenerResumenPublico,
  obtenerDatosAdmin,
  reiniciarBaseDeDatosSimulada
} = dbService;

const results = [];
function test(name, fn) {
  try {
    fn();
    results.push({ name, pass: true });
    console.log(`  ✔ PASS: ${name}`);
  } catch (err) {
    results.push({ name, pass: false, error: err.message, stack: err.stack });
    console.error(`  ✖ FAIL: ${name} -> ${err.message}`);
  }
}

async function asyncTest(name, fn) {
  try {
    await fn();
    results.push({ name, pass: true });
    console.log(`  ✔ PASS: ${name}`);
  } catch (err) {
    results.push({ name, pass: false, error: err.message, stack: err.stack });
    console.error(`  ✖ FAIL: ${name} -> ${err.message}`);
  }
}

console.log('\n===============================================================');
console.log('  CHALLENGER M1: EMPIRICAL STRESS & VERIFICATION SUITE');
console.log('===============================================================\n');

// -------------------------------------------------------------
// DIMENSION 1: Phone Formatting & Validation in inscribirEquipo
// -------------------------------------------------------------
console.log('● DIMENSION 1: Phone Formatting & Validation');

let colorIdx = 0;
const availableColors = ['Rojo', 'Azul', 'Blanco', 'Negro', 'Amarillo', 'Verde', 'Naranja', 'Morado'];

const createBasePayload = (telefono) => {
  const color = availableColors[(colorIdx++) % availableColors.length];
  return {
    equipo: {
      nombre: `Equipo Test ${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      categoria: 'Masculino',
      tipoEquipo: 'Estudiantes',
      color: color
    },
    capitan: {
      nombre: 'Capitan Prueba',
      cuenta: `2200${Math.floor(100000 + Math.random() * 900000)}`,
      correo: `capitan.${Date.now()}.${Math.floor(Math.random() * 10000)}@unitec.edu`,
      telefono: telefono,
      dni: `0801-2000-${Math.floor(10000 + Math.random() * 90000)}`,
      carrera: 'Ingeniería Mecatrónica',
      codigoClase: 'MEC-101',
      fotoDocumento: 'data:image/jpeg;base64,/9j/4AAQSkZJRg=='
    },
    jugadores: [
      {
        nombre: 'Jugador 2',
        cuenta: `2200${Math.floor(100000 + Math.random() * 900000)}`,
        correo: `j2.${Date.now()}.${Math.floor(Math.random() * 10000)}@unitec.edu`,
        dni: `0801-2001-${Math.floor(10000 + Math.random() * 90000)}`,
        carrera: 'Ingeniería Mecatrónica',
        codigoClase: 'MEC-101',
        fotoDocumento: 'data:image/jpeg;base64,/9j/4AAQSkZJRg=='
      }
    ],
    comprobanteFile: null
  };
};

await asyncTest('Phone format: "+504 9474-4365" accepted and saved in capitan.telefono', async () => {
  reiniciarBaseDeDatosSimulada();
  const phone = '+504 9474-4365';
  const payload = createBasePayload(phone);
  const res = await inscribirEquipo(payload);
  assert.equal(res.modo, 'simulado');

  const adminData = await obtenerDatosAdmin();
  const team = adminData.equipos.find(e => e.nombre === payload.equipo.nombre);
  assert.ok(team, 'Team must be persisted in DB');
  assert.equal(team.capitan.telefono, '+504 9474-4365');
});

await asyncTest('Phone format: "50494744365" (11 digits, no plus) accepted and saved', async () => {
  const phone = '50494744365';
  const payload = createBasePayload(phone);
  const res = await inscribirEquipo(payload);
  assert.ok(res.codigoAcceso);

  const adminData = await obtenerDatosAdmin();
  const team = adminData.equipos.find(e => e.nombre === payload.equipo.nombre);
  assert.equal(team.capitan.telefono, '50494744365');
});

await asyncTest('Phone format: "  99887766  " (spaces trimmed) accepted and saved as "99887766"', async () => {
  const phone = '  99887766  ';
  const payload = createBasePayload(phone);
  await inscribirEquipo(payload);

  const adminData = await obtenerDatosAdmin();
  const team = adminData.equipos.find(e => e.nombre === payload.equipo.nombre);
  assert.equal(team.capitan.telefono, '99887766');
});

await asyncTest('Phone format: "(504) 9474-4365" (parentheses + hyphens) accepted and saved', async () => {
  const phone = '(504) 9474-4365';
  const payload = createBasePayload(phone);
  await inscribirEquipo(payload);

  const adminData = await obtenerDatosAdmin();
  const team = adminData.equipos.find(e => e.nombre === payload.equipo.nombre);
  assert.equal(team.capitan.telefono, '(504) 9474-4365');
});

await asyncTest('Phone format: "+504-2233-4455" (hyphenated international) accepted and saved', async () => {
  const phone = '+504-2233-4455';
  const payload = createBasePayload(phone);
  await inscribirEquipo(payload);

  const adminData = await obtenerDatosAdmin();
  const team = adminData.equipos.find(e => e.nombre === payload.equipo.nombre);
  assert.equal(team.capitan.telefono, '+504-2233-4455');
});

await asyncTest('Phone validation: 7 digits ("9474436") MUST throw error', async () => {
  const payload = createBasePayload('9474436');
  await assert.rejects(
    async () => await inscribirEquipo(payload),
    /mínimo 8 dígitos/i
  );
});

await asyncTest('Phone validation: 5 digits ("12345") MUST throw error', async () => {
  const payload = createBasePayload('12345');
  await assert.rejects(
    async () => await inscribirEquipo(payload),
    /mínimo 8 dígitos/i
  );
});

await asyncTest('Phone validation: empty string "" MUST throw error', async () => {
  const payload = createBasePayload('');
  await assert.rejects(
    async () => await inscribirEquipo(payload),
    /mínimo 8 dígitos/i
  );
});

await asyncTest('Phone validation: pure whitespace "   " MUST throw error', async () => {
  const payload = createBasePayload('   ');
  await assert.rejects(
    async () => await inscribirEquipo(payload),
    /mínimo 8 dígitos/i
  );
});

await asyncTest('Phone validation: non-digit characters only "abc-def-gh" MUST throw error', async () => {
  const payload = createBasePayload('abc-def-gh');
  await assert.rejects(
    async () => await inscribirEquipo(payload),
    /mínimo 8 dígitos/i
  );
});

await asyncTest('Phone validation: null or undefined phone MUST throw error', async () => {
  const payloadNull = createBasePayload(null);
  await assert.rejects(
    async () => await inscribirEquipo(payloadNull),
    /mínimo 8 dígitos/i
  );

  const payloadUndef = createBasePayload(undefined);
  await assert.rejects(
    async () => await inscribirEquipo(payloadUndef),
    /mínimo 8 dígitos/i
  );
});

// -------------------------------------------------------------
// DIMENSION 2: Teacher Exemption vs Student Carnet in esJugadorHabilitado
// -------------------------------------------------------------
console.log('\n● DIMENSION 2: Teacher Exemption vs Student Carnet');

test('Teacher "juan.mejia@unitec.edu.hn" without photo MUST return true', () => {
  const res = esJugadorHabilitado({
    nombre: 'Ing. Juan Miguel Mejía',
    correo: 'juan.mejia@unitec.edu.hn',
    fotoDocumento: null
  });
  assert.equal(res, true);
});

test('Teacher "cristhyan.rivera@unitec.edu.hn" without photo MUST return true', () => {
  const res = esJugadorHabilitado({
    nombre: 'Ing. Cristhyan Rivera',
    correo: 'cristhyan.rivera@unitec.edu.hn',
    fotoDocumento: null
  });
  assert.equal(res, true);
});

test('Teacher email with uppercase "JUAN.MEJIA@UNITEC.EDU.HN" without photo returns true', () => {
  const res = esJugadorHabilitado({
    correo: 'JUAN.MEJIA@UNITEC.EDU.HN',
    fotoDocumento: null
  });
  assert.equal(res, true);
});

test('Teacher email with leading/trailing spaces "  cristhyan.rivera@unitec.edu.hn  " returns true', () => {
  const res = esJugadorHabilitado({
    correo: '  cristhyan.rivera@unitec.edu.hn  ',
    fotoDocumento: null
  });
  assert.equal(res, true);
});

test('Student "estudiante@unitec.edu" without photo MUST return false', () => {
  const res = esJugadorHabilitado({
    nombre: 'Alumno Uno',
    correo: 'estudiante@unitec.edu',
    fotoDocumento: null
  });
  assert.equal(res, false);
});

test('Student "estudiante@unitec.edu.hn" without photo MUST return false', () => {
  const res = esJugadorHabilitado({
    nombre: 'Alumno Dos',
    correo: 'estudiante@unitec.edu.hn',
    fotoDocumento: null
  });
  assert.equal(res, false);
});

test('Student with camelCase fotoDocumento in en_revision returns false until verified, then true', () => {
  const enRevision = esJugadorHabilitado({
    nombre: 'Alumno Con Carnet En Revision',
    correo: 'alumno@unitec.edu',
    fotoDocumento: 'data:image/jpeg;base64,/9j/4AAQSkZJRg=='
  });
  assert.equal(enRevision, false);

  const res = esJugadorHabilitado({
    nombre: 'Alumno Con Carnet Verificado',
    correo: 'alumno@unitec.edu',
    fotoDocumento: 'data:image/jpeg;base64,/9j/4AAQSkZJRg==',
    estadoCarnet: 'verificado'
  });
  assert.equal(res, true);
});

test('Student with snake_case foto_documento + estado_carnet verificado MUST return true', () => {
  const res = esJugadorHabilitado({
    nombre: 'Alumno Con Carnet DB',
    correo: 'alumno@unitec.edu',
    foto_documento: 'data:image/jpeg;base64,/9j/4AAQSkZJRg==',
    estado_carnet: 'verificado'
  });
  assert.equal(res, true);
});

test('Non-authorized teacher email "otro.docente@unitec.edu.hn" without photo returns false', () => {
  const res = esJugadorHabilitado({
    nombre: 'Docente No Autorizado',
    correo: 'otro.docente@unitec.edu.hn',
    fotoDocumento: null
  });
  assert.equal(res, false);
});

test('Edge cases: null, undefined, empty object return false', () => {
  assert.equal(esJugadorHabilitado(null), false);
  assert.equal(esJugadorHabilitado(undefined), false);
  assert.equal(esJugadorHabilitado({}), false);
  assert.equal(esJugadorHabilitado({ correo: '' }), false);
});

// -------------------------------------------------------------
// DIMENSION 3: Realtime Channel Isolation in suscribirTorneoEnVivo
// -------------------------------------------------------------
console.log('\n● DIMENSION 3: Realtime Channel Isolation & Lifecycle');

test('suscribirTorneoEnVivo delivers initial tournament state to callback', () => {
  let received = null;
  const unsub = suscribirTorneoEnVivo((data) => {
    received = data;
  });
  assert.ok(received, 'Initial tournament state must be received immediately');
  assert.ok(received.brackets, 'Initial state must contain brackets');
  unsub();
});

test('Multiple concurrent subscribers receive independent lifecycle handles without collisions', () => {
  let sub1Data = null;
  let sub2Data = null;
  let sub3Data = null;

  const unsub1 = suscribirTorneoEnVivo((d) => { sub1Data = d; });
  const unsub2 = suscribirTorneoEnVivo((d) => { sub2Data = d; });
  const unsub3 = suscribirTorneoEnVivo((d) => { sub3Data = d; });

  assert.ok(sub1Data, 'Sub 1 received data');
  assert.ok(sub2Data, 'Sub 2 received data');
  assert.ok(sub3Data, 'Sub 3 received data');
  assert.notEqual(unsub1, unsub2, 'Handles must be distinct functions');
  assert.notEqual(unsub2, unsub3, 'Handles must be distinct functions');

  // Clean unsubscribe for each
  assert.doesNotThrow(() => unsub1());
  assert.doesNotThrow(() => unsub2());
  assert.doesNotThrow(() => unsub3());
});

test('Unsubscribe is idempotent (calling multiple times does not throw)', () => {
  const unsub = suscribirTorneoEnVivo(() => {});
  assert.doesNotThrow(() => {
    unsub();
    unsub();
    unsub();
  });
});

test('Rapid churn: 20 rapid subscribe / unsubscribe cycles execute cleanly without leaking', () => {
  for (let i = 0; i < 20; i++) {
    const unsub = suscribirTorneoEnVivo(() => {});
    unsub();
  }
  assert.ok(true, 'Rapid churn test passed');
});

// -------------------------------------------------------------
// DIMENSION 4: Configuration Merge (WhatsApp + Settings)
// -------------------------------------------------------------
console.log('\n● DIMENSION 4: Configuration Merge & WhatsApp URL');

await asyncTest('Initial config preserves custom tournament settings', async () => {
  reiniciarBaseDeDatosSimulada();
  const merged1 = await guardarConfiguracionGeneral({
    sponsorName: 'UNITEC Mechatronics',
    maxEquiposCustom: 16
  });
  assert.equal(merged1.sponsorName, 'UNITEC Mechatronics');
  assert.equal(merged1.maxEquiposCustom, 16);
  assert.equal(merged1.inscripcionesAbiertas, true);
});

await asyncTest('actualizarEnlaceWhatsapp trims whitespace and preserves all other keys', async () => {
  const newUrl = '  https://chat.whatsapp.com/MECAFUT-Q4-CAPTAINS  ';
  const res = await actualizarEnlaceWhatsapp(newUrl);

  assert.equal(res.whatsappCapitanesUrl, 'https://chat.whatsapp.com/MECAFUT-Q4-CAPTAINS');
  assert.equal(res.sponsorName, 'UNITEC Mechatronics', 'sponsorName must be preserved');
  assert.equal(res.maxEquiposCustom, 16, 'maxEquiposCustom must be preserved');
  assert.equal(res.inscripcionesAbiertas, true, 'inscripcionesAbiertas must be preserved');
});

await asyncTest('cambiarEstadoInscripciones(false) preserves whatsappCapitanesUrl and custom keys', async () => {
  await cambiarEstadoInscripciones(false);

  const adminData = await obtenerDatosAdmin();
  const cfg = adminData.configuracion;

  assert.equal(cfg.inscripcionesAbiertas, false, 'inscripcionesAbiertas must now be false');
  assert.equal(cfg.whatsappCapitanesUrl, 'https://chat.whatsapp.com/MECAFUT-Q4-CAPTAINS', 'whatsappCapitanesUrl must be preserved');
  assert.equal(cfg.sponsorName, 'UNITEC Mechatronics', 'sponsorName must be preserved');
  assert.equal(cfg.maxEquiposCustom, 16, 'maxEquiposCustom must be preserved');
});

await asyncTest('obtenerResumenPublico reflects updated whatsappCapitanesUrl', async () => {
  const publicSummary = await obtenerResumenPublico();
  assert.equal(publicSummary.whatsappCapitanesUrl, 'https://chat.whatsapp.com/MECAFUT-Q4-CAPTAINS');
});

await asyncTest('actualizarEnlaceWhatsapp rejects non-string or empty url', async () => {
  await assert.rejects(
    async () => await actualizarEnlaceWhatsapp(''),
    /no es válido/i
  );
  await assert.rejects(
    async () => await actualizarEnlaceWhatsapp(null),
    /no es válido/i
  );
});

// -------------------------------------------------------------
// DIMENSION 5: Teacher Exemption in inscribirEquipo & Player Status
// -------------------------------------------------------------
console.log('\n● DIMENSION 5: Teacher Captain & Player Estado Lifecycle');

await asyncTest('Teacher as captain (Ing. Juan Mejía) registers without carnet/DNI with valid phone & Aprobado status', async () => {
  // Reopen registrations for test
  await cambiarEstadoInscripciones(true);

  const teacherPhone = '+504 9474-4365';
  const payload = {
    equipo: {
      nombre: `Docentes FC ${Date.now()}`,
      categoria: 'Masculino',
      tipoEquipo: 'Docentes',
      color: 'Azul'
    },
    capitan: {
      nombre: 'Ing. Juan Miguel Mejía',
      cuenta: `DOC-MEJIA-${Date.now()}`,
      correo: 'juan.mejia@unitec.edu.hn',
      telefono: teacherPhone,
      dni: '', // empty on purpose: teachers exempt
      fotoDocumento: null // empty on purpose: teachers exempt
    },
    jugadores: [],
    comprobanteFile: null
  };

  const res = await inscribirEquipo(payload);
  assert.ok(res.codigoAcceso);

  const adminData = await obtenerDatosAdmin();
  const team = adminData.equipos.find(e => e.nombre === payload.equipo.nombre);
  assert.ok(team);
  assert.equal(team.capitan.telefono, '+504 9474-4365');
  assert.equal(team.capitan.dni, 'Exento (Docente)');
  assert.equal(team.capitan.tipoDocumento, 'docente');
  assert.equal(team.capitan.estado, 'Aprobado');
});

await asyncTest('Student captain without carnet photo MUST be rejected at inscribirEquipo', async () => {
  const payload = {
    equipo: {
      nombre: `Estudiantes Sin Carnet ${Date.now()}`,
      categoria: 'Masculino',
      tipoEquipo: 'Estudiantes',
      color: 'Negro'
    },
    capitan: {
      nombre: 'Capitan Sin Carnet',
      cuenta: `2200${Math.floor(1000 + Math.random() * 9000)}`,
      correo: `estudiante.nocarnet.${Date.now()}@unitec.edu`,
      telefono: '+504 9999-8888',
      dni: '0801-1999-99999',
      fotoDocumento: null // missing carnet!
    },
    jugadores: [],
    comprobanteFile: null
  };

  await assert.rejects(
    async () => await inscribirEquipo(payload),
    /adjuntar obligatoriamente la foto.*carnet/i
  );
});

// -------------------------------------------------------------
// SUMMARY & VERDICT
// -------------------------------------------------------------
console.log('\n===============================================================');
const passed = results.filter(r => r.pass).length;
const failed = results.filter(r => !r.pass).length;
console.log(`  TOTAL TESTS:  ${results.length}`);
console.log(`  PASSED:       ${passed}`);
console.log(`  FAILED:       ${failed}`);
console.log('===============================================================\n');

if (failed > 0) {
  console.error(`VERDICT: REJECT (${failed} test(s) failed)`);
  process.exit(1);
} else {
  console.log('VERDICT: APPROVE (All empirical tests passed cleanly)');
  process.exit(0);
}

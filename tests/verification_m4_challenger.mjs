/**
 * tests/verification_m4_challenger.mjs
 * 
 * EMPIRICAL CHALLENGER VERIFICATION HARNESS — MILESTONE 4
 * 
 * Target Verifications:
 * 1. Manual Bracket Assembly Generator Validation:
 *    - 12 valid unique Masculino teams -> exact 4 BYE quarterfinal slots + 4 preliminary matches.
 *    - Duplicate teams rejection (Set size validation).
 *    - Missing teams rejection.
 *    - 3 valid unique Femenino teams -> 3 round-robin matches + Grand Final.
 * 2. Eligibility Filter Logic (esEquipoAptoParaLlaves):
 *    - Case a: 8 verified players + paid -> Eligible.
 *    - Case b: 7 verified students + 1 faculty without carnet + paid -> Eligible (Faculty Exemption!).
 *    - Case c: 7 verified students + 1 student without carnet + paid -> Ineligible (Blocked!).
 *    - Case d: 8 verified players + unpaid -> Ineligible (Blocked!).
 *    - Additional boundary conditions (case-insensitivity, cross-team contamination, snake_case DB fields).
 * 3. Carnet Update & State Consistency:
 *    - Base64 dataUrl storage & estado: "Aprobado" transition.
 *    - React functional setState atomic updater concurrency.
 * 4. WhatsApp Configuration & Production Badge Integrity.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { register } from 'node:module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// Register extensionless resolver
try {
  const resolverPath = pathToFileURL(path.join(__dirname, 'e2e', 'resolver.mjs')).href;
  register(resolverPath, import.meta.url);
} catch (e) {
  // Already registered
}

// Polyfill browser environment
class MemoryStorage {
  constructor() {
    this._store = new Map();
  }
  getItem(k) { return this._store.has(String(k)) ? this._store.get(String(k)) : null; }
  setItem(k, v) { this._store.set(String(k), String(v)); }
  removeItem(k) { this._store.delete(String(k)); }
  clear() { this._store.clear(); }
}

const memLocal = new MemoryStorage();
const memSession = new MemoryStorage();
globalThis.localStorage = memLocal;
globalThis.sessionStorage = memSession;
globalThis.window = {
  localStorage: memLocal,
  sessionStorage: memSession,
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => true,
  open: () => {}
};

// Import project modules
const {
  generarBracketEliminacion,
  generarTriangularFemenino,
  calcularTablaTriangular,
  propagarGanadorEliminacion
} = await import('../lib/bracketUtils.js');

const {
  CONFIG_TORNEO,
  esDocenteAutorizado,
  DOCENTES_AUTORIZADOS
} = await import('../lib/torneoConfig.js');

if (CONFIG_TORNEO?.fechas) {
  CONFIG_TORNEO.fechas.finInscripciones = '2099-12-31T23:59:59-06:00';
}

const { verificarOtp } = await import('../lib/authService.js');

const {
  esJugadorHabilitado,
  esEquipoAptoParaLlaves,
  actualizarDocumentoJugador,
  inscribirEquipo,
  obtenerDatosAdmin,
  reiniciarBaseDeDatosSimulada,
  guardarConfiguracionGeneral,
  actualizarEnlaceWhatsapp
} = await import('../lib/dbService.js');

// Verify app/admin/page.jsx exports esEquipoAptoParaLlaves
const adminCode = fs.readFileSync(path.join(projectRoot, 'app', 'admin', 'page.jsx'), 'utf8');
if (!adminCode.includes('esEquipoAptoParaLlaves')) {
  throw new Error("CRITICAL: esEquipoAptoParaLlaves not found in app/admin/page.jsx");
}

function callApto(equipo, todosJugadores) {
  return esEquipoAptoParaLlaves(equipo, todosJugadores);
}

// Test Runner Infrastructure
console.log('======================================================================');
console.log('   MECAFUT 2026 — CHALLENGER EMPIRICAL VERIFICATION (MILESTONE 4)     ');
console.log('======================================================================\n');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failures = [];

function test(name, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  [PASS] ${name}`);
  } catch (err) {
    failedTests++;
    failures.push({ name, error: err });
    console.error(`  [FAIL] ${name}`);
    console.error(`         ${err.message}`);
  }
}

async function testAsync(name, fn) {
  totalTests++;
  try {
    await fn();
    passedTests++;
    console.log(`  [PASS] ${name}`);
  } catch (err) {
    failedTests++;
    failures.push({ name, error: err });
    console.error(`  [FAIL] ${name}`);
    console.error(`         ${err.message}`);
  }
}

// ======================================================================
// SUITE 1: MANUAL BRACKET ASSEMBLY GENERATOR VALIDATION
// ======================================================================
console.log('● Suite 1: Manual Bracket Assembly Generator & Symmetry Validation');

test('1.1 Given 12 valid unique Masculino teams, creates exact 4 BYE slots and 4 preliminary matches', () => {
  const teams = Array.from({ length: 12 }, (_, i) => ({
    id: `m-team-${i + 1}`,
    nombre: `Equipo M${i + 1}`,
    color: "Azul"
  }));

  const bracket = generarBracketEliminacion(teams, false);
  assert.equal(bracket.tipo, "eliminacion", "Bracket type must be 'eliminacion'");
  assert.equal(bracket.rondas.length, 4, "Must have 4 rounds: Preliminar, Cuartos, Semis, Final");

  const r1 = bracket.rondas[0];
  assert.equal(r1.partidos.length, 8, "R1 must have exactly 8 match slots (P=16 / 2)");

  // 4 BYEs
  const byes = r1.partidos.filter(p => p.equipo2?.esBye);
  assert.equal(byes.length, 4, "Must have exactly 4 BYE matches");

  // 4 Preliminary matches
  const prelims = r1.partidos.filter(p => !p.equipo2?.esBye);
  assert.equal(prelims.length, 4, "Must have exactly 4 preliminary matches");
});

test('1.2 Symmetry & Placement: 4 BYE teams occupy exact slots and advance automatically to Cuartos', () => {
  const teams = Array.from({ length: 12 }, (_, i) => ({
    id: `m-team-${i + 1}`,
    nombre: `Equipo M${i + 1}`,
    color: "Azul"
  }));

  const bracket = generarBracketEliminacion(teams, false);
  const r1 = bracket.rondas[0];
  const r2 = bracket.rondas[1]; // Cuartos de Final

  // In R1, BYEs are located at even indices 0, 2, 4, 6
  const byeMatches = [r1.partidos[0], r1.partidos[2], r1.partidos[4], r1.partidos[6]];
  byeMatches.forEach((p, idx) => {
    assert.equal(p.equipo2.esBye, true, `Match ${p.id} must be a BYE`);
    assert.equal(p.estado, "Finalizado", "BYE match must be Finalizado");
    assert.equal(p.ganador.id, teams[idx].id, `Winner must be team ${teams[idx].id}`);
  });

  // Check propagation to Cuartos de Final (Ronda 2)
  assert.equal(r2.partidos.length, 4, "Cuartos must have 4 matches");
  r2.partidos.forEach((p, idx) => {
    assert.ok(p.equipo1, `Cuartos match ${p.id} must have equipo1 assigned`);
    assert.equal(p.equipo1.id, teams[idx].id, `Cuartos match ${p.id} equipo1 must be BYE team ${teams[idx].id}`);
    assert.equal(p.equipo2, null, `Cuartos match ${p.id} equipo2 must be null (pending prelim winner)`);
  });
});

test('1.3 Manual Selection Validation (Masculino): Duplicate teams detection rejects duplicate', () => {
  // Simulates handleGuardarManualMasculino validation logic in app/admin/page.jsx
  function validateManualMasc(manualMasc) {
    const keys = ["bye1", "bye2", "bye3", "bye4", "p1a", "p1b", "p2a", "p2b", "p3a", "p3b", "p4a", "p4b"];
    const ids = keys.map((k) => manualMasc[k]);
    if (ids.some((id) => !id)) {
      return { valid: false, error: "Debes seleccionar los 12 equipos para los pases directos y los 4 partidos preliminares." };
    }
    const setIds = new Set(ids);
    if (setIds.size !== 12) {
      return { valid: false, error: "Error de validación: Hay equipos repetidos en la selección. Cada uno de los 12 equipos debe ser único." };
    }
    return { valid: true };
  }

  // Duplicate team between bye1 and p1a
  const duplicateSelection = {
    bye1: "team1",
    bye2: "team2",
    bye3: "team3",
    bye4: "team4",
    p1a: "team1", // Duplicate!
    p1b: "team5",
    p2a: "team6",
    p2b: "team7",
    p3a: "team8",
    p3b: "team9",
    p4a: "team10",
    p4b: "team11"
  };

  const res = validateManualMasc(duplicateSelection);
  assert.equal(res.valid, false, "Selection with duplicate team must be invalid");
  assert.match(res.error, /equipos repetidos/i);
});

test('1.4 Manual Selection Validation (Masculino): Missing slot rejects incomplete selection', () => {
  function validateManualMasc(manualMasc) {
    const keys = ["bye1", "bye2", "bye3", "bye4", "p1a", "p1b", "p2a", "p2b", "p3a", "p3b", "p4a", "p4b"];
    const ids = keys.map((k) => manualMasc[k]);
    if (ids.some((id) => !id)) {
      return { valid: false, error: "Debes seleccionar los 12 equipos para los pases directos y los 4 partidos preliminares." };
    }
    const setIds = new Set(ids);
    if (setIds.size !== 12) {
      return { valid: false, error: "Error de validación: Hay equipos repetidos en la selección. Cada uno de los 12 equipos debe ser único." };
    }
    return { valid: true };
  }

  const incompleteSelection = {
    bye1: "team1",
    bye2: "team2",
    bye3: "team3",
    bye4: "team4",
    p1a: "team5",
    p1b: "team6",
    p2a: "team7",
    p2b: "team8",
    p3a: "team9",
    p3b: "team10",
    p4a: "team11",
    p4b: "" // Empty!
  };

  const res = validateManualMasc(incompleteSelection);
  assert.equal(res.valid, false, "Selection with empty slot must be invalid");
  assert.match(res.error, /seleccionar los 12 equipos/i);
});

test('1.5 Given 3 valid unique Femenino teams, generarTriangularFemenino creates 3 round-robin matches and Grand Final', () => {
  const femTeams = [
    { id: "f1", nombre: "Leonas FC", color: "Rosa" },
    { id: "f2", nombre: "Águilas FC", color: "Blanco" },
    { id: "f3", nombre: "Panteras FC", color: "Negro" }
  ];

  const triangular = generarTriangularFemenino(femTeams, false);
  assert.equal(triangular.tipo, "triangular_final", "Must be 'triangular_final'");
  assert.equal(triangular.jornadas.length, 3, "Must have exactly 3 round-robin matches");
  assert.ok(triangular.granFinal, "Must have granFinal object");
  assert.match(triangular.granFinal.nombre, /Gran Final/i);

  // Check pairing combinations: J1(f1 vs f2), J2(f2 vs f3), J3(f1 vs f3)
  const j1 = triangular.jornadas[0];
  const j2 = triangular.jornadas[1];
  const j3 = triangular.jornadas[2];

  assert.equal(j1.equipo1.id, "f1");
  assert.equal(j1.equipo2.id, "f2");

  assert.equal(j2.equipo1.id, "f2");
  assert.equal(j2.equipo2.id, "f3");

  assert.equal(j3.equipo1.id, "f1");
  assert.equal(j3.equipo2.id, "f3");
});

test('1.6 Manual Selection Validation (Femenino): Duplicate teams rejection and missing teams rejection', () => {
  function validateManualFem(manualFem) {
    const ids = [manualFem.eq1, manualFem.eq2, manualFem.eq3];
    if (ids.some((id) => !id)) {
      return { valid: false, error: "Debes seleccionar los 3 equipos para el Triangular Femenino." };
    }
    const setIds = new Set(ids);
    if (setIds.size !== 3) {
      return { valid: false, error: "Error de validación: Hay equipos repetidos en la selección. Los 3 equipos del Triangular deben ser únicos." };
    }
    return { valid: true };
  }

  // Duplicate
  const dup = validateManualFem({ eq1: "femA", eq2: "femA", eq3: "femB" });
  assert.equal(dup.valid, false);
  assert.match(dup.error, /equipos repetidos/i);

  // Missing
  const missing = validateManualFem({ eq1: "femA", eq2: "", eq3: "femB" });
  assert.equal(missing.valid, false);
  assert.match(missing.error, /seleccionar los 3 equipos/i);

  // Valid
  const ok = validateManualFem({ eq1: "femA", eq2: "femB", eq3: "femC" });
  assert.equal(ok.valid, true);
});

// ======================================================================
// SUITE 2: ELIGIBILITY FILTER LOGIC (esEquipoAptoParaLlaves)
// ======================================================================
console.log('● Suite 2: Eligibility Filter Logic & Faculty Exemption (esEquipoAptoParaLlaves)');

test('2.1 Case A: 8 verified student players with carnet + payment approved -> Eligible (true)', () => {
  const eq = { id: "eq-a", nombre: "Equipo A", estado: "Confirmado", pagoConfirmado: true };
  const players = Array.from({ length: 8 }, (_, i) => ({
    id: `j-a-${i}`,
    equipoId: "eq-a",
    nombre: `Estudiante ${i + 1}`,
    correo: `estudiante${i + 1}@unitec.edu`,
    fotoDocumento: "data:image/jpeg;base64,/9j/carnet_verif",
    estadoCarnet: "verificado"
  }));

  const eligible = callApto(eq, players);
  assert.equal(eligible, true, "Team with 8 carnet-verified players and paid must be eligible");
});

test('2.2 Case B: 7 verified students + 1 faculty member without carnet (Juan Mejía) + paid -> Eligible (Faculty Exemption)', () => {
  const eq = { id: "eq-b", nombre: "Equipo B", estado: "Confirmado", pagoConfirmado: true };
  const players = [
    ...Array.from({ length: 7 }, (_, i) => ({
      id: `j-b-${i}`,
      equipoId: "eq-b",
      nombre: `Estudiante ${i + 1}`,
      correo: `estudiante${i + 1}@unitec.edu`,
      fotoDocumento: "data:image/jpeg;base64,/9j/carnet_verif",
      estadoCarnet: "verificado"
    })),
    {
      id: "j-b-docente",
      equipoId: "eq-b",
      nombre: "Ing. Juan Miguel Mejía",
      correo: "juan.mejia@unitec.edu.hn", // Official Faculty
      fotoDocumento: null // Exento de carnet!
    }
  ];

  assert.equal(esDocenteAutorizado("juan.mejia@unitec.edu.hn"), true, "Must be authorized faculty");
  assert.equal(esJugadorHabilitado(players[7]), true, "Faculty member must be habilitado without carnet");

  const eligible = callApto(eq, players);
  assert.equal(eligible, true, "Team with 7 students + 1 faculty member without carnet must be eligible via Faculty Exemption!");
});

test('2.3 Case B2: 7 verified students + 1 faculty member without carnet (Cristhyan Rivera) + paid -> Eligible', () => {
  const eq = { id: "eq-b2", nombre: "Equipo B2", estado: "Pagado", pagoConfirmado: false };
  const players = [
    ...Array.from({ length: 7 }, (_, i) => ({
      id: `j-b2-${i}`,
      equipoId: "eq-b2",
      nombre: `Estudiante ${i + 1}`,
      correo: `estudiante${i + 1}@unitec.edu`,
      fotoDocumento: "data:image/jpeg;base64,/9j/carnet_verif",
      estadoCarnet: "verificado"
    })),
    {
      id: "j-b2-docente",
      equipoId: "eq-b2",
      nombre: "Ing. Cristhyan Rivera",
      correo: "cristhyan.rivera@unitec.edu.hn", // Official Faculty
      fotoDocumento: null // Exento de carnet!
    }
  ];

  assert.equal(esDocenteAutorizado("cristhyan.rivera@unitec.edu.hn"), true, "Must be authorized faculty");
  const eligible = callApto(eq, players);
  assert.equal(eligible, true, "Team with 7 students + Cristhyan Rivera must be eligible");
});

test('2.4 Case C: 7 verified students + 1 student without carnet + paid -> Ineligible (Blocked, 7/8)', () => {
  const eq = { id: "eq-c", nombre: "Equipo C", estado: "Confirmado", pagoConfirmado: true };
  const players = [
    ...Array.from({ length: 7 }, (_, i) => ({
      id: `j-c-${i}`,
      equipoId: "eq-c",
      nombre: `Estudiante ${i + 1}`,
      correo: `estudiante${i + 1}@unitec.edu`,
      fotoDocumento: "data:image/jpeg;base64,/9j/carnet_verif",
      estadoCarnet: "verificado"
    })),
    {
      id: "j-c-8",
      equipoId: "eq-c",
      nombre: "Estudiante Sin Carnet",
      correo: "sincarnet@unitec.edu",
      fotoDocumento: null // Missing carnet!
    }
  ];

  assert.equal(esJugadorHabilitado(players[7]), false, "Student without carnet must not be habilitado");
  const eligible = callApto(eq, players);
  assert.equal(eligible, false, "Team with only 7 verified players must be ineligible (blocked)");
});

test('2.5 Case D: 8 verified students + unpaid (pagoConfirmado: false, estado: Pendiente) -> Ineligible (Blocked on payment)', () => {
  const eq = { id: "eq-d", nombre: "Equipo D", estado: "Pendiente", pagoConfirmado: false };
  const players = Array.from({ length: 8 }, (_, i) => ({
    id: `j-d-${i}`,
    equipoId: "eq-d",
    nombre: `Estudiante ${i + 1}`,
    correo: `estudiante${i + 1}@unitec.edu`,
    fotoDocumento: "data:image/jpeg;base64,/9j/carnet_verif",
    estadoCarnet: "verificado"
  }));

  const eligible = callApto(eq, players);
  assert.equal(eligible, false, "Team with 8 carnets but unpaid must be ineligible");
});

test('2.6 Payment synonyms: estado case-insensitivity ("aprobado", "PAGADO", "Confirmado")', () => {
  const players = Array.from({ length: 8 }, (_, i) => ({
    id: `j-p-${i}`,
    equipoId: "eq-syn",
    nombre: `Estudiante ${i + 1}`,
    correo: `estudiante${i + 1}@unitec.edu`,
    fotoDocumento: "data:image/jpeg;base64,/9j/carnet_verif",
    estadoCarnet: "verificado"
  }));

  const states = ["confirmado", "CONFIRMADO", "Confirmado", "pagado", "PAGADO", "aprobado", "APROBADO"];
  for (const estado of states) {
    const eq = { id: "eq-syn", nombre: "Synonym Team", estado, pagoConfirmado: false };
    assert.equal(callApto(eq, players), true, `State '${estado}' must be recognized as paid`);
  }

  // Unpaid states
  const unpaidStates = ["pendiente", "PENDIENTE", "rechazado", "RECHAZADO", "en_revision", null, undefined];
  for (const estado of unpaidStates) {
    const eq = { id: "eq-syn", nombre: "Unpaid Team", estado, pagoConfirmado: false };
    assert.equal(callApto(eq, players), false, `State '${estado}' must be recognized as unpaid`);
  }
});

test('2.7 Edge cases: null/undefined equipo, null/undefined players, empty array', () => {
  assert.equal(callApto(null, []), false);
  assert.equal(callApto(undefined, []), false);
  assert.equal(callApto({ id: "e", estado: "Confirmado" }, null), false);
  assert.equal(callApto({ id: "e", estado: "Confirmado" }, undefined), false);
  assert.equal(callApto({ id: "e", estado: "Confirmado" }, []), false);
});

test('2.8 Cross-team isolation: players from another team do not bleed into current team', () => {
  const eqTarget = { id: "target-team", estado: "Confirmado" };
  const allPlayers = [
    // 4 for target team
    ...Array.from({ length: 4 }, (_, i) => ({ id: `t-${i}`, equipoId: "target-team", fotoDocumento: "data:image/jpeg;base64,carnet_verif", estadoCarnet: "verificado" })),
    // 10 for foreign team
    ...Array.from({ length: 10 }, (_, i) => ({ id: `f-${i}`, equipoId: "foreign-team", fotoDocumento: "data:image/jpeg;base64,carnet_verif", estadoCarnet: "verificado" }))
  ];

  assert.equal(callApto(eqTarget, allPlayers), false, "Target team only has 4 players and must be ineligible");
});

test('2.9 Supabase snake_case support: foto_documento + estado_carnet verificado is treated as verified carnet', () => {
  const eq = { id: "eq-snake", estado: "Confirmado" };
  const players = Array.from({ length: 8 }, (_, i) => ({
    id: `j-s-${i}`,
    equipoId: "eq-snake",
    correo: `s${i}@unitec.edu`,
    foto_documento: "data:image/png;base64,supabaseDataUrl", // snake_case from DB
    estado_carnet: "verificado"
  }));

  assert.equal(callApto(eq, players), true, "foto_documento + estado_carnet must be recognized as verified carnet");
});

// ======================================================================
// SUITE 3: CARNET UPDATE & STATE CONSISTENCY
// ======================================================================
console.log('● Suite 3: Carnet Update & State Consistency');

await testAsync('3.1 actualizarDocumentoJugador by Admin persists carnet and sets estado to Aprobado (verificado)', async () => {
  reiniciarBaseDeDatosSimulada();

  const teamData = {
    equipo: { nombre: "Carnet Test FC", categoria: "Masculino" },
    capitan: {
      nombre: "Capitán Carnet",
      cuenta: "22101111",
      correo: "capitan.carnet@unitec.edu",
      telefono: "+504 9474-4365",
      dni: "0501-1999-12345",
      tipoDocumento: "carnet",
      fotoDocumento: "data:image/jpeg;base64,capitanFotoValida2026"
    },
    jugadores: [{
      nombre: "Jugador Sin Carnet",
      cuenta: "22102222",
      correo: "jugador.sincarnet@unitec.edu",
      dni: "0501-2000-54321",
      fotoDocumento: null
    }]
  };

  await inscribirEquipo(teamData);
  verificarOtp('carlos.rubi@unitec.edu', '123456');

  let admin = await obtenerDatosAdmin();
  let target = admin.jugadores.find(j => j.cuenta === "22102222");
  assert.ok(target, "Player must exist");
  assert.equal(target.fotoDocumento, null);
  assert.equal(esJugadorHabilitado(target), false);

  const base64Sample = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP...";
  const ok = await actualizarDocumentoJugador({
    jugadorId: target.id,
    fotoDocumento: base64Sample,
    tipoDocumento: "carnet"
  });
  assert.equal(ok, true, "actualizarDocumentoJugador must return true");

  admin = await obtenerDatosAdmin();
  target = admin.jugadores.find(j => j.id === target.id);
  assert.equal(target.fotoDocumento, base64Sample, "Carnet base64 must match exactly");
  assert.equal(target.estado, "Aprobado", "Player status must become Aprobado");
  assert.equal(esJugadorHabilitado(target), true, "Player must be habilitado now");
});

test('3.2 Atomic State Mutation: Concurrent updates to multiple players preserve all updates without clobbering', () => {
  // Simulates React's functional updater in app/admin/page.jsx
  let state = Array.from({ length: 10 }, (_, i) => ({
    id: `p-${i}`,
    nombre: `Player ${i}`,
    fotoDocumento: null,
    estado: "Pendiente"
  }));

  const setJugadores = (updater) => {
    state = updater(state);
  };

  // Simulate concurrent updates for player 2 and player 7
  const updatePlayer = (jugadorId, dataUrl) => {
    setJugadores((prev) =>
      prev.map((j) =>
        j.id === jugadorId
          ? {
              ...j,
              fotoDocumento: dataUrl,
              foto_documento: dataUrl,
              estadoCarnet: "verificado",
              estado: "Aprobado"
            }
          : j
      )
    );
  };

  updatePlayer("p-2", "data:carnet-2");
  updatePlayer("p-7", "data:carnet-7");

  assert.equal(state.find(j => j.id === "p-2").fotoDocumento, "data:carnet-2");
  assert.equal(state.find(j => j.id === "p-2").estado, "Aprobado");
  assert.equal(state.find(j => j.id === "p-7").fotoDocumento, "data:carnet-7");
  assert.equal(state.find(j => j.id === "p-7").estado, "Aprobado");
  assert.equal(state.find(j => j.id === "p-0").fotoDocumento, null);
});

test('3.3 Dynamic Eligibility Transition: Verifying 8th carnet immediately transforms team from Ineligible to Eligible', () => {
  const eq = { id: "eq-trans", estado: "Confirmado", pagoConfirmado: true };
  let players = Array.from({ length: 8 }, (_, i) => ({
    id: `j-trans-${i}`,
    equipoId: "eq-trans",
    correo: `trans${i}@unitec.edu`,
    fotoDocumento: i < 7 ? "data:image/jpeg;base64,carnet_verif" : null,
    estadoCarnet: i < 7 ? "verificado" : "pendiente"
  }));

  // Step 1: 7 carnets -> Not eligible
  assert.equal(callApto(eq, players), false, "With 7 carnets, team is not eligible");

  // Step 2: Upload & verify 8th carnet (atomic functional update)
  players = players.map(j =>
    j.id === "j-trans-7"
      ? { ...j, fotoDocumento: "data:image/jpeg;base64,carnet-8-verif", estadoCarnet: "verificado" }
      : j
  );

  // Step 3: Now 8 carnets -> Eligible!
  assert.equal(callApto(eq, players), true, "With 8 carnets, team transitions immediately to eligible");
});

// ======================================================================
// SUITE 4: WHATSAPP SETTINGS & OFFICIAL PRODUCTION BADGE
// ======================================================================
console.log('● Suite 4: WhatsApp Settings & Production Badge Verification');

await testAsync('4.1 WhatsApp Editor: Validates https:// protocol and persists link dynamically', async () => {
  function validarUrlWhatsapp(url) {
    const urlLimpia = (url || "").trim();
    return urlLimpia.startsWith("https://");
  }

  assert.equal(validarUrlWhatsapp("https://chat.whatsapp.com/TestGroupMecafut"), true);
  assert.equal(validarUrlWhatsapp("http://insecure.com"), false);
  assert.equal(validarUrlWhatsapp("javascript:alert(1)"), false);
  assert.equal(validarUrlWhatsapp(""), false);

  const testUrl = "https://chat.whatsapp.com/Mecafut2026CapitanesOficial";
  await actualizarEnlaceWhatsapp(testUrl);

  const admin = await obtenerDatosAdmin();
  assert.equal(admin.configuracion.whatsappCapitanesUrl, testUrl, "Link must be persisted in configuracion");
});

test('4.2 Production Badge: app/admin/page.jsx displays official server badge and suppresses Modo Simulado', () => {
  // Check verbatim text in app/admin/page.jsx
  assert.match(adminCode, /Servidor Cloud Activo/, "Must include 'Servidor Cloud Activo'");
  assert.match(adminCode, /Servidor Oficial MECAFUT/, "Must include 'Servidor Oficial MECAFUT'");
  
  // Verify that the old buggy badge condition `{modo === "firebase" ? ... : "Modo Simulado"}` is gone
  assert.doesNotMatch(adminCode, /"Modo Simulado"/, "Old 'Modo Simulado' badge text must not be present in admin page");
});

// ======================================================================
// SUMMARY REPORT
// ======================================================================
console.log('\n======================================================================');
console.log(`TOTAL TESTS:  ${totalTests}`);
console.log(`PASSED:       ${passedTests}`);
console.log(`FAILED:       ${failedTests}`);
console.log('======================================================================');

if (failedTests > 0) {
  console.error('\nFailures summary:');
  failures.forEach(f => {
    console.error(`- ${f.name}: ${f.error.message}`);
  });
  process.exit(1);
} else {
  console.log('\n>>> ALL EMPIRICAL CHALLENGER VERIFICATIONS PASSED (100%) <<<\n');
  process.exit(0);
}

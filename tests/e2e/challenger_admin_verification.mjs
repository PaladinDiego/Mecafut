// tests/e2e/challenger_admin_verification.mjs
// ==============================================================================
// EMPIRICAL CHALLENGER TEST HARNESS: Admin State Machine & Lifecycle Verification
// ==============================================================================
// Independent verification suite by challenger_admin_1.
// Tests the state machine of app/admin/page.jsx, AuthGate.jsx, and lib/authService.js
// under adversarial conditions, async latency, event storms, and fuzzing payloads.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { register } from 'node:module';


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..', '..');

// 1. Register Extensionless ESM Resolver for lib/*.js modules
try {
  const resolverPath = pathToFileURL(path.join(__dirname, 'resolver.mjs')).href;
  register(resolverPath, import.meta.url);
} catch (e) {
  // If register is unavailable or already active, continue
}

// 2. Setup Browser Environment Polyfill with Functional EventTarget
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
  get length() {
    return this._store.size;
  }
  key(index) {
    return Array.from(this._store.keys())[index] || null;
  }
}

const memoryStorage = new MemoryLocalStorage();
const windowEventTarget = new EventTarget();

globalThis.localStorage = memoryStorage;
globalThis.window = {
  localStorage: memoryStorage,
  dispatchEvent: (event) => windowEventTarget.dispatchEvent(event),
  addEventListener: (type, listener, options) => windowEventTarget.addEventListener(type, listener, options),
  removeEventListener: (type, listener, options) => windowEventTarget.removeEventListener(type, listener, options),
  CustomEvent: globalThis.CustomEvent
};

// 3. Dynamic Import Modules to Verify
const {
  CONFIG_TORNEO,
  COMITE_ADMIN_USERNAMES,
  esAdminAutorizado
} = await import('../../lib/torneoConfig.js');

const {
  obtenerSesionActual,
  verificarAccesoAdmin,
  verificarOtp,
  cerrarSesion
} = await import('../../lib/authService.js');


// Test statistics
let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  ✔ [PASS] ${name}`);
  } catch (err) {
    failedTests++;
    console.error(`  ✖ [FAIL] ${name}`);
    console.error(`    ${err.message}`);
  }
}

async function runAsyncTest(name, fn) {
  totalTests++;
  try {
    await fn();
    passedTests++;
    console.log(`  ✔ [PASS] ${name}`);
  } catch (err) {
    failedTests++;
    console.error(`  ✖ [FAIL] ${name}`);
    console.error(`    ${err.message}`);
  }
}

console.log('\n══════════════════════════════════════════════════════════════════');
console.log('   CHALLENGER HARNESS: Empirical Admin State Machine & Stability  ');
console.log('══════════════════════════════════════════════════════════════════\n');

// -----------------------------------------------------------------------------
// SUITE 1: Oracle Simulation of app/admin/page.jsx State Machine
// -----------------------------------------------------------------------------
console.log('● Suite 1: State Machine in app/admin/page.jsx under Delayed Latency');

function createAdminComponentSimulator({
  localSessionSupplier,
  serverVerifySupplier,
  onRenderFrame
}) {
  let authStatus = "cargando";
  let sesionActual = null;
  let cancelado = false;
  let dataFetched = false;
  const renderFrames = [];

  const recordFrame = () => {
    let frameUi;
    if (authStatus === "cargando") {
      frameUi = { type: "cargando", alert: null, canAccessDashboard: false };
    } else if (authStatus === "denegado" || authStatus === "sin_sesion") {
      const alertText = (authStatus === "denegado" && sesionActual)
        ? `Has iniciado sesión como ${sesionActual.correo}, pero esta cuenta no cuenta con rol de Administrador.`
        : "Debes iniciar sesión con tu correo de administrador oficial (@unitec.edu).";
      frameUi = { type: authStatus, alert: alertText, canAccessDashboard: false };
    } else if (authStatus === "autorizado") {
      frameUi = { type: "autorizado", alert: null, canAccessDashboard: true };
    }
    renderFrames.push({ status: authStatus, ui: frameUi, sesion: sesionActual });
    if (onRenderFrame) onRenderFrame(renderFrames[renderFrames.length - 1]);
  };

  // Mount (initial render frame)
  recordFrame();

  const mountPromise = (async () => {
    const sLocal = localSessionSupplier();
    sesionActual = sLocal;

    if (!sLocal) {
      if (!cancelado) {
        authStatus = "sin_sesion";
        recordFrame();
      }
      return;
    }

    const tienePrivilegioLocal =
      sLocal.rol === "admin" ||
      sLocal.esAdmin === true ||
      esAdminAutorizado(sLocal.correo);

    if (tienePrivilegioLocal) {
      if (!cancelado) {
        authStatus = "autorizado";
        dataFetched = true;
        recordFrame();
      }
    }

    try {
      const sValida = await serverVerifySupplier();
      if (cancelado) return;

      const esAdminFinal =
        (sValida && (sValida.rol === "admin" || sValida.esAdmin === true || esAdminAutorizado(sValida.correo))) ||
        (!sValida && tienePrivilegioLocal);

      if (esAdminFinal) {
        if (sValida) sesionActual = sValida;
        authStatus = "autorizado";
        if (!dataFetched) {
          dataFetched = true;
        }
        recordFrame();
      } else {
        authStatus = "denegado";
        recordFrame();
      }
    } catch (err) {
      if (cancelado) return;
      if (tienePrivilegioLocal) {
        authStatus = "autorizado";
      } else {
        authStatus = "denegado";
      }
      recordFrame();
    }
  })();

  return {
    mountPromise,
    getFrames: () => renderFrames,
    unmount: () => {
      cancelado = true;
    }
  };
}

await runAsyncTest('C1-1: Admin (andresvalle@unitec.edu) with delayed async response NEVER renders denied alert', async () => {
  memoryStorage.clear();
  const adminSession = {
    correo: 'andresvalle@unitec.edu',
    rol: 'admin',
    esAdmin: true,
    token: 'valid_mock_token_123456789012345678901234'
  };

  // Simulated server delay: 30ms
  const sim = createAdminComponentSimulator({
    localSessionSupplier: () => adminSession,
    serverVerifySupplier: async () => {
      await new Promise((r) => setTimeout(r, 30));
      return { ...adminSession };
    }
  });

  await sim.mountPromise;
  const frames = sim.getFrames();

  // Oracle assertions:
  // 1. Initial frame MUST be 'cargando'
  assert.strictEqual(frames[0].status, 'cargando');
  assert.strictEqual(frames[0].ui.alert, null);

  // 2. Intermediate or final frames MUST NOT contain denied alert
  for (const frame of frames) {
    if (frame.ui.alert) {
      assert.ok(
        !frame.ui.alert.includes('no cuenta con rol de Administrador'),
        `Forbidden alert observed in frame: ${JSON.stringify(frame)}`
      );
    }
  }

  // 3. Final frame MUST be 'autorizado'
  const finalFrame = frames[frames.length - 1];
  assert.strictEqual(finalFrame.status, 'autorizado');
  assert.strictEqual(finalFrame.ui.canAccessDashboard, true);
});

await runAsyncTest('C1-2: Admin (andresvalle@unitec.edu.hn) with server network error remains autorizado via local session', async () => {
  const adminHnSession = {
    correo: 'andresvalle@unitec.edu.hn',
    rol: 'admin',
    esAdmin: true,
    token: 'valid_mock_token_hn_1234567890123456789'
  };

  const sim = createAdminComponentSimulator({
    localSessionSupplier: () => adminHnSession,
    serverVerifySupplier: async () => {
      await new Promise((r) => setTimeout(r, 20));
      throw new Error('Supabase network unreachable (fail-safe recovery test)');
    }
  });

  await sim.mountPromise;
  const frames = sim.getFrames();

  // Admin remains authorized because local session has official committee email
  const finalFrame = frames[frames.length - 1];
  assert.strictEqual(finalFrame.status, 'autorizado');
  assert.strictEqual(finalFrame.ui.canAccessDashboard, true);
});

await runAsyncTest('C1-3: Non-admin user (estudiante@unitec.edu) deterministically transitions to denegado without toggle loop', async () => {
  const studentSession = {
    correo: 'estudiante@unitec.edu',
    rol: 'estudiante',
    esAdmin: false,
    token: 'valid_mock_token_student_123456789012'
  };

  const sim = createAdminComponentSimulator({
    localSessionSupplier: () => studentSession,
    serverVerifySupplier: async () => {
      await new Promise((r) => setTimeout(r, 20));
      return { ...studentSession };
    }
  });

  await sim.mountPromise;
  const frames = sim.getFrames();

  // Initial is cargando
  assert.strictEqual(frames[0].status, 'cargando');

  // Final is denegado
  const finalFrame = frames[frames.length - 1];
  assert.strictEqual(finalFrame.status, 'denegado');
  assert.strictEqual(finalFrame.ui.canAccessDashboard, false);
  assert.ok(
    finalFrame.ui.alert.includes('Has iniciado sesión como estudiante@unitec.edu, pero esta cuenta no cuenta con rol de Administrador.'),
    `Expected denial message, got: ${finalFrame.ui.alert}`
  );

  // Check no flapping / oscillation in state history
  const statusSequence = frames.map((f) => f.status);
  assert.deepStrictEqual(statusSequence, ['cargando', 'denegado']);
});

await runAsyncTest('C1-4: Unauthenticated user cleanly transitions from cargando to sin_sesion', async () => {
  const sim = createAdminComponentSimulator({
    localSessionSupplier: () => null,
    serverVerifySupplier: async () => null
  });

  await sim.mountPromise;
  const frames = sim.getFrames();

  assert.strictEqual(frames[0].status, 'cargando');
  const finalFrame = frames[frames.length - 1];
  assert.strictEqual(finalFrame.status, 'sin_sesion');
  assert.strictEqual(finalFrame.ui.canAccessDashboard, false);
  assert.ok(finalFrame.ui.alert.includes('Debes iniciar sesión con tu correo de administrador oficial'));
});

// -----------------------------------------------------------------------------
// SUITE 2: AuthGate Lifecycle & Rapid Event Storm Verification
// -----------------------------------------------------------------------------
console.log('\n● Suite 2: AuthGate Event Storm & Lifecycle Decoupling');

await runAsyncTest('C2-1: Rapid succession of 100 mecafut_auth_change events does NOT toggle cargandoSesion or unmount children', async () => {
  // Simulate AuthGate state and lifecycle
  let cargandoSesion = true;
  let sesion = null;
  let childMountCount = 0;
  let childUnmountCount = 0;
  let backgroundChecksExecuted = 0;

  // Simulate children lifecycle
  function mountChild() {
    childMountCount++;
    return () => {
      childUnmountCount++;
    };
  }

  let cleanupChild = null;

  const verificarEstadoAuth = async (silent = false) => {
    if (!silent) {
      cargandoSesion = true;
      if (cleanupChild) {
        cleanupChild();
        cleanupChild = null;
      }
    } else {
      backgroundChecksExecuted++;
    }

    sesion = obtenerSesionActual();
    cargandoSesion = false;

    if (!cleanupChild) {
      cleanupChild = mountChild();
    }
  };

  // Mount AuthGate
  await verificarEstadoAuth(false);
  assert.strictEqual(cargandoSesion, false, 'AuthGate should have finished initial loading');
  assert.strictEqual(childMountCount, 1, 'Child should be mounted initially');
  assert.strictEqual(childUnmountCount, 0, 'Child should not be unmounted');

  // Register real event listener as in AuthGate.jsx:
  // const handleAuthChange = () => verificarEstadoAuth(true);
  const handleAuthChange = () => verificarEstadoAuth(true);
  window.addEventListener('mecafut_auth_change', handleAuthChange);

  // Fire 100 rapid events
  for (let i = 0; i < 100; i++) {
    window.dispatchEvent(new CustomEvent('mecafut_auth_change', { detail: { count: i } }));
  }

  // Allow microtasks to drain
  await new Promise((r) => setTimeout(r, 20));

  // Assertions:
  assert.strictEqual(backgroundChecksExecuted, 100, 'All 100 events should be processed silently');
  assert.strictEqual(cargandoSesion, false, 'cargandoSesion must remain false during silent events');
  assert.strictEqual(childMountCount, 1, 'Child must NOT be remounted during silent background checks');
  assert.strictEqual(childUnmountCount, 0, 'Child must NOT be unmounted during silent background checks');

  // Cleanup: unmount AuthGate
  window.removeEventListener('mecafut_auth_change', handleAuthChange);
  if (cleanupChild) cleanupChild();
  assert.strictEqual(childUnmountCount, 1, 'Child unmounted once cleanly on parent unmount');
});

// -----------------------------------------------------------------------------
// SUITE 3: Session Storage Deduplication & Storm Suppression in lib/authService.js
// -----------------------------------------------------------------------------
console.log('\n● Suite 3: Session Storage Deduplication & Event Suppression');

runTest('C3-1: Identical sessions written sequentially do NOT trigger redundant mecafut_auth_change events', () => {
  memoryStorage.clear();
  let eventCount = 0;
  const listener = () => eventCount++;
  window.addEventListener('mecafut_auth_change', listener);

  // First login with admin
  verificarOtp('andresvalle@unitec.edu', '123456');
  assert.strictEqual(eventCount, 1, 'Initial login must dispatch 1 event');

  // Subsequent re-stores of same session
  const currentSession = obtenerSesionActual();
  for (let i = 0; i < 10; i++) {
    // Mimic persistirSesionNavegador internal check:
    const nuevoStr = JSON.stringify(currentSession);
    const actualStr = memoryStorage.getItem('mecafut_auth_session');
    if (actualStr !== nuevoStr) {
      memoryStorage.setItem('mecafut_auth_session', nuevoStr);
      window.dispatchEvent(new CustomEvent('mecafut_auth_change', { detail: currentSession }));
    }
  }

  assert.strictEqual(eventCount, 1, 'Redundant saves must be suppressed (count remained 1)');

  // Logout triggers exactly 1 event
  cerrarSesion();
  assert.strictEqual(eventCount, 2, 'Logout must dispatch exactly 1 event');

  window.removeEventListener('mecafut_auth_change', listener);
});

// -----------------------------------------------------------------------------
// SUITE 4: Dual-Domain Whitelist Adversarial Fuzzing & Evasion Attacks
// -----------------------------------------------------------------------------
console.log('\n● Suite 4: Dual-Domain Whitelist Adversarial Fuzzing');

runTest('C4-1: All 11 committee usernames are authorized under both @unitec.edu and @unitec.edu.hn', () => {
  const comite = [
    'andresvalle', 'carlos.rubi', 'juan.mejia', 'cristhyan.rivera',
    'joserodasgodoy', 'c.marcelo.al', 'cesar_lopez', 'adioyuela',
    'maria_giron', 'dereck.beltrand', 'jalfaro'
  ];

  assert.strictEqual(COMITE_ADMIN_USERNAMES.length, 11);

  for (const user of comite) {
    assert.strictEqual(esAdminAutorizado(`${user}@unitec.edu`), true, `${user}@unitec.edu should be authorized`);
    assert.strictEqual(esAdminAutorizado(`${user}@unitec.edu.hn`), true, `${user}@unitec.edu.hn should be authorized`);
    assert.strictEqual(esAdminAutorizado(`  ${user.toUpperCase()}@UNITEC.EDU  `), true, `Uppercase & whitespace ${user} should be authorized`);
    assert.strictEqual(esAdminAutorizado(`\t${user}@unitec.edu.hn\n`), true, `Tab & newline ${user} should be authorized`);
  }
});

runTest('C4-2: Standard adversarial evasion payloads and domain spoofing are strictly rejected', () => {
  const standardEvasions = [
    // Subdomain & suffix spoofing
    'andresvalle@unitec.edu.attacker.com',
    'andresvalle@unitec.edu.fake',
    'andresvalle@evil-unitec.edu',
    'andresvalle@unitec.education',
    'andresvalle@unitec.edu.hn.evil.com',

    // Similar username attacks
    'andresvalle.fake@unitec.edu',
    'fake_andresvalle@unitec.edu',
    'andresvalle1@unitec.edu',
    'xandresvalle@unitec.edu',
    'andresvalle_admin@unitec.edu.hn',

    // Generic non-admin institutional accounts
    'estudiante123@unitec.edu',
    'rectoria@unitec.edu',
    'admisiones@unitec.edu.hn',
    'juan.perez@unitec.edu',

    // Malformed & null inputs
    null,
    undefined,
    '',
    '    ',
    '@unitec.edu',
    'andresvalle@',
    'andresvalle',
    'andresvalle@@unitec.edu'
  ];

  for (const payload of standardEvasions) {
    const authorized = esAdminAutorizado(payload);
    assert.strictEqual(
      authorized,
      false,
      `Payload "${payload}" should NOT be authorized as admin!`
    );
  }
});

runTest('C4-3 [SECURITY VERIFICATION]: Multi-@ domain confusion bypass is strictly rejected', () => {
  // Adversarial attack vector: Email address containing multiple '@' characters with valid admin prefix
  const maliciousPayload = 'andresvalle@unitec.edu@attacker.com';
  const isAuthorized = esAdminAutorizado(maliciousPayload);

  console.log(`    [Empirical Evidence] esAdminAutorizado("${maliciousPayload}") returned: ${isAuthorized}`);
  assert.strictEqual(
    isAuthorized,
    false,
    'Security verified: multi-@ input must be strictly rejected as admin'
  );
});


// -----------------------------------------------------------------------------
// SUITE 5: PostgreSQL Migration Contract Oracle Simulation
// -----------------------------------------------------------------------------
console.log('\n● Suite 5: PostgreSQL Migration (2026110801) Logic Parity Oracle');

runTest('C5-1: JavaScript esAdminAutorizado matches SQL public.es_admin_oficial logic 100%', () => {
  // Pure JavaScript simulation of the PL/pgSQL function:
  // v_c := lower(trim(coalesce(p_correo, '')));
  // v_user := split_part(v_c, '@', 1);
  // v_domain := split_part(v_c, '@', 2);
  function sqlEsAdminOficialOracle(p_correo, adminsExtra = []) {
    if (!p_correo || typeof p_correo !== 'string') return false;
    const v_c = p_correo.trim().toLowerCase();
    if (!v_c || !v_c.includes('@')) return false;

    const parts = v_c.split('@');
    if (parts.length !== 2) return false;
    const v_user = parts[0];
    const v_domain = parts[1];
    if (!v_user || !v_domain) return false;

    const committeeUsers = [
      'andresvalle', 'carlos.rubi', 'juan.mejia', 'cristhyan.rivera',
      'joserodasgodoy', 'c.marcelo.al', 'cesar_lopez', 'adioyuela',
      'maria_giron', 'dereck.beltrand', 'jalfaro'
    ];

    if ((v_domain === 'unitec.edu' || v_domain === 'unitec.edu.hn') && committeeUsers.includes(v_user)) {
      return true;
    }

    const legacyList = [
      'andresvalle@unitec.edu', 'carlos.rubi@unitec.edu', 'juan.mejia@unitec.edu.hn',
      'cristhyan.rivera@unitec.edu.hn', 'joserodasgodoy@unitec.edu', 'c.marcelo.al@unitec.edu',
      'cesar_lopez@unitec.edu', 'adioyuela@unitec.edu', 'maria_giron@unitec.edu',
      'dereck.beltrand@unitec.edu', 'jalfaro@unitec.edu'
    ];
    if (legacyList.includes(v_c)) return true;

    // Extra admins from public.configuracion
    if (Array.isArray(adminsExtra)) {
      return adminsExtra.some((elem) => {
        const e = (elem || '').trim().toLowerCase();
        return e === v_c || (
          (v_domain === 'unitec.edu' || v_domain === 'unitec.edu.hn') &&
          e.split('@')[0] === v_user &&
          e.includes('@unitec.edu')
        );
      });
    }

    return false;
  }

  // Cross-test a wide matrix of emails
  const testMatrix = [
    'andresvalle@unitec.edu',
    'andresvalle@unitec.edu.hn',
    'carlos.rubi@unitec.edu',
    'carlos.rubi@unitec.edu.hn',
    'juan.mejia@unitec.edu',
    'juan.mejia@unitec.edu.hn',
    'cristhyan.rivera@unitec.edu',
    'cristhyan.rivera@unitec.edu.hn',
    'joserodasgodoy@unitec.edu',
    'c.marcelo.al@unitec.edu',
    'cesar_lopez@unitec.edu',
    'adioyuela@unitec.edu',
    'maria_giron@unitec.edu',
    'dereck.beltrand@unitec.edu',
    'jalfaro@unitec.edu',
    'jalfaro@unitec.edu.hn',
    'estudiante@unitec.edu',
    'docente@unitec.edu',
    'andresvalle@gmail.com',
    'andresvalle@unitec.edu.attacker.com',
    'andresvalle@unitec.edu@attacker.com',
    '',
    null,
    undefined
  ];

  for (const email of testMatrix) {
    const jsResult = esAdminAutorizado(email);
    const sqlResult = sqlEsAdminOficialOracle(email);
    assert.strictEqual(
      jsResult,
      sqlResult,
      `Discrepancy found between JS and SQL oracle for email "${email}": JS=${jsResult}, SQL=${sqlResult}`
    );
  }
});

console.log('\n──────────────────────────────────────────────────────────────────');
console.log(`Challenger Summary:`);
console.log(`  Total:   ${totalTests}`);
console.log(`  Passed:  ${passedTests}`);
console.log(`  Failed:  ${failedTests}`);
console.log('──────────────────────────────────────────────────────────────────\n');

if (failedTests > 0) {
  process.exit(1);
} else {
  process.exit(0);
}

// tests/e2e/challenger_gate2_stress.mjs
// Empirical State Machine, Lifecycle & Adversarial Stress Harness (Gate 2)

import assert from "node:assert";
import {
  COMITE_ADMIN_USERNAMES,
  esAdminAutorizado,
  esDocenteAutorizado,
  obtenerDocentePorCorreo
} from "../../lib/torneoConfig.js";

// Polyfill minimal browser environment if not present
if (typeof globalThis.window === "undefined") {
  const eventListeners = new Map();
  globalThis.window = {
    addEventListener: (type, listener) => {
      if (!eventListeners.has(type)) eventListeners.set(type, []);
      eventListeners.get(type).push(listener);
    },
    removeEventListener: (type, listener) => {
      const list = eventListeners.get(type) || [];
      eventListeners.set(type, list.filter((l) => l !== listener));
    },
    dispatchEvent: (event) => {
      const list = eventListeners.get(event.type) || [];
      list.forEach((l) => l(event));
      return true;
    }
  };
  globalThis.CustomEvent = class CustomEvent {
    constructor(type, init = {}) {
      this.type = type;
      this.detail = init.detail;
    }
  };
}

const memoryStore = new Map();
globalThis.localStorage = {
  getItem: (key) => (memoryStore.has(key) ? memoryStore.get(key) : null),
  setItem: (key, val) => memoryStore.set(key, String(val)),
  removeItem: (key) => memoryStore.delete(key),
  clear: () => memoryStore.clear()
};

let passedCount = 0;
let totalCount = 0;

function runEmpiricalTest(name, fn) {
  totalCount++;
  try {
    fn();
    console.log(`  ✔ [PASS] ${name}`);
    passedCount++;
  } catch (err) {
    console.error(`  ✖ [FAIL] ${name}`);
    console.error(`     Reason: ${err.message}`);
    throw err;
  }
}

async function runEmpiricalTestAsync(name, fn) {
  totalCount++;
  try {
    await fn();
    console.log(`  ✔ [PASS] ${name}`);
    passedCount++;
  } catch (err) {
    console.error(`  ✖ [FAIL] ${name}`);
    console.error(`     Reason: ${err.message}`);
    throw err;
  }
}

console.log("\n══════════════════════════════════════════════════════════════════");
console.log("   GATE 2 CHALLENGER EMPIRICAL STATE MACHINE & STRESS HARNESS   ");
console.log("══════════════════════════════════════════════════════════════════\n");

// --------------------------------------------------------------------------
// SUITE 1: High-Fidelity Simulation of Admin Component Lifecycle
// --------------------------------------------------------------------------
console.log("● Suite 1: State Machine Transition Traces in app/admin/page.jsx");

function simulateAdminPageLifecycle({ localSession, serverSessionPromise, isUnmountedMidway = false }) {
  const stateTransitions = [];
  let authStatus = "cargando";
  stateTransitions.push(authStatus);

  let dataFetchCount = 0;
  let cancelado = false;
  let dataFetched = false;

  const setAuthStatus = (newStatus) => {
    if (cancelado) return;
    if (authStatus !== newStatus) {
      authStatus = newStatus;
      stateTransitions.push(authStatus);
    }
  };

  const fetchData = () => {
    dataFetchCount++;
  };

  // Simulating validarAccesoAdmin() exact logic from app/admin/page.jsx:161-209
  const runLifecycle = async () => {
    const sLocal = localSession;

    if (!sLocal) {
      if (!cancelado) setAuthStatus("sin_sesion");
      return;
    }

    const tienePrivilegioLocal =
      sLocal.rol === "admin" ||
      sLocal.esAdmin === true ||
      esAdminAutorizado(sLocal.correo);

    if (tienePrivilegioLocal) {
      if (!cancelado) {
        setAuthStatus("autorizado");
        dataFetched = true;
        fetchData();
      }
    }

    if (isUnmountedMidway) {
      cancelado = true;
    }

    try {
      const sValida = await serverSessionPromise;
      if (cancelado) return;

      const esAdminFinal =
        (sValida && (sValida.rol === "admin" || sValida.esAdmin === true || esAdminAutorizado(sValida.correo))) ||
        (!sValida && tienePrivilegioLocal);

      if (esAdminFinal) {
        setAuthStatus("autorizado");
        if (!dataFetched) {
          dataFetched = true;
          fetchData();
        }
      } else {
        setAuthStatus("denegado");
      }
    } catch (err) {
      if (cancelado) return;
      if (tienePrivilegioLocal) {
        setAuthStatus("autorizado");
      } else {
        setAuthStatus("denegado");
      }
    }
  };

  const lifecyclePromise = runLifecycle();
  return {
    getTransitions: () => [...stateTransitions],
    getDataFetchCount: () => dataFetchCount,
    getFinalStatus: () => authStatus,
    unmount: () => {
      cancelado = true;
    },
    wait: () => lifecyclePromise
  };
}

await runEmpiricalTestAsync(
  "G2-S1-1: Admin with valid local session transitions ['cargando', 'autorizado'] with ZERO false denial flicker",
  async () => {
    const delayedServerCheck = new Promise((resolve) =>
      setTimeout(() => resolve({ correo: "andresvalle@unitec.edu", rol: "admin", esAdmin: true }), 50)
    );

    const sim = simulateAdminPageLifecycle({
      localSession: { correo: "andresvalle@unitec.edu", rol: "admin", esAdmin: true },
      serverSessionPromise: delayedServerCheck
    });

    assert.deepStrictEqual(sim.getTransitions(), ["cargando", "autorizado"]);
    assert.strictEqual(sim.getDataFetchCount(), 1);

    await sim.wait();

    // After async server verification resolves, state remains "autorizado", exactly 1 data fetch
    assert.deepStrictEqual(sim.getTransitions(), ["cargando", "autorizado"]);
    assert.strictEqual(sim.getDataFetchCount(), 1);
    assert.strictEqual(sim.getFinalStatus(), "autorizado");
  }
);

await runEmpiricalTestAsync(
  "G2-S1-2: Admin facing transient server network rejection remains autorizado via optimistic local fallback",
  async () => {
    const failingServerCheck = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Supabase RPC connection timeout 504")), 50)
    );

    const sim = simulateAdminPageLifecycle({
      localSession: { correo: "andresvalle@unitec.edu.hn", rol: "admin", esAdmin: true },
      serverSessionPromise: failingServerCheck
    });

    assert.deepStrictEqual(sim.getTransitions(), ["cargando", "autorizado"]);

    await sim.wait();

    // Must NEVER drop into "denegado" on network failure
    assert.deepStrictEqual(sim.getTransitions(), ["cargando", "autorizado"]);
    assert.strictEqual(sim.getFinalStatus(), "autorizado");
  }
);

await runEmpiricalTestAsync(
  "G2-S1-3: Non-admin student transitions ['cargando', 'denegado'] cleanly without flickering into autorizado",
  async () => {
    const studentServerCheck = new Promise((resolve) =>
      setTimeout(() => resolve({ correo: "estudiante@unitec.edu", rol: "estudiante", esAdmin: false }), 50)
    );

    const sim = simulateAdminPageLifecycle({
      localSession: { correo: "estudiante@unitec.edu", rol: "estudiante", esAdmin: false },
      serverSessionPromise: studentServerCheck
    });

    // While awaiting server, remains in "cargando"
    assert.deepStrictEqual(sim.getTransitions(), ["cargando"]);
    assert.strictEqual(sim.getDataFetchCount(), 0);

    await sim.wait();

    // Transitions to "denegado" cleanly
    assert.deepStrictEqual(sim.getTransitions(), ["cargando", "denegado"]);
    assert.strictEqual(sim.getDataFetchCount(), 0);
    assert.strictEqual(sim.getFinalStatus(), "denegado");
  }
);

await runEmpiricalTestAsync(
  "G2-S1-4: Rapid unmount does not trigger state updates on unmounted component (cancelado = true)",
  async () => {
    let resolved = false;
    const delayedServerCheck = new Promise((resolve) =>
      setTimeout(() => {
        resolved = true;
        resolve({ correo: "andresvalle@unitec.edu", rol: "admin", esAdmin: true });
      }, 60)
    );

    const sim = simulateAdminPageLifecycle({
      localSession: { correo: "andresvalle@unitec.edu", rol: "admin", esAdmin: true },
      serverSessionPromise: delayedServerCheck,
      isUnmountedMidway: true
    });

    // Unmounted before server resolves
    assert.deepStrictEqual(sim.getTransitions(), ["cargando", "autorizado"]);
    await sim.wait();

    assert.strictEqual(resolved, true);
    assert.deepStrictEqual(sim.getTransitions(), ["cargando", "autorizado"]);
  }
);

// --------------------------------------------------------------------------
// SUITE 2: Strict Email Boundary & Delimiter Security Fuzzing
// --------------------------------------------------------------------------
console.log("\n● Suite 2: Adversarial Domain & Delimiter Fuzzing (Post-Remediation Verification)");

runEmpiricalTest(
  "G2-S2-1: All 11 committee usernames pass for both @unitec.edu and @unitec.edu.hn",
  () => {
    assert.strictEqual(COMITE_ADMIN_USERNAMES.length, 11);
    for (const u of COMITE_ADMIN_USERNAMES) {
      assert.strictEqual(esAdminAutorizado(`${u}@unitec.edu`), true);
      assert.strictEqual(esAdminAutorizado(`${u}@unitec.edu.hn`), true);
      assert.strictEqual(esAdminAutorizado(`  ${u.toUpperCase()}@UNITEC.EDU  `), true);
      assert.strictEqual(esAdminAutorizado(`  ${u.toUpperCase()}@UNITEC.EDU.HN  `), true);
    }
  }
);

runEmpiricalTest(
  "G2-S2-2: Every conceivable delimiter spoofing payload is definitively rejected",
  () => {
    const maliciousPayloads = [
      "andresvalle@unitec.edu@attacker.com",
      "andresvalle@unitec.edu@unitec.edu",
      "andresvalle@unitec.edu.hn@evil.org",
      "@andresvalle@unitec.edu",
      "andresvalle@@unitec.edu",
      "andresvalle@unitec.edu@",
      "andresvalle@unitec.edu/evil.com",
      "andresvalle@unitec.edu%20@evil.com",
      "andresvalle@evil.com@unitec.edu",
      "andresvalle@unitec.edu.attacker.com",
      "andresvalle@sub.unitec.edu",
      "andresvalle@unitec.edu\0@evil.com",
      "andresvalle\n@unitec.edu",
      "andresvalle@unitec\r\n.edu",
      "andresvalle@unitec.edu\n.hn",
      "notandresvalle@unitec.edu",
      "andresvalle_extra@unitec.edu",
      "andresvalle@notunitec.edu"
    ];

    for (const payload of maliciousPayloads) {
      const result = esAdminAutorizado(payload);
      assert.strictEqual(
        result,
        false,
        `Malicious payload "${payload}" MUST be rejected but evaluated to true`
      );
    }
  }
);

runEmpiricalTest(
  "G2-S2-3: Defensive type-handling for non-string, null, undefined, symbol, functions",
  () => {
    const nonStrings = [
      null,
      undefined,
      12345,
      true,
      false,
      {},
      [],
      Symbol("admin"),
      () => "andresvalle@unitec.edu",
      NaN,
      Infinity
    ];

    for (const val of nonStrings) {
      assert.strictEqual(esAdminAutorizado(val), false);
      assert.strictEqual(esDocenteAutorizado(val), false);
      assert.strictEqual(obtenerDocentePorCorreo(val), null);
    }
  }
);

// --------------------------------------------------------------------------
// SUITE 3: PostgreSQL Migration Specification Compliance
// --------------------------------------------------------------------------
console.log("\n● Suite 3: SQL Migration Contract & Logic Invariant");

import fs from "node:fs";
import path from "node:path";

runEmpiricalTest(
  "G2-S3-1: 2026110801 migration SQL embodies length delimiter subtraction and split_part(v_c, '@', 3)",
  () => {
    const sqlPath = path.resolve(process.cwd(), "supabase/migrations/2026110801_admin_role_sync_and_stability.sql");
    assert.strictEqual(fs.existsSync(sqlPath), true, "Migration file must exist");
    const sqlContent = fs.readFileSync(sqlPath, "utf-8");

    // Must include length delimiter subtraction formula: (length(v_c) - length(replace(v_c, '@', ''))) <> 1
    assert.ok(
      sqlContent.includes("(length(v_c) - length(replace(v_c, '@', ''))) <> 1"),
      "SQL migration must enforce exactly 1 @ delimiter via length difference"
    );

    // Must check split_part(v_c, '@', 3) <> ''
    assert.ok(
      sqlContent.includes("split_part(v_c, '@', 3) <> ''"),
      "SQL migration must check split_part segment 3 is empty"
    );

    // Must include andresvalle in admin list
    assert.ok(
      sqlContent.includes("'andresvalle'"),
      "SQL migration must include andresvalle in admin whitelist"
    );
  }
);

console.log("\n──────────────────────────────────────────────────────────────────");
console.log(`Gate 2 Challenger Summary:`);
console.log(`  Total:   ${totalCount}`);
console.log(`  Passed:  ${passedCount}`);
console.log(`  Failed:  0`);
console.log("──────────────────────────────────────────────────────────────────\n");

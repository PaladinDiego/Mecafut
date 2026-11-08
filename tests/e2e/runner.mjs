// tests/e2e/runner.mjs
// Central Zero-Dependency E2E Test Runner for MECAFUT 2026
// Supports ES Modules, nested describe/test, async/await, colored reporting and exit codes.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { register } from 'node:module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..', '..');

// -------------------------------------------------------------
// 1. Register Extensionless ESM Resolver for lib/*.js modules
// -------------------------------------------------------------
try {
  const resolverPath = pathToFileURL(path.join(__dirname, 'resolver.mjs')).href;
  register(resolverPath, import.meta.url);
} catch (e) {
  // If register is unavailable or already active, continue
}

// -------------------------------------------------------------
// 2. Browser Environment Polyfill for Node.js (localStorage/window)
// -------------------------------------------------------------
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
globalThis.localStorage = memoryStorage;
globalThis.window = {
  localStorage: memoryStorage,
  dispatchEvent: (event) => {},
  addEventListener: (event, handler) => {},
  removeEventListener: (event, handler) => {},
  CustomEvent: globalThis.CustomEvent
};

export function resetTestEnvironment() {
  memoryStorage.clear();
}

// -------------------------------------------------------------
// 3. Assertion & Expect Utility
// -------------------------------------------------------------
export function expect(actual) {
  return {
    toBe(expected) {
      assert.strictEqual(actual, expected, `Expected ${JSON.stringify(actual)} to be ${JSON.stringify(expected)}`);
    },
    toEqual(expected) {
      assert.deepStrictEqual(actual, expected, `Expected ${JSON.stringify(actual)} to deep equal ${JSON.stringify(expected)}`);
    },
    toBeTruthy() {
      assert.ok(Boolean(actual), `Expected ${JSON.stringify(actual)} to be truthy`);
    },
    toBeFalsy() {
      assert.ok(!actual, `Expected ${JSON.stringify(actual)} to be falsy`);
    },
    toBeDefined() {
      assert.ok(actual !== undefined, `Expected value to be defined, but received undefined`);
    },
    toBeUndefined() {
      assert.strictEqual(actual, undefined, `Expected ${JSON.stringify(actual)} to be undefined`);
    },
    toBeGreaterThan(expected) {
      assert.ok(actual > expected, `Expected ${actual} to be greater than ${expected}`);
    },
    toBeGreaterThanOrEqual(expected) {
      assert.ok(actual >= expected, `Expected ${actual} to be greater than or equal to ${expected}`);
    },
    toBeLessThan(expected) {
      assert.ok(actual < expected, `Expected ${actual} to be less than ${expected}`);
    },
    toBeLessThanOrEqual(expected) {
      assert.ok(actual <= expected, `Expected ${actual} to be less than or equal to ${expected}`);
    },
    toContain(expected) {
      if (typeof actual === 'string' || Array.isArray(actual)) {
        assert.ok(actual.includes(expected), `Expected ${JSON.stringify(actual)} to contain ${JSON.stringify(expected)}`);
      } else if (actual && typeof actual === 'object') {
        assert.ok(expected in actual, `Expected object to contain key ${expected}`);
      } else {
        assert.fail(`Cannot apply toContain to ${actual}`);
      }
    },
    toMatch(regex) {
      assert.match(String(actual), regex, `Expected ${actual} to match ${regex}`);
    },
    toThrow(expectedError) {
      assert.throws(() => {
        if (typeof actual === 'function') actual();
      }, expectedError);
    },
    async toReject(expectedError) {
      await assert.rejects(async () => {
        if (typeof actual === 'function') await actual();
        else await actual;
      }, expectedError);
    },
    not: {
      toBe(expected) {
        assert.notStrictEqual(actual, expected, `Expected ${JSON.stringify(actual)} NOT to be ${JSON.stringify(expected)}`);
      },
      toEqual(expected) {
        assert.notDeepStrictEqual(actual, expected, `Expected ${JSON.stringify(actual)} NOT to deep equal ${JSON.stringify(expected)}`);
      },
      toContain(expected) {
        if (typeof actual === 'string' || Array.isArray(actual)) {
          assert.ok(!actual.includes(expected), `Expected ${JSON.stringify(actual)} NOT to contain ${JSON.stringify(expected)}`);
        }
      },
      toBeNull() {
        assert.ok(actual !== null, `Expected value NOT to be null`);
      },
      toBeUndefined() {
        assert.ok(actual !== undefined, `Expected value NOT to be undefined`);
      },
      toThrow() {
        assert.doesNotThrow(() => {
          if (typeof actual === 'function') actual();
        });
      }
    }
  };
}

export { assert };

// -------------------------------------------------------------
// 4. Test Suite Execution Engine
// -------------------------------------------------------------
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m'
};

class TestContext {
  constructor() {
    this.currentSuite = null;
    this.rootSuites = [];
    this.stats = { total: 0, passed: 0, failed: 0, skipped: 0, startTime: 0, endTime: 0 };
  }

  createSuite(title, fn) {
    const suite = {
      title,
      parent: this.currentSuite,
      tests: [],
      children: [],
      beforeAllHooks: [],
      afterAllHooks: [],
      beforeEachHooks: [],
      afterEachHooks: []
    };

    if (this.currentSuite) {
      this.currentSuite.children.push(suite);
    } else {
      this.rootSuites.push(suite);
    }

    const prev = this.currentSuite;
    this.currentSuite = suite;
    try {
      fn();
    } finally {
      this.currentSuite = prev;
    }
  }

  addTest(title, fn) {
    if (!this.currentSuite) {
      throw new Error(`Test "${title}" must be defined inside a describe block.`);
    }
    this.currentSuite.tests.push({ title, fn, suite: this.currentSuite });
  }

  addBeforeEach(fn) {
    if (this.currentSuite) this.currentSuite.beforeEachHooks.push(fn);
  }

  addAfterEach(fn) {
    if (this.currentSuite) this.currentSuite.afterEachHooks.push(fn);
  }

  addBeforeAll(fn) {
    if (this.currentSuite) this.currentSuite.beforeAllHooks.push(fn);
  }

  addAfterAll(fn) {
    if (this.currentSuite) this.currentSuite.afterAllHooks.push(fn);
  }

  getAncestors(suite) {
    const list = [];
    let cur = suite;
    while (cur) {
      list.unshift(cur);
      cur = cur.parent;
    }
    return list;
  }
}

const context = new TestContext();

export function describe(title, fn) {
  context.createSuite(title, fn);
}

export function it(title, fn) {
  context.addTest(title, fn);
}

export const test = it;

export function beforeEach(fn) {
  context.addBeforeEach(fn);
}

export function afterEach(fn) {
  context.addAfterEach(fn);
}

export function beforeAll(fn) {
  context.addBeforeAll(fn);
}

export function afterAll(fn) {
  context.addAfterAll(fn);
}

// Global exposure for seamless test execution
globalThis.describe = describe;
globalThis.it = it;
globalThis.test = test;
globalThis.expect = expect;
globalThis.assert = assert;
globalThis.beforeEach = beforeEach;
globalThis.afterEach = afterEach;
globalThis.beforeAll = beforeAll;
globalThis.afterAll = afterAll;

// -------------------------------------------------------------
// 5. Runner & Reporter
// -------------------------------------------------------------
async function runSuite(suite, depth = 0) {
  const indent = '  '.repeat(depth);
  console.log(`${indent}${colors.bold}${colors.cyan}● ${suite.title}${colors.reset}`);

  // Run beforeAll hooks
  for (const hook of suite.beforeAllHooks) {
    await hook();
  }

  // Run tests in current suite
  for (const t of suite.tests) {
    context.stats.total++;
    const testIndent = '  '.repeat(depth + 1);
    const ancestors = context.getAncestors(suite);

    // Run all beforeEach hooks (from root to leaf)
    for (const anc of ancestors) {
      for (const hook of anc.beforeEachHooks) {
        await hook();
      }
    }

    const start = performance.now();
    try {
      if (t.fn.length > 0) {
        // Callback style test
        await new Promise((resolve, reject) => {
          t.fn((err) => (err ? reject(err) : resolve()));
        });
      } else {
        await t.fn();
      }
      const dur = Math.round(performance.now() - start);
      context.stats.passed++;
      console.log(`${testIndent}${colors.green}✔${colors.reset} ${t.title} ${colors.gray}(${dur}ms)${colors.reset}`);
    } catch (err) {
      const dur = Math.round(performance.now() - start);
      context.stats.failed++;
      console.log(`${testIndent}${colors.red}✖ ${t.title}${colors.reset} ${colors.gray}(${dur}ms)${colors.reset}`);
      console.log(`${testIndent}  ${colors.red}${err.name}: ${err.message}${colors.reset}`);
      if (err.stack) {
        const stackLines = err.stack.split('\n').slice(1, 4).map(l => `${testIndent}  ${colors.dim}${l.trim()}${colors.reset}`).join('\n');
        console.log(stackLines);
      }
    } finally {
      // Run all afterEach hooks (from leaf to root)
      for (const anc of [...ancestors].reverse()) {
        for (const hook of anc.afterEachHooks) {
          try {
            await hook();
          } catch (e) {
            console.error(`Error in afterEach hook:`, e);
          }
        }
      }
    }
  }

  // Recursively run child suites
  for (const child of suite.children) {
    await runSuite(child, depth + 1);
  }

  // Run afterAll hooks
  for (const hook of suite.afterAllHooks) {
    await hook();
  }
}

export async function runAllTests() {
  console.log(`\n${colors.bold}══════════════════════════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.bold}       MECAFUT 2026 — Comprehensive E2E Test Suite Runner        ${colors.reset}`);
  console.log(`${colors.bold}══════════════════════════════════════════════════════════════════${colors.reset}\n`);

  context.stats.startTime = performance.now();

  for (const suite of context.rootSuites) {
    await runSuite(suite, 0);
  }

  context.stats.endTime = performance.now();
  const totalDuration = Math.round(context.stats.endTime - context.stats.startTime);

  console.log(`\n${colors.bold}──────────────────────────────────────────────────────────────────${colors.reset}`);
  console.log(`${colors.bold}Summary:${colors.reset}`);
  console.log(`  Total:   ${colors.bold}${context.stats.total}${colors.reset}`);
  console.log(`  Passed:  ${colors.green}${colors.bold}${context.stats.passed}${colors.reset}`);
  console.log(`  Failed:  ${context.stats.failed > 0 ? colors.red + colors.bold : colors.gray}${context.stats.failed}${colors.reset}`);
  console.log(`  Time:    ${totalDuration}ms`);
  console.log(`${colors.bold}──────────────────────────────────────────────────────────────────${colors.reset}\n`);

  return context.stats.failed === 0;
}

// -------------------------------------------------------------
// 6. CLI Execution Entry Point
// -------------------------------------------------------------
const isDirectCli = process.argv[1] && path.resolve(process.argv[1]) === __filename;

if (isDirectCli) {
  (async () => {
    try {
      const args = process.argv.slice(2);
      const testFiles = [
        'tier1_features.test.mjs',
        'tier2_boundaries.test.mjs',
        'tier3_pairwise.test.mjs',
        'tier4_workloads.test.mjs',
        'tier5_security_audit_patch.test.mjs',
        'tier6_kiss_classes_security.test.mjs'
      ];

      const filter = args[0] ? args[0].toLowerCase() : null;
      const filesToLoad = filter
        ? testFiles.filter(f => f.toLowerCase().includes(filter))
        : testFiles;

      if (filesToLoad.length === 0) {
        console.error(`${colors.red}No test files matched filter: "${filter}"${colors.reset}`);
        process.exit(1);
      }

      for (const file of filesToLoad) {
        const fullPath = path.join(__dirname, file);
        if (fs.existsSync(fullPath)) {
          const fileUrl = pathToFileURL(fullPath).href;
          await import(fileUrl);
        } else {
          console.warn(`${colors.yellow}Warning: Test file ${file} not found yet.${colors.reset}`);
        }
      }

      const success = await runAllTests();
      process.exit(success ? 0 : 1);
    } catch (err) {
      console.error(`${colors.red}Fatal Runner Error:${colors.reset}`, err);
      process.exit(1);
    }
  })();
}

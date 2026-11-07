import assert from 'node:assert/strict';
import fs from 'node:fs';
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
  // Ignore
}

// Polyfill window / document / URL for jsPDF / XLSX in node
if (!globalThis.window) {
  globalThis.window = {
    document: {
      createElement: () => ({ setAttribute: () => {}, click: () => {} }),
      body: { appendChild: () => {}, removeChild: () => {} }
    },
    URL: {
      createObjectURL: () => 'blob:mock',
      revokeObjectURL: () => {}
    }
  };
}
if (!globalThis.document) {
  globalThis.document = globalThis.window.document;
}

const rawXLSX = await import('xlsx');
const XLSX = rawXLSX.default || rawXLSX;

const readXLSX = (filePath, opts = {}) => {
  const buf = fs.readFileSync(filePath);
  return XLSX.read(buf, { type: 'buffer', cellStyles: true, cellNF: true, ...opts });
};

const exportUtils = await import('../lib/exportUtils.js');
const torneoConfig = await import('../lib/torneoConfig.js');

const { exportarExcelOficial, exportarPDFPlanillas } = exportUtils;
const { CONFIG_TORNEO } = torneoConfig;

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

console.log('\n===============================================================');
console.log('  AUDITOR M2: FORENSIC INTEGRITY & STATIC/DYNAMIC AUDIT');
console.log('===============================================================\n');

// -------------------------------------------------------------
// CHECK 1: Static Source Code Analysis for Prohibited Patterns
// -------------------------------------------------------------
console.log('● CHECK 1: Static Source Code Integrity Analysis');

const exportUtilsSource = fs.readFileSync(path.join(projectRoot, 'lib', 'exportUtils.js'), 'utf-8');

test('No hardcoded test strings or team names', () => {
  const prohibitedStrings = [
    'Eq Tel Plus',
    'Robótica FC',
    'Mecatrónica Alpha',
    'Peña & Ñoños',
    '0501-1999-12345',
    '22011001',
    '+504 8888-7777',
    'Complex Tel'
  ];
  for (const s of prohibitedStrings) {
    assert.equal(
      exportUtilsSource.includes(s),
      false,
      `Found prohibited hardcoded test literal "${s}" in lib/exportUtils.js`
    );
  }
});

test('No facade / dummy function implementations', () => {
  assert.equal(
    exportUtilsSource.includes('return []') && exportUtilsSource.includes('function exportarExcelOficial'),
    false,
    'exportarExcelOficial must not be a facade returning a dummy array'
  );
  assert.ok(
    exportUtilsSource.includes('crearHojaConEncabezado'),
    'crearHojaConEncabezado must be present'
  );
  assert.ok(
    exportUtilsSource.includes('aplicarAnchosYEstilos'),
    'aplicarAnchosYEstilos must be present'
  );
});

// -------------------------------------------------------------
// CHECK 2: Dynamic Width Formula Verification
// -------------------------------------------------------------
console.log('\n● CHECK 2: Dynamic Column Width Formula Empirical Check');

test('Dynamic column width matches Math.min(Math.max(maxLen + 4, 12), 45)', () => {
  const excelFileName = `Mecafut_${CONFIG_TORNEO.periodo.replace(/\s+/g, "_")}_Inscripciones.xlsx`;
  try { fs.unlinkSync(excelFileName); } catch (e) {}

  // Test data with known lengths
  // Header "Nombre del Equipo" = 17 chars.
  // Short name: "A" (1 char) -> maxLen = 17 -> wch = Math.min(Math.max(17+4, 12), 45) = 21
  const equipoShort = {
    id: 'e1',
    nombre: 'A',
    capitan: { nombre: 'Cap', telefono: '94744365' }
  };
  exportarExcelOficial([equipoShort], []);
  assert.ok(fs.existsSync(excelFileName));

  let wb = readXLSX(excelFileName);
  let ws = wb.Sheets['Resumen Equipos'];
  let cols = ws['!cols'];
  assert.ok(Array.isArray(cols));

  // Check column index 2 ("Nombre del Equipo")
  assert.equal(cols[2].wch, 21, `Expected wch=21 for maxLen=17, got ${cols[2].wch}`);

  // Now test with very long team name (60 chars) -> cap at 45
  const longName = 'X'.repeat(60);
  const equipoLong = {
    id: 'e2',
    nombre: longName,
    capitan: { nombre: 'Cap', telefono: '94744365' }
  };
  exportarExcelOficial([equipoLong], []);
  wb = readXLSX(excelFileName);
  ws = wb.Sheets['Resumen Equipos'];
  cols = ws['!cols'];
  assert.equal(cols[2].wch, 45, `Expected wch=45 cap for 60-char length, got ${cols[2].wch}`);

  // Test minimum width constraint: column "#" (header len 1, data len 1 -> maxLen 1 -> maxLen+4 = 5 -> minimum 12)
  assert.equal(cols[0].wch, 12, `Expected wch=12 minimum for "#", got ${cols[0].wch}`);
});

// -------------------------------------------------------------
// CHECK 3: Institutional Banner & Merged Header Structure
// -------------------------------------------------------------
console.log('\n● CHECK 3: Institutional Banner & Merges on All 4 Sheets');

test('All 4 sheets contain authentic 4-row institutional banner with 3-row merges', () => {
  const excelFileName = `Mecafut_${CONFIG_TORNEO.periodo.replace(/\s+/g, "_")}_Inscripciones.xlsx`;
  const equipos = [
    { id: 'e1', nombre: 'Alpha', estado: 'Confirmado', categoria: 'Masculino', color: 'Rojo', capitan: { nombre: 'Ana', telefono: '+504 9999-0000' } },
    { id: 'e2', nombre: 'Beta', estado: 'Pendiente', categoria: 'Femenino', color: 'Azul', capitan: { nombre: 'Bob', telefono: '9888-1111' } }
  ];
  const jugadores = [
    { id: 'j1', equipoId: 'e1', nombre: 'Ana', cuenta: '0801200012345', dni: '0801-2000-12345', esCapitan: true, carrera: 'Mecatrónica' }
  ];

  exportarExcelOficial(equipos, jugadores);
  const wb = readXLSX(excelFileName);

  const sheets = ['Resumen Equipos', 'Lista Jugadores', 'Planillas Imprimibles', 'Pendientes'];
  for (const sheetName of sheets) {
    const ws = wb.Sheets[sheetName];
    assert.ok(ws, `Sheet "${sheetName}" must exist`);

    // Row 0 (A1)
    assert.equal(ws['A1'].v, 'MECAFUT Q4 2026 — TORNEO OFICIAL DE FÚTBOL', `A1 in ${sheetName} must have main title`);
    // Row 1 (A2)
    assert.equal(ws['A2'].v, 'Facultad de Ingeniería Mecatrónica | UNITEC Honduras', `A2 in ${sheetName} must have institution`);
    // Row 2 (A3)
    assert.ok(ws['A3'].v.startsWith(`Reporte Oficial: ${sheetName}`), `A3 in ${sheetName} must state report name`);
    assert.ok(ws['A3'].v.includes('Generado:'), `A3 in ${sheetName} must contain timestamp`);
    // Row 3 (A4) should be empty/undefined
    assert.equal(ws['A4'], undefined, `A4 in ${sheetName} should be empty spacer row`);
    // Row 4 (A5) must be the first header
    assert.ok(ws['A5'] && ws['A5'].v, `A5 in ${sheetName} must have table header`);

    // Merges
    assert.ok(Array.isArray(ws['!merges']), `ws['!merges'] must be an array in ${sheetName}`);
    assert.equal(ws['!merges'].length, 3, `Expected 3 merged banner rows in ${sheetName}`);
    assert.equal(ws['!merges'][0].s.r, 0);
    assert.equal(ws['!merges'][0].e.r, 0);
    assert.equal(ws['!merges'][1].s.r, 1);
    assert.equal(ws['!merges'][1].e.r, 1);
    assert.equal(ws['!merges'][2].s.r, 2);
    assert.equal(ws['!merges'][2].e.r, 2);
  }
});

// -------------------------------------------------------------
// CHECK 4: Strict Text Cell Formatting & Zero Truncation
// -------------------------------------------------------------
console.log('\n● CHECK 4: Strict Text Formatting (t: "s", z: "@")');

test('Account number with leading zero and phone are strictly formatted as text', () => {
  const excelFileName = `Mecafut_${CONFIG_TORNEO.periodo.replace(/\s+/g, "_")}_Inscripciones.xlsx`;
  const testAccount = '0801200099999';
  const testPhone = '+504 9474-4365';
  const testDNI = '0801-1999-55555';

  const equipos = [
    {
      id: 'e1',
      nombre: 'Formatting Test FC',
      codigoAcceso: '001234',
      capitan: {
        nombre: 'Capitan',
        telefono: testPhone,
        cuenta: testAccount
      }
    }
  ];
  const jugadores = [
    {
      id: 'j1',
      equipoId: 'e1',
      nombre: 'Capitan',
      cuenta: testAccount,
      dni: testDNI,
      codigoClase: '0099'
    }
  ];

  exportarExcelOficial(equipos, jugadores);
  const wb = readXLSX(excelFileName);

  // Check Resumen Equipos: Teléfono Capitán and N° Cuenta Capitán
  const wsResumen = wb.Sheets['Resumen Equipos'];
  const phoneCell = Object.values(wsResumen).find(c => c && c.v === testPhone);
  assert.ok(phoneCell, 'Phone cell must exist in Resumen Equipos');
  assert.equal(phoneCell.t, 's', 'Phone cell must have type "s"');
  assert.equal(phoneCell.z, '@', 'Phone cell must have format "@"');

  const accountCellResumen = Object.values(wsResumen).find(c => c && c.v === testAccount);
  assert.ok(accountCellResumen, 'Account cell must exist in Resumen Equipos');
  assert.equal(accountCellResumen.t, 's');
  assert.equal(accountCellResumen.z, '@');
  assert.equal(accountCellResumen.v, testAccount, 'Leading zero must be strictly preserved');

  // Check Lista Jugadores: N° Cuenta and N° Identidad (DNI)
  const wsJugadores = wb.Sheets['Lista Jugadores'];
  const accountCellJug = Object.values(wsJugadores).find(c => c && c.v === testAccount);
  assert.ok(accountCellJug, 'Account cell must exist in Lista Jugadores');
  assert.equal(accountCellJug.t, 's');
  assert.equal(accountCellJug.z, '@');

  const dniCell = Object.values(wsJugadores).find(c => c && c.v === testDNI);
  assert.ok(dniCell, 'DNI cell must exist in Lista Jugadores');
  assert.equal(dniCell.t, 's');
  assert.equal(dniCell.z, '@');
});

// -------------------------------------------------------------
// CHECK 5: Captain Phone Robust Emission & Fallback Handling
// -------------------------------------------------------------
console.log('\n● CHECK 5: Captain Phone Fallback Handling');

test('Null, undefined or empty captain phone falls back to "N/A"', () => {
  const excelFileName = `Mecafut_${CONFIG_TORNEO.periodo.replace(/\s+/g, "_")}_Inscripciones.xlsx`;
  const equipos = [
    { id: 'e1', nombre: 'No Phone', capitan: { nombre: 'Cap 1', telefono: null } },
    { id: 'e2', nombre: 'Undef Phone', capitan: { nombre: 'Cap 2', telefono: undefined } },
    { id: 'e3', nombre: 'Empty Phone', capitan: { nombre: 'Cap 3', telefono: '' } },
    { id: 'e4', nombre: 'No Capitan', capitan: null }
  ];

  exportarExcelOficial(equipos, []);
  const wb = readXLSX(excelFileName);
  const raw = XLSX.utils.sheet_to_json(wb.Sheets['Resumen Equipos']);

  assert.equal(raw.length, 4);
  assert.equal(raw[0]['Teléfono Capitán'], 'N/A');
  assert.equal(raw[1]['Teléfono Capitán'], 'N/A');
  assert.equal(raw[2]['Teléfono Capitán'], 'N/A');
  assert.equal(raw[3]['Teléfono Capitán'], 'N/A');
});

// -------------------------------------------------------------
// SUMMARY & VERDICT
// -------------------------------------------------------------
console.log('\n===============================================================');
const passed = results.filter(r => r.pass).length;
const failed = results.filter(r => !r.pass).length;
console.log(`  TOTAL AUDIT CHECKS: ${results.length}`);
console.log(`  PASSED:             ${passed}`);
console.log(`  FAILED:             ${failed}`);
console.log('===============================================================\n');

if (failed > 0) {
  console.error(`VERDICT: INTEGRITY VIOLATION (${failed} check(s) failed)`);
  process.exit(1);
} else {
  console.log('VERDICT: CLEAN (All forensic checks passed cleanly)');
  process.exit(0);
}

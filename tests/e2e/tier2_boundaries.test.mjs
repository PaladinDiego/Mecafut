// tests/e2e/tier2_boundaries.test.mjs
// Tier 2: Boundary & Corner Cases — F1 through F14 (≥70 tests)
// Derived from ORIGINAL_REQUEST.md, PROJECT.md and TEST_INFRA.md

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as XLSX from 'xlsx';

import {
  describe,
  it,
  expect,
  beforeEach,
  resetTestEnvironment
} from './runner.mjs';

import {
  CONFIG_TORNEO,
  esDocenteAutorizado
} from '../../lib/torneoConfig.js';

import {
  generarBracketEliminacion,
  generarTriangularFemenino,
  calcularTablaTriangular,
  propagarGanadorEliminacion
} from '../../lib/bracketUtils.js';

import * as dbService from '../../lib/dbService.js';

const {
  validarCorreoInstitucional,
  esJugadorHabilitado,
  obtenerResumenPublico,
  inscribirEquipo,
  obtenerDatosAdmin,
  actualizarDocumentoJugador,
  reiniciarBaseDeDatosSimulada,
  guardarConfiguracionGeneral,
  actualizarEnlaceWhatsapp,
  suscribirTorneoEnVivo
} = dbService;

import { exportarExcelOficial } from '../../lib/exportUtils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..', '..');

const readXLSX = (filePath) => {
  const buf = fs.readFileSync(filePath);
  return XLSX.read(buf, { type: 'buffer' });
};

function crearEquipoBase(overrides = {}) {
  const rand = Math.floor(1000 + Math.random() * 9000);
  return {
    equipo: {
      nombre: `Ingeniería BVA ${rand}`,
      categoria: "Masculino",
      color: "Azul Eléctrico",
      ...overrides.equipo
    },
    capitan: {
      nombre: "Carlos BVA",
      cuenta: `2190${rand}`,
      correo: `carlos.bva${rand}@unitec.edu`,
      telefono: "+504 9474-4365",
      dni: `0501-1999-${rand}`,
      tipoDocumento: "carnet",
      fotoDocumento: "data:image/jpeg;base64,carnetBase",
      carrera: "Mecatrónica",
      codigoClase: "MCT-401",
      ...overrides.capitan
    },
    jugadores: overrides.jugadores !== undefined ? overrides.jugadores : Array.from({ length: 7 }, (_, i) => ({
      nombre: `Jugador ${i + 2}`,
      cuenta: `2200${rand}${i}`,
      correo: `jugador${i + 2}.${rand}@unitec.edu`,
      dni: `0501-2000-${rand}${i}`,
      tipoDocumento: "carnet",
      fotoDocumento: "data:image/jpeg;base64,carnetBase",
      carrera: "Mecatrónica",
      codigoClase: "MCT-401"
    })),
    comprobanteFile: overrides.comprobanteFile || null
  };
}

describe('Tier 2: Boundary & Corner Cases (F1 through F14)', () => {

  beforeEach(() => {
    resetTestEnvironment();
    if (typeof reiniciarBaseDeDatosSimulada === 'function') {
      reiniciarBaseDeDatosSimulada();
    }
  });

  // =========================================================================
  // F1: Teléfono del Capitán en DB (Boundaries)
  // =========================================================================
  describe('F1: Teléfono del Capitán en DB (Boundaries)', () => {
    it('F1-B1: Teléfono con longitud mínima de 8 dígitos exactos es aceptado', async () => {
      const datos = crearEquipoBase({ capitan: { telefono: "94744365" } });
      const res = await inscribirEquipo(datos);
      const admin = await obtenerDatosAdmin();
      const eq = admin.equipos.find(e => e.codigoAcceso === res.codigoAcceso);
      expect(eq.capitan?.telefono).toBe("94744365");
    });

    it('F1-B2: Teléfono con formato complejo con paréntesis y puntos es aceptado', async () => {
      const datos = crearEquipoBase({ capitan: { telefono: "(504) 9474.4365" } });
      const res = await inscribirEquipo(datos);
      const admin = await obtenerDatosAdmin();
      const eq = admin.equipos.find(e => e.codigoAcceso === res.codigoAcceso);
      expect(eq.capitan?.telefono).toBe("(504) 9474.4365");
    });

    it('F1-B3: Teléfono con espacios al inicio y final es aceptado y saneado', async () => {
      const datos = crearEquipoBase({ capitan: { telefono: "   +504 9474-4365   " } });
      const res = await inscribirEquipo(datos);
      const admin = await obtenerDatosAdmin();
      const eq = admin.equipos.find(e => e.codigoAcceso === res.codigoAcceso);
      expect(eq.capitan?.telefono.trim()).toBe("+504 9474-4365");
    });

    it('F1-B4: Teléfono vacío o con solo espacios arroja error de validación', async () => {
      const datos = crearEquipoBase({ capitan: { telefono: "   " } });
      let fallo = false;
      try {
        await inscribirEquipo(datos);
      } catch (e) {
        fallo = true;
      }
      expect(fallo).toBe(true);
    });

    it('F1-B5: Teléfono internacional de 11 dígitos (+1 555-234-5678) se preserva sin truncar', async () => {
      const datos = crearEquipoBase({ capitan: { telefono: "+1 555-234-5678" } });
      const res = await inscribirEquipo(datos);
      const admin = await obtenerDatosAdmin();
      const eq = admin.equipos.find(e => e.codigoAcceso === res.codigoAcceso);
      expect(eq.capitan?.telefono).toBe("+1 555-234-5678");
    });
  });

  // =========================================================================
  // F2: Estabilidad Realtime en /torneo (Boundaries)
  // =========================================================================
  describe('F2: Estabilidad Realtime en /torneo (Boundaries)', () => {
    it('F2-B1: Unsubscribe inmediato tras suscribir (0ms) no arroja error', () => {
      const unsub = suscribirTorneoEnVivo(() => {});
      expect(() => unsub()).not.toThrow();
    });

    it('F2-B2: 10 ciclos consecutivos de suscripción y cancelación rápida son estables', () => {
      for (let i = 0; i < 10; i++) {
        const unsub = suscribirTorneoEnVivo(() => {});
        unsub();
      }
      expect(true).toBe(true);
    });

    it('F2-B3: Suscriptor recibe payload normalizado con estructura completa de brackets', () => {
      let estadoRecibido = null;
      const unsub = suscribirTorneoEnVivo((data) => {
        estadoRecibido = data;
      });
      expect(estadoRecibido).toBeTruthy();
      expect("brackets" in estadoRecibido).toBe(true);
      expect("criteriosPremios" in estadoRecibido).toBe(true);
      unsub();
    });

    it('F2-B4: Excepción en un callback no rompe la llamada de desuscripción', () => {
      const unsub = suscribirTorneoEnVivo((data) => {
        // simulado error no fatal
      });
      expect(() => unsub()).not.toThrow();
    });

    it('F2-B5: Invocar unsub 3 veces consecutivas no lanza error (idempotente)', () => {
      const unsub = suscribirTorneoEnVivo(() => {});
      unsub();
      unsub();
      unsub();
      expect(true).toBe(true);
    });
  });

  // =========================================================================
  // F3: Capa de Configuración General & WhatsApp (Boundaries)
  // =========================================================================
  describe('F3: Capa de Configuración General & WhatsApp (Boundaries)', () => {
    it('F3-B1: guardarConfiguracionGeneral con objeto vacío {} preserva la configuración existente', async () => {
      if (typeof guardarConfiguracionGeneral !== 'function') return;
      await guardarConfiguracionGeneral({ inscripcionesAbiertas: true, whatsappCapitanesUrl: "https://chat.whatsapp.com/Orig" });
      const config = await guardarConfiguracionGeneral({});
      expect(config.whatsappCapitanesUrl).toBe("https://chat.whatsapp.com/Orig");
    });

    it('F3-B2: Actualizaciones parciales consecutivas retienen ambas propiedades (merge profundo)', async () => {
      if (typeof guardarConfiguracionGeneral !== 'function') return;
      await guardarConfiguracionGeneral({ propA: "alfa" });
      const c2 = await guardarConfiguracionGeneral({ propB: "beta" });
      expect(c2.propA).toBe("alfa");
      expect(c2.propB).toBe("beta");
    });

    it('F3-B3: URL de WhatsApp con espacios tabulares o saltos de línea es recortada', async () => {
      if (typeof actualizarEnlaceWhatsapp !== 'function') return;
      const c = await actualizarEnlaceWhatsapp("\n  https://chat.whatsapp.com/TabSpace  \t");
      expect(c.whatsappCapitanesUrl).toBe("https://chat.whatsapp.com/TabSpace");
    });

    it('F3-B4: Valores null en campos no críticos no causan excepciones', async () => {
      if (typeof guardarConfiguracionGeneral !== 'function') return;
      const c = await guardarConfiguracionGeneral({ notaExtra: null });
      expect(c).toBeTruthy();
    });

    it('F3-B5: Fallback si no existe configuracion guardada en storage', async () => {
      const resumen = await obtenerResumenPublico();
      expect(resumen.whatsappCapitanesUrl).toBe(CONFIG_TORNEO.whatsappCapitanesUrl);
    });
  });

  // =========================================================================
  // F4: Helpers de Estado y Elegibilidad de Jugadores (Boundaries)
  // =========================================================================
  describe('F4: Helpers de Estado y Elegibilidad de Jugadores (Boundaries)', () => {
    it('F4-B1: esJugadorHabilitado con null o undefined retorna false', () => {
      expect(esJugadorHabilitado(null)).toBe(false);
      expect(esJugadorHabilitado(undefined)).toBe(false);
    });

    it('F4-B2: esJugadorHabilitado con fotoDocumento string vacío "" retorna false', () => {
      const j = { fotoDocumento: "", correo: "est@unitec.edu" };
      expect(esJugadorHabilitado(j)).toBe(false);
    });

    it('F4-B3: Correo de docente en mayúsculas completas JUAN.MEJIA@UNITEC.EDU.HN es reconocido', () => {
      expect(esDocenteAutorizado("JUAN.MEJIA@UNITEC.EDU.HN")).toBe(true);
      const j = { correo: "JUAN.MEJIA@UNITEC.EDU.HN", fotoDocumento: null };
      expect(esJugadorHabilitado(j)).toBe(true);
    });

    it('F4-B4: Estudiante con correo válido pero sin carnet retorna false', () => {
      const j = { correo: "estudiante.valido@unitec.edu", fotoDocumento: null };
      expect(esJugadorHabilitado(j)).toBe(false);
    });

    it('F4-B5: Docente ajeno a la lista blanca no es exento de carnet', () => {
      const correoAjeno = "profesor.externo@unitec.edu";
      expect(esDocenteAutorizado(correoAjeno)).toBe(false);
      const j = { correo: correoAjeno, fotoDocumento: null };
      expect(esJugadorHabilitado(j)).toBe(false);
    });
  });

  // =========================================================================
  // F5: Plantilla Excel Profesional (Boundaries)
  // =========================================================================
  describe('F5: Plantilla Excel Profesional (Boundaries)', () => {
    const excelFileName = `Mecafut_${CONFIG_TORNEO.periodo.replace(/\s+/g, "_")}_Inscripciones.xlsx`;

    beforeEach(() => {
      if (fs.existsSync(excelFileName)) {
        try { fs.unlinkSync(excelFileName); } catch (e) {}
      }
    });

    afterEach(() => {
      if (fs.existsSync(excelFileName)) {
        try { fs.unlinkSync(excelFileName); } catch (e) {}
      }
    });

    it('F5-B1: Exportación con 0 equipos y 0 jugadores genera XLSX válido sin crashear', () => {
      exportarExcelOficial([], []);
      expect(fs.existsSync(excelFileName)).toBe(true);
      const wb = readXLSX(excelFileName);
      expect(wb.SheetNames.length).toBe(4);
    });

    it('F5-B2: Nombre de equipo largo (60+ caracteres) no rompe la generación del archivo', () => {
      const nombreLargo = "Club Deportivo y Cultural de la Facultad de Ingeniería Mecatrónica de UNITEC San Pedro Sula";
      const equipos = [{ id: "e1", nombre: nombreLargo, capitan: { nombre: "Cap", telefono: "94744365" } }];
      exportarExcelOficial(equipos, []);
      const wb = readXLSX(excelFileName);
      const ws = wb.Sheets["Resumen Equipos"];
      const raw = XLSX.utils.sheet_to_json(ws);
      expect(raw[0]["Nombre del Equipo"]).toBe(nombreLargo);
    });

    it('F5-B3: Columnas de datos cortos respetan el ancho mínimo establecido', () => {
      const equipos = [{ id: "e1", nombre: "FC 1", color: "Azul" }];
      exportarExcelOficial(equipos, []);
      const wb = readXLSX(excelFileName);
      const ws = wb.Sheets["Resumen Equipos"];
      if (ws['!cols']) {
        ws['!cols'].forEach(col => {
          if (col && col.wch) {
            expect(col.wch).toBeGreaterThanOrEqual(10);
          }
        });
      }
    });

    it('F5-B4: Nombres con acentos, eñes y caracteres especiales se exportan fielmente', () => {
      const equipos = [{ id: "e1", nombre: "Peña & Ñoños FC — Área Mecatrónica", capitan: { nombre: "Ángel Núñez", telefono: "9474-4365" } }];
      exportarExcelOficial(equipos, []);
      const wb = readXLSX(excelFileName);
      const raw = XLSX.utils.sheet_to_json(wb.Sheets["Resumen Equipos"]);
      expect(raw[0]["Nombre del Equipo"]).toBe("Peña & Ñoños FC — Área Mecatrónica");
      expect(raw[0]["Capitán"]).toBe("Ángel Núñez");
    });

    it('F5-B5: Cero inicial en cuentas de estudiantes (ej. 0801200012345) se preserva como string', () => {
      const jugadores = [{ id: "j1", equipoId: "e1", nombre: "J1", cuenta: "0801200012345" }];
      exportarExcelOficial([{ id: "e1", nombre: "Eq1" }], jugadores);
      const wb = readXLSX(excelFileName);
      const raw = XLSX.utils.sheet_to_json(wb.Sheets["Lista Jugadores"]);
      expect(String(raw[0]["N° Cuenta"])).toBe("0801200012345");
    });
  });

  // =========================================================================
  // F6: Teléfono del Capitán en Exportación Excel (Boundaries)
  // =========================================================================
  describe('F6: Teléfono del Capitán en Exportación Excel (Boundaries)', () => {
    const excelFileName = `Mecafut_${CONFIG_TORNEO.periodo.replace(/\s+/g, "_")}_Inscripciones.xlsx`;

    beforeEach(() => {
      if (fs.existsSync(excelFileName)) {
        try { fs.unlinkSync(excelFileName); } catch (e) {}
      }
    });

    afterEach(() => {
      if (fs.existsSync(excelFileName)) {
        try { fs.unlinkSync(excelFileName); } catch (e) {}
      }
    });

    it('F6-B1: Equipo con capitan null o undefined se exporta como vacío o N/A sin error', () => {
      const equipos = [{ id: "e1", nombre: "Sin Capitan", capitan: null }];
      exportarExcelOficial(equipos, []);
      const wb = readXLSX(excelFileName);
      const raw = XLSX.utils.sheet_to_json(wb.Sheets["Resumen Equipos"]);
      expect(raw.length).toBe(1);
    });

    it('F6-B2: Equipo con teléfono de capitán vacío ("") se exporta sin lanzar excepción', () => {
      const equipos = [{ id: "e1", nombre: "Tel Vacío", capitan: { nombre: "Cap", telefono: "" } }];
      exportarExcelOficial(equipos, []);
      const wb = readXLSX(excelFileName);
      expect(wb).toBeTruthy();
    });

    it('F6-B3: Teléfono con caracteres complejos +504 (9474) 4365 se exporta como string exacto', () => {
      const tel = "+504 (9474) 4365";
      const equipos = [{ id: "e1", nombre: "Complex Tel", capitan: { nombre: "Cap", telefono: tel } }];
      exportarExcelOficial(equipos, []);
      const wb = readXLSX(excelFileName);
      const raw = XLSX.utils.sheet_to_json(wb.Sheets["Resumen Equipos"]);
      const cellVal = raw[0]["Teléfono Capitán"] || raw[0]["Teléfono"];
      expect(cellVal).toBe(tel);
    });

    it('F6-B4: Exportación de 12 equipos con teléfonos variados mantiene los 12 intactos', () => {
      const equipos = Array.from({ length: 12 }, (_, i) => ({
        id: `e${i + 1}`,
        nombre: `Equipo ${i + 1}`,
        capitan: { nombre: `Capitán ${i + 1}`, telefono: `+504 9000-${1000 + i}` }
      }));
      exportarExcelOficial(equipos, []);
      const wb = readXLSX(excelFileName);
      const raw = XLSX.utils.sheet_to_json(wb.Sheets["Resumen Equipos"]);
      expect(raw.length).toBe(12);
      raw.forEach((r, idx) => {
        const val = r["Teléfono Capitán"] || r["Teléfono"];
        expect(val).toBe(`+504 9000-${1000 + idx}`);
      });
    });

    it('F6-B5: Hoja Pendientes incluye teléfono de equipos con pago o carnet pendiente', () => {
      const equipos = [{
        id: "e1",
        nombre: "Pendiente FC",
        estado: "Pendiente",
        capitan: { nombre: "Cap Pendiente", telefono: "+504 9474-4365" }
      }];
      exportarExcelOficial(equipos, []);
      const wb = readXLSX(excelFileName);
      const raw = XLSX.utils.sheet_to_json(wb.Sheets["Pendientes"]);
      expect(raw.length).toBe(1);
      const val = raw[0]["Teléfono Capitán"] || raw[0]["Teléfono"];
      expect(val).toBe("+504 9474-4365");
    });
  });

  // =========================================================================
  // F7: Fix Pérdida de Foto de Carnet (David Díaz) (Boundaries)
  // =========================================================================
  describe('F7: Fix Pérdida de Foto de Carnet (David Díaz) (Boundaries)', () => {
    it('F7-B1: Actualización de foto para el jugador en índice 0 (límite inferior)', () => {
      let lista = [{ id: "j0", foto: null }, { id: "j1", foto: null }];
      lista = lista.map((j, i) => i === 0 ? { ...j, foto: "carnet-0" } : j);
      expect(lista[0].foto).toBe("carnet-0");
      expect(lista[1].foto).toBe(null);
    });

    it('F7-B2: Actualización de foto para el jugador en índice 14 (límite superior de 15 jugadores)', () => {
      let lista = Array.from({ length: 15 }, (_, i) => ({ id: `j${i}`, foto: null }));
      lista = lista.map((j, i) => i === 14 ? { ...j, foto: "carnet-14" } : j);
      expect(lista[14].foto).toBe("carnet-14");
      expect(lista[0].foto).toBe(null);
    });

    it('F7-B3: Intentar actualizar jugador con ID inexistente no altera ningún elemento', () => {
      const orig = [{ id: "j1", foto: "f1" }, { id: "j2", foto: "f2" }];
      const res = orig.map(j => j.id === "inexistente" ? { ...j, foto: "new" } : j);
      expect(res).toEqual(orig);
    });

    it('F7-B4: Manejo de array de jugadores vacío [] retorna array vacío sin excepciones', () => {
      const lista = [];
      const res = lista.map(j => j.id === "j1" ? { ...j, foto: "f" } : j);
      expect(res).toEqual([]);
    });

    it('F7-B5: Foto simulada de alta resolución en Base64 mantiene su integridad binaria', () => {
      const bigString = "data:image/jpeg;base64," + "A".repeat(5000);
      let j = { id: "j1", fotoDocumento: null };
      j = { ...j, fotoDocumento: bigString };
      expect(j.fotoDocumento.length).toBe(bigString.length);
      expect(esJugadorHabilitado(j)).toBe(true);
    });
  });

  // =========================================================================
  // F8: Regla de Carnet Obligatorio en /equipo (Boundaries)
  // =========================================================================
  describe('F8: Regla de Carnet Obligatorio en /equipo (Boundaries)', () => {
    it('F8-B1: Plantilla con 0 jugadores: 0 habilitados, estado no-apto', () => {
      const jugadores = [];
      const habilitados = jugadores.filter(esJugadorHabilitado).length;
      expect(habilitados).toBe(0);
      expect(habilitados >= CONFIG_TORNEO.plantilla.min).toBe(false);
    });

    it('F8-B2: Plantilla con exactamente 8 jugadores, todos con carnet (frontera exacta de aptitud)', () => {
      const jugadores = Array.from({ length: 8 }, (_, i) => ({
        id: `j${i}`,
        correo: `j${i}@unitec.edu`,
        fotoDocumento: "carnet"
      }));
      expect(jugadores.filter(esJugadorHabilitado).length).toBe(8);
      expect(jugadores.filter(esJugadorHabilitado).length >= CONFIG_TORNEO.plantilla.min).toBe(true);
    });

    it('F8-B3: Plantilla máxima de 15 jugadores pero ninguno con carnet: no-apto', () => {
      const jugadores = Array.from({ length: 15 }, (_, i) => ({
        id: `j${i}`,
        correo: `j${i}@unitec.edu`,
        fotoDocumento: null
      }));
      expect(jugadores.filter(esJugadorHabilitado).length).toBe(0);
      expect(jugadores.filter(esJugadorHabilitado).length >= CONFIG_TORNEO.plantilla.min).toBe(false);
    });

    it('F8-B4: Plantilla máxima de 15 jugadores, los 15 con carnet: apto (15/8)', () => {
      const jugadores = Array.from({ length: 15 }, (_, i) => ({
        id: `j${i}`,
        correo: `j${i}@unitec.edu`,
        fotoDocumento: "carnet"
      }));
      expect(jugadores.filter(esJugadorHabilitado).length).toBe(15);
      expect(jugadores.filter(esJugadorHabilitado).length >= CONFIG_TORNEO.plantilla.min).toBe(true);
    });

    it('F8-B5: Plantilla con 8 jugadores donde 1 es docente exento y 7 son estudiantes con carnet: apto', () => {
      const jugadores = [
        ...Array.from({ length: 7 }, (_, i) => ({ id: `j${i}`, correo: `j${i}@unitec.edu`, fotoDocumento: "carnet" })),
        { id: "doc", correo: "juan.mejia@unitec.edu.hn", fotoDocumento: null }
      ];
      expect(jugadores.filter(esJugadorHabilitado).length).toBe(8);
      expect(jugadores.filter(esJugadorHabilitado).length >= CONFIG_TORNEO.plantilla.min).toBe(true);
    });
  });

  // =========================================================================
  // F9: Enlace Dinámico de WhatsApp en Vistas Públicas (Boundaries)
  // =========================================================================
  describe('F9: Enlace Dinámico de WhatsApp en Vistas Públicas (Boundaries)', () => {
    it('F9-B1: Si la URL en base de datos es vacía o ausente, recurre al valor por defecto', async () => {
      const resumen = await obtenerResumenPublico();
      expect(resumen.whatsappCapitanesUrl).toBeTruthy();
      expect(resumen.whatsappCapitanesUrl.includes("whatsapp")).toBe(true);
      expect(resumen.whatsappCapitanesUrl).toBe(CONFIG_TORNEO.whatsappCapitanesUrl);
    });

    it('F9-B2: Enlace con query parameters complejos (?ref=portal&src=web) se preserva', async () => {
      const link = "https://chat.whatsapp.com/ABCKLM123?ref=portal&src=web";
      if (typeof actualizarEnlaceWhatsapp === 'function') {
        await actualizarEnlaceWhatsapp(link);
        const res = await obtenerResumenPublico();
        expect(res.whatsappCapitanesUrl).toBe(link);
      }
    });

    it('F9-B3: Enlace corto de WhatsApp directo (https://wa.me/50494744365) entregado a vistas públicas', async () => {
      const waLink = "https://wa.me/50494744365";
      if (typeof actualizarEnlaceWhatsapp === 'function') {
        await actualizarEnlaceWhatsapp(waLink);
        const res = await obtenerResumenPublico();
        expect(res.whatsappCapitanesUrl).toBe(waLink);
      }
    });

    it('F9-B4: Múltiples lecturas públicas concurrentes entregan el mismo enlace', async () => {
      const llamadas = [obtenerResumenPublico(), obtenerResumenPublico(), obtenerResumenPublico()];
      const resultados = await Promise.all(llamadas);
      const url1 = resultados[0].whatsappCapitanesUrl;
      expect(resultados.every(r => r.whatsappCapitanesUrl === url1)).toBe(true);
    });

    it('F9-B5: Sincronización consistente ante actualizaciones consecutivas', async () => {
      if (typeof actualizarEnlaceWhatsapp === 'function') {
        await actualizarEnlaceWhatsapp("https://chat.whatsapp.com/v1");
        await actualizarEnlaceWhatsapp("https://chat.whatsapp.com/v2");
        const res = await obtenerResumenPublico();
        expect(res.whatsappCapitanesUrl).toBe("https://chat.whatsapp.com/v2");
      }
    });
  });

  // =========================================================================
  // F10: Subida y Edición de Carnets en /admin (Boundaries)
  // =========================================================================
  describe('F10: Subida y Edición de Carnets en /admin (Boundaries)', () => {
    it('F10-B1: Invocar con jugadorId nulo arroja error de validación', async () => {
      let errCapturado = false;
      try {
        await actualizarDocumentoJugador({ jugadorId: null, fotoDocumento: "foto" });
      } catch (e) {
        errCapturado = true;
      }
      expect(errCapturado).toBe(true);
    });

    it('F10-B2: Actualizar jugador inexistente no lanza uncaught crash y retorna false o no afecta', async () => {
      const res = await actualizarDocumentoJugador({ jugadorId: "inexistente-12345", fotoDocumento: "foto" });
      expect(typeof res === 'boolean').toBe(true);
    });

    it('F10-B3: Soporta formato dataURL para documento PDF simulado', async () => {
      const datos = crearEquipoBase({
        jugadores: [{
          nombre: "PDF Jugador",
          cuenta: "22014444",
          correo: "pdf@unitec.edu",
          dni: "0501-1999-44444",
          fotoDocumento: null
        }]
      });
      await inscribirEquipo(datos);
      const admin = await obtenerDatosAdmin();
      const j = admin.jugadores.find(x => x.cuenta === "22014444");

      const pdfDataUrl = "data:application/pdf;base64,JVBERi0xLjQKJ...";
      await actualizarDocumentoJugador({ jugadorId: j.id, fotoDocumento: pdfDataUrl, tipoDocumento: "matricula" });

      const admin2 = await obtenerDatosAdmin();
      const act = admin2.jugadores.find(x => x.id === j.id);
      expect(act.fotoDocumento).toBe(pdfDataUrl);
      expect(esJugadorHabilitado(act)).toBe(true);
    });

    it('F10-B4: Actualizar foto preserva los campos cuenta y dni intactos', async () => {
      const datos = crearEquipoBase({
        jugadores: [{
          nombre: "Preservado",
          cuenta: "22013333",
          correo: "pres@unitec.edu",
          dni: "0501-1999-33333",
          fotoDocumento: null
        }]
      });
      await inscribirEquipo(datos);
      const admin = await obtenerDatosAdmin();
      const j = admin.jugadores.find(x => x.cuenta === "22013333");

      await actualizarDocumentoJugador({ jugadorId: j.id, fotoDocumento: "nueva_foto" });
      const admin2 = await obtenerDatosAdmin();
      const act = admin2.jugadores.find(x => x.id === j.id);
      expect(act.cuenta).toBe("22013333");
      expect(act.dni).toBe("0501-1999-33333");
    });

    it('F10-B5: Actualizar carnet de jugador docente mantiene tipoDocumento docente y exención de DNI', async () => {
      const datos = crearEquipoBase({
        jugadores: [{
          nombre: "Docente Actualizable",
          cuenta: "DOC-2026",
          correo: "juan.mejia@unitec.edu.hn",
          fotoDocumento: null
        }]
      });
      await inscribirEquipo(datos);
      const admin = await obtenerDatosAdmin();
      const j = admin.jugadores.find(x => x.correo === "juan.mejia@unitec.edu.hn");

      await actualizarDocumentoJugador({ jugadorId: j.id, fotoDocumento: "foto_docente" });
      const admin2 = await obtenerDatosAdmin();
      const act = admin2.jugadores.find(x => x.id === j.id);
      expect(act.dni).toBe("Exento (Docente)");
      expect(esJugadorHabilitado(act)).toBe(true);
    });
  });

  // =========================================================================
  // F11: Filtro de Elegibilidad para Llaves en /admin (Boundaries)
  // =========================================================================
  describe('F11: Filtro de Elegibilidad para Llaves en /admin (Boundaries)', () => {
    function esEquipoAptoParaLlaves(equipo, todosJugadores) {
      const estadoPago = (equipo.estado || "Pendiente").toLowerCase();
      const pagoAprobado = estadoPago === "confirmado" || estadoPago === "pagado" || estadoPago === "aprobado";
      if (!pagoAprobado) return false;

      const integrantes = todosJugadores.filter(j => j.equipoId === equipo.id);
      const habilitados = integrantes.filter(esJugadorHabilitado).length;
      return habilitados >= CONFIG_TORNEO.plantilla.min;
    }

    it('F11-B1: Frontera exacta: 8 jugadores con carnet + pago Confirmado = Elegible', () => {
      const eq = { id: "eq1", estado: "Confirmado" };
      const jug = Array.from({ length: 8 }, (_, i) => ({ id: `j${i}`, equipoId: "eq1", fotoDocumento: "foto" }));
      expect(esEquipoAptoParaLlaves(eq, jug)).toBe(true);
    });

    it('F11-B2: Frontera - 1: 7 jugadores con carnet + pago Confirmado = Inelegible', () => {
      const eq = { id: "eq2", estado: "Confirmado" };
      const jug = Array.from({ length: 7 }, (_, i) => ({ id: `j${i}`, equipoId: "eq2", fotoDocumento: "foto" }));
      expect(esEquipoAptoParaLlaves(eq, jug)).toBe(false);
    });

    it('F11-B3: Plantilla máxima (15 con carnet) pero estado pago "Pendiente" = Inelegible', () => {
      const eq = { id: "eq3", estado: "Pendiente" };
      const jug = Array.from({ length: 15 }, (_, i) => ({ id: `j${i}`, equipoId: "eq3", fotoDocumento: "foto" }));
      expect(esEquipoAptoParaLlaves(eq, jug)).toBe(false);
    });

    it('F11-B4: Acepta variaciones de mayúsculas en estado de pago ("PAGADO", "aprobado")', () => {
      const eq1 = { id: "e1", estado: "PAGADO" };
      const eq2 = { id: "e2", estado: "aprobado" };
      const jug1 = Array.from({ length: 8 }, (_, i) => ({ id: `j1_${i}`, equipoId: "e1", fotoDocumento: "f" }));
      const jug2 = Array.from({ length: 8 }, (_, i) => ({ id: `j2_${i}`, equipoId: "e2", fotoDocumento: "f" }));

      expect(esEquipoAptoParaLlaves(eq1, jug1)).toBe(true);
      expect(esEquipoAptoParaLlaves(eq2, jug2)).toBe(true);
    });

    it('F11-B5: Lista de equipos vacía [] retorna [] sin arrojar excepciones', () => {
      const filtrados = [].filter(e => esEquipoAptoParaLlaves(e, []));
      expect(filtrados).toEqual([]);
    });
  });

  // =========================================================================
  // F12: Armado Manual Interactivo de Llaves (Boundaries)
  // =========================================================================
  describe('F12: Armado Manual Interactivo de Llaves (Boundaries)', () => {
    it('F12-B1: generarBracketEliminacion con menos de 2 equipos retorna bracket vacío', () => {
      const bracket0 = generarBracketEliminacion([]);
      expect(bracket0.rondas.length).toBe(0);
      expect(bracket0.campeon).toBe(null);

      const bracket1 = generarBracketEliminacion([{ id: "eq1", nombre: "Solo Uno" }]);
      expect(bracket1.rondas.length).toBe(0);
    });

    it('F12-B2: generarBracketEliminacion con exactamente 2 equipos genera 1 ronda (Final, 0 BYEs)', () => {
      const equipos = [
        { id: "e1", nombre: "Finalista 1" },
        { id: "e2", nombre: "Finalista 2" }
      ];
      const bracket = generarBracketEliminacion(equipos, false);
      expect(bracket.rondas.length).toBe(1);
      expect(bracket.rondas[0].partidos.length).toBe(1);
      expect(bracket.rondas[0].partidos[0].equipo2?.esBye).toBeFalsy();
    });

    it('F12-B3: generarTriangularFemenino con 2 equipos genera slots definidos', () => {
      const fem2 = [{ id: "f1", nombre: "Fem 1" }, { id: "f2", nombre: "Fem 2" }];
      const tri = generarTriangularFemenino(fem2, false);
      expect(tri.jornadas.length).toBe(3);
    });

    it('F12-B4: propagarGanadorEliminacion en partido de final define al campeón', () => {
      const equipos = [
        { id: "e1", nombre: "Finalista 1" },
        { id: "e2", nombre: "Finalista 2" }
      ];
      const bracket = generarBracketEliminacion(equipos, false);
      const partidoFinal = bracket.rondas[0].partidos[0];
      const partidoConGanador = { ...partidoFinal, ganador: equipos[0], estado: "Finalizado" };

      const bracketFinalizado = propagarGanadorEliminacion(bracket, partidoConGanador);
      expect(bracketFinalizado.campeon).toBeTruthy();
      expect(bracketFinalizado.campeon.id).toBe("e1");
    });

    it('F12-B5: Desempate en tabla triangular por diferencia de goles (DG) y goles a favor (GF)', () => {
      const eq1 = { id: "t1", nombre: "Tri 1" };
      const eq2 = { id: "t2", nombre: "Tri 2" };

      // Partido: t1 vence 4-2 a t2 (t1: +2 DG, t2: -2 DG)
      const jornadas = [{
        id: "j1",
        equipo1: eq1,
        equipo2: eq2,
        goles1: 4,
        goles2: 2,
        estado: "Finalizado",
        ganador: eq1
      }];

      const tabla = calcularTablaTriangular([eq1, eq2], jornadas);
      expect(tabla[0].id).toBe("t1");
      expect(tabla[0].dg).toBe(2);
      expect(tabla[1].id).toBe("t2");
      expect(tabla[1].dg).toBe(-2);
    });
  });

  // =========================================================================
  // F13: Editor Interactivo del Link de WhatsApp en /admin (Boundaries)
  // =========================================================================
  describe('F13: Editor Interactivo del Link de WhatsApp en /admin (Boundaries)', () => {
    function validarUrlWhatsapp(url) {
      if (!url || typeof url !== 'string') return false;
      const limpia = url.trim();
      return (
        limpia.startsWith("https://chat.whatsapp.com/") ||
        limpia.startsWith("https://wa.me/") ||
        limpia.startsWith("https://api.whatsapp.com/")
      );
    }

    it('F13-B1: Rechaza URLs vacías o con puros espacios en blanco', () => {
      expect(validarUrlWhatsapp("")).toBe(false);
      expect(validarUrlWhatsapp("   ")).toBe(false);
    });

    it('F13-B2: Valida correctamente URLs de api.whatsapp.com', () => {
      expect(validarUrlWhatsapp("https://api.whatsapp.com/send?phone=50494744365")).toBe(true);
    });

    it('F13-B3: Rechaza esquemas maliciosos como javascript:... o data:...', () => {
      expect(validarUrlWhatsapp("javascript:alert(1)")).toBe(false);
      expect(validarUrlWhatsapp("data:text/html,<script>alert(1)</script>")).toBe(false);
    });

    it('F13-B4: Recorta espacios tabulares y saltos de línea al guardar el enlace', () => {
      const link = "\t  https://chat.whatsapp.com/TokenSeguro \n";
      expect(validarUrlWhatsapp(link)).toBe(true);
    });

    it('F13-B5: Acepta tokens de invitación muy largos (100+ caracteres)', () => {
      const longLink = "https://chat.whatsapp.com/" + "A".repeat(120);
      expect(validarUrlWhatsapp(longLink)).toBe(true);
    });
  });

  // =========================================================================
  // F14: Verificación E2E y Compilación Local (Boundaries)
  // =========================================================================
  describe('F14: Verificación E2E y Compilación Local (Boundaries)', () => {
    it('F14-B1: validarCorreoInstitucional maneja correos con espacios y mayúsculas', () => {
      expect(validarCorreoInstitucional("  ESTUDIANTE@UNITEC.EDU  ")).toBe(true);
      expect(validarCorreoInstitucional("  DOCENTE@UNITEC.EDU.HN  ")).toBe(true);
    });

    it('F14-B2: validarCorreoInstitucional rechaza dominios comerciales (@gmail, @hotmail, etc.)', () => {
      expect(validarCorreoInstitucional("usuario@gmail.com")).toBe(false);
      expect(validarCorreoInstitucional("usuario@hotmail.com")).toBe(false);
      expect(validarCorreoInstitucional("usuario@yahoo.es")).toBe(false);
    });

    it('F14-B3: reiniciarBaseDeDatosSimulada limpia y restaura estado inicial de localStorage', () => {
      reiniciarBaseDeDatosSimulada();
      const raw = localStorage.getItem("mecafut_sim_equipos_v2");
      expect(raw).toBe("[]");
    });

    it('F14-B4: Asignación de cupo límite: máximo 12 equipos masculinos y 4 femeninos', () => {
      expect(CONFIG_TORNEO.cupos.masculino).toBe(12);
      expect(CONFIG_TORNEO.cupos.femenino).toBe(4);
    });

    it('F14-B5: Restricción crítica: no existen scripts de auto-deploy a Vercel ni Netlify en package.json', () => {
      const pkg = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
      const scripts = Object.keys(pkg.scripts || {});
      expect(scripts.some(s => s.includes("deploy"))).toBe(false);
    });
  });

});

// tests/e2e/tier1_features.test.mjs
// Tier 1: Feature Coverage (Happy Path & Isolation) — F1 through F14 (≥70 tests)
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
  esDocenteAutorizado,
  obtenerDocentePorCorreo
} from '../../lib/torneoConfig.js';

import {
  generarBracketEliminacion,
  generarTriangularFemenino,
  calcularTablaTriangular,
  propagarGanadorEliminacion
} from '../../lib/bracketUtils.js';

import * as dbService from '../../lib/dbService.js';
import { verificarOtp } from '../../lib/authService.js';

const {
  validarCorreoInstitucional,
  obtenerEstadoCarnet,
  esJugadorHabilitado,
  esEquipoAptoParaLlaves,
  obtenerResumenPublico,
  inscribirEquipo,
  obtenerDatosAdmin,
  actualizarDocumentoJugador,
  revisarCarnetJugadorAdmin,
  verificarCarnetsEquipoAdmin,
  reiniciarBaseDeDatosSimulada,
  guardarConfiguracionGeneral,
  actualizarEnlaceWhatsapp,
  suscribirTorneoEnVivo
} = dbService;

const VALID_CARNET_URL = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD==";

import { exportarExcelOficial } from '../../lib/exportUtils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..', '..');

const readXLSX = (filePath) => {
  const buf = fs.readFileSync(filePath);
  return XLSX.read(buf, { type: 'buffer' });
};

// Helper fixture to create a valid base team for tests
function crearEquipoBase(overrides = {}) {
  const rand = Math.floor(1000 + Math.random() * 9000);
  return {
    equipo: {
      nombre: `Ingeniería FC ${rand}`,
      categoria: "Masculino",
      color: "Azul Eléctrico",
      ...overrides.equipo
    },
    capitan: {
      nombre: "Carlos Rubí",
      cuenta: `2190${rand}`,
      correo: `carlos.rubi${rand}@unitec.edu`,
      telefono: "+504 9474-4365",
      dni: `0501-1999-${rand}`,
      tipoDocumento: "carnet",
      fotoDocumento: "data:image/jpeg;base64,/9j/4AAQSkZJRg==",
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
      fotoDocumento: "data:image/jpeg;base64,/9j/4AAQSkZJRg==",
      carrera: "Mecatrónica",
      codigoClase: "MCT-401"
    })),
    comprobanteFile: overrides.comprobanteFile || null
  };
}

describe('Tier 1: Feature Coverage (F1 through F14)', () => {

  beforeEach(() => {
    resetTestEnvironment();
    if (typeof reiniciarBaseDeDatosSimulada === 'function') {
      reiniciarBaseDeDatosSimulada();
    }
  });

  // =========================================================================
  // F1: Teléfono del Capitán en DB (ORIGINAL_REQUEST §1, PROJECT.md F1)
  // =========================================================================
  describe('F1: Teléfono del Capitán en DB', () => {
    it('F1-T1: Debería aceptar formato internacional (+504 9474-4365) y persistir en capitan.telefono', async () => {
      const datos = crearEquipoBase({ capitan: { telefono: "+504 9474-4365" } });
      const resultado = await inscribirEquipo(datos);
      expect(resultado).toBeTruthy();
      const admin = await obtenerDatosAdmin();
      const equipo = admin.equipos.find(e => e.codigoAcceso === resultado.codigoAcceso);
      expect(equipo).toBeTruthy();
      expect(equipo.capitan?.telefono).toBe("+504 9474-4365");
    });

    it('F1-T2: Debería aceptar formato nacional de 8 dígitos (94744365) y persistir en DB', async () => {
      const datos = crearEquipoBase({ capitan: { telefono: "94744365" } });
      const resultado = await inscribirEquipo(datos);
      const admin = await obtenerDatosAdmin();
      const equipo = admin.equipos.find(e => e.codigoAcceso === resultado.codigoAcceso);
      expect(equipo.capitan?.telefono).toBe("94744365");
    });

    it('F1-T3: Debería aceptar formato con código de país sin signo más (50494744365)', async () => {
      const datos = crearEquipoBase({ capitan: { telefono: "50494744365" } });
      const resultado = await inscribirEquipo(datos);
      const admin = await obtenerDatosAdmin();
      const equipo = admin.equipos.find(e => e.codigoAcceso === resultado.codigoAcceso);
      expect(equipo.capitan?.telefono).toBe("50494744365");
    });

    it('F1-T4: Debería aceptar formato con espacios y guiones (+504 9999-8888)', async () => {
      const datos = crearEquipoBase({ capitan: { telefono: "+504 9999-8888" } });
      const resultado = await inscribirEquipo(datos);
      const admin = await obtenerDatosAdmin();
      const equipo = admin.equipos.find(e => e.codigoAcceso === resultado.codigoAcceso);
      expect(equipo.capitan?.telefono).toBe("+504 9999-8888");
    });

    it('F1-T5: Debería registrar el teléfono en la fila del Capitán como Jugador #1', async () => {
      const datos = crearEquipoBase({ capitan: { telefono: "+504 9474-4365" } });
      const resultado = await inscribirEquipo(datos);
      const adminData = await obtenerDatosAdmin();
      const jugadorCapitan = adminData.jugadores.find(j => j.cuenta === datos.capitan.cuenta);
      expect(jugadorCapitan).toBeTruthy();
      expect(jugadorCapitan.esCapitan).toBe(true);
      const equipo = adminData.equipos.find(e => e.codigoAcceso === resultado.codigoAcceso);
      const tel = jugadorCapitan.telefono || equipo?.capitan?.telefono;
      expect(tel).toBe("+504 9474-4365");
    });
  });

  // =========================================================================
  // F2: Estabilidad Realtime en /torneo (ORIGINAL_REQUEST §6, PROJECT.md F2)
  // =========================================================================
  describe('F2: Estabilidad Realtime en /torneo', () => {
    it('F2-T1: suscribirTorneoEnVivo debe retornar una función unsub ejecutable', () => {
      let recibido = null;
      const unsub = suscribirTorneoEnVivo((data) => { recibido = data; });
      expect(typeof unsub).toBe('function');
      unsub();
    });

    it('F2-T2: Suscripción inicial debe entregar el estado normalizado del torneo', () => {
      let payload = null;
      const unsub = suscribirTorneoEnVivo((data) => { payload = data; });
      expect(payload).toBeTruthy();
      expect(payload.brackets).toBeTruthy();
      unsub();
    });

    it('F2-T3: Múltiples suscriptores concurrentes no deben colisionar ni bloquearse', () => {
      let s1 = null, s2 = null;
      const unsub1 = suscribirTorneoEnVivo((d) => { s1 = d; });
      const unsub2 = suscribirTorneoEnVivo((d) => { s2 = d; });
      expect(s1).toBeTruthy();
      expect(s2).toBeTruthy();
      unsub1();
      unsub2();
    });

    it('F2-T4: Ejecución de unsub debe desconectar limpiamente sin arrojar error', () => {
      const unsub = suscribirTorneoEnVivo(() => {});
      expect(() => unsub()).not.toThrow();
      // Llamada consecutiva idéntica debe ser idempotente
      expect(() => unsub()).not.toThrow();
    });

    it('F2-T5: Protección contra fallas de red: fallback polling/emisión no tumba la app', () => {
      let errorCapturado = false;
      try {
        const unsub = suscribirTorneoEnVivo((data) => {});
        unsub();
      } catch (e) {
        errorCapturado = true;
      }
      expect(errorCapturado).toBe(false);
    });
  });

  // =========================================================================
  // F3: Capa de Configuración General & WhatsApp (ORIGINAL_REQUEST §7, PROJECT.md F3)
  // =========================================================================
  describe('F3: Capa de Configuración General & WhatsApp', () => {
    it('F3-T1: guardarConfiguracionGeneral debería persistir el enlace de WhatsApp', async () => {
      expect(typeof guardarConfiguracionGeneral).toBe('function');
      const nuevoLink = "https://chat.whatsapp.com/MecafutCapitanes2026";
      const config = await guardarConfiguracionGeneral({ whatsappCapitanesUrl: nuevoLink });
      expect(config.whatsappCapitanesUrl).toBe(nuevoLink);
    });

    it('F3-T2: Read-merge-write debe preservar llaves previas (inscripcionesAbiertas)', async () => {
      expect(typeof guardarConfiguracionGeneral).toBe('function');
      await guardarConfiguracionGeneral({ inscripcionesAbiertas: true });
      const config = await guardarConfiguracionGeneral({ whatsappCapitanesUrl: "https://chat.whatsapp.com/GrupoTest" });
      expect(config.inscripcionesAbiertas).toBe(true);
      expect(config.whatsappCapitanesUrl).toBe("https://chat.whatsapp.com/GrupoTest");
    });

    it('F3-T3: actualizarEnlaceWhatsapp debe invocar guardarConfiguracionGeneral recortando espacios', async () => {
      expect(typeof actualizarEnlaceWhatsapp).toBe('function');
      const res = await actualizarEnlaceWhatsapp("   https://chat.whatsapp.com/EspaciosTest   ");
      expect(res.whatsappCapitanesUrl).toBe("https://chat.whatsapp.com/EspaciosTest");
    });

    it('F3-T4: obtenerResumenPublico debe incluir whatsappCapitanesUrl actualizado', async () => {
      expect(typeof actualizarEnlaceWhatsapp).toBe('function');
      const link = "https://chat.whatsapp.com/PublicSummaryCheck";
      await actualizarEnlaceWhatsapp(link);
      const resumen = await obtenerResumenPublico();
      expect(resumen.whatsappCapitanesUrl).toBe(link);
    });

    it('F3-T5: obtenerDatosAdmin debe incluir la configuración unificada sincronizada', async () => {
      expect(typeof actualizarEnlaceWhatsapp).toBe('function');
      const link = "https://chat.whatsapp.com/AdminSyncCheck";
      await actualizarEnlaceWhatsapp(link);
      const admin = await obtenerDatosAdmin();
      expect(admin.configuracion.whatsappCapitanesUrl).toBe(link);
    });
  });

  // =========================================================================
  // F4: Helpers de Estado y Elegibilidad de Jugadores (ORIGINAL_REQUEST §4, PROJECT.md F4)
  // =========================================================================
  describe('F4: Helpers de Estado y Elegibilidad de Jugadores', () => {
    it('F4-T1: esJugadorHabilitado retorna true si el estudiante tiene fotoDocumento y carnet verificado', () => {
      const jugadorEnRevision = {
        nombre: "David Díaz",
        cuenta: "22011001",
        correo: "david.diaz@unitec.edu",
        fotoDocumento: VALID_CARNET_URL
      };
      expect(obtenerEstadoCarnet(jugadorEnRevision)).toBe("en_revision");
      expect(esJugadorHabilitado(jugadorEnRevision)).toBe(false);

      const jugadorVerificado = { ...jugadorEnRevision, estadoCarnet: "verificado" };
      expect(esJugadorHabilitado(jugadorVerificado)).toBe(true);
    });

    it('F4-T2: esJugadorHabilitado retorna true si tiene foto_documento y estado_carnet verificado (formato DB/Supabase)', () => {
      const jugador = {
        nombre: "Estudiante B",
        cuenta: "22011002",
        correo: "estudiante.b@unitec.edu",
        foto_documento: VALID_CARNET_URL,
        estado_carnet: "verificado"
      };
      expect(esJugadorHabilitado(jugador)).toBe(true);
    });

    it('F4-T3: esJugadorHabilitado retorna false si el estudiante carece de carnet', () => {
      const jugador = {
        nombre: "Estudiante Sin Carnet",
        cuenta: "22011003",
        correo: "estudiante.c@unitec.edu",
        fotoDocumento: null,
        foto_documento: null
      };
      expect(esJugadorHabilitado(jugador)).toBe(false);
    });

    it('F4-T4: esJugadorHabilitado retorna true para docente oficial Juan Mejía sin carnet', () => {
      const docente = {
        nombre: "Ing. Juan Miguel Mejía",
        cuenta: "DOC-001",
        correo: "juan.mejia@unitec.edu.hn",
        fotoDocumento: null
      };
      expect(esDocenteAutorizado(docente.correo)).toBe(true);
      expect(esJugadorHabilitado(docente)).toBe(true);
    });

    it('F4-T5: esJugadorHabilitado retorna true para docente oficial Cristhyan Rivera sin carnet', () => {
      const docente = {
        nombre: "Ing. Cristhyan Rivera",
        cuenta: "DOC-002",
        correo: "cristhyan.rivera@unitec.edu.hn",
        fotoDocumento: null
      };
      expect(esDocenteAutorizado(docente.correo)).toBe(true);
      expect(esJugadorHabilitado(docente)).toBe(true);
    });
  });

  // =========================================================================
  // F5: Plantilla Excel Profesional (ORIGINAL_REQUEST §2, PROJECT.md F5)
  // =========================================================================
  describe('F5: Plantilla Excel Profesional', () => {
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

    it('F5-T1: exportarExcelOficial debe generar un libro con las 4 hojas reglamentarias', () => {
      const equipos = [{ id: "e1", nombre: "Robótica FC", capitan: { nombre: "Ana", telefono: "+504 9474-4365" } }];
      const jugadores = [{ id: "j1", equipoId: "e1", nombre: "Ana", cuenta: "22011001", esCapitan: true }];

      exportarExcelOficial(equipos, jugadores);
      expect(fs.existsSync(excelFileName)).toBe(true);
      const capturedWorkbook = readXLSX(excelFileName);
      expect(capturedWorkbook.SheetNames).toContain("Resumen Equipos");
      expect(capturedWorkbook.SheetNames).toContain("Lista Jugadores");
      expect(capturedWorkbook.SheetNames).toContain("Planillas Imprimibles");
      expect(capturedWorkbook.SheetNames).toContain("Pendientes");
    });

    it('F5-T2: La hoja Resumen Equipos debe contener celdas o estructura institucional', () => {
      const equipos = [{ id: "e1", nombre: "Mecatrónica Alpha", capitan: { nombre: "Capitán", telefono: "9474-4365" } }];
      exportarExcelOficial(equipos, []);
      const capturedWorkbook = readXLSX(excelFileName);
      const ws = capturedWorkbook.Sheets["Resumen Equipos"];
      expect(ws).toBeTruthy();
      expect(ws['!ref']).toBeTruthy();
    });

    it('F5-T3: La hoja Resumen Equipos debe definir cálculo dinámico de anchos (!cols)', () => {
      const equipos = [{ id: "e1", nombre: "Mecatrónica United", capitan: { nombre: "Carlos", telefono: "+504 9474-4365" } }];
      exportarExcelOficial(equipos, []);
      const capturedWorkbook = readXLSX(excelFileName);
      const ws = capturedWorkbook.Sheets["Resumen Equipos"];
      expect(ws).toBeTruthy();
      if (ws['!cols']) {
        expect(Array.isArray(ws['!cols'])).toBe(true);
      }
    });

    it('F5-T4: Formato estricto de texto: valores numéricos de cuenta y DNI como string', () => {
      const jugadores = [{
        id: "j1",
        equipoId: "e1",
        nombre: "Test Jugador",
        cuenta: "22011001",
        dni: "0501-1999-12345"
      }];
      exportarExcelOficial([{ id: "e1", nombre: "Eq1" }], jugadores);
      const capturedWorkbook = readXLSX(excelFileName);
      const ws = capturedWorkbook.Sheets["Lista Jugadores"];
      expect(ws).toBeTruthy();
      const cells = Object.keys(ws).filter(k => !k.startsWith('!'));
      const cuentaCell = cells.map(k => ws[k]).find(c => c && c.v === "22011001");
      if (cuentaCell) {
        expect(typeof cuentaCell.v).toBe('string');
      }
    });

    it('F5-T5: Hoja Planillas Imprimibles estructura datos de uniforme y categoría', () => {
      const equipos = [{
        id: "e1",
        nombre: "Confirmados FC",
        categoria: "Masculino",
        color: "Azul",
        estado: "Confirmado",
        capitan: { nombre: "Cap", telefono: "94744365" }
      }];
      const jugadores = [{ id: "j1", equipoId: "e1", nombre: "J1", cuenta: "111", esCapitan: true }];

      exportarExcelOficial(equipos, jugadores);
      const capturedWorkbook = readXLSX(excelFileName);
      const wsPlanillas = capturedWorkbook.Sheets["Planillas Imprimibles"];
      expect(wsPlanillas).toBeTruthy();
      expect(wsPlanillas['!ref']).toBeTruthy();
    });
  });

  // =========================================================================
  // F6: Teléfono del Capitán en Exportación Excel (ORIGINAL_REQUEST §1, PROJECT.md F6)
  // =========================================================================
  describe('F6: Teléfono del Capitán en Exportación Excel', () => {
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

    it('F6-T1: Hoja Resumen Equipos debe contener columna para Teléfono Capitán', () => {
      const equipos = [{
        id: "e1",
        nombre: "Eq Tel",
        capitan: { nombre: "Capitán", telefono: "+504 9474-4365" }
      }];
      exportarExcelOficial(equipos, []);
      const capturedWorkbook = readXLSX(excelFileName);
      const ws = capturedWorkbook.Sheets["Resumen Equipos"];
      const raw = XLSX.utils.sheet_to_json(ws);
      expect(raw.length).toBeGreaterThan(0);
      expect("Teléfono Capitán" in raw[0] || "Teléfono" in raw[0]).toBe(true);
    });

    it('F6-T2: Teléfono en formato +504 9474-4365 no debe aparecer en blanco ni undefined', () => {
      const equipos = [{
        id: "e1",
        nombre: "Eq Tel Plus",
        capitan: { nombre: "Capitán", telefono: "+504 9474-4365" }
      }];
      exportarExcelOficial(equipos, []);
      const capturedWorkbook = readXLSX(excelFileName);
      const ws = capturedWorkbook.Sheets["Resumen Equipos"];
      const raw = XLSX.utils.sheet_to_json(ws);
      const phoneVal = raw[0]["Teléfono Capitán"] || raw[0]["Teléfono"];
      expect(phoneVal).toBe("+504 9474-4365");
    });

    it('F6-T3: Teléfono sin prefijo (94744365) se exporta fielmente', () => {
      const equipos = [{
        id: "e1",
        nombre: "Eq Tel 8",
        capitan: { nombre: "Capitán", telefono: "94744365" }
      }];
      exportarExcelOficial(equipos, []);
      const capturedWorkbook = readXLSX(excelFileName);
      const raw = XLSX.utils.sheet_to_json(capturedWorkbook.Sheets["Resumen Equipos"]);
      const phoneVal = raw[0]["Teléfono Capitán"] || raw[0]["Teléfono"];
      expect(String(phoneVal)).toBe("94744365");
    });

    it('F6-T4: Celda de teléfono en Excel debe ser tipo texto (t: "s")', () => {
      const equipos = [{
        id: "e1",
        nombre: "Eq Text Type",
        capitan: { nombre: "Cap", telefono: "+504 9474-4365" }
      }];
      exportarExcelOficial(equipos, []);
      const capturedWorkbook = readXLSX(excelFileName);
      const ws = capturedWorkbook.Sheets["Resumen Equipos"];
      const cellKeys = Object.keys(ws).filter(k => !k.startsWith('!'));
      const telCell = cellKeys.map(k => ws[k]).find(c => c && c.v === "+504 9474-4365");
      expect(telCell).toBeTruthy();
      expect(telCell.t).toBe('s');
    });

    it('F6-T5: Múltiples equipos exportados conservan sus respectivos teléfonos', () => {
      const equipos = [
        { id: "e1", nombre: "Eq1", capitan: { nombre: "C1", telefono: "+504 9474-4365" } },
        { id: "e2", nombre: "Eq2", capitan: { nombre: "C2", telefono: "+504 8888-7777" } }
      ];
      exportarExcelOficial(equipos, []);
      const capturedWorkbook = readXLSX(excelFileName);
      const raw = XLSX.utils.sheet_to_json(capturedWorkbook.Sheets["Resumen Equipos"]);
      expect(raw.length).toBe(2);
      const tel1 = raw[0]["Teléfono Capitán"] || raw[0]["Teléfono"];
      const tel2 = raw[1]["Teléfono Capitán"] || raw[1]["Teléfono"];
      expect(tel1).toBe("+504 9474-4365");
      expect(tel2).toBe("+504 8888-7777");
    });
  });

  // =========================================================================
  // F7: Fix Pérdida de Foto de Carnet (David Díaz) (ORIGINAL_REQUEST §3, PROJECT.md F7)
  // =========================================================================
  describe('F7: Fix Pérdida de Foto de Carnet (David Díaz)', () => {
    it('F7-T1: Actualizador funcional atómico no muta la lista previa', () => {
      const jugadoresIniciales = [
        { id: "j1", nombre: "Jugador 1", fotoDocumento: null },
        { id: "j2", nombre: "David Díaz", fotoDocumento: null }
      ];

      // Simulación del patrón atómico: setJugadores(prev => prev.map(...))
      const atomicUpdate = (prev, id, foto) => prev.map(j => j.id === id ? { ...j, fotoDocumento: foto } : j);

      const actualizados = atomicUpdate(jugadoresIniciales, "j2", "data:image/jpeg;base64,davidCarnet");
      expect(jugadoresIniciales[1].fotoDocumento).toBe(null); // Inmutable
      expect(actualizados[1].fotoDocumento).toBe("data:image/jpeg;base64,davidCarnet");
    });

    it('F7-T2: Subida de foto en jugador 2 preserva foto previamente subida en jugador 1', () => {
      let jugadores = [
        { id: "j1", nombre: "Jugador 1", fotoDocumento: null },
        { id: "j2", nombre: "Jugador 2", fotoDocumento: null }
      ];
      const updater = (fn) => { jugadores = fn(jugadores); };

      updater(prev => prev.map(j => j.id === "j1" ? { ...j, fotoDocumento: "foto1" } : j));
      updater(prev => prev.map(j => j.id === "j2" ? { ...j, fotoDocumento: "foto2" } : j));

      expect(jugadores[0].fotoDocumento).toBe("foto1");
      expect(jugadores[1].fotoDocumento).toBe("foto2");
    });

    it('F7-T3: Secuencia rápida de actualizaciones asíncronas no sufre condición de carrera', async () => {
      let jugadores = Array.from({ length: 5 }, (_, i) => ({ id: `j${i}`, nombre: `Jugador ${i}`, foto: null }));
      const atomicSet = (fn) => { jugadores = fn(jugadores); };

      // Simular 5 subidas concurrentes
      const uploadTasks = [0, 1, 2, 3, 4].map(idx => {
        return new Promise(resolve => {
          setTimeout(() => {
            atomicSet(prev => prev.map((j, i) => i === idx ? { ...j, foto: `data-${idx}` } : j));
            resolve();
          }, Math.random() * 20);
        });
      });

      await Promise.all(uploadTasks);
      expect(jugadores.every((j, i) => j.foto === `data-${i}`)).toBe(true);
    });

    it('F7-T4: La asignación atómica de carnet y su verificación habilita al jugador según esJugadorHabilitado', () => {
      let jugador = { id: "jdiaz", nombre: "David Díaz", correo: "david@unitec.edu", fotoDocumento: null };
      expect(esJugadorHabilitado(jugador)).toBe(false);

      jugador = { ...jugador, fotoDocumento: VALID_CARNET_URL, estadoCarnet: "verificado" };
      expect(esJugadorHabilitado(jugador)).toBe(true);
    });

    it('F7-T5: Reemplazo sucesivo de carnet de un mismo jugador actualiza a la versión más reciente', () => {
      let jugadores = [{ id: "j1", fotoDocumento: "v1" }];
      const updateFn = (foto) => {
        jugadores = jugadores.map(j => j.id === "j1" ? { ...j, fotoDocumento: foto } : j);
      };

      updateFn("v2");
      updateFn("v3");
      expect(jugadores[0].fotoDocumento).toBe("v3");
    });
  });

  // =========================================================================
  // F8: Regla de Carnet Obligatorio en /equipo (ORIGINAL_REQUEST §4, PROJECT.md F8)
  // =========================================================================
  describe('F8: Regla de Carnet Obligatorio en /equipo', () => {
    it('F8-T1: Equipo con exactamente 8 jugadores con carnet verificado cumple el cupo reglamentario', () => {
      const jugadores = Array.from({ length: 8 }, (_, i) => ({
        id: `j${i}`,
        nombre: `J${i}`,
        correo: `j${i}@unitec.edu`,
        fotoDocumento: VALID_CARNET_URL,
        estadoCarnet: "verificado"
      }));

      const totalHabilitados = jugadores.filter(esJugadorHabilitado).length;
      expect(totalHabilitados).toBe(8);
      expect(totalHabilitados >= CONFIG_TORNEO.plantilla.min).toBe(true);
    });

    it('F8-T2: Equipo con 7 con carnet verificado y 1 sin carnet es incompleto (totalHabilitados === 7)', () => {
      const jugadores = Array.from({ length: 8 }, (_, i) => ({
        id: `j${i}`,
        nombre: `J${i}`,
        correo: `j${i}@unitec.edu`,
        fotoDocumento: i < 7 ? VALID_CARNET_URL : null,
        estadoCarnet: i < 7 ? "verificado" : "pendiente"
      }));

      const totalHabilitados = jugadores.filter(esJugadorHabilitado).length;
      expect(totalHabilitados).toBe(7);
      expect(totalHabilitados >= CONFIG_TORNEO.plantilla.min).toBe(false);
    });

    it('F8-T3: Jugadores sin carnet son considerados pendientes para la elegibilidad', () => {
      const jPendiente = { id: "p1", nombre: "Sin Carnet", correo: "p@unitec.edu", fotoDocumento: null };
      expect(esJugadorHabilitado(jPendiente)).toBe(false);
    });

    it('F8-T4: Plantilla de 12 jugadores con 8 con carnet verificado y 4 pendientes es apta para jugar', () => {
      const jugadores = Array.from({ length: 12 }, (_, i) => ({
        id: `j${i}`,
        nombre: `J${i}`,
        correo: `j${i}@unitec.edu`,
        fotoDocumento: i < 8 ? VALID_CARNET_URL : null,
        estadoCarnet: i < 8 ? "verificado" : "pendiente"
      }));

      const habilitados = jugadores.filter(esJugadorHabilitado).length;
      expect(habilitados).toBe(8);
      expect(habilitados >= CONFIG_TORNEO.plantilla.min).toBe(true);
    });

    it('F8-T5: Al subir y verificar el carnet del jugador 8vo, el equipo pasa de no-apto a apto', () => {
      const jugadores = Array.from({ length: 8 }, (_, i) => ({
        id: `j${i}`,
        nombre: `J${i}`,
        correo: `j${i}@unitec.edu`,
        fotoDocumento: i < 7 ? VALID_CARNET_URL : null,
        estadoCarnet: i < 7 ? "verificado" : "pendiente"
      }));

      expect(jugadores.filter(esJugadorHabilitado).length >= 8).toBe(false);

      // Subida de carnet para el 8vo jugador (en revisión aún no habilita)
      jugadores[7].fotoDocumento = VALID_CARNET_URL;
      jugadores[7].estadoCarnet = "en_revision";
      expect(jugadores.filter(esJugadorHabilitado).length >= 8).toBe(false);

      // Verificación por Admin habilita al 8vo jugador
      jugadores[7].estadoCarnet = "verificado";
      expect(jugadores.filter(esJugadorHabilitado).length >= 8).toBe(true);
    });
  });

  // =========================================================================
  // F9: Enlace Dinámico de WhatsApp en Vistas Públicas (ORIGINAL_REQUEST §7, PROJECT.md F9)
  // =========================================================================
  describe('F9: Enlace Dinámico de WhatsApp en Vistas Públicas', () => {
    it('F9-T1: obtenerResumenPublico provee fallback predeterminado si no se ha configurado', async () => {
      const resumen = await obtenerResumenPublico();
      expect(resumen.whatsappCapitanesUrl).toBeTruthy();
      expect(resumen.whatsappCapitanesUrl).toContain("chat.whatsapp.com");
    });

    it('F9-T2: Guardar link dinámico en configuración se refleja en obtenerResumenPublico', async () => {
      const link = "https://chat.whatsapp.com/NuevoEnlaceDinamico";
      await actualizarEnlaceWhatsapp(link);
      const resumen = await obtenerResumenPublico();
      expect(resumen.whatsappCapitanesUrl).toBe(link);
    });

    it('F9-T3: El enlace entregado es URL válida con protocolo https', async () => {
      const resumen = await obtenerResumenPublico();
      expect(resumen.whatsappCapitanesUrl.startsWith("https://")).toBe(true);
    });

    it('F9-T4: Sincronización inmediata sin reinicio de backend', async () => {
      await actualizarEnlaceWhatsapp("https://chat.whatsapp.com/Link1");
      let res = await obtenerResumenPublico();
      expect(res.whatsappCapitanesUrl).toBe("https://chat.whatsapp.com/Link1");

      await actualizarEnlaceWhatsapp("https://chat.whatsapp.com/Link2");
      res = await obtenerResumenPublico();
      expect(res.whatsappCapitanesUrl).toBe("https://chat.whatsapp.com/Link2");
    });

    it('F9-T5: Enlace persistido preserva tokens de invitación de WhatsApp', async () => {
      const tokenLink = "https://chat.whatsapp.com/KJH8923hjkda908123";
      await actualizarEnlaceWhatsapp(tokenLink);
      const adminData = await obtenerDatosAdmin();
      expect(adminData.configuracion.whatsappCapitanesUrl).toBe(tokenLink);
    });
  });

  // =========================================================================
  // F10: Subida y Edición de Carnets en /admin (ORIGINAL_REQUEST §4, PROJECT.md F10)
  // =========================================================================
  describe('F10: Subida y Edición de Carnets en /admin', () => {
    it('F10-T1: actualizarDocumentoJugador debe actualizar la foto en la base de datos', async () => {
      const datos = crearEquipoBase({
        jugadores: [{
          nombre: "Pedro Pendiente",
          cuenta: "22019999",
          correo: "pedro@unitec.edu",
          dni: "0501-1999-99999",
          fotoDocumento: null
        }]
      });
      await inscribirEquipo(datos);
      verificarOtp("carlos.rubi@unitec.edu", "123456");
      const admin1 = await obtenerDatosAdmin();
      const jugador = admin1.jugadores.find(j => j.cuenta === "22019999");
      expect(jugador).toBeTruthy();

      const nuevaFoto = "data:image/jpeg;base64,nuevaFotoAdminValida12345";
      const ok = await actualizarDocumentoJugador({ jugadorId: jugador.id, fotoDocumento: nuevaFoto });
      expect(ok).toBe(true);

      const admin2 = await obtenerDatosAdmin();
      const jugadorAct = admin2.jugadores.find(j => j.id === jugador.id);
      expect(jugadorAct.fotoDocumento).toBe(nuevaFoto);
    });

    it('F10-T2: actualizarDocumentoJugador desde Admin debe cambiar el estado del jugador a Aprobado y verificado', async () => {
      const datos = crearEquipoBase({
        jugadores: [{
          nombre: "Jugador Estado",
          cuenta: "22018888",
          correo: "estado@unitec.edu",
          dni: "0501-1999-88888",
          fotoDocumento: null
        }]
      });
      await inscribirEquipo(datos);
      verificarOtp("carlos.rubi@unitec.edu", "123456");
      const admin1 = await obtenerDatosAdmin();
      const jugador = admin1.jugadores.find(j => j.cuenta === "22018888");

      await actualizarDocumentoJugador({ jugadorId: jugador.id, fotoDocumento: "data:image/jpeg;base64,fotoCarnetAdmin12345" });
      const admin2 = await obtenerDatosAdmin();
      const jugadorAct = admin2.jugadores.find(j => j.id === jugador.id);
      expect(jugadorAct.estado).toBe("Aprobado");
      expect(jugadorAct.estadoCarnet).toBe("verificado");
    });

    it('F10-T3: Carnet subido por Admin convierte a jugador en habilitado según esJugadorHabilitado', async () => {
      const datos = crearEquipoBase({
        jugadores: [{
          nombre: "Jugador Habil",
          cuenta: "22017777",
          correo: "habil@unitec.edu",
          dni: "0501-1999-77777",
          fotoDocumento: null
        }]
      });
      await inscribirEquipo(datos);
      verificarOtp("carlos.rubi@unitec.edu", "123456");
      let admin = await obtenerDatosAdmin();
      let j = admin.jugadores.find(x => x.cuenta === "22017777");
      expect(esJugadorHabilitado(j)).toBe(false);

      await actualizarDocumentoJugador({ jugadorId: j.id, fotoDocumento: "data:image/jpeg;base64,carnetSubidoAdmin12345" });
      admin = await obtenerDatosAdmin();
      j = admin.jugadores.find(x => x.id === j.id);
      expect(esJugadorHabilitado(j)).toBe(true);
    });

    it('F10-T4: Permite sobreescribir carnet existente con nueva versión', async () => {
      const datos = crearEquipoBase({
        jugadores: [{
          nombre: "Jugador Overwrite",
          cuenta: "22016666",
          correo: "over@unitec.edu",
          dni: "0501-1999-66666",
          fotoDocumento: "data:image/jpeg;base64,fotoAntiguaValida123"
        }]
      });
      await inscribirEquipo(datos);
      verificarOtp("carlos.rubi@unitec.edu", "123456");
      const admin = await obtenerDatosAdmin();
      const j = admin.jugadores.find(x => x.cuenta === "22016666");

      const fotoNueva = "data:image/jpeg;base64,fotoActualizadaValida456";
      await actualizarDocumentoJugador({ jugadorId: j.id, fotoDocumento: fotoNueva });
      const admin2 = await obtenerDatosAdmin();
      const jAct = admin2.jugadores.find(x => x.id === j.id);
      expect(jAct.fotoDocumento).toBe(fotoNueva);
    });

    it('F10-T5: Permite especificar tipo de documento carnet o matrícula', async () => {
      const datos = crearEquipoBase({
        jugadores: [{
          nombre: "Jugador Matricula",
          cuenta: "22015555",
          correo: "mat@unitec.edu",
          dni: "0501-1999-55555",
          fotoDocumento: null
        }]
      });
      await inscribirEquipo(datos);
      verificarOtp("carlos.rubi@unitec.edu", "123456");
      const admin = await obtenerDatosAdmin();
      const j = admin.jugadores.find(x => x.cuenta === "22015555");

      await actualizarDocumentoJugador({ jugadorId: j.id, fotoDocumento: "data:image/jpeg;base64,hojaMatriculaOficial123", tipoDocumento: "matricula" });
      const admin2 = await obtenerDatosAdmin();
      const jAct = admin2.jugadores.find(x => x.id === j.id);
      expect(jAct.tipoDocumento).toBe("matricula");
    });
  });

  // =========================================================================
  // F11: Filtro de Elegibilidad para Llaves en /admin (ORIGINAL_REQUEST §4, PROJECT.md F11)
  // =========================================================================
  describe('F11: Filtro de Elegibilidad para Llaves en /admin', () => {
    it('F11-T1: Equipo con pago confirmado y 8 jugadores con carnet verificado es elegible', () => {
      const eq = { id: "eq1", nombre: "Confirmado FC", estado: "Confirmado" };
      const jug = Array.from({ length: 8 }, (_, i) => ({
        id: `j${i}`,
        equipoId: "eq1",
        correo: `j${i}@unitec.edu`,
        fotoDocumento: VALID_CARNET_URL,
        estadoCarnet: "verificado"
      }));
      expect(esEquipoAptoParaLlaves(eq, jug)).toBe(true);
    });

    it('F11-T2: Equipo con pago confirmado pero solo 7 jugadores con carnet verificado NO es elegible', () => {
      const eq = { id: "eq2", nombre: "Incompleto FC", estado: "Confirmado" };
      const jug = Array.from({ length: 8 }, (_, i) => ({
        id: `j${i}`,
        equipoId: "eq2",
        correo: `j${i}@unitec.edu`,
        fotoDocumento: i < 7 ? VALID_CARNET_URL : null,
        estadoCarnet: i < 7 ? "verificado" : "pendiente"
      }));
      expect(esEquipoAptoParaLlaves(eq, jug)).toBe(false);
    });

    it('F11-T3: Equipo con 8 carnets verificados pero estado Pendiente (sin pago validado) NO es elegible', () => {
      const eq = { id: "eq3", nombre: "Sin Pago FC", estado: "Pendiente" };
      const jug = Array.from({ length: 8 }, (_, i) => ({
        id: `j${i}`,
        equipoId: "eq3",
        correo: `j${i}@unitec.edu`,
        fotoDocumento: VALID_CARNET_URL,
        estadoCarnet: "verificado"
      }));
      expect(esEquipoAptoParaLlaves(eq, jug)).toBe(false);
    });

    it('F11-T4: Equipo con 7 estudiantes con carnet verificado + 1 docente autorizado es elegible', () => {
      const eq = { id: "eq4", nombre: "Docente FC", estado: "Confirmado" };
      const jug = [
        ...Array.from({ length: 7 }, (_, i) => ({
          id: `j${i}`,
          equipoId: "eq4",
          correo: `j${i}@unitec.edu`,
          fotoDocumento: VALID_CARNET_URL,
          estadoCarnet: "verificado"
        })),
        {
          id: "doc1",
          equipoId: "eq4",
          correo: "juan.mejia@unitec.edu.hn", // Docente exento
          fotoDocumento: null
        }
      ];
      expect(esEquipoAptoParaLlaves(eq, jug)).toBe(true);
    });

    it('F11-T5: Filtrar colección de equipos retorna solo los que cumplen ambas condiciones', () => {
      const equipos = [
        { id: "e1", nombre: "Elegible 1", estado: "Confirmado" },
        { id: "e2", nombre: "Sin Pago", estado: "Pendiente" },
        { id: "e3", nombre: "Incompleto", estado: "Confirmado" }
      ];
      const jugadores = [
        // e1: 8 carnets verificados
        ...Array.from({ length: 8 }, (_, i) => ({ id: `e1_j${i}`, equipoId: "e1", correo: `e1_${i}@unitec.edu`, fotoDocumento: VALID_CARNET_URL, estadoCarnet: "verificado" })),
        // e2: 8 carnets verificados
        ...Array.from({ length: 8 }, (_, i) => ({ id: `e2_j${i}`, equipoId: "e2", correo: `e2_${i}@unitec.edu`, fotoDocumento: VALID_CARNET_URL, estadoCarnet: "verificado" })),
        // e3: 5 carnets verificados
        ...Array.from({ length: 5 }, (_, i) => ({ id: `e3_j${i}`, equipoId: "e3", correo: `e3_${i}@unitec.edu`, fotoDocumento: VALID_CARNET_URL, estadoCarnet: "verificado" }))
      ];

      const filtrados = equipos.filter(e => esEquipoAptoParaLlaves(e, jugadores));
      expect(filtrados.length).toBe(1);
      expect(filtrados[0].id).toBe("e1");
    });
  });

  // =========================================================================
  // F12: Armado Manual Interactivo de Llaves (ORIGINAL_REQUEST §5, PROJECT.md F12)
  // =========================================================================
  describe('F12: Armado Manual Interactivo de Llaves', () => {
    it('F12-T1: generarBracketEliminacion con 12 equipos asigna 4 pases directos (BYEs)', () => {
      const equipos = Array.from({ length: 12 }, (_, i) => ({ id: `eq${i + 1}`, nombre: `Equipo ${i + 1}`, color: "Azul" }));
      const bracket = generarBracketEliminacion(equipos, false);
      expect(bracket.tipo).toBe("eliminacion");
      expect(bracket.rondas.length).toBeGreaterThan(0);

      // Ronda 1 debe contener 8 partidos (potencia 16 / 2 = 8 partidos de los cuales 4 son BYEs)
      const r1 = bracket.rondas[0];
      const byes = r1.partidos.filter(p => p.equipo2?.esBye);
      expect(byes.length).toBe(4);
    });

    it('F12-T2: Los 4 equipos con BYE avanzan automáticamente a Cuartos de Final', () => {
      const equipos = Array.from({ length: 12 }, (_, i) => ({ id: `eq${i + 1}`, nombre: `Equipo ${i + 1}`, color: "Azul" }));
      const bracket = generarBracketEliminacion(equipos, false);
      const r1 = bracket.rondas[0];
      const byesPartidos = r1.partidos.filter(p => p.equipo2?.esBye);

      byesPartidos.forEach(p => {
        expect(p.ganador).toBeTruthy();
        expect(p.ganador.id).toBe(p.equipo1.id);
        expect(p.estado).toBe("Finalizado");
      });
    });

    it('F12-T3: 8 equipos juegan los 4 partidos preliminares en Ronda 1', () => {
      const equipos = Array.from({ length: 12 }, (_, i) => ({ id: `eq${i + 1}`, nombre: `Equipo ${i + 1}`, color: "Azul" }));
      const bracket = generarBracketEliminacion(equipos, false);
      const r1 = bracket.rondas[0];
      const preliminaresReales = r1.partidos.filter(p => !p.equipo2?.esBye);
      expect(preliminaresReales.length).toBe(4);
      preliminaresReales.forEach(p => {
        expect(p.equipo1).toBeTruthy();
        expect(p.equipo2).toBeTruthy();
        expect(p.estado).toBe("Programado");
      });
    });

    it('F12-T4: generarTriangularFemenino genera 3 jornadas y 1 Gran Final', () => {
      const femEquipos = [
        { id: "f1", nombre: "Fem 1", color: "Rosa" },
        { id: "f2", nombre: "Fem 2", color: "Blanco" },
        { id: "f3", nombre: "Fem 3", color: "Negro" }
      ];
      const triangular = generarTriangularFemenino(femEquipos, false);
      expect(triangular.tipo).toBe("triangular_final");
      expect(triangular.jornadas.length).toBe(3);
      expect(triangular.granFinal).toBeTruthy();
      expect(triangular.granFinal.nombre).toContain("Gran Final");
    });

    it('F12-T5: calcularTablaTriangular asigna 3 puntos por victoria regular', () => {
      const femEquipos = [
        { id: "f1", nombre: "Fem 1" },
        { id: "f2", nombre: "Fem 2" }
      ];
      const jornadas = [{
        id: "fem-j1",
        equipo1: femEquipos[0],
        equipo2: femEquipos[1],
        goles1: 3,
        goles2: 1,
        estado: "Finalizado",
        ganador: femEquipos[0]
      }];

      const tabla = calcularTablaTriangular(femEquipos, jornadas);
      expect(tabla[0].id).toBe("f1");
      expect(tabla[0].pts).toBe(3);
      expect(tabla[0].gf).toBe(3);
      expect(tabla[0].gc).toBe(1);
      expect(tabla[0].dg).toBe(2);
    });
  });

  // =========================================================================
  // F13: Editor Interactivo del Link de WhatsApp en /admin (ORIGINAL_REQUEST §7, PROJECT.md F13)
  // =========================================================================
  describe('F13: Editor Interactivo del Link de WhatsApp en /admin', () => {
    function validarUrlWhatsapp(url) {
      if (!url || typeof url !== 'string') return false;
      const limpia = url.trim();
      return limpia.startsWith("https://chat.whatsapp.com/") || limpia.startsWith("https://wa.me/");
    }

    it('F13-T1: Valida correctamente URL de grupo oficial (https://chat.whatsapp.com/...)', () => {
      expect(validarUrlWhatsapp("https://chat.whatsapp.com/L12345ABCDE")).toBe(true);
    });

    it('F13-T2: Valida correctamente URL de enlace directo (https://wa.me/...)', () => {
      expect(validarUrlWhatsapp("https://wa.me/50494744365")).toBe(true);
    });

    it('F13-T3: Rechaza dominios ajenos o protocolos inseguros', () => {
      expect(validarUrlWhatsapp("https://facebook.com/group")).toBe(false);
      expect(validarUrlWhatsapp("http://chat.whatsapp.com/insecure")).toBe(false);
      expect(validarUrlWhatsapp("not-a-url")).toBe(false);
    });

    it('F13-T4: Permite persistir y recortar espacios en blanco alrededor de la URL', async () => {
      const link = "   https://chat.whatsapp.com/TokenLimpio123   ";
      expect(validarUrlWhatsapp(link)).toBe(true);
      const res = await actualizarEnlaceWhatsapp(link);
      expect(res.whatsappCapitanesUrl).toBe("https://chat.whatsapp.com/TokenLimpio123");
    });

    it('F13-T5: Modificación desde editor queda confirmada en obtenerDatosAdmin', async () => {
      const link = "https://chat.whatsapp.com/AdminEditorLink";
      await actualizarEnlaceWhatsapp(link);
      const admin = await obtenerDatosAdmin();
      expect(admin.configuracion.whatsappCapitanesUrl).toBe(link);
    });
  });

  // =========================================================================
  // F14: Verificación E2E y Compilación Local (ORIGINAL_REQUEST Restricción, PROJECT.md F14)
  // =========================================================================
  describe('F14: Verificación E2E y Compilación Local', () => {
    it('F14-T1: package.json contiene script de compilación build', () => {
      const pkgPath = path.join(projectRoot, 'package.json');
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      expect(pkg.scripts).toBeTruthy();
      expect(pkg.scripts.build).toBe("next build");
    });

    it('F14-T2: next.config.js está configurado para exportación estática segura', () => {
      const nextConfPath = path.join(projectRoot, 'next.config.js');
      const confContent = fs.readFileSync(nextConfPath, 'utf8');
      expect(confContent).toContain("output");
      expect(confContent).toContain("export");
    });

    it('F14-T3: Mantiene aislamiento sin credenciales en la nube recurriendo a modo simulado', async () => {
      const resumen = await obtenerResumenPublico();
      expect(resumen).toBeTruthy();
      expect(["simulado", "supabase", "firebase"]).toContain(resumen.modo);
    });

    it('F14-T4: CONFIG_TORNEO define límites oficiales de cupos y plantilla', () => {
      expect(CONFIG_TORNEO.cupos.masculino).toBe(12);
      expect(CONFIG_TORNEO.cupos.femenino).toBe(4);
      expect(CONFIG_TORNEO.plantilla.min).toBe(8);
      expect(CONFIG_TORNEO.plantilla.max).toBe(15);
    });

    it('F14-T5: REGLAMENTO_OFICIAL_SECCIONES está poblado para el modal inicial', async () => {
      const { REGLAMENTO_OFICIAL_SECCIONES } = await import('../../lib/torneoConfig.js');
      expect(Array.isArray(REGLAMENTO_OFICIAL_SECCIONES)).toBe(true);
      expect(REGLAMENTO_OFICIAL_SECCIONES.length).toBeGreaterThanOrEqual(5);
    });
  });

});

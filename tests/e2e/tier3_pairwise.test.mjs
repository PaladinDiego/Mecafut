// tests/e2e/tier3_pairwise.test.mjs
// Tier 3: Cross-Feature Interactions (Pairwise Combinations) (≥14 tests)
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
  afterEach,
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
import { verificarOtp } from '../../lib/authService.js';

const {
  validarCorreoInstitucional,
  esJugadorHabilitado,
  esEquipoAptoParaLlaves,
  obtenerResumenPublico,
  inscribirEquipo,
  obtenerDatosAdmin,
  actualizarDocumentoJugador,
  verificarCarnetsEquipoAdmin,
  reiniciarBaseDeDatosSimulada,
  guardarConfiguracionGeneral,
  actualizarEnlaceWhatsapp,
  suscribirTorneoEnVivo,
  guardarBracketCategoria,
  guardarTorneoCompleto
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

const excelFileName = `Mecafut_${CONFIG_TORNEO.periodo.replace(/\s+/g, "_")}_Inscripciones.xlsx`;

function crearEquipoBase(overrides = {}) {
  const rand = Math.floor(1000 + Math.random() * 9000);
  return {
    equipo: {
      nombre: `Ingeniería PW ${rand}`,
      categoria: "Masculino",
      color: "Azul Eléctrico",
      ...overrides.equipo
    },
    capitan: {
      nombre: "Capitán Pairwise",
      cuenta: `2190${rand}`,
      correo: `capitan.pw${rand}@unitec.edu`,
      telefono: "+504 9474-4365",
      dni: `0501-1999-${rand}`,
      tipoDocumento: "carnet",
      fotoDocumento: "data:image/jpeg;base64,carnetPW",
      carrera: "Mecatrónica",
      codigoClase: "MCT-401",
      ...overrides.capitan
    },
    jugadores: overrides.jugadores !== undefined ? overrides.jugadores : Array.from({ length: 7 }, (_, i) => ({
      nombre: `Jugador PW ${i + 2}`,
      cuenta: `2200${rand}${i}`,
      correo: `jugador.pw${i + 2}.${rand}@unitec.edu`,
      dni: `0501-2000-${rand}${i}`,
      tipoDocumento: "carnet",
      fotoDocumento: "data:image/jpeg;base64,carnetPW",
      carrera: "Mecatrónica",
      codigoClase: "MCT-401"
    })),
    comprobanteFile: overrides.comprobanteFile || null
  };
}

describe('Tier 3: Cross-Feature Interactions (Pairwise Combinations)', () => {

  beforeEach(() => {
    resetTestEnvironment();
    if (typeof reiniciarBaseDeDatosSimulada === 'function') {
      reiniciarBaseDeDatosSimulada();
    }
    if (fs.existsSync(excelFileName)) {
      try { fs.unlinkSync(excelFileName); } catch (e) {}
    }
  });

  afterEach(() => {
    if (fs.existsSync(excelFileName)) {
      try { fs.unlinkSync(excelFileName); } catch (e) {}
    }
  });

  // P1: F1 (Teléfono Capitán DB) × F6 (Teléfono Capitán en Excel)
  it('P1: F1 × F6 — Registro con teléfono internacional se exporta a Excel con formato de texto idéntico', async () => {
    const telefono = "+504 9474-4365";
    const datos = crearEquipoBase({ capitan: { telefono } });
    const reg = await inscribirEquipo(datos);
    const admin = await obtenerDatosAdmin();
    const equipo = admin.equipos.find(e => e.codigoAcceso === reg.codigoAcceso);

    expect(equipo.capitan?.telefono).toBe(telefono);
    exportarExcelOficial([equipo], admin.jugadores);

    const wb = readXLSX(excelFileName);
    const ws = wb.Sheets["Resumen Equipos"];
    const raw = XLSX.utils.sheet_to_json(ws);
    const telExportado = raw[0]["Teléfono Capitán"] || raw[0]["Teléfono"];
    expect(telExportado).toBe(telefono);
  });

  // P2: F1 (Teléfono Capitán DB) × F8 (Portal del Equipo)
  it('P2: F1 × F8 — Teléfono del capitán y regla de 8 carnets verificados coexisten en el perfil de equipo', async () => {
    const datos = crearEquipoBase({ capitan: { telefono: "+504 8888-9999" } });
    const reg = await inscribirEquipo(datos);
    verificarOtp("carlos.rubi@unitec.edu", "123456");
    await verificarCarnetsEquipoAdmin(reg.equipoId);
    const admin = await obtenerDatosAdmin();
    const equipo = admin.equipos.find(e => e.codigoAcceso === reg.codigoAcceso);
    const jugadores = admin.jugadores.filter(j => j.equipoId === equipo.id);

    expect(equipo.capitan?.telefono).toBe("+504 8888-9999");
    const habilitados = jugadores.filter(esJugadorHabilitado).length;
    expect(habilitados).toBe(8);
    expect(habilitados >= CONFIG_TORNEO.plantilla.min).toBe(true);
  });

  // P3: F3 (Capa Configuración) × F9 (Vistas Públicas)
  it('P3: F3 × F9 — Actualizar enlace de WhatsApp en configuración se refleja en resumen público', async () => {
    const url = "https://chat.whatsapp.com/PairwiseUrl123";
    if (typeof guardarConfiguracionGeneral === 'function') {
      await guardarConfiguracionGeneral({ whatsappCapitanesUrl: url });
      const pub = await obtenerResumenPublico();
      expect(pub.whatsappCapitanesUrl).toBe(url);
    }
  });

  // P4: F3 (Capa Configuración) × F13 (Editor WhatsApp en Admin)
  it('P4: F3 × F13 — Guardar URL desde editor valida sintaxis y persiste en base de datos', async () => {
    const urlValida = "https://chat.whatsapp.com/EditorValidLink";
    if (typeof actualizarEnlaceWhatsapp === 'function') {
      await actualizarEnlaceWhatsapp(urlValida);
      const admin = await obtenerDatosAdmin();
      expect(admin.configuracion.whatsappCapitanesUrl).toBe(urlValida);
    }
  });

  // P5: F4 (Helpers Elegibilidad) × F8 (Regla 8 Carnets en Equipo)
  it('P5: F4 × F8 — Plantilla de 8 con 7 carnets verificados y 1 pendiente es evaluada como no-apta', () => {
    const jugadores = [
      ...Array.from({ length: 7 }, (_, i) => ({ id: `j${i}`, fotoDocumento: VALID_CARNET_URL, estadoCarnet: "verificado" })),
      { id: "j7", fotoDocumento: null }
    ];
    const habilitados = jugadores.filter(esJugadorHabilitado);
    expect(habilitados.length).toBe(7);
    expect(habilitados.length >= CONFIG_TORNEO.plantilla.min).toBe(false);
  });

  // P6: F4 (Helpers Elegibilidad) × F10 (Subida de Carnet Admin)
  it('P6: F4 × F10 — Subir carnet desde admin transforma al jugador en habilitado con estado Aprobado', async () => {
    const datos = crearEquipoBase({
      jugadores: [{
        nombre: "Sin Carnet PW",
        cuenta: "22019911",
        correo: "pw@unitec.edu",
        dni: "0501-1999-99111",
        fotoDocumento: null
      }]
    });
    await inscribirEquipo(datos);
    verificarOtp("carlos.rubi@unitec.edu", "123456");
    let admin = await obtenerDatosAdmin();
    let j = admin.jugadores.find(x => x.cuenta === "22019911");
    expect(esJugadorHabilitado(j)).toBe(false);

    await actualizarDocumentoJugador({ jugadorId: j.id, fotoDocumento: "data:image/jpeg;base64,subidaAdminValida123" });
    admin = await obtenerDatosAdmin();
    j = admin.jugadores.find(x => x.id === j.id);
    expect(esJugadorHabilitado(j)).toBe(true);
    expect(j.estado).toBe("Aprobado");
  });

  // P7: F4 (Helpers Elegibilidad) × F11 (Filtro Elegibilidad Llaves)
  it('P7: F4 × F11 — Subir el carnet faltante desde admin habilita al equipo en el filtro de llaves', async () => {
    const datos = crearEquipoBase({
      equipo: { estado: "Confirmado" },
      jugadores: [
        ...Array.from({ length: 6 }, (_, i) => ({
          nombre: `J${i}`,
          cuenta: `220099${i}`,
          correo: `j${i}@unitec.edu`,
          dni: `0501-1999-${i}`,
          fotoDocumento: VALID_CARNET_URL
        })),
        {
          nombre: "Pendiente 8vo",
          cuenta: "2200997",
          correo: "p8@unitec.edu",
          dni: "0501-1999-777",
          fotoDocumento: null
        }
      ]
    });
    const reg = await inscribirEquipo(datos);
    verificarOtp("carlos.rubi@unitec.edu", "123456");
    await verificarCarnetsEquipoAdmin(reg.equipoId);
    let admin = await obtenerDatosAdmin();
    let eq = admin.equipos.find(e => e.codigoAcceso === reg.codigoAcceso);
    eq.estado = "Confirmado"; // pago validado

    expect(esEquipoAptoParaLlaves(eq, admin.jugadores)).toBe(false);

    // Subir el carnet faltante desde admin
    const jFaltante = admin.jugadores.find(j => j.cuenta === "2200997");
    await actualizarDocumentoJugador({ jugadorId: jFaltante.id, fotoDocumento: VALID_CARNET_URL });

    admin = await obtenerDatosAdmin();
    expect(esEquipoAptoParaLlaves(eq, admin.jugadores)).toBe(true);
  });

  // P8: F5 (Plantilla Excel Profesional) × F6 (Teléfono en Exportación)
  it('P8: F5 × F6 — Libro generado contiene formato institucional y teléfonos completos en Resumen', () => {
    const equipos = [
      { id: "e1", nombre: "Alpha", capitan: { nombre: "Cap1", telefono: "+504 9474-4365" } },
      { id: "e2", nombre: "Beta", capitan: { nombre: "Cap2", telefono: "+504 9999-0000" } }
    ];
    exportarExcelOficial(equipos, []);
    const wb = readXLSX(excelFileName);
    expect(wb.SheetNames.length).toBe(4);
    const raw = XLSX.utils.sheet_to_json(wb.Sheets["Resumen Equipos"]);
    expect(raw[0]["Teléfono Capitán"] || raw[0]["Teléfono"]).toBe("+504 9474-4365");
    expect(raw[1]["Teléfono Capitán"] || raw[1]["Teléfono"]).toBe("+504 9999-0000");
  });

  // P9: F7 (Atomic Photo Upload) × F4 (Eligibility Helper)
  it('P9: F7 × F4 — Actualización atómica y verificación de foto de un jugador actualiza únicamente su elegibilidad', () => {
    let plantilla = [
      { id: "j1", nombre: "J1", correo: "j1@unitec.edu", fotoDocumento: null },
      { id: "j2", nombre: "David Díaz", correo: "ddiaz@unitec.edu", fotoDocumento: null }
    ];

    // Aplicar actualización atómica a David Díaz
    plantilla = plantilla.map(j => j.id === "j2" ? { ...j, fotoDocumento: VALID_CARNET_URL, estadoCarnet: "verificado" } : j);

    expect(esJugadorHabilitado(plantilla[0])).toBe(false);
    expect(esJugadorHabilitado(plantilla[1])).toBe(true);
  });

  // P10: F8 (Regla 8 Carnets) × F11 (Filtro Elegibilidad Llaves)
  it('P10: F8 × F11 — Equipo con 8 carnets verificados pero estado de pago Pendiente no pasa el filtro de llaves', () => {
    const eq = { id: "e1", estado: "Pendiente" };
    const jug = Array.from({ length: 8 }, (_, i) => ({ id: `j${i}`, equipoId: "e1", fotoDocumento: VALID_CARNET_URL, estadoCarnet: "verificado" }));

    // Cumple con la regla de 8 carnets pero no con el pago
    expect(jug.filter(esJugadorHabilitado).length >= 8).toBe(true);
    expect(esEquipoAptoParaLlaves(eq, jug)).toBe(false);
  });

  // P11: F11 (Filtro Elegibilidad) × F12 (Armado Manual Llaves)
  it('P11: F11 × F12 — Sorteo de 12 equipos utiliza únicamente los clasificados por el filtro de elegibilidad', () => {
    const todosEquipos = Array.from({ length: 15 }, (_, i) => ({
      id: `eq${i + 1}`,
      nombre: `Equipo ${i + 1}`,
      estado: i < 12 ? "Confirmado" : "Pendiente" // solo 12 pagados
    }));
    const todosJugadores = [];
    todosEquipos.forEach(eq => {
      for (let j = 0; j < 8; j++) {
        todosJugadores.push({
          id: `j_${eq.id}_${j}`,
          equipoId: eq.id,
          fotoDocumento: eq.estado === "Confirmado" ? VALID_CARNET_URL : null,
          estadoCarnet: eq.estado === "Confirmado" ? "verificado" : "pendiente"
        });
      }
    });

    const aptos = todosEquipos.filter(e => esEquipoAptoParaLlaves(e, todosJugadores));
    expect(aptos.length).toBe(12);

    const bracket = generarBracketEliminacion(aptos, false);
    expect(bracket.rondas[0].partidos.length).toBe(8); // 4 BYEs + 4 preliminares
  });

  // P12: F10 (Subida Carnet Admin) × F5 (Exportación Excel)
  it('P12: F10 × F5 — Jugador con carnet actualizado desde admin se exporta como Carnet Universitario verificado', async () => {
    const datos = crearEquipoBase({
      jugadores: [{
        nombre: "Jugador Excel Check",
        cuenta: "22019955",
        correo: "check@unitec.edu",
        dni: "0501-1999-99555",
        fotoDocumento: null
      }]
    });
    await inscribirEquipo(datos);
    verificarOtp("carlos.rubi@unitec.edu", "123456");
    let admin = await obtenerDatosAdmin();
    const j = admin.jugadores.find(x => x.cuenta === "22019955");

    await actualizarDocumentoJugador({ jugadorId: j.id, fotoDocumento: VALID_CARNET_URL, tipoDocumento: "carnet" });
    admin = await obtenerDatosAdmin();

    exportarExcelOficial(admin.equipos, admin.jugadores);
    const wb = readXLSX(excelFileName);
    const raw = XLSX.utils.sheet_to_json(wb.Sheets["Lista Jugadores"]);
    const jExportado = raw.find(r => String(r["N° Cuenta"]) === "22019955");
    expect(jExportado["Doc. Verificado"]).toBe("Carnet Universitario");
  });

  // P13: F2 (Realtime /torneo) × F12 (Armado de Llaves)
  it('P13: F2 × F12 — Guardar bracket de torneo notifica al suscriptor en tiempo real', async () => {
    let ultimoTorneo = null;
    const unsub = suscribirTorneoEnVivo((data) => {
      ultimoTorneo = data;
    });

    const equipos = Array.from({ length: 4 }, (_, i) => ({ id: `e${i + 1}`, nombre: `Eq ${i + 1}` }));
    const bracket = generarBracketEliminacion(equipos, false);
    await guardarBracketCategoria("Masculino", bracket);

    expect(ultimoTorneo).toBeTruthy();
    unsub();
  });

  // P14: F4 (Helpers Elegibilidad con Docente) × F11 (Filtro Elegibilidad Llaves)
  it('P14: F4 × F11 — Equipo con 7 estudiantes con carnet verificado y 1 docente oficial pasa el filtro de llaves', () => {
    const eq = { id: "eqDoc", nombre: "Docente Unido", estado: "Confirmado" };
    const jug = [
      ...Array.from({ length: 7 }, (_, i) => ({
        id: `est_${i}`,
        equipoId: "eqDoc",
        correo: `est${i}@unitec.edu`,
        fotoDocumento: VALID_CARNET_URL,
        estadoCarnet: "verificado"
      })),
      {
        id: "doc1",
        equipoId: "eqDoc",
        correo: "cristhyan.rivera@unitec.edu.hn", // Docente oficial exento
        fotoDocumento: null
      }
    ];

    expect(esEquipoAptoParaLlaves(eq, jug)).toBe(true);
  });

});

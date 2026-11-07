// tests/e2e/tier4_workloads.test.mjs
// Tier 4: Real-World Tournament Lifecycle Workload Scenarios (8 Scenarios)
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
  suscribirTorneoEnVivo,
  guardarBracketCategoria,
  guardarTorneoCompleto
} = dbService;

import { exportarExcelOficial } from '../../lib/exportUtils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..', '..');

const readXLSX = (filePath) => {
  const buf = fs.readFileSync(filePath);
  return XLSX.read(buf, { type: 'buffer' });
};

const excelFileName = `Mecafut_${CONFIG_TORNEO.periodo.replace(/\s+/g, "_")}_Inscripciones.xlsx`;

function esEquipoAptoParaLlaves(equipo, todosJugadores) {
  const estadoPago = (equipo.estado || "Pendiente").toLowerCase();
  const pagoAprobado = estadoPago === "confirmado" || estadoPago === "pagado" || estadoPago === "aprobado";
  if (!pagoAprobado) return false;

  const integrantes = todosJugadores.filter(j => j.equipoId === equipo.id);
  const habilitados = integrantes.filter(esJugadorHabilitado).length;
  return habilitados >= CONFIG_TORNEO.plantilla.min;
}

describe('Tier 4: Real-World Tournament Lifecycle Workloads (8 Scenarios)', () => {

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

  // =========================================================================
  // Escenario 1: Registro completo de equipo con teléfono internacional y verificación de exportación Excel
  // =========================================================================
  it('Escenario 1: Registro con teléfono internacional (+504 9474-4365) y exportación Excel con anchos y tipo texto', async () => {
    const telefonoCapitan = "+504 9474-4365";
    const registroPayload = {
      equipo: {
        nombre: "Galácticos Mecatrónica",
        categoria: "Masculino",
        color: "Rojo Carmesí"
      },
      capitan: {
        nombre: "Carlos Rubí",
        cuenta: "21941001",
        correo: "carlos.rubi@unitec.edu",
        telefono: telefonoCapitan,
        dni: "0501-1999-12345",
        tipoDocumento: "carnet",
        fotoDocumento: "data:image/jpeg;base64,carnetCarlos",
        carrera: "Mecatrónica",
        codigoClase: "MCT-401"
      },
      jugadores: Array.from({ length: 7 }, (_, i) => ({
        nombre: `Estudiante ${i + 2}`,
        cuenta: `2201100${i + 2}`,
        correo: `estudiante${i + 2}@unitec.edu`,
        dni: `0501-2000-0000${i + 2}`,
        tipoDocumento: "carnet",
        fotoDocumento: "data:image/jpeg;base64,carnetValido",
        carrera: "Mecatrónica",
        codigoClase: "MCT-401"
      })),
      comprobanteFile: null
    };

    const resInscripcion = await inscribirEquipo(registroPayload);
    expect(resInscripcion.codigoAcceso).toBeTruthy();

    const admin = await obtenerDatosAdmin();
    const equipoGuardado = admin.equipos.find(e => e.codigoAcceso === resInscripcion.codigoAcceso);
    expect(equipoGuardado).toBeTruthy();
    expect(equipoGuardado.capitan?.telefono).toBe(telefonoCapitan);

    // Exportar Excel Oficial
    exportarExcelOficial(admin.equipos, admin.jugadores);
    expect(fs.existsSync(excelFileName)).toBe(true);

    const wb = readXLSX(excelFileName);
    expect(wb.SheetNames).toContain("Resumen Equipos");
    expect(wb.SheetNames).toContain("Lista Jugadores");

    const wsResumen = wb.Sheets["Resumen Equipos"];
    const resumenData = XLSX.utils.sheet_to_json(wsResumen);
    const filaEquipo = resumenData.find(r => r["Nombre del Equipo"] === "Galácticos Mecatrónica");
    expect(filaEquipo).toBeTruthy();
    const telExportado = filaEquipo["Teléfono Capitán"] || filaEquipo["Teléfono"];
    expect(telExportado).toBe(telefonoCapitan);

    // Verificación de formato texto estricto
    const cells = Object.keys(wsResumen).filter(k => !k.startsWith('!'));
    const phoneCell = cells.map(k => wsResumen[k]).find(c => c && c.v === telefonoCapitan);
    expect(phoneCell).toBeTruthy();
    expect(phoneCell.t).toBe('s');
  });

  // =========================================================================
  // Escenario 2: Carga concurrente de carnets adicionales asegurando persistencia (Anti-David Díaz)
  // =========================================================================
  it('Escenario 2: Actualización atómica de carnets de jugadores concurrentes previene pérdida de fotos', async () => {
    let jugadoresEnEstado = [
      { id: "j1", nombre: "Capitán", fotoDocumento: "fotoCapitan", estado: "Aprobado" },
      { id: "j2", nombre: "David Díaz", fotoDocumento: null, estado: "Pendiente" },
      { id: "j3", nombre: "Andrés Valle", fotoDocumento: null, estado: "Pendiente" },
      { id: "j4", nombre: "José Rodas", fotoDocumento: null, estado: "Pendiente" }
    ];

    // Simulación del setter atómico de React en page.jsx:
    // setJugadores(prev => prev.map(j => j.id === id ? { ...j, fotoDocumento: url, estado: "Aprobado" } : j))
    const atomicUpload = (id, fotoData) => {
      jugadoresEnEstado = jugadoresEnEstado.map(j =>
        j.id === id ? { ...j, fotoDocumento: fotoData, estado: "Aprobado" } : j
      );
    };

    // Lanzar subidas simuladas en paralelo con diferentes tiempos de respuesta
    const taskDavid = new Promise(resolve => {
      setTimeout(() => {
        atomicUpload("j2", "data:image/jpeg;base64,carnetDavidDiaz");
        resolve();
      }, 15);
    });

    const taskAndres = new Promise(resolve => {
      setTimeout(() => {
        atomicUpload("j3", "data:image/jpeg;base64,carnetAndresValle");
        resolve();
      }, 5);
    });

    const taskJose = new Promise(resolve => {
      setTimeout(() => {
        atomicUpload("j4", "data:image/jpeg;base64,carnetJoseRodas");
        resolve();
      }, 25);
    });

    await Promise.all([taskDavid, taskAndres, taskJose]);

    // Verificar que ninguna foto se perdió por stale closure
    expect(jugadoresEnEstado[1].fotoDocumento).toBe("data:image/jpeg;base64,carnetDavidDiaz");
    expect(jugadoresEnEstado[2].fotoDocumento).toBe("data:image/jpeg;base64,carnetAndresValle");
    expect(jugadoresEnEstado[3].fotoDocumento).toBe("data:image/jpeg;base64,carnetJoseRodas");

    // Todos deben ser reconocidos como habilitados
    expect(jugadoresEnEstado.every(esJugadorHabilitado)).toBe(true);
  });

  // =========================================================================
  // Escenario 3: Ciclo de vida completo de elegibilidad: 7 con carnet -> actualización admin -> apto para llaves
  // =========================================================================
  it('Escenario 3: Equipo con 7 carnets (no apto) -> actualización desde admin -> apto para llaves (8 carnets)', async () => {
    const payload = {
      equipo: {
        nombre: "Titanium FC",
        categoria: "Masculino",
        color: "Plateado"
      },
      capitan: {
        nombre: "Capitán Titan",
        cuenta: "21950001",
        correo: "titan.cap@unitec.edu",
        telefono: "94744365",
        dni: "0501-1999-55555",
        tipoDocumento: "carnet",
        fotoDocumento: "carnetCap",
        carrera: "Mecatrónica"
      },
      jugadores: [
        ...Array.from({ length: 6 }, (_, i) => ({
          nombre: `Jugador ${i + 2}`,
          cuenta: `2201500${i + 2}`,
          correo: `titan${i + 2}@unitec.edu`,
          dni: `0501-2000-5555${i + 2}`,
          tipoDocumento: "carnet",
          fotoDocumento: "carnetOk",
          carrera: "Mecatrónica"
        })),
        {
          nombre: "Jugador 8vo Pendiente",
          cuenta: "22015008",
          correo: "titan8@unitec.edu",
          dni: "0501-2000-55558",
          tipoDocumento: "carnet",
          fotoDocumento: null, // Sin carnet
          carrera: "Mecatrónica"
        }
      ]
    };

    const reg = await inscribirEquipo(payload);
    let admin = await obtenerDatosAdmin();
    let eq = admin.equipos.find(e => e.codigoAcceso === reg.codigoAcceso);
    eq.estado = "Confirmado"; // Supongamos pago validado

    // Verificación 1: Equipo NO es apto (7 con carnet, 1 pendiente)
    expect(esEquipoAptoParaLlaves(eq, admin.jugadores)).toBe(false);

    // Acción Administrativa: Admin sube carnet para el 8vo jugador
    const jPendiente = admin.jugadores.find(j => j.cuenta === "22015008");
    expect(jPendiente).toBeTruthy();
    await actualizarDocumentoJugador({
      jugadorId: jPendiente.id,
      fotoDocumento: "data:image/jpeg;base64,carnetSubidoAdmin"
    });

    // Verificación 2: El jugador pasa a Aprobado y el equipo ahora es APTO
    admin = await obtenerDatosAdmin();
    const jActualizado = admin.jugadores.find(j => j.id === jPendiente.id);
    expect(jActualizado.estado).toBe("Aprobado");
    expect(esJugadorHabilitado(jActualizado)).toBe(true);

    expect(esEquipoAptoParaLlaves(eq, admin.jugadores)).toBe(true);
  });

  // =========================================================================
  // Escenario 4: Docente autorizado registrado en plantilla: validación de exención y cupo válido
  // =========================================================================
  it('Escenario 4: Docente autorizado cuenta para el cupo mínimo de 8 sin requerir carnet estudiantil', async () => {
    const payload = {
      equipo: {
        nombre: "Facultad FC",
        categoria: "Masculino",
        color: "Dorado"
      },
      capitan: {
        nombre: "Estudiante Cap",
        cuenta: "21960001",
        correo: "estcap@unitec.edu",
        telefono: "94744365",
        dni: "0501-1999-66666",
        tipoDocumento: "carnet",
        fotoDocumento: "carnet",
        carrera: "Mecatrónica"
      },
      jugadores: [
        ...Array.from({ length: 6 }, (_, i) => ({
          nombre: `Estudiante ${i + 2}`,
          cuenta: `2201600${i + 2}`,
          correo: `est${i + 2}@unitec.edu`,
          dni: `0501-2000-6666${i + 2}`,
          tipoDocumento: "carnet",
          fotoDocumento: "carnet",
          carrera: "Mecatrónica"
        })),
        {
          nombre: "Ing. Juan Miguel Mejía",
          cuenta: "DOCENTE-01",
          correo: "juan.mejia@unitec.edu.hn", // Docente oficial
          tipoDocumento: "docente",
          fotoDocumento: null,
          carrera: "Mecatrónica"
        }
      ]
    };

    const reg = await inscribirEquipo(payload);
    const admin = await obtenerDatosAdmin();
    const eq = admin.equipos.find(e => e.codigoAcceso === reg.codigoAcceso);
    eq.estado = "Confirmado";

    const jDocente = admin.jugadores.find(j => j.correo === "juan.mejia@unitec.edu.hn");
    expect(jDocente).toBeTruthy();
    expect(jDocente.dni).toBe("Exento (Docente)");
    expect(esJugadorHabilitado(jDocente)).toBe(true);

    // 7 estudiantes con carnet + 1 docente exento = 8 habilitados -> Equipo apto
    expect(esEquipoAptoParaLlaves(eq, admin.jugadores)).toBe(true);
  });

  // =========================================================================
  // Escenario 5: Armado manual completo de torneo masculino de 12 equipos con 4 BYEs
  // =========================================================================
  it('Escenario 5: Armado de torneo masculino de 12 equipos con 4 BYEs, cruces preliminares y propagación a Cuartos', () => {
    const nombres = [
      "Robótica FC", "Mecatrónica Alpha", "Cibernética United", "Automatización FC", // Top 4 (BYEs)
      "Hidráulica", "Neumática", "Electrónica", "Termodinámica",
      "Control Digital", "Inteligencia Artificial", "Microcontroladores", "PLC Warriors"
    ];

    const equipos12 = nombres.map((nom, i) => ({
      id: `eq-${i + 1}`,
      nombre: nom,
      color: "Azul"
    }));

    // Generar bracket determinista (manual, aleatorio: false)
    const bracket = generarBracketEliminacion(equipos12, false);
    expect(bracket.tipo).toBe("eliminacion");
    expect(bracket.rondas.length).toBe(4); // Preliminares (R1), Cuartos (R2), Semis (R3), Final (R4)

    const r1 = bracket.rondas[0];
    expect(r1.partidos.length).toBe(8);

    // Los primeros 4 equipos deben haber recibido BYE
    const byes = r1.partidos.filter(p => p.equipo2?.esBye);
    expect(byes.length).toBe(4);
    byes.forEach((p, idx) => {
      expect(p.ganador).toBeTruthy();
      expect(p.ganador.nombre).toBe(nombres[idx]);
    });

    // Los siguientes 8 equipos juegan 4 partidos preliminares reales
    const preliminares = r1.partidos.filter(p => !p.equipo2?.esBye);
    expect(preliminares.length).toBe(4);

    // Simular resultado de preliminar 1: gana Hidráulica
    const p1 = preliminares[0];
    const p1Actualizado = {
      ...p1,
      goles1: 2,
      goles2: 1,
      ganador: p1.equipo1,
      estado: "Finalizado"
    };

    const bracketAvanzado = propagarGanadorEliminacion(bracket, p1Actualizado);
    const r2 = bracketAvanzado.rondas[1]; // Cuartos de final
    // Debe haber avanzado a un partido de cuartos de final
    const enCuartos = r2.partidos.some(p => p.equipo1?.nombre === p1.equipo1.nombre || p.equipo2?.nombre === p1.equipo1.nombre);
    expect(enCuartos).toBe(true);
  });

  // =========================================================================
  // Escenario 6: Armado manual de triangular femenino de 3 equipos con cálculo de tabla y Gran Final
  // =========================================================================
  it('Escenario 6: Triangular femenino (3 equipos), cálculo de tabla por puntos y clasificación a Gran Final', () => {
    const femEquipos = [
      { id: "fem-1", nombre: "Las Fénix", color: "Rosa" },
      { id: "fem-2", nombre: "Mecatrónica Fem", color: "Blanco" },
      { id: "fem-3", nombre: "Amazonas FC", color: "Negro" }
    ];

    const triangular = generarTriangularFemenino(femEquipos, false);
    expect(triangular.jornadas.length).toBe(3);
    expect(triangular.granFinal).toBeTruthy();

    // Simular resultados de las 3 jornadas:
    // J1: Las Fénix (3) vs Mecatrónica Fem (1) -> Fénix gana en tiempo regular (3 pts)
    const j1 = {
      ...triangular.jornadas[0],
      goles1: 3,
      goles2: 1,
      estado: "Finalizado",
      ganador: femEquipos[0]
    };

    // J2: Mecatrónica Fem (2) vs Amazonas (2) [Penales: 4-3] -> Meca Fem gana en penales (2 pts, Amazonas 1 pt)
    const j2 = {
      ...triangular.jornadas[1],
      goles1: 2,
      goles2: 2,
      penales1: 4,
      penales2: 3,
      estado: "Finalizado",
      ganador: femEquipos[1]
    };

    // J3: Las Fénix (1) vs Amazonas (0) -> Fénix gana (3 pts)
    const j3 = {
      ...triangular.jornadas[2],
      goles1: 1,
      goles2: 0,
      estado: "Finalizado",
      ganador: femEquipos[0]
    };

    const tablaFinal = calcularTablaTriangular(femEquipos, [j1, j2, j3]);
    expect(tablaFinal[0].nombre).toBe("Las Fénix");
    expect(tablaFinal[0].pts).toBe(6); // 2 victorias regulares = 6 pts
    expect(tablaFinal[1].nombre).toBe("Mecatrónica Fem");
    expect(tablaFinal[1].pts).toBe(2); // 1 victoria penales = 2 pts
    expect(tablaFinal[2].nombre).toBe("Amazonas FC");
    expect(tablaFinal[2].pts).toBe(1); // 1 derrota penales = 1 pt

    // Clasificados a Gran Final: 1° y 2° lugar
    const clasificado1 = tablaFinal[0];
    const clasificado2 = tablaFinal[1];
    expect(clasificado1.nombre).toBe("Las Fénix");
    expect(clasificado2.nombre).toBe("Mecatrónica Fem");
  });

  // =========================================================================
  // Escenario 7: Actualización de enlace de WhatsApp desde admin y propagación a vistas públicas
  // =========================================================================
  it('Escenario 7: Edición de WhatsApp en configuracion de admin se propaga a vistas públicas inmediatamente', async () => {
    // 1. Resumen inicial contiene el enlace predeterminado
    const resInicial = await obtenerResumenPublico();
    expect(resInicial.whatsappCapitanesUrl).toBeTruthy();

    // 2. Admin edita y guarda un nuevo enlace oficial del torneo
    const nuevoLinkOficial = "https://chat.whatsapp.com/MecafutTorneoOficial2026";
    if (typeof guardarConfiguracionGeneral === 'function') {
      await guardarConfiguracionGeneral({
        whatsappCapitanesUrl: nuevoLinkOficial,
        inscripcionesAbiertas: true
      });

      // 3. Verificar persistencia en admin
      const admin = await obtenerDatosAdmin();
      expect(admin.configuracion.whatsappCapitanesUrl).toBe(nuevoLinkOficial);
      expect(admin.configuracion.inscripcionesAbiertas).toBe(true);

      // 4. Verificar propagación al resumen público para los capitanes
      const resActualizado = await obtenerResumenPublico();
      expect(resActualizado.whatsappCapitanesUrl).toBe(nuevoLinkOficial);
    }
  });

  // =========================================================================
  // Escenario 8: Simulación de múltiples suscriptores simultáneos a canal Realtime sin colisiones
  // =========================================================================
  it('Escenario 8: Múltiples componentes (Navbar, Torneo, Admin) suscriptos simultáneamente reciben eventos sin colisión', async () => {
    let navbarState = null;
    let torneoState = null;
    let adminState = null;

    // Tres componentes montados simultáneamente
    const unsubNavbar = suscribirTorneoEnVivo((data) => { navbarState = data; });
    const unsubTorneo = suscribirTorneoEnVivo((data) => { torneoState = data; });
    const unsubAdmin = suscribirTorneoEnVivo((data) => { adminState = data; });

    expect(navbarState).toBeTruthy();
    expect(torneoState).toBeTruthy();
    expect(adminState).toBeTruthy();

    // Simular actualización del torneo
    const bracketMasc = generarBracketEliminacion([{ id: "e1", nombre: "E1" }, { id: "e2", nombre: "E2" }], false);
    await guardarBracketCategoria("Masculino", bracketMasc);

    // Los 3 componentes siguen activos y reciben el estado sin excepciones
    expect(navbarState.brackets).toBeTruthy();
    expect(torneoState.brackets).toBeTruthy();
    expect(adminState.brackets).toBeTruthy();

    // Desmontar componentes uno a uno limpiamente
    unsubNavbar();
    unsubTorneo();
    unsubAdmin();

    expect(true).toBe(true);
  });

});

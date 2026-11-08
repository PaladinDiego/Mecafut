// tests/e2e/tier5_security_audit_patch.test.mjs
// Tier 5: Regression & Security Audit Suite (F-01 through F-13)
// Validates all 13 security, data-integrity, and tournament-logic findings from diagnostico-inicial-2026-11-07.md

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
  obtenerFechaLocalHonduras
} from '../../lib/torneoConfig.js';

import {
  generarBracketEliminacion,
  generarTriangularFemenino,
  propagarGanadorEliminacion,
  tieneDescendientesConResultado,
  actualizarPartidoTriangular
} from '../../lib/bracketUtils.js';

import {
  verificarOtp,
  crearCuentaConOtp,
  iniciarSesionConPassword,
  guardarPerfil,
  obtenerPerfil,
  obtenerHistorialPerfilLocal,
  cerrarSesion
} from '../../lib/authService.js';

import {
  isFirebaseConfigured,
  obtenerEstadoCarnet,
  esJugadorHabilitado,
  esEquipoAptoParaLlaves,
  inscribirEquipo,
  buscarEquipoPorCodigo,
  agregarJugadorConCodigo,
  expulsarJugador,
  obtenerDatosAdmin,
  obtenerPerfilPendienteJugador,
  actualizarDocumentoJugador,
  revisarCarnetJugadorAdmin,
  verificarCarnetsEquipoAdmin,
  actualizarConfigVisibilidadTorneo,
  obtenerEstadoTorneo,
  reiniciarBaseDeDatosSimulada
} from '../../lib/dbService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..', '..');

const VALID_CARNET_URL = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD==";

function crearPayloadEquipo(overrides = {}) {
  const suffix = Math.floor(1000 + Math.random() * 9000);
  return {
    equipo: {
      nombre: `Seguridad FC ${suffix}`,
      categoria: "Masculino",
      tipoEquipo: "Estudiantes",
      color: "Azul Eléctrico",
      ...overrides.equipo
    },
    capitan: {
      nombre: "Capitán Verificado",
      cuenta: `2210${suffix}`,
      correo: `capitan.${suffix}@unitec.edu`,
      telefono: "+504 9474-4365",
      dni: `0801-2001-${suffix}1`,
      tipoDocumento: "carnet",
      fotoDocumento: VALID_CARNET_URL,
      carrera: "Ingeniería Mecatrónica",
      codigoClase: "MEC-401",
      ...overrides.capitan
    },
    jugadores:
      overrides.jugadores !== undefined
        ? overrides.jugadores
        : Array.from({ length: 7 }, (_, idx) => ({
            nombre: `Integrante ${idx + 2}`,
            cuenta: `2220${suffix}${idx}`,
            correo: `int${idx + 2}.${suffix}@unitec.edu`,
            dni: `0801-2002-${suffix}${idx}`,
            tipoDocumento: "carnet",
            fotoDocumento: VALID_CARNET_URL,
            carrera: "Ingeniería Mecatrónica",
            codigoClase: "MEC-401"
          })),
    comprobanteFile: null
  };
}

describe('Tier 5: Security & Data-Integrity Audit Patch (F-01 through F-13)', () => {
  beforeEach(() => {
    resetTestEnvironment();
    reiniciarBaseDeDatosSimulada();
  });

  // =========================================================================
  // F-01 & F-11: OTP Hardening, Password Minimum, Lockout & Admin Reset Block
  // =========================================================================
  describe('F-01 & F-11: Autenticación endurecida (OTP, mínimo 8 caracteres, lockout y bloqueo reset Admin)', () => {
    it('F11-S1: Rechaza contraseñas menores de 8 caracteres y acepta contraseñas >= 8 caracteres', async () => {
      await expect(() =>
        crearCuentaConOtp('alumno.seguro@unitec.edu', '123456', '1234567')
      ).toReject(/al menos 8 caracteres/i);

      const sesion = await crearCuentaConOtp('alumno.seguro@unitec.edu', '123456', 'ClaveSegura2026');
      expect(sesion.correo).toBe('alumno.seguro@unitec.edu');
      expect(sesion.token).toBeTruthy();
    });

    it('F01-S1: Bloquea código OTP tras superar el límite de 5 intentos fallidos consecutivos', () => {
      const correo = 'intentos@unitec.edu';
      localStorage.setItem(
        'mecafut_otps',
        JSON.stringify({
          [correo]: {
            codigo: '654321',
            expiracion: Date.now() + 600000,
            intentos: 0,
            modoReal: true
          }
        })
      );

      for (let i = 0; i < 5; i++) {
        expect(() => verificarOtp(correo, '000000')).toThrow(/incorrecto/i);
      }

      // El 6to intento aún con el código real debe ser rechazado e invalidado
      expect(() => verificarOtp(correo, '654321')).toThrow(/máximo de 5 intentos/i);
    });

    it('F01-S2: En NODE_ENV="production" bloquea el comodín de desarrollo 123456', () => {
      const prevEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      try {
        expect(() => verificarOtp('carlos.rubi@unitec.edu', '123456')).toThrow();
      } finally {
        process.env.NODE_ENV = prevEnv;
      }
    });

    it('F11-S2: Bloquea intentos de restablecer la contraseña de un Administrador activo vía OTP', async () => {
      await crearCuentaConOtp('carlos.rubi@unitec.edu', '123456', 'AdminClaveInicial99');
      cerrarSesion();

      await expect(() =>
        crearCuentaConOtp('carlos.rubi@unitec.edu', '123456', 'IntentoHijack999')
      ).toReject(/no admiten restablecimiento automático/i);
    });

    it('F11-S3: Bloquea temporalmente el login tras 5 contraseñas fallidas consecutivas', async () => {
      await crearCuentaConOtp('bloqueo@unitec.edu', '123456', 'ClaveCorrecta88');
      cerrarSesion();

      for (let i = 0; i < 5; i++) {
        await expect(() =>
          iniciarSesionConPassword('bloqueo@unitec.edu', 'Incorrecta00')
        ).toReject(/incorrectos/i);
      }

      await expect(() =>
        iniciarSesionConPassword('bloqueo@unitec.edu', 'ClaveCorrecta88')
      ).toReject(/temporalmente protegida/i);
    });
  });

  // =========================================================================
  // F-02 & F-03: Enmascaramiento de PII y Permisos de Capitán/Admin en /equipo
  // =========================================================================
  describe('F-02 & F-03: Enmascaramiento de PII y control de acceso por rol en /equipo', () => {
    it('F03-S1: Estudiante ajeno no ve DNI completo, fotos de carnet ni comprobante; Capitán y Admin sí', async () => {
      verificarOtp('capitan.priv@unitec.edu', '123456');
      const payload = crearPayloadEquipo({
        capitan: {
          correo: 'capitan.priv@unitec.edu',
          dni: '0801-1999-54321'
        }
      });
      payload.comprobanteDataUrl = VALID_CARNET_URL;
      const reg = await inscribirEquipo(payload);

      // Consultar como estudiante externo
      verificarOtp('visitante.externo@unitec.edu', '123456');
      const vistaExterna = await buscarEquipoPorCodigo(reg.codigoAcceso);
      expect(vistaExterna.permisos.esCapitanOAdmin).toBe(false);
      expect(vistaExterna.equipo.comprobanteDataUrl).toBe(null);

      const capEnmascarado = vistaExterna.jugadores.find((j) => j.esCapitan);
      expect(capEnmascarado.dni).toBe('****-****-4321');
      expect(capEnmascarado.correo).toBe('');
      expect(capEnmascarado.fotoDocumento).toBe(null);
      expect(capEnmascarado.tieneFoto).toBe(true);

      // Consultar como Capitán dueño del equipo
      verificarOtp('capitan.priv@unitec.edu', '123456');
      const vistaCapitan = await buscarEquipoPorCodigo(reg.codigoAcceso);
      expect(vistaCapitan.permisos.esCapitanOAdmin).toBe(true);
      const capCompleto = vistaCapitan.jugadores.find((j) => j.esCapitan);
      expect(capCompleto.dni).toBe('0801-1999-54321');
      expect(capCompleto.correo).toBe('capitan.priv@unitec.edu');
      expect(capCompleto.fotoDocumento).toBe(VALID_CARNET_URL);
    });

    it('F03-S2: Estudiante no-capitán no puede agregar manualmente a terceros ni expulsar integrantes', async () => {
      verificarOtp('capitan.guard@unitec.edu', '123456');
      const payload = crearPayloadEquipo({
        capitan: { correo: 'capitan.guard@unitec.edu' },
        jugadores: [
          {
            nombre: 'Jugador Protegido',
            cuenta: '22007771',
            correo: 'protegido@unitec.edu',
            dni: '0801-2000-77771',
            fotoDocumento: VALID_CARNET_URL
          }
        ]
      });
      const reg = await inscribirEquipo(payload);
      const admin = await obtenerDatosAdmin();
      const jProtegido = admin.jugadores.find((j) => j.cuenta === '22007771');

      verificarOtp('intruso@unitec.edu', '123456');
      await expect(() =>
        agregarJugadorConCodigo(
          reg.codigoAcceso,
          {
            nombre: 'Tercero No Autorizado',
            cuenta: '22008881',
            correo: 'tercero@unitec.edu',
            dni: '0801-2000-88881',
            fotoDocumento: VALID_CARNET_URL
          },
          { esAutoRegistro: false }
        )
      ).toReject(/Solo el Capitán/i);

      await expect(() =>
        expulsarJugador({ codigoAcceso: reg.codigoAcceso, jugadorId: jProtegido.id })
      ).toReject(/Solo el Capitán/i);
    });
  });

  // =========================================================================
  // F-04: Máquina de Estados de Verificación Documental (en_revision -> verificado / rechazado)
  // =========================================================================
  describe('F-04: Verificación administrativa real de carnets (2 pasos)', () => {
    it('F04-S1: Equipo recién inscrito con 8 fotos queda en_revision (no apto) hasta verificarCarnetsEquipoAdmin', async () => {
      verificarOtp('capitan.f04@unitec.edu', '123456');
      const payload = crearPayloadEquipo({
        capitan: { correo: 'capitan.f04@unitec.edu' }
      });
      const reg = await inscribirEquipo(payload);

      verificarOtp('carlos.rubi@unitec.edu', '123456');
      let admin = await obtenerDatosAdmin();
      let eq = admin.equipos.find((e) => e.id === reg.equipoId);
      eq.estado = 'Confirmado';

      const integrantesAntes = admin.jugadores.filter((j) => j.equipoId === eq.id);
      expect(integrantesAntes.length).toBe(8);
      expect(integrantesAntes.every((j) => obtenerEstadoCarnet(j) === 'en_revision')).toBe(true);
      expect(esEquipoAptoParaLlaves(eq, admin.jugadores)).toBe(false);

      // Verificación en lote con 1 clic por el Admin
      const lote = await verificarCarnetsEquipoAdmin(eq.id);
      expect(lote.verificadosCount).toBe(8);

      admin = await obtenerDatosAdmin();
      eq = admin.equipos.find((e) => e.id === reg.equipoId);
      eq.estado = 'Confirmado';
      expect(esEquipoAptoParaLlaves(eq, admin.jugadores)).toBe(true);

      // Si Admin rechaza 1 carnet borroso, baja a 7/8 y deja de ser apto + notifica perfil pendiente
      const jugadorObjetivo = admin.jugadores.find((j) => j.equipoId === eq.id && !j.esCapitan);
      await revisarCarnetJugadorAdmin({
        jugadorId: jugadorObjetivo.id,
        decision: 'rechazado',
        motivo: 'Imagen desenfocada, vuelve a adjuntar tu carnet.'
      });

      admin = await obtenerDatosAdmin();
      eq = admin.equipos.find((e) => e.id === reg.equipoId);
      eq.estado = 'Confirmado';
      expect(esEquipoAptoParaLlaves(eq, admin.jugadores)).toBe(false);

      const pendiente = await obtenerPerfilPendienteJugador(jugadorObjetivo.correo);
      expect(pendiente).toBeTruthy();
      expect(pendiente.estadoCarnet).toBe('rechazado');
      expect(pendiente.motivoRechazo).toContain('desenfocada');
    });
  });

  // =========================================================================
  // F-05 & F-13: Unicidad Cuádruple (Cuenta, Correo, DNI Normalizado) e Historial de Identidad
  // =========================================================================
  describe('F-05 & F-13: Unicidad cruzada estricta, anti-spoofing docente y auditoría de cambios', () => {
    it('F05-S1: Bloquea duplicidad de DNI aunque tenga distinto formato de guiones (0801-1999-12345 vs 0801199912345)', async () => {
      const p1 = crearPayloadEquipo({
        equipo: { nombre: 'Equipo Uno DNI', color: 'Rojo' },
        capitan: { correo: 'cap.dni1@unitec.edu', cuenta: '22001111', dni: '0801-1999-12345' },
        jugadores: []
      });
      await inscribirEquipo(p1);

      const p2 = crearPayloadEquipo({
        equipo: { nombre: 'Equipo Dos DNI', color: 'Verde' },
        capitan: { correo: 'cap.dni2@unitec.edu', cuenta: '22002222', dni: '0801199912345' },
        jugadores: []
      });
      await expect(() => inscribirEquipo(p2)).toReject(/DNI/i);
    });

    it('F13-S1: Estudiante no puede forzar tipoEquipo="Docentes" ni obtener exención automática pre-registrando correo docente', async () => {
      verificarOtp('alumno.astuto@unitec.edu', '123456');
      const payload = crearPayloadEquipo({
        equipo: { nombre: 'Intento Spoof Docentes', tipoEquipo: 'Docentes', color: 'Naranja' },
        capitan: { correo: 'alumno.astuto@unitec.edu' },
        jugadores: [
          ...Array.from({ length: 6 }, (_, idx) => ({
            nombre: `Alum ${idx}`,
            cuenta: `229900${idx}`,
            correo: `alum${idx}@unitec.edu`,
            dni: `0801-2003-9900${idx}`,
            fotoDocumento: VALID_CARNET_URL
          })),
          {
            nombre: 'Ing. Juan Miguel Mejía',
            cuenta: 'DOC-SPOOF',
            correo: 'juan.mejia@unitec.edu.hn',
            fotoDocumento: null
          }
        ]
      });

      const reg = await inscribirEquipo(payload);
      verificarOtp('carlos.rubi@unitec.edu', '123456');
      await verificarCarnetsEquipoAdmin(reg.equipoId);

      const admin = await obtenerDatosAdmin();
      const eq = admin.equipos.find((e) => e.id === reg.equipoId);
      // Como el capitán es estudiante, tipoEquipo fue forzado a "Estudiantes"
      expect(eq.tipoEquipo).toBe('Estudiantes');

      // Y el 8vo slot (docente pre-registrado sin login propio ni verificación individual) NO habilita automáticamente
      eq.estado = 'Confirmado';
      expect(esEquipoAptoParaLlaves(eq, admin.jugadores)).toBe(false);
    });

    it('F13-S2: Registra historial de auditoría cuando un usuario modifica cuenta, nombre o DNI en su perfil', async () => {
      const correo = 'cambio.identidad@unitec.edu';
      await crearCuentaConOtp(correo, '123456', 'ClavePerfil2026');

      await guardarPerfil(correo, {
        nombre: 'Nombre Original',
        cuenta: '21900001',
        dni: '0801-2000-11111'
      });

      await guardarPerfil(correo, {
        nombre: 'Nombre Modificado',
        cuenta: '21900099',
        dni: '0801-2000-99999'
      });

      const perfil = await obtenerPerfil(correo);
      expect(perfil.nombre).toBe('Nombre Modificado');
      expect(perfil.cuenta).toBe('21900099');

      const historial = obtenerHistorialPerfilLocal(correo);
      expect(historial.length).toBe(3);
      expect(historial.map((h) => h.campo).sort()).toEqual(['cuenta', 'dni', 'nombre']);

      // Al inscribir equipo tras haber cambiado identidad, marca alertaCambioIdentidad = true para revisión Admin
      const payload = crearPayloadEquipo({
        equipo: { nombre: 'Alerta Identidad FC', color: 'Morado' },
        capitan: {
          nombre: 'Nombre Modificado',
          cuenta: '21900099',
          correo,
          dni: '0801-2000-99999'
        },
        jugadores: []
      });
      const reg = await inscribirEquipo(payload);
      const admin = await obtenerDatosAdmin();
      const filaCap = admin.jugadores.find((j) => j.equipoId === reg.equipoId && j.esCapitan);
      expect(filaCap.alertaCambioIdentidad).toBe(true);
    });
  });

  // =========================================================================
  // F-06, F-07, F-08, F-09 & F-12: Visibilidad, Cascada de Brackets, Femenino Dual, Zona Horaria y Legado
  // =========================================================================
  describe('F-06, F-07, F-08, F-09 & F-12: Integridad de Torneo, Zona Horaria Honduras y Limpieza Legado', () => {
    it('F06-S1: actualizarConfigVisibilidadTorneo actualiza visibilidad y fecha sin ReferenceError', async () => {
      const actualizado = await actualizarConfigVisibilidadTorneo({
        visibilidadPublica: 'visible',
        fechaEvento: '2026-11-20'
      });
      expect(actualizado.visibilidadPublica).toBe('visible');
      expect(actualizado.fechaEvento).toBe('2026-11-20');

      const leido = await obtenerEstadoTorneo();
      expect(leido.visibilidadPublica).toBe('visible');
      expect(leido.fechaEvento).toBe('2026-11-20');
    });

    it('F07-S1: propagarGanadorEliminacion invalida en cascada rondas posteriores y campeón si cambia un ganador previo', () => {
      const equipos4 = [
        { id: 'e1', nombre: 'Alpha' },
        { id: 'e2', nombre: 'Beta' },
        { id: 'e3', nombre: 'Gamma' },
        { id: 'e4', nombre: 'Delta' }
      ];
      let bracket = generarBracketEliminacion(equipos4, false);

      // Semifinal 1: Alpha vence a Beta
      const sf1 = { ...bracket.rondas[0].partidos[0], goles1: 2, goles2: 0, ganador: equipos4[0], estado: 'Finalizado' };
      bracket = propagarGanadorEliminacion(bracket, sf1);

      // Semifinal 2: Gamma vence a Delta
      const sf2 = { ...bracket.rondas[0].partidos[1], goles1: 1, goles2: 0, ganador: equipos4[2], estado: 'Finalizado' };
      bracket = propagarGanadorEliminacion(bracket, sf2);

      // Gran Final: Alpha vence a Gamma -> Campeón Alpha
      const fin = { ...bracket.rondas[1].partidos[0], goles1: 3, goles2: 1, ganador: equipos4[0], estado: 'Finalizado' };
      bracket = propagarGanadorEliminacion(bracket, fin);
      expect(bracket.campeon?.id).toBe('e1');

      // Detectar impacto antes de cambiar ganador de Semifinal 1 a Beta
      expect(tieneDescendientesConResultado(bracket, sf1.id, 'e2')).toBe(true);

      // Cambiar ganador de Semifinal 1 a Beta -> Gran Final debe reiniciarse y campeón limpiarse
      const sf1Corregida = { ...bracket.rondas[0].partidos[0], goles1: 1, goles2: 2, ganador: equipos4[1], estado: 'Finalizado' };
      bracket = propagarGanadorEliminacion(bracket, sf1Corregida);

      const nuevaFinal = bracket.rondas[1].partidos[0];
      expect(nuevaFinal.equipo1?.id).toBe('e2');
      expect(nuevaFinal.equipo2?.id).toBe('e3');
      expect(nuevaFinal.goles1).toBe(null);
      expect(nuevaFinal.goles2).toBe(null);
      expect(nuevaFinal.ganador).toBe(null);
      expect(nuevaFinal.estado).toBe('Programado');
      expect(bracket.campeon).toBe(null);
    });

    it('F07-S2 & F08-S1: Categoría Femenina soporta Triangular (3 equipos con Gran Final reactiva) y Semifinales (4 equipos)', () => {
      // Caso 3 equipos: Triangular + Gran Final automática al cerrar las 3 jornadas
      const fem3 = [
        { id: 'f1', nombre: 'Leonas' },
        { id: 'f2', nombre: 'Panteras' },
        { id: 'f3', nombre: 'Valkirias' }
      ];
      let tri = generarTriangularFemenino(fem3, false);
      tri = actualizarPartidoTriangular(tri, { ...tri.jornadas[0], goles1: 2, goles2: 0, ganador: fem3[0], estado: 'Finalizado' });
      tri = actualizarPartidoTriangular(tri, { ...tri.jornadas[1], goles1: 3, goles2: 1, ganador: fem3[1], estado: 'Finalizado' });
      tri = actualizarPartidoTriangular(tri, { ...tri.jornadas[2], goles1: 1, goles2: 0, ganador: fem3[0], estado: 'Finalizado' });

      expect(tri.granFinal.equipo1?.id).toBe('f1');
      expect(tri.granFinal.equipo2?.id).toBe('f2');

      // Caso 4 equipos: Semifinales + Gran Final
      const fem4 = [...fem3, { id: 'f4', nombre: 'Fénix' }];
      const elim4 = generarBracketEliminacion(fem4, false);
      expect(elim4.rondas.length).toBe(2);
      expect(elim4.rondas[0].nombreRonda).toBe('Semifinales');
      expect(elim4.rondas[1].nombreRonda).toBe('Gran Final');
    });

    it('F09-S1: obtenerFechaLocalHonduras calcula fecha en America/Tegucigalpa (UTC-6) sin adelanto nocturno UTC', () => {
      // 2026-11-15T01:30:00Z equivale a las 19:30 (7:30 PM) del 14 de noviembre en Honduras (UTC-6)
      const instanteNocheHn = new Date('2026-11-15T01:30:00Z');
      expect(obtenerFechaLocalHonduras(instanteNocheHn)).toBe('2026-11-14');

      // 2026-11-15T14:00:00Z equivale a las 08:00 AM del 15 de noviembre en Honduras
      const instanteMananaHn = new Date('2026-11-15T14:00:00Z');
      expect(obtenerFechaLocalHonduras(instanteMananaHn)).toBe('2026-11-15');
    });

    it('F12-S1: lib/firebase.js fue erradicado y firestore.rules está cerrado (allow read, write: if false)', () => {
      expect(isFirebaseConfigured).toBe(false);
      expect(fs.existsSync(path.join(projectRoot, 'lib', 'firebase.js'))).toBe(false);

      const rules = fs.readFileSync(path.join(projectRoot, 'firestore.rules'), 'utf8');
      expect(rules).toContain('allow read, write: if false;');
      expect(rules).not.toContain('allow read: if true');
    });
  });
});

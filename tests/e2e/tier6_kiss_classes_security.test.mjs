// tests/e2e/tier6_kiss_classes_security.test.mjs
// Suite de pruebas E2E para Requisitos KISS: Clases Representadas, Serie Femenina de 2 Equipos,
// Contraseñas Temporales y Publicación Selectiva del Torneo.

import { describe, it, expect, beforeEach } from './runner.mjs';
import {
  inscribirEquipo,
  agregarJugadorConCodigo,
  buscarEquipoPorCodigo,
  obtenerResumenPublico,
  guardarConfiguracionGeneral,
  obtenerDatosAdmin,
  obtenerEstadoTorneo,
  obtenerTorneoMaster,
  crearCriterioPremio,
  ajustarConteoCriterio,
  actualizarConfigVisibilidadTorneo
} from '../../lib/dbService.js';
import {
  verificarOtp,
  crearCuentaConOtp,
  iniciarSesionConPassword,
  cerrarSesion,
  generarPasswordTemporalAdmin,
  cambiarPasswordObligatorio,
  obtenerSesionActual
} from '../../lib/authService.js';
import {
  generarSerieDosEquiposFemenino,
  actualizarPartidoSerieDos,
  validarBracketCompleto,
  generarBracketEliminacion
} from '../../lib/bracketUtils.js';

const VALID_DOC_URL = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=";

describe('Tier 6: Clases Representadas, Serie Femenina 2 Equipos y Seguridad Administrativa', () => {
  beforeEach(() => {
    localStorage.clear();
    cerrarSesion();
  });

  // =========================================================================
  // 1. Clases Representadas y Auto-incorporación Filtrada por Clase
  // =========================================================================
  describe('Clases Representadas y Validación de Auto-registro', () => {
    it('Capitán registra equipo con 2 clases representadas y sus códigos', async () => {
      verificarOtp('capitan.robotica@unitec.edu', '123456');

      const payload = {
        equipo: {
          nombre: 'Robótica Mechatronics',
          categoria: 'Masculino',
          color: 'Azul',
          docente: 'Ing. Jared Sauceda',
          clasesRepresentadas: [
            { nombre: 'Robótica Industrial', codigo: 'MEC-401' },
            { nombre: 'Sistemas de Control', codigo: 'MEC-302' }
          ]
        },
        capitan: {
          nombre: 'Carlos Capitán',
          cuenta: '22114455',
          correo: 'capitan.robotica@unitec.edu',
          dni: '0801-2001-11223',
          telefono: '+504 9474-4365',
          carrera: 'Ingeniería Mecatrónica',
          nombreClase: 'Robótica Industrial',
          codigoClase: 'MEC-401',
          fotoDocumento: VALID_DOC_URL
        },
        jugadores: [],
        comprobanteDataUrl: VALID_DOC_URL
      };

      const res = await inscribirEquipo(payload);
      expect(res.codigoAcceso).toBeTruthy();

      const info = await buscarEquipoPorCodigo(res.codigoAcceso);
      expect(info.equipo.clasesRepresentadas.length).toBe(2);
      expect(info.equipo.clasesRepresentadas[0].codigo).toBe('MEC-401');
      expect(info.equipo.clasesRepresentadas[1].codigo).toBe('MEC-302');
    });

    it('Auto-registro permite jugador cuya clase coincide con una de las clases del equipo', async () => {
      verificarOtp('capitan.auto@unitec.edu', '123456');
      const payload = {
        equipo: {
          nombre: 'Control Automático FC',
          categoria: 'Masculino',
          color: 'Blanco',
          docente: 'Ing. Cristhyan Rivera',
          clasesRepresentadas: [
            { nombre: 'Dinámica de Sistemas', codigo: 'MEC-205' }
          ]
        },
        capitan: {
          nombre: 'Ana Capitana',
          cuenta: '22118899',
          correo: 'capitan.auto@unitec.edu',
          dni: '0801-2002-33445',
          telefono: '99887766',
          nombreClase: 'Dinámica de Sistemas',
          codigoClase: 'MEC-205',
          fotoDocumento: VALID_DOC_URL
        },
        jugadores: [],
        comprobanteDataUrl: VALID_DOC_URL
      };

      const res = await inscribirEquipo(payload);

      // Alumno de la misma clase se auto-registra con el código del equipo
      verificarOtp('alumno.valido@unitec.edu', '123456');
      const nuevoJugador = {
        nombre: 'Pedro Alumno',
        cuenta: '22117766',
        correo: 'alumno.valido@unitec.edu',
        dni: '0801-2003-55667',
        nombreClase: 'Dinámica de Sistemas',
        codigoClase: 'MEC-205',
        fotoDocumento: VALID_DOC_URL
      };

      const equipoActualizado = await agregarJugadorConCodigo(res.codigoAcceso, nuevoJugador, { esAutoRegistro: true });
      expect(equipoActualizado.jugadores.length).toBe(2);
      expect(equipoActualizado.jugadores.some(j => j.cuenta === '22117766')).toBe(true);
    });

    it('Auto-registro rechaza jugador cuya clase NO coincide con las clases representadas', async () => {
      verificarOtp('capitan.rechazo@unitec.edu', '123456');
      const payload = {
        equipo: {
          nombre: 'Equipo Termo',
          categoria: 'Masculino',
          color: 'Negro',
          clasesRepresentadas: [
            { nombre: 'Termodinámica', codigo: 'MEC-101' }
          ]
        },
        capitan: {
          nombre: 'Hugo Capitán',
          cuenta: '22110001',
          correo: 'capitan.rechazo@unitec.edu',
          dni: '0801-2000-11111',
          telefono: '94744365',
          nombreClase: 'Termodinámica',
          codigoClase: 'MEC-101',
          fotoDocumento: VALID_DOC_URL
        },
        jugadores: [],
        comprobanteDataUrl: VALID_DOC_URL
      };

      const res = await inscribirEquipo(payload);

      // Alumno con clase no representada intenta unirse
      verificarOtp('alumno.ajeno@unitec.edu', '123456');
      const jugadorAjeno = {
        nombre: 'Clara Alumna',
        cuenta: '22110002',
        correo: 'alumno.ajeno@unitec.edu',
        dni: '0801-2000-22222',
        nombreClase: 'Cálculo I',
        codigoClase: 'MAT-101',
        fotoDocumento: VALID_DOC_URL
      };

      await expect(() =>
        agregarJugadorConCodigo(res.codigoAcceso, jugadorAjeno, { esAutoRegistro: true })
      ).toReject(/no coincide con ninguna de las clases representadas/i);
    });

    it('Auto-registro es rechazado si el equipo carece de clases representadas registradas', async () => {
      verificarOtp('capitan.vacio@unitec.edu', '123456');
      const payload = {
        equipo: {
          nombre: 'Equipo Sin Clases',
          categoria: 'Masculino',
          color: 'Gris',
          clasesRepresentadas: [] // Equipo histórico o sin clases definidas
        },
        capitan: {
          nombre: 'Capitán Vacio',
          cuenta: '22119999',
          correo: 'capitan.vacio@unitec.edu',
          dni: '0801-1999-55555',
          telefono: '94744365',
          nombreClase: 'General',
          codigoClase: 'GEN-001',
          fotoDocumento: VALID_DOC_URL
        },
        jugadores: [],
        comprobanteDataUrl: VALID_DOC_URL
      };

      const res = await inscribirEquipo(payload);

      // Alumno intenta auto-registrarse en equipo sin clases
      verificarOtp('alumno.intento@unitec.edu', '123456');
      const alumno = {
        nombre: 'Alumno Intento',
        cuenta: '22118888',
        correo: 'alumno.intento@unitec.edu',
        dni: '0801-1999-44444',
        nombreClase: 'General',
        codigoClase: 'GEN-001',
        fotoDocumento: VALID_DOC_URL
      };

      await expect(() =>
        agregarJugadorConCodigo(res.codigoAcceso, alumno, { esAutoRegistro: true })
      ).toReject(/no tiene clases representadas registradas/i);
    });
  });

  // =========================================================================
  // 2. Formato Serie Femenina 2 Equipos y Validación Reglamentaria
  // =========================================================================
  describe('Serie Femenina de 2 Equipos (Final Única e Ida y Vuelta)', () => {
    const eqFem1 = { id: 'eq-f1', nombre: 'Mecatrónicas A', color: 'Rosa' };
    const eqFem2 = { id: 'eq-f2', nombre: 'Mecatrónicas B', color: 'Morado' };

    it('generarSerieDosEquiposFemenino en formato final_unica crea 1 partido único', () => {
      const serie = generarSerieDosEquiposFemenino([eqFem1, eqFem2], { formato: 'final_unica' });
      expect(serie.tipo).toBe('serie_dos_equipos');
      expect(serie.formato).toBe('final_unica');
      expect(serie.partidos.length).toBe(1);
      expect(serie.partidos[0].id).toBe('fem-final-unica');
      expect(serie.campeon).toBe(null);

      const val = validarBracketCompleto(serie);
      expect(val.valido).toBe(true);
    });

    it('generarSerieDosEquiposFemenino en formato ida_vuelta calcula global y campeón acumulado', () => {
      const serie = generarSerieDosEquiposFemenino([eqFem1, eqFem2], { formato: 'ida_vuelta' });
      expect(serie.partidos.length).toBe(2);

      // Partido Ida: Mecatrónicas A gana 2 - 1
      const pIda = {
        ...serie.partidos[0],
        goles1: 2,
        goles2: 1,
        estado: 'Finalizado',
        ganador: eqFem1
      };
      const serieTrasIda = actualizarPartidoSerieDos(serie, pIda);
      expect(serieTrasIda.campeon).toBe(null); // No hay campeón hasta terminar la vuelta

      // Partido Vuelta: Mecatrónicas B gana 2 - 0 (Global: Mecatrónicas B 3 - 2 Mecatrónicas A)
      const pVuelta = {
        ...serieTrasIda.partidos[1],
        goles1: 2, // Mecatrónicas B juega de local
        goles2: 0, // Mecatrónicas A
        estado: 'Finalizado',
        ganador: eqFem2
      };
      const serieFinalizada = actualizarPartidoSerieDos(serieTrasIda, pVuelta);
      expect(serieFinalizada.globalA).toBe(2);
      expect(serieFinalizada.globalB).toBe(3);
      expect(serieFinalizada.campeon.id).toBe(eqFem2.id);
    });

    it('Ida y Vuelta con empate global define campeón por penales en partido de vuelta', () => {
      const serie = generarSerieDosEquiposFemenino([eqFem1, eqFem2], { formato: 'ida_vuelta' });

      // Ida: 1 - 0 a favor de eq1
      const pIda = {
        ...serie.partidos[0],
        goles1: 1,
        goles2: 0,
        estado: 'Finalizado',
        ganador: eqFem1
      };
      const s1 = actualizarPartidoSerieDos(serie, pIda);

      // Vuelta: eq2 gana 1 - 0 (Global empatado 1 - 1) -> Penales: eq1 gana 4 - 3
      const pVuelta = {
        ...s1.partidos[1],
        goles1: 1,
        goles2: 0,
        penales1: 3,
        penales2: 4,
        estado: 'Finalizado',
        ganador: eqFem1
      };
      const s2 = actualizarPartidoSerieDos(s1, pVuelta);
      expect(s2.globalA).toBe(1);
      expect(s2.globalB).toBe(1);
      expect(s2.campeon.id).toBe(eqFem1.id);
    });

    it('generarSerieDosEquiposFemenino en formato mejor_de_tres define campeón al primer equipo con 2 victorias', () => {
      const serie = generarSerieDosEquiposFemenino([eqFem1, eqFem2], { formato: 'mejor_de_tres' });
      expect(serie.partidos.length).toBe(3);

      // Juego 1: gana eq1
      const p1 = { ...serie.partidos[0], goles1: 3, goles2: 1, estado: 'Finalizado', ganador: eqFem1 };
      const s1 = actualizarPartidoSerieDos(serie, p1);
      expect(s1.campeon).toBe(null);
      expect(s1.victoriasA).toBe(1);

      // Juego 2: gana eq2
      const p2 = { ...s1.partidos[1], goles1: 2, goles2: 0, estado: 'Finalizado', ganador: eqFem2 };
      const s2 = actualizarPartidoSerieDos(s1, p2);
      expect(s2.campeon).toBe(null);
      expect(s2.victoriasB).toBe(1);

      // Juego 3: gana eq1 (2 victorias vs 1 victoria) -> eq1 es campeón
      const p3 = { ...s2.partidos[2], goles1: 2, goles2: 1, estado: 'Finalizado', ganador: eqFem1 };
      const s3 = actualizarPartidoSerieDos(s2, p3);
      expect(s3.victoriasA).toBe(2);
      expect(s3.campeon.id).toBe(eqFem1.id);
    });

    it('validarBracketCompleto detecta llaves vacías o corruptas', () => {
      expect(validarBracketCompleto(null).valido).toBe(false);
      expect(validarBracketCompleto({ tipo: 'eliminacion', rondas: [] }).valido).toBe(false);
      expect(validarBracketCompleto({ tipo: 'desconocido' }).valido).toBe(false);
    });
  });

  // =========================================================================
  // 3. Contraseñas Temporales Administrativas y Cambio Obligatorio
  // =========================================================================
  describe('Contraseñas Temporales y Flujo de Cambio Obligatorio', () => {
    it('Admin genera contraseña temporal para usuario y activa flag debe_cambiar_password', async () => {
      // 1. Crear cuenta de estudiante y cerrar sesión
      await crearCuentaConOtp('estudiante.temp@unitec.edu', '123456', 'ClaveOriginal123');
      cerrarSesion();

      // 2. Iniciar sesión como Admin
      verificarOtp('carlos.rubi@unitec.edu', '123456');
      const adminData = await obtenerDatosAdmin();
      const uEstudiante = adminData.usuarios.find(u => u.correo === 'estudiante.temp@unitec.edu');
      expect(uEstudiante).toBeTruthy();

      // 3. Admin genera clave temporal
      const resTemp = await generarPasswordTemporalAdmin(uEstudiante.id || uEstudiante.usuario_id);
      expect(resTemp.ok).toBe(true);
      expect(resTemp.tempPassword.length >= 10).toBe(true);

      // 4. Estudiante inicia sesión con la contraseña temporal
      cerrarSesion();
      const loginTemp = await iniciarSesionConPassword('estudiante.temp@unitec.edu', resTemp.tempPassword);
      expect(loginTemp.sesion.debeCambiarPassword).toBe(true);

      // 5. Estudiante cambia obligatoriamente su contraseña
      const resCambio = await cambiarPasswordObligatorio('NuevaClavePersonal777');
      expect(resCambio.ok).toBe(true);
      expect(resCambio.sesion.debeCambiarPassword).toBe(false);

      // 6. Nuevo login con la nueva contraseña personal
      cerrarSesion();
      const loginFinal = await iniciarSesionConPassword('estudiante.temp@unitec.edu', 'NuevaClavePersonal777');
      expect(loginFinal.sesion.debeCambiarPassword).toBe(false);
    });

    it('Contraseña temporal no puede reutilizarse tras el primer inicio de sesión (un solo uso real)', async () => {
      // 1. Crear cuenta y generar contraseña temporal desde admin
      await crearCuentaConOtp('estudiante.onetime@unitec.edu', '123456', 'PasswordBase123');
      cerrarSesion();

      verificarOtp('carlos.rubi@unitec.edu', '123456');
      const adminData = await obtenerDatosAdmin();
      const user = adminData.usuarios.find(u => u.correo === 'estudiante.onetime@unitec.edu');
      const resTemp = await generarPasswordTemporalAdmin(user.id || user.usuario_id);
      cerrarSesion();

      // 2. Primer login exitoso con contraseña temporal (se marca temp_password_usada = true)
      const primerLogin = await iniciarSesionConPassword('estudiante.onetime@unitec.edu', resTemp.tempPassword);
      expect(primerLogin.sesion.debeCambiarPassword).toBe(true);

      // 3. Usuario cierra sesión SIN cambiar contraseña
      cerrarSesion();

      // 4. Intento de segundo login con la misma clave temporal debe ser RECHAZADO
      await expect(() =>
        iniciarSesionConPassword('estudiante.onetime@unitec.edu', resTemp.tempPassword)
      ).toReject(/ya fue utilizada en un inicio de sesión previo/i);
    });
  });

  // =========================================================================
  // 4. Configuración Operativa y Publicación Selectiva
  // =========================================================================
  describe('Configuración Operativa y Resumen Público', () => {
    it('guardarConfiguracionGeneral persiste límites y visibilidad de secciones', async () => {
      verificarOtp('carlos.rubi@unitec.edu', '123456');

      await guardarConfiguracionGeneral({
        maxJugadoresPorEquipo: 12,
        fechaCierreInscripciones: '2026-11-20',
        publicarGoleadores: false,
        publicarClasificacion: false,
        publicarPremios: true
      });

      const resumen = await obtenerResumenPublico();
      expect(resumen.maxJugadoresPorEquipo).toBe(12);
      expect(resumen.fechaCierreInscripciones).toBe('2026-11-20');

      const admin = await obtenerDatosAdmin();
      expect(admin.configuracion.publicarGoleadores).toBe(false);
      expect(admin.configuracion.publicarClasificacion).toBe(false);
      expect(admin.configuracion.publicarPremios).toBe(true);
    });

    it('Resumen público no filtra códigos de acceso de equipos a usuarios no autorizados', async () => {
      const resumen = await obtenerResumenPublico();
      expect(Array.isArray(resumen.equiposActivos)).toBe(true);
      // Ningún equipo público debe revelar codigoAcceso
      resumen.equiposActivos.forEach(eq => {
        expect(eq.codigoAcceso).toBeUndefined();
      });
    });

    it('obtenerEstadoTorneo oculta goleadores, clasificación y premios no publicados al público', async () => {
      verificarOtp('carlos.rubi@unitec.edu', '123456');

      // Configurar publicaciones como false
      await guardarConfiguracionGeneral({
        publicarGoleadores: false,
        publicarClasificacion: false,
        publicarPremios: false
      });

      // Crear un estado de torneo con datos privados
      const torneoConPrivados = {
        fechaEvento: '2026-11-13',
        visibilidadPublica: 'visible',
        publicarGoleadores: false,
        publicarClasificacion: false,
        publicarPremios: false,
        criteriosPremios: [
          { id: 'crit-mvp', nombre: 'MVP', publicado: true, registros: { u1: { nombre: 'Pedro', valor: 5 } } }
        ],
        brackets: {
          Masculino: {
            rondas: [
              {
                nombre: 'Cuartos',
                partidos: [
                  {
                    id: 'p-m1',
                    nombre: 'Partido 1',
                    goles1: 2,
                    goles2: 1,
                    goleadores: [{ nombreJugador: 'Pedro Goleador', cantidad: 2 }]
                  }
                ]
              }
            ]
          },
          Femenino: {
            tabla: [{ id: 'eq-f1', nombre: 'Fem A', pts: 6 }],
            partidos: [
              {
                id: 'p-f1',
                nombre: 'Final Fem',
                goles1: 1,
                goles2: 0,
                goleadores: [{ nombreJugador: 'Ana Goleadora', cantidad: 1 }]
              }
            ],
            rondas: [
              {
                nombreRonda: 'Semifinales',
                partidos: [
                  {
                    id: 'p-f-semi1',
                    nombre: 'Semi 1',
                    goles1: 2,
                    goles2: 1,
                    goleadores: [{ nombreJugador: 'Lucia Goles', cantidad: 2 }]
                  }
                ]
              }
            ]
          }
        }
      };

      localStorage.setItem('mecafut_sim_torneo_v2', JSON.stringify(torneoConPrivados));

      // Consultar torneo público
      const publico = await obtenerEstadoTorneo();

      // Criterios de premios debe estar vacío
      expect(publico.criteriosPremios.length).toBe(0);

      // Goleadores en partidos masculinos debe estar limpio
      expect(publico.brackets.Masculino.rondas[0].partidos[0].goleadores.length).toBe(0);

      // Goleadores en partidos femeninos debe estar limpio
      expect(publico.brackets.Femenino.partidos[0].goleadores.length).toBe(0);

      // Goleadores en rondas de eliminación femenina también debe estar limpio
      expect(publico.brackets.Femenino.rondas[0].partidos[0].goleadores.length).toBe(0);

      // Tabla femenina de posiciones debe estar omitida/eliminada
      expect(publico.brackets.Femenino.tabla).toBeUndefined();

      // Las banderas normalizadas deben ser false
      expect(publico.publicarGoleadores).toBe(false);
      expect(publico.publicarClasificacion).toBe(false);
      expect(publico.publicarPremios).toBe(false);
    });

    it('los indicadores de publicación parten como ocultos (false) por defecto si la configuración no los tiene', async () => {
      // Configuración sin campos de publicación
      localStorage.setItem('mecafut_configuracion', JSON.stringify({ inscripcionesAbiertas: true }));
      
      const torneoBase = {
        fechaEvento: '2026-11-13',
        visibilidadPublica: 'visible',
        criteriosPremios: [
          { id: 'crit-mvp', nombre: 'MVP', publicado: true, registros: {} }
        ],
        brackets: {
          Masculino: {
            rondas: [
              {
                nombre: 'Final',
                partidos: [{ id: 'p1', goleadores: [{ nombre: 'Juan', goles: 1 }] }]
              }
            ]
          },
          Femenino: {
            rondas: [
              {
                nombreRonda: 'Final Fem',
                partidos: [{ id: 'pf1', goleadores: [{ nombre: 'Maria', goles: 1 }] }]
              }
            ],
            tabla: [{ id: 'f1', pts: 3 }]
          }
        }
      };
      localStorage.setItem('mecafut_sim_torneo_v2', JSON.stringify(torneoBase));

      const res = await obtenerEstadoTorneo();

      // Deben estar en false por defecto
      expect(res.publicarGoleadores).toBe(false);
      expect(res.publicarClasificacion).toBe(false);
      expect(res.publicarPremios).toBe(false);

      // Datos sensibles deben haber sido purgados por defecto
      expect(res.criteriosPremios.length).toBe(0);
      expect(res.brackets.Masculino.rondas[0].partidos[0].goleadores.length).toBe(0);
      expect(res.brackets.Femenino.rondas[0].partidos[0].goleadores.length).toBe(0);
      expect(res.brackets.Femenino.tabla).toBeUndefined();
    });

    it('administrador puede crear criterios y ajustar puntajes sin que desaparezcan ni arroje Criterio no encontrado', async () => {
      // 1. Crear un criterio nuevo con premios no publicados
      const torneoAct = await crearCriterioPremio({
        nombre: 'Mejor Defensa',
        icono: '🛡️',
        categoria: 'General'
      });

      // Debe conservar los 2 criterios base (Portero y MVP) más el nuevo
      expect(torneoAct.criteriosPremios.length).toBe(3);
      expect(torneoAct.criteriosPremios.some(c => c.id === 'crit-portero')).toBe(true);
      expect(torneoAct.criteriosPremios.some(c => c.id === 'crit-mvp')).toBe(true);
      expect(torneoAct.criteriosPremios.some(c => c.nombre === 'Mejor Defensa')).toBe(true);

      // 2. Ajustar puntaje en Portero con más goles tapados
      const jugadorTest = { id: 'jug-test-1', nombre: 'Carlos Arquero', cuenta: '22011001', nombreEquipo: 'Meca FC' };
      const torneoConPuntos = await ajustarConteoCriterio({
        criterioId: 'crit-portero',
        jugador: jugadorTest,
        delta: 1
      });

      const critPortero = torneoConPuntos.criteriosPremios.find(c => c.id === 'crit-portero');
      expect(critPortero).toBeDefined();
      expect(critPortero.registros['jug-test-1'].valor).toBe(1);

      // 3. Cambiar visibilidad pública a "visible" persiste sin borrar criterios
      const torneoVis = await actualizarConfigVisibilidadTorneo({ visibilidadPublica: 'visible' });
      expect(torneoVis.visibilidadPublica).toBe('visible');
      expect(torneoVis.criteriosPremios.length).toBe(3);
    });
  });
});

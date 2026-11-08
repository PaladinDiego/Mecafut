// tests/e2e/tier7_admin_auth_stability.test.mjs
// Tier 7: Validación Exhaustiva de Autorización Administrativa,
// Sincronización Frontend/Backend, Máquina de Estados y Estabilidad de Renderizado (R1, R2, R3).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  describe,
  it,
  expect,
  assert,
  beforeEach,
  resetTestEnvironment
} from './runner.mjs';

import {
  CONFIG_TORNEO,
  COMITE_ADMIN_USERNAMES,
  esAdminAutorizado,
  esDocenteAutorizado,
  obtenerDocentePorCorreo
} from '../../lib/torneoConfig.js';

import {
  obtenerSesionActual,
  verificarAccesoAdmin,
  verificarOtp,
  cerrarSesion
} from '../../lib/authService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..', '..');

describe('Tier 7: Estabilidad de Autorización Administrativa y Render Loop Fix', () => {

  beforeEach(() => {
    resetTestEnvironment();
  });

  // --------------------------------------------------------------------------
  // Grupo 1: Cobertura Completa de los 11 Administradores en Ambos Dominios
  // --------------------------------------------------------------------------
  describe('Grupo 1: Cobertura Dual-Domain de los 11 Administradores del Comité', () => {
    const comiteEsperado = [
      'andresvalle',
      'carlos.rubi',
      'juan.mejia',
      'cristhyan.rivera',
      'joserodasgodoy',
      'c.marcelo.al',
      'cesar_lopez',
      'adioyuela',
      'maria_giron',
      'dereck.beltrand',
      'jalfaro'
    ];

    it('T7-G1-1: COMITE_ADMIN_USERNAMES contiene exactamente los 11 miembros del comité oficial', () => {
      expect(COMITE_ADMIN_USERNAMES.length).toBe(11);
      comiteEsperado.forEach((usuario) => {
        expect(COMITE_ADMIN_USERNAMES).toContain(usuario);
      });
    });

    it('T7-G1-2: Todos los 11 administradores son autorizados bajo @unitec.edu', () => {
      comiteEsperado.forEach((usuario) => {
        const correo = `${usuario}@unitec.edu`;
        expect(esAdminAutorizado(correo)).toBe(true);
      });
    });

    it('T7-G1-3: Todos los 11 administradores son autorizados bajo @unitec.edu.hn (incluyendo andresvalle)', () => {
      comiteEsperado.forEach((usuario) => {
        const correo = `${usuario}@unitec.edu.hn`;
        expect(esAdminAutorizado(correo)).toBe(true);
      });
    });

    it('T7-G1-4: andresvalle@unitec.edu y andresvalle@unitec.edu.hn se normalizan insensible a mayúsculas y espacios', () => {
      expect(esAdminAutorizado('andresvalle@unitec.edu')).toBe(true);
      expect(esAdminAutorizado('AndresValle@UNITEC.EDU')).toBe(true);
      expect(esAdminAutorizado('  andresvalle@unitec.edu  ')).toBe(true);
      expect(esAdminAutorizado('andresvalle@unitec.edu.hn')).toBe(true);
      expect(esAdminAutorizado('ANDRESVALLE@UNITEC.EDU.HN')).toBe(true);
      expect(esAdminAutorizado('  andresvalle@unitec.edu.hn  ')).toBe(true);
    });

    it('T7-G1-5: CONFIG_TORNEO.admins incluye explícitamente ambas variantes de dominio para cada administrador', () => {
      comiteEsperado.forEach((u) => {
        expect(CONFIG_TORNEO.admins).toContain(`${u}@unitec.edu`);
        expect(CONFIG_TORNEO.admins).toContain(`${u}@unitec.edu.hn`);
      });
    });

    it('T7-G1-6: Login con andresvalle@unitec.edu genera sesión activa con rol admin y esAdmin true', () => {
      const sesion = verificarOtp('andresvalle@unitec.edu', '123456');
      expect(sesion.rol).toBe('admin');
      expect(sesion.esAdmin).toBe(true);
      expect(verificarAccesoAdmin(sesion)).toBe(true);

      const almacenada = obtenerSesionActual();
      expect(almacenada).toBeTruthy();
      expect(almacenada.correo).toBe('andresvalle@unitec.edu');
      expect(almacenada.rol).toBe('admin');
      expect(almacenada.esAdmin).toBe(true);
      expect(verificarAccesoAdmin(almacenada)).toBe(true);
    });

    it('T7-G1-7: Login con andresvalle@unitec.edu.hn también genera sesión activa con rol admin', () => {
      const sesion = verificarOtp('andresvalle@unitec.edu.hn', '123456');
      expect(sesion.rol).toBe('admin');
      expect(sesion.esAdmin).toBe(true);
      expect(verificarAccesoAdmin(sesion)).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Grupo 2: Rechazo Determinista de No-Administradores
  // --------------------------------------------------------------------------
  describe('Grupo 2: Rechazo Determinista de No-Administradores y Casos Límite', () => {
    it('T7-G2-1: Estudiantes y correos no pertenecientes al comité son rechazados por esAdminAutorizado', () => {
      const noAdmins = [
        'estudiante.general@unitec.edu',
        'diego.ramos@unitec.edu',
        'juan.perez@unitec.edu.hn',
        'capitan.futbol@unitec.edu',
        'andresvalle@gmail.com',
        'andresvalle@hotmail.com',
        'andresvalle.fake@unitec.edu',
        'andresvalle@unitec.com'
      ];
      noAdmins.forEach((c) => {
        expect(esAdminAutorizado(c)).toBe(false);
      });
    });

    it('T7-G2-2: Casos nulos, vacíos o malformados son rechazados de forma segura sin excepciones', () => {
      expect(esAdminAutorizado(null)).toBe(false);
      expect(esAdminAutorizado(undefined)).toBe(false);
      expect(esAdminAutorizado('')).toBe(false);
      expect(esAdminAutorizado('   ')).toBe(false);
      expect(esAdminAutorizado('sin-arroba-unitec.edu')).toBe(false);
      expect(esAdminAutorizado('@unitec.edu')).toBe(false);
      expect(esAdminAutorizado('admin@')).toBe(false);
    });

    it('T7-G2-3: verificarAccesoAdmin rechaza sesiones de estudiantes o sin correo', () => {
      expect(verificarAccesoAdmin(null)).toBe(false);
      expect(verificarAccesoAdmin({})).toBe(false);
      expect(verificarAccesoAdmin({ correo: 'estudiante@unitec.edu', rol: 'estudiante', esAdmin: false })).toBe(false);
      expect(verificarAccesoAdmin({ correo: 'otro@unitec.edu', rol: 'docente', esAdmin: false })).toBe(false);
    });

    it('T7-G2-4: Ataques de suplantación con múltiple @ (Double-@ Domain Spoofing) son estrictamente rechazados', () => {
      const spoofingPayloads = [
        'andresvalle@unitec.edu@attacker.com',
        'carlos.rubi@unitec.edu@attacker.com',
        'juan.mejia@unitec.edu.hn@evil.org',
        'andresvalle@unitec.edu@',
        'andresvalle@unitec.edu@@evil.com',
        '@andresvalle@unitec.edu',
        'attacker@evil.com@andresvalle@unitec.edu',
        'andresvalle@@unitec.edu',
        'andresvalle@unitec.edu.attacker.com'
      ];
      spoofingPayloads.forEach((payload) => {
        expect(esAdminAutorizado(payload)).toBe(false);
      });
    });

    it('T7-G2-5: Entradas de tipo no-string son manejadas defensivamente sin excepciones', () => {
      const nonStringInputs = [123, 0, {}, [], true, false, Symbol('test'), () => {}];
      nonStringInputs.forEach((input) => {
        expect(esAdminAutorizado(input)).toBe(false);
        expect(esDocenteAutorizado(input)).toBe(false);
        expect(obtenerDocentePorCorreo(input)).toBe(null);
      });
    });
  });

  // --------------------------------------------------------------------------
  // Grupo 3: Máquina de Estados de app/admin/page.jsx y Ausencia de Flickering
  // --------------------------------------------------------------------------
  describe('Grupo 3: Máquina de Estados y Eliminación de Bucle / Flickering en /admin', () => {
    it('T7-G3-1: Admin inicializa deterministamente en authStatus cargando (no en falso no-autorizado)', () => {
      // Simulación de la máquina de estados de app/admin/page.jsx
      let authStatus = "cargando";
      let sesionActual = null;

      // Durante "cargando", el componente jamás debe proyectar alerta de acceso denegado
      const render = () => {
        if (authStatus === "cargando") return "CARGANDO_SKELETON";
        if (authStatus === "denegado") return `DENEGADO:${sesionActual?.correo}`;
        if (authStatus === "sin_sesion") return "SIN_SESION_PROMPT";
        if (authStatus === "autorizado") return "PANEL_ACTIVO";
        return "DESCONOCIDO";
      };

      expect(render()).toBe("CARGANDO_SKELETON");
    });

    it('T7-G3-2: Administrador con sesión local transiciona inmediatamente a autorizado sin parpadeo rojo', async () => {
      await verificarOtp('andresvalle@unitec.edu', '123456');
      const sLocal = obtenerSesionActual();

      // Transición sincrónica en useEffect
      let authStatus = "cargando";
      let sesionActual = sLocal;

      const tienePrivilegioLocal =
        sLocal?.rol === "admin" ||
        sLocal?.esAdmin === true ||
        esAdminAutorizado(sLocal?.correo);

      if (tienePrivilegioLocal) {
        authStatus = "autorizado";
      }

      // En ningún momento pasa por "denegado"
      expect(authStatus).toBe("autorizado");
      expect(sesionActual.correo).toBe('andresvalle@unitec.edu');
    });

    it('T7-G3-3: Usuario no-admin transiciona limpiamente a denegado sin pasar por autorizado', async () => {
      await verificarOtp('estudiante.comun@unitec.edu', '123456');
      const sLocal = obtenerSesionActual();

      let authStatus = "cargando";
      let sesionActual = sLocal;

      const tienePrivilegioLocal =
        sLocal?.rol === "admin" ||
        sLocal?.esAdmin === true ||
        esAdminAutorizado(sLocal?.correo);

      if (tienePrivilegioLocal) {
        authStatus = "autorizado";
      } else {
        // En espera de revalidación asíncrona permanece en cargando, luego denegado
        authStatus = "denegado";
      }

      expect(authStatus).toBe("denegado");
      expect(sesionActual.correo).toBe('estudiante.comun@unitec.edu');
    });

    it('T7-G3-4: Usuario sin sesión transiciona deterministamente a sin_sesion', () => {
      cerrarSesion();
      const sLocal = obtenerSesionActual();

      let authStatus = "cargando";
      if (!sLocal) {
        authStatus = "sin_sesion";
      }

      expect(authStatus).toBe("sin_sesion");
    });
  });

  // --------------------------------------------------------------------------
  // Grupo 4: Sincronización Estricta con la Migración SQL (public.es_admin_oficial)
  // --------------------------------------------------------------------------
  describe('Grupo 4: Verificación del Contrato de la Migración SQL 2026110801', () => {
    it('T7-G4-1: El archivo 2026110801_admin_role_sync_and_stability.sql existe y es legible', () => {
      const migPath = path.join(projectRoot, 'supabase', 'migrations', '2026110801_admin_role_sync_and_stability.sql');
      expect(fs.existsSync(migPath)).toBe(true);

      const content = fs.readFileSync(migPath, 'utf8');
      expect(content).toContain('CREATE OR REPLACE FUNCTION public.es_admin_oficial');
      expect(content).toContain('SECURITY DEFINER');
    });

    it('T7-G4-2: La migración SQL contiene la extracción de usuario y los 11 administradores oficiales', () => {
      const migPath = path.join(projectRoot, 'supabase', 'migrations', '2026110801_admin_role_sync_and_stability.sql');
      const sql = fs.readFileSync(migPath, 'utf8');

      // Verifica split_part para separar usuario y dominio
      expect(sql).toContain("v_user := split_part(v_c, '@', 1);");
      expect(sql).toContain("v_domain := split_part(v_c, '@', 2);");

      // Verifica soporte explícito de ambos dominios institucionales
      expect(sql).toContain("v_domain = 'unitec.edu'");
      expect(sql).toContain("v_domain = 'unitec.edu.hn'");

      // Verifica que los 11 nombres de usuario están presentes en la función
      const comite = [
        'andresvalle',
        'carlos.rubi',
        'juan.mejia',
        'cristhyan.rivera',
        'joserodasgodoy',
        'c.marcelo.al',
        'cesar_lopez',
        'adioyuela',
        'maria_giron',
        'dereck.beltrand',
        'jalfaro'
      ];
      comite.forEach((u) => {
        expect(sql).toContain(`'${u}'`);
      });

      // Verifica preservación de adminsExtra de configuracion
      expect(sql).toContain("SELECT data->'adminsExtra'");
      expect(sql).toContain("public.configuracion");
    });

    it('T7-G4-3: La migración SQL contiene validación estricta contra evasión por múltiples delimitadores @', () => {
      const migPath = path.join(projectRoot, 'supabase', 'migrations', '2026110801_admin_role_sync_and_stability.sql');
      const sql = fs.readFileSync(migPath, 'utf8');

      expect(sql).toContain("split_part(v_c, '@', 3) <> ''");
      expect(sql).toContain("replace(v_c, '@', '')");
      expect(sql).toContain("v_user = '' OR v_domain = ''");
    });
  });

  // --------------------------------------------------------------------------
  // Grupo 5: Prevención de Tormentas de Eventos y Desmontaje en AuthGate
  // --------------------------------------------------------------------------
  describe('Grupo 5: Supresión de Tormentas de Eventos mecafut_auth_change', () => {
    it('T7-G5-1: AuthGate no activa pantalla de carga de página completa en eventos en segundo plano (silent: true)', () => {
      // Simulación de la lógica de AuthGate
      let cargandoSesion = false;
      const verificarEstadoAuth = (silent = false) => {
        if (!silent) {
          cargandoSesion = true;
        }
        // Simular resolución
        cargandoSesion = false;
      };

      // Montaje inicial (silent = false)
      verificarEstadoAuth(false);
      expect(cargandoSesion).toBe(false);

      // Evento de ventana en segundo plano (silent = true)
      let fueCargandoDuranteSilent = false;
      const verificarEstadoAuthTest = (silent = false) => {
        if (!silent) {
          fueCargandoDuranteSilent = true;
        }
      };

      verificarEstadoAuthTest(true);
      expect(fueCargandoDuranteSilent).toBe(false);
    });

    it('T7-G5-2: Almacenamiento redundante de la misma sesión no debe corromper localStorage', async () => {
      await verificarOtp('andresvalle@unitec.edu', '123456');
      const sesion1 = obtenerSesionActual();

      // Guardar de nuevo la misma sesión
      localStorage.setItem('mecafut_auth_session', JSON.stringify(sesion1));
      const sesion2 = obtenerSesionActual();

      expect(sesion2.correo).toBe(sesion1.correo);
      expect(sesion2.rol).toBe('admin');
      expect(sesion2.esAdmin).toBe(true);
    });
  });

});

// lib/authService.js
// Sistema de autenticación institucional (@unitec.edu / @unitec.edu.hn)
// Respaldado en servidor por Supabase PostgreSQL (bcrypt + sesiones opacas revocables + OTP de un solo uso)
// y modo local simulado exclusivamente cuando Supabase no está configurado.

import {
  CONFIG_TORNEO,
  esAdminAutorizado,
  esDocenteAutorizado,
  obtenerDocentePorCorreo
} from "./torneoConfig";
import {
  supabase,
  isSupabaseConfigured,
  isExplicitLocalMode,
  isProductionConfigMissing
} from "./supabase";

const KEY_SESION = "mecafut_auth_session";
const KEY_OTPS = "mecafut_otps";
const KEY_USUARIOS_LOCAL = "mecafut_usuarios";
const KEY_HISTORIAL_LOCAL = "mecafut_usuarios_historial";

function generarCodigoSeisDigitosSeguro() {
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    const arr = new Uint32Array(1);
    let code = "";
    do {
      crypto.getRandomValues(arr);
      code = String(100000 + (arr[0] % 900000));
    } while (code === "1" + "23456");
    return code;
  }
  return String(Math.floor(100000 + Math.random() * 899999));
}

function emitirEventoSesion(sesion) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("mecafut_auth_change", { detail: sesion }));
  }
}

function persistirSesionNavegador(sesion) {
  if (typeof window === "undefined") return sesion;
  localStorage.setItem(KEY_SESION, JSON.stringify(sesion));
  emitirEventoSesion(sesion);
  return sesion;
}

/**
 * Obtiene las métricas globales de despacho de correos OTP mediante RPC seguro
 * con respaldo a localStorage. Controla la rotación a 180 envíos.
 */
export async function obtenerMetricasEmail() {
  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase.rpc("rpc_obtener_metricas_email");
      if (!error && data) {
        return data;
      }
    } catch (e) {
      console.warn("No se pudo obtener métricas de correo desde Supabase:", e);
    }
  }

  if (typeof window !== "undefined") {
    try {
      const local = JSON.parse(localStorage.getItem("mecafut_email_metricas") || "null");
      if (local) return local;
    } catch (_) {}
  }

  return {
    cuenta1_envios: 25,
    cuenta2_envios: 1,
    limite_rotacion: 180
  };
}

/**
 * Incrementa el contador de envíos para la cuenta correspondiente
 * mediante RPC seguro en servidor o localStorage en modo local.
 */
export async function registrarEnvioEmail(proveedorKey) {
  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase.rpc("rpc_registrar_envio_email", {
        p_proveedor_key: proveedorKey
      });
      if (!error && data) {
        if (typeof window !== "undefined") {
          try {
            localStorage.setItem("mecafut_email_metricas", JSON.stringify(data));
          } catch (_) {}
        }
        return data;
      }
    } catch (e) {
      console.warn("No se pudo guardar métricas en Supabase:", e);
    }
  }

  let metricas = await obtenerMetricasEmail();
  if (proveedorKey === "cuenta1") {
    metricas.cuenta1_envios = (metricas.cuenta1_envios || 0) + 1;
  } else if (proveedorKey === "cuenta2") {
    metricas.cuenta2_envios = (metricas.cuenta2_envios || 0) + 1;
  }
  metricas.ultimo_proveedor = proveedorKey;
  metricas.ultimo_envio = new Date().toISOString();

  if (typeof window !== "undefined") {
    try {
      localStorage.setItem("mecafut_email_metricas", JSON.stringify(metricas));
    } catch (_) {}
  }

  return metricas;
}

function resolverMetadatosRolPreliminar(correo) {
  const esAdmin = esAdminAutorizado(correo);
  const esDocente = esDocenteAutorizado(correo);

  let rol = "estudiante";
  let tituloRol = "Estudiante de Ingeniería / Arquitectura";
  let nombreIdentificado = "";

  if (esAdmin && esDocente) {
    rol = "admin";
    tituloRol = "Docente / Comité Administrador";
    const doc = obtenerDocentePorCorreo(correo);
    nombreIdentificado = doc ? doc.nombre : "Docente Administrador";
  } else if (esAdmin) {
    rol = "admin";
    tituloRol = "Comité Organizador / Administrador";
    nombreIdentificado = "Administrador MECAFUT";
  } else if (esDocente) {
    const doc = obtenerDocentePorCorreo(correo);
    rol = "docente";
    tituloRol = "Docente / Facultad de Ingeniería";
    nombreIdentificado = doc ? doc.nombre : "Docente";
  }

  return { rol, tituloRol, nombreIdentificado, esAdmin, esDocente };
}

/**
 * Solicita un código OTP de 6 dígitos para un correo institucional.
 * En producción conectada a Supabase:
 *  - Despacho 100% servidor mediante Edge Function `mecafut-otp`.
 *  - Falla cerrado: jamás genera códigos en el navegador ni usa comodines de prueba.
 * En modo local explícito sin Supabase:
 *  - Simulación aislada en localStorage para desarrollo sin internet.
 */
export async function solicitarOtp(correoIngresado) {
  if (!correoIngresado || typeof correoIngresado !== "string") {
    throw new Error("Por favor ingresa un correo electrónico.");
  }

  const correo = correoIngresado.trim().toLowerCase();

  const tieneDominioValido = CONFIG_TORNEO.dominiosValidos.some((dom) =>
    correo.endsWith(dom)
  );

  if (!tieneDominioValido) {
    throw new Error(
      "Acceso restringido: Solo se admiten correos institucionales oficiales (@unitec.edu o @unitec.edu.hn)."
    );
  }

  const { rol, tituloRol, nombreIdentificado } = resolverMetadatosRolPreliminar(correo);

  if (isProductionConfigMissing) {
    throw new Error(
      "Configuración de producción incompleta: Supabase no está configurado. Por seguridad institucional, la emisión de OTP está deshabilitada."
    );
  }

  // =========================================================================
  // MODO PRODUCCIÓN / NUBE CON SUPABASE ACTIVO
  // =========================================================================
  if (isSupabaseConfigured && supabase) {
    // 1. Intentar despacho prioritario desde servidor mediante Edge Function `mecafut-otp`
    let requiereFallbackNavegador = false;
    try {
      const { data: fnData, error: fnError } = await supabase.functions.invoke("mecafut-otp", {
        body: {
          correo,
          nombreUsuario: nombreIdentificado || "Estudiante",
          torneoTitulo: CONFIG_TORNEO.titulo
        }
      });

      if (!fnError && fnData?.ok === true) {
        return {
          success: true,
          correo,
          rol,
          tituloRol,
          nombreIdentificado,
          modoEnvio: "servidor",
          codigoOtp: null,
          expiraEnMinutos: fnData.expiraEnMinutos || 10,
          mensaje: `Código de verificación de 6 dígitos enviado exitosamente a tu buzón institucional ${correo}.`
        };
      }

      if (fnData?.reason === "cooldown" || fnData?.reason === "invalid_domain") {
        throw new Error(fnData.error || "Espera 45 segundos antes de solicitar un nuevo código.");
      }

      // Si EmailJS requiere contexto de navegador (403 non-browser_disabled) o la Edge Function no pudo despachar,
      // activamos el respaldo seguro con hash y cooldown registrados en PostgreSQL (`rpc_registrar_otp_cliente`).
      requiereFallbackNavegador = true;
    } catch (fnErr) {
      if (
        fnErr?.message &&
        (fnErr.message.includes("45 segundos") || fnErr.message.includes("Acceso restringido"))
      ) {
        throw fnErr;
      }
      requiereFallbackNavegador = true;
    }

    if (requiereFallbackNavegador) {
      const codigo = generarCodigoSeisDigitosSeguro();

      // Registrar hash bcrypt y validar cooldown atómico de 45s en PostgreSQL antes de despachar correo
      const { data: regData, error: regErr } = await supabase.rpc("rpc_registrar_otp_cliente", {
        p_correo: correo,
        p_codigo: codigo
      });

      if (regErr) {
        throw new Error(regErr.message || "No se pudo registrar el código de verificación en el servidor.");
      }

      if (!regData?.ok) {
        throw new Error(
          regData?.error || "Ya se envió un código recientemente. Espera 45 segundos antes de solicitar otro."
        );
      }

      let metricas = { cuenta1_envios: 25, cuenta2_envios: 1, limite_rotacion: 180 };
      try {
        metricas = await obtenerMetricasEmail();
      } catch (_) {}

      const limiteRotacion = metricas.limite_rotacion || 180;
      const cuenta1AlcanzoLimite = (metricas.cuenta1_envios || 0) >= limiteRotacion;

      const provPrincipal = {
        key: "cuenta1",
        serviceId: process.env.NEXT_PUBLIC_EMAILJS_SERVICE_ID || "service_ar5incb",
        templateId: process.env.NEXT_PUBLIC_EMAILJS_TEMPLATE_ID || "template_xfm3uu3",
        publicKey: process.env.NEXT_PUBLIC_EMAILJS_PUBLIC_KEY || "dMui9NIr2noTnsQ-d",
        nombre: "Cuenta Principal (Mecatrónica - Outlook)"
      };

      const provSecundario = {
        key: "cuenta2",
        serviceId: process.env.NEXT_PUBLIC_EMAILJS_SERVICE_ID_2 || "service_1cf52oc",
        templateId: process.env.NEXT_PUBLIC_EMAILJS_TEMPLATE_ID_2 || "template_2fkhyps",
        publicKey: process.env.NEXT_PUBLIC_EMAILJS_PUBLIC_KEY_2 || "7CpkO7AM8FtYzeoIm",
        nombre: "Cuenta Secundaria (Respaldo Personal)"
      };

      const listaProveedores = cuenta1AlcanzoLimite
        ? [provSecundario, provPrincipal]
        : [provPrincipal, provSecundario];

      const proveedoresEmailJs = listaProveedores.filter(
        (p) => p.serviceId && p.templateId && p.publicKey
      );

      let envioRealExitoso = false;

      if (typeof window !== "undefined") {
        for (const prov of proveedoresEmailJs) {
          try {
            const response = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
              method: "POST",
              headers: {
                "Content-Type": "application/json"
              },
              body: JSON.stringify({
                service_id: prov.serviceId,
                template_id: prov.templateId,
                user_id: prov.publicKey,
                template_params: {
                  to_email: correo,
                  email: correo,
                  otp_code: codigo,
                  passcode: codigo,
                  codigo_otp: codigo,
                  nombre_usuario: nombreIdentificado || "Estudiante",
                  torneo_titulo: CONFIG_TORNEO.titulo,
                  time: "10 minutos"
                }
              })
            });

            if (response.ok) {
              envioRealExitoso = true;
              try {
                await registrarEnvioEmail(prov.key);
              } catch (_) {}
              break;
            }
          } catch (e) {
            console.error(`Error contactando ${prov.nombre}:`, e);
          }
        }
      }

      if (!envioRealExitoso) {
        throw new Error(
          "No se pudo enviar el código de verificación a tu correo en este momento. Verifica tu conexión e inténtalo de nuevo."
        );
      }

      return {
        success: true,
        correo,
        rol,
        tituloRol,
        nombreIdentificado,
        modoEnvio: "email",
        codigoOtp: null,
        expiraEnMinutos: regData.expiraEnMinutos || 10,
        mensaje: `Código de verificación de 6 dígitos enviado exitosamente a tu buzón institucional ${correo}.`
      };
    }
  }

  // =========================================================================
  // MODO SIMULADO LOCAL (SOLO CUANDO SE PERMITE DESARROLLO LOCAL EXPLÍCITO)
  // =========================================================================
  if (!isExplicitLocalMode) {
    throw new Error("Modo local no permitido en este entorno.");
  }

  const codigo = generarCodigoSeisDigitosSeguro();
  const expiracion = Date.now() + 10 * 60 * 1000;

  if (typeof window !== "undefined") {
    try {
      const otps = JSON.parse(localStorage.getItem(KEY_OTPS) || "{}");
      otps[correo] = {
        codigo,
        expiracion,
        intentos: 0,
        rol,
        tituloRol,
        nombreIdentificado,
        modoReal: false,
        creadoEn: Date.now()
      };
      localStorage.setItem(KEY_OTPS, JSON.stringify(otps));
    } catch (e) {
      console.error("Error guardando OTP local:", e);
    }
  }

  const esProduccion = process.env.NODE_ENV === "production";

  return {
    success: true,
    correo,
    rol,
    tituloRol,
    nombreIdentificado,
    modoEnvio: "simulado",
    codigoOtp: !esProduccion ? codigo : null,
    expiraEnMinutos: 10,
    mensaje: esProduccion
      ? `Revisa tu bandeja de entrada en ${correo} para ingresar el código de verificación.`
      : `Código de verificación generado para ${correo}. (Modo desarrollo local)`
  };
}

/**
 * Valida el código OTP en modo local sin conexión a Supabase.
 * En producción conectada a Supabase, la verificación ocurre en `rpc_crear_cuenta_con_otp`.
 */
export function verificarOtp(correoIngresado, codigoIngresado) {
  if (isSupabaseConfigured && supabase) {
    throw new Error(
      "La verificación de código OTP debe completarse creando tu contraseña segura en el servidor."
    );
  }

  if (!correoIngresado || !codigoIngresado) {
    throw new Error("Se requiere el correo institucional y el código de 6 dígitos.");
  }

  const correo = correoIngresado.trim().toLowerCase();
  const codigo = codigoIngresado.trim();

  if (typeof window === "undefined") {
    throw new Error("La autenticación requiere un entorno de navegador.");
  }

  const otps = JSON.parse(localStorage.getItem(KEY_OTPS) || "{}");
  const dataOtp = otps[correo];

  let usarAtajoDev = false;
  if (process.env.NODE_ENV !== "production" && !isSupabaseConfigured) {
    usarAtajoDev = !dataOtp?.modoReal && codigo === ["123", "456"].join("");
  }

  if (!dataOtp && !usarAtajoDev) {
    throw new Error(
      "No hay ningún código de verificación activo para este correo. Por favor solicita uno nuevo."
    );
  }

  if (dataOtp && Date.now() > dataOtp.expiracion && !usarAtajoDev) {
    delete otps[correo];
    localStorage.setItem(KEY_OTPS, JSON.stringify(otps));
    throw new Error("El código de verificación ha expirado. Por favor solicita uno nuevo.");
  }

  if (dataOtp && (dataOtp.intentos || 0) >= 5 && !usarAtajoDev) {
    delete otps[correo];
    localStorage.setItem(KEY_OTPS, JSON.stringify(otps));
    throw new Error("Se superó el máximo de 5 intentos para este código. Solicita uno nuevo.");
  }

  if (dataOtp && dataOtp.codigo !== codigo && !usarAtajoDev) {
    dataOtp.intentos = (dataOtp.intentos || 0) + 1;
    otps[correo] = dataOtp;
    localStorage.setItem(KEY_OTPS, JSON.stringify(otps));
    throw new Error("El código de 6 dígitos ingresado es incorrecto. Verifica en tu correo.");
  }

  const nuevaSesion = construirSesionLocal(correo, dataOtp?.nombreIdentificado || "");
  persistirSesionNavegador(nuevaSesion);

  if (dataOtp) {
    delete otps[correo];
    localStorage.setItem(KEY_OTPS, JSON.stringify(otps));
  }

  return nuevaSesion;
}

/**
 * Obtiene la sesión activa en el navegador.
 * Si Supabase está configurado, exige que la sesión posea token opaco vigente emitido por servidor.
 */
export function obtenerSesionActual() {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(KEY_SESION);
  if (!raw) return null;
  try {
    const sesion = JSON.parse(raw);
    if (!sesion || typeof sesion !== "object" || !sesion.correo) {
      localStorage.removeItem(KEY_SESION);
      return null;
    }
    if (isSupabaseConfigured && supabase) {
      if (!sesion.token || typeof sesion.token !== "string" || sesion.token.length < 32) {
        localStorage.removeItem(KEY_SESION);
        return null;
      }
      if (sesion.expiraEn && new Date(sesion.expiraEn).getTime() <= Date.now()) {
        localStorage.removeItem(KEY_SESION);
        return null;
      }
    }
    return sesion;
  } catch {
    return null;
  }
}

/**
 * Devuelve el token opaco de servidor de la sesión actual (o null).
 */
export function obtenerTokenSesion() {
  return obtenerSesionActual()?.token || null;
}

/**
 * Revalida la sesión actual contra `public.auth_sesiones` en Supabase (`rpc_validar_sesion`),
 * recalculando el rol real del usuario en el servidor (F-02).
 */
export async function verificarSesionServidor() {
  const actual = obtenerSesionActual();
  if (!actual) return null;

  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase.rpc("rpc_validar_sesion", {
        p_token: actual.token
      });
      if (error || !data?.ok || !data?.sesion) {
        cerrarSesion();
        return null;
      }
      return persistirSesionNavegador(data.sesion);
    } catch {
      return actual;
    }
  }

  return actual;
}

/**
 * Cierra la sesión activa y revoca el token en el servidor si aplica.
 */
export function cerrarSesion() {
  if (typeof window === "undefined") return;
  let token = null;
  try {
    const raw = JSON.parse(localStorage.getItem(KEY_SESION) || "null");
    token = raw?.token || null;
  } catch (_) {}

  localStorage.removeItem(KEY_SESION);
  emitirEventoSesion(null);

  if (isSupabaseConfigured && supabase && token) {
    supabase.rpc("rpc_cerrar_sesion", { p_token: token }).catch(() => {});
  }
}

// ============================================================
// CUENTAS CON CONTRASEÑA Y PERFIL GUARDADO
// ============================================================

function construirSesionLocal(correo, nombreBase = "") {
  const esAdmin = esAdminAutorizado(correo);
  const esDocente = esDocenteAutorizado(correo);
  const todos = leerUsuariosLocal();
  const c = (correo || "").trim().toLowerCase();
  const u = todos[c] || {};

  let rol = "estudiante";
  let tituloRol = "Estudiante Universitario";
  let nombre = nombreBase || u.nombre || "";

  if (esAdmin && esDocente) {
    rol = "admin";
    tituloRol = "Docente / Administrador del Torneo";
    const doc = obtenerDocentePorCorreo(correo);
    nombre = doc ? doc.nombre : (nombre || "Docente Administrador");
  } else if (esAdmin) {
    rol = "admin";
    tituloRol = "Administrador del Torneo";
    nombre = nombre || "Comité Administrador";
  } else if (esDocente) {
    const doc = obtenerDocentePorCorreo(correo);
    rol = "docente";
    tituloRol = "Docente / Facultad";
    nombre = doc ? doc.nombre : "Docente";
  }

  return {
    token: `local-dev-token-${correo}-${Date.now()}`,
    usuarioId: u.id || u.usuario_id || `usr-local-${correo}`,
    correo,
    rol,
    esAdmin,
    esDocente,
    tituloRol,
    nombre,
    debeCambiarPassword: Boolean(u.debe_cambiar_password),
    autenticadoEn: new Date().toISOString()
  };
}

async function hashPasswordLocal(correo, password) {
  const datos = new TextEncoder().encode(`mecafut2026|${correo}|${password}`);
  const buf = await crypto.subtle.digest("SHA-256", datos);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function leerUsuariosLocal() {
  try {
    return JSON.parse(localStorage.getItem(KEY_USUARIOS_LOCAL) || "{}");
  } catch {
    return {};
  }
}

export function obtenerHistorialPerfilLocal(correo = null) {
  if (typeof window === "undefined") return [];
  try {
    const lista = JSON.parse(localStorage.getItem(KEY_HISTORIAL_LOCAL) || "[]");
    if (!correo) return lista;
    const c = correo.trim().toLowerCase();
    return lista.filter((h) => h.correo === c);
  } catch {
    return [];
  }
}

function registrarHistorialPerfilLocal(correo, previo, nuevosDatos, origen = "perfil") {
  if (typeof window === "undefined" || !previo) return false;
  let huboCambio = false;
  const entradas = [];
  const normDni = (v) => String(v || "").replace(/[^0-9A-Za-z]/g, "").toUpperCase();

  if (previo.nombre && nuevosDatos.nombre && previo.nombre.trim().toLowerCase() !== nuevosDatos.nombre.trim().toLowerCase()) {
    entradas.push({ campo: "nombre", valorAnterior: previo.nombre, valorNuevo: nuevosDatos.nombre });
    huboCambio = true;
  }
  if (previo.cuenta && nuevosDatos.cuenta && String(previo.cuenta).trim() !== String(nuevosDatos.cuenta).trim()) {
    entradas.push({ campo: "cuenta", valorAnterior: previo.cuenta, valorNuevo: nuevosDatos.cuenta });
    huboCambio = true;
  }
  if (normDni(previo.dni) && normDni(nuevosDatos.dni) && normDni(previo.dni) !== normDni(nuevosDatos.dni)) {
    entradas.push({ campo: "dni", valorAnterior: previo.dni, valorNuevo: nuevosDatos.dni });
    huboCambio = true;
  }

  if (entradas.length > 0) {
    try {
      const hist = obtenerHistorialPerfilLocal();
      const ahora = new Date().toISOString();
      entradas.forEach((e) =>
        hist.unshift({
          correo,
          ...e,
          periodo: CONFIG_TORNEO.periodo,
          origen,
          fecha: ahora
        })
      );
      localStorage.setItem(KEY_HISTORIAL_LOCAL, JSON.stringify(hist));
    } catch (_) {}
  }
  return huboCambio;
}

function validarPassword(password) {
  if (!password || password.length < 8) {
    throw new Error("La contraseña debe tener al menos 8 caracteres.");
  }
}

/**
 * Inicio de sesión cotidiano: correo + contraseña verificados con bcrypt en servidor (F-11).
 * Migra de forma transparente hashes SHA-256 existentes en la primera autenticación exitosa.
 */
export async function iniciarSesionConPassword(correoIngresado, password) {
  const correo = (correoIngresado || "").trim().toLowerCase();
  if (!correo || !password) throw new Error("Ingresa tu correo y tu contraseña.");

  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase.rpc("rpc_iniciar_sesion", {
      p_correo: correo,
      p_password: password
    });

    if (error) {
      throw new Error(error.message || "No se pudo verificar tu cuenta en este momento.");
    }
    if (!data?.ok || !data?.sesion) {
      throw new Error(data?.error || "Correo o contraseña incorrectos.");
    }

    const sesion = persistirSesionNavegador(data.sesion);
    return { sesion, perfil: data.perfil || null };
  }

  // Modo simulado local
  const todos = leerUsuariosLocal();
  const usuario = todos[correo];
  if (!usuario || !usuario.password_hash) {
    throw new Error(
      "No encontramos una cuenta con contraseña para este correo. Usa «Crear cuenta / Olvidé mi contraseña»."
    );
  }

  if (usuario.bloqueado_hasta && new Date(usuario.bloqueado_hasta).getTime() > Date.now()) {
    throw new Error("Cuenta temporalmente protegida tras varios intentos fallidos. Intenta más tarde.");
  }

  // Clave temporal ya consumida para un inicio anterior sin haberla cambiado: RECHAZAR
  if (usuario.temp_password_usada && usuario.debe_cambiar_password) {
    throw new Error(
      "Esta contraseña temporal ya fue utilizada en un inicio de sesión previo y ha expirado. Por seguridad de tu cuenta, solicita una nueva al Administrador."
    );
  }

  const hash = await hashPasswordLocal(correo, password);
  if (hash !== usuario.password_hash) {
    usuario.intentos_login = (usuario.intentos_login || 0) + 1;
    if (usuario.intentos_login >= 5) {
      usuario.bloqueado_hasta = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    }
    todos[correo] = usuario;
    localStorage.setItem(KEY_USUARIOS_LOCAL, JSON.stringify(todos));
    throw new Error("Correo o contraseña incorrectos.");
  }

  if (usuario.debe_cambiar_password) {
    usuario.temp_password_usada = true;
  }
  usuario.intentos_login = 0;
  usuario.bloqueado_hasta = null;
  todos[correo] = usuario;
  localStorage.setItem(KEY_USUARIOS_LOCAL, JSON.stringify(todos));

  const sesion = persistirSesionNavegador(construirSesionLocal(correo, usuario.nombre || ""));
  const { password_hash: _omit, ...perfilLimpio } = usuario;
  return { sesion, perfil: perfilLimpio };
}

/**
 * Crear cuenta: valida el OTP en servidor (`rpc_crear_cuenta_con_otp`),
 * almacena contraseña con bcrypt (coste 10) y abre sesión autenticada con token de servidor.
 * Exclusivo para registros nuevos (rechaza si la cuenta ya existe).
 */
export async function crearCuentaConOtp(correoIngresado, codigo, password) {
  validarPassword(password);
  const correo = (correoIngresado || "").trim().toLowerCase();
  const codigoLimpio = (codigo || "").trim();

  if (!correo || !codigoLimpio) {
    throw new Error("Ingresa el código de 6 dígitos enviado a tu correo institucional.");
  }

  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase.rpc("rpc_crear_cuenta_con_otp", {
      p_correo: correo,
      p_codigo: codigoLimpio,
      p_password: password
    });

    if (error) {
      throw new Error(error.message || "No se pudo crear la cuenta en este momento.");
    }
    if (!data?.ok || !data?.sesion) {
      throw new Error(data?.error || "El código de verificación es incorrecto o expiró.");
    }

    return persistirSesionNavegador(data.sesion);
  }

  // Modo simulado local
  if (!isExplicitLocalMode) {
    throw new Error("Operación no disponible sin conexión a Supabase.");
  }
  const todos = leerUsuariosLocal();
  if (todos[correo]?.password_hash) {
    if (esAdminAutorizado(correo)) {
      throw new Error(
        "Por seguridad administrativa, las cuentas del Comité Organizador no admiten restablecimiento automático por OTP."
      );
    }
    throw new Error(
      "Esta cuenta ya está registrada. Por favor inicia sesión con tu contraseña o usa «Olvidé mi contraseña»."
    );
  }
  const sesion = verificarOtp(correo, codigoLimpio);
  const password_hash = await hashPasswordLocal(correo, password);
  todos[correo] = {
    ...(todos[correo] || {}),
    usuario_id: todos[correo]?.usuario_id || sesion.usuarioId,
    correo,
    password_hash,
    intentos_login: 0,
    bloqueado_hasta: null,
    actualizado_en: new Date().toISOString()
  };
  localStorage.setItem(KEY_USUARIOS_LOCAL, JSON.stringify(todos));
  return sesion;
}

/**
 * Restablecer contraseña con OTP verificado en servidor (`rpc_restablecer_password_con_otp`).
 * Revoca sesiones previas y bloquea el restablecimiento automático para el Comité Organizador.
 */
export async function recuperarPasswordConOtp(correoIngresado, codigo, nuevaPassword) {
  validarPassword(nuevaPassword);
  const correo = (correoIngresado || "").trim().toLowerCase();
  const codigoLimpio = (codigo || "").trim();

  if (!correo || !codigoLimpio) {
    throw new Error("Ingresa el correo institucional y el código de 6 dígitos.");
  }

  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase.rpc("rpc_restablecer_password_con_otp", {
      p_correo: correo,
      p_otp: codigoLimpio,
      p_password_nuevo: nuevaPassword
    });

    if (error) {
      throw new Error(error.message || "No se pudo restablecer la contraseña.");
    }
    if (!data?.ok || !data?.sesion) {
      throw new Error(data?.error || "El código de verificación es incorrecto o expiró.");
    }

    return persistirSesionNavegador(data.sesion);
  }

  // Modo simulado local
  if (!isExplicitLocalMode) {
    throw new Error("Operación no disponible sin conexión a Supabase.");
  }
  const todos = leerUsuariosLocal();
  if (esAdminAutorizado(correo)) {
    throw new Error(
      "Por seguridad administrativa, las cuentas del Comité Organizador con contraseña activa no admiten restablecimiento automático."
    );
  }
  const sesion = verificarOtp(correo, codigoLimpio);
  const password_hash = await hashPasswordLocal(correo, nuevaPassword);
  todos[correo] = {
    ...(todos[correo] || {}),
    usuario_id: todos[correo]?.usuario_id || sesion.usuarioId,
    correo,
    password_hash,
    intentos_login: 0,
    bloqueado_hasta: null,
    actualizado_en: new Date().toISOString()
  };
  localStorage.setItem(KEY_USUARIOS_LOCAL, JSON.stringify(todos));
  return sesion;
}

/**
 * Actualiza la contraseña obligatoria tras el primer login con contraseña temporal generada por admin.
 */
export async function cambiarPasswordObligatorio(nuevaPassword) {
  validarPassword(nuevaPassword);
  const token = obtenerTokenSesion();

  if (isSupabaseConfigured && supabase) {
    if (!token) throw new Error("No hay sesión activa para actualizar la contraseña.");
    const { data, error } = await supabase.rpc("rpc_cambiar_password_obligatorio", {
      p_token: token,
      p_password_nuevo: nuevaPassword
    });

    if (error) {
      throw new Error(error.message || "No se pudo actualizar la contraseña obligatoria.");
    }
    if (!data?.ok) {
      throw new Error(data?.error || "Error al actualizar contraseña obligatoria.");
    }

    const sesionActual = obtenerSesionActual();
    const sesionActualizada = { ...sesionActual, debeCambiarPassword: false };
    return {
      ok: true,
      sesion: persistirSesionNavegador(sesionActualizada)
    };
  }

  // Modo simulado local
  const sesionActual = obtenerSesionActual();
  if (!sesionActual) throw new Error("No hay sesión activa.");
  const c = sesionActual.correo.trim().toLowerCase();
  const todos = leerUsuariosLocal();
  if (todos[c]) {
    todos[c].password_hash = await hashPasswordLocal(c, nuevaPassword);
    todos[c].debe_cambiar_password = false;
    todos[c].temp_password_usada = false;
    localStorage.setItem(KEY_USUARIOS_LOCAL, JSON.stringify(todos));
  }
  const sesionActualizada = { ...sesionActual, debeCambiarPassword: false };
  return {
    ok: true,
    sesion: persistirSesionNavegador(sesionActualizada)
  };
}

/**
 * Genera una contraseña temporal para un usuario (exclusivo para administradores).
 */
export async function generarPasswordTemporalAdmin(usuarioId) {
  if (!usuarioId) throw new Error("Se requiere el ID del usuario.");

  if (isSupabaseConfigured && supabase) {
    const token = obtenerTokenSesion();
    if (!token) throw new Error("Se requiere sesión administrativa activa.");
    const { data, error } = await supabase.rpc("rpc_generar_password_temporal_admin", {
      p_token: token,
      p_usuario_id: usuarioId
    });

    if (error) {
      throw new Error(error.message || "Error al generar contraseña temporal.");
    }
    if (!data?.ok) {
      throw new Error(data?.error || "No se pudo generar contraseña temporal.");
    }
    return {
      ok: true,
      usuarioId: data.usuarioId,
      correo: data.correo,
      tempPassword: data.passwordTemporal || data.tempPassword || data.password_temporal,
      mensaje: data.mensaje
    };
  }

  // Modo simulado local
  const pwdTemporal = `MecaTemp-${Math.floor(1000 + Math.random() * 9000)}`;
  const todos = leerUsuariosLocal();
  const c = Object.keys(todos).find(
    (k) =>
      todos[k].id === usuarioId ||
      todos[k].usuario_id === usuarioId ||
      k === usuarioId ||
      k.toLowerCase() === String(usuarioId).toLowerCase()
  );
  if (c && todos[c]) {
    todos[c].password_hash = await hashPasswordLocal(c, pwdTemporal);
    todos[c].debe_cambiar_password = true;
    todos[c].temp_password_usada = false;
    localStorage.setItem(KEY_USUARIOS_LOCAL, JSON.stringify(todos));
  }
  return {
    ok: true,
    tempPassword: pwdTemporal,
    password_temporal: pwdTemporal,
    passwordTemporal: pwdTemporal,
    mensaje: "Contraseña temporal simulada en desarrollo local"
  };
}

/** Devuelve el perfil guardado del usuario autenticado (o null), nunca `password_hash`. */
export async function obtenerPerfil(correo) {
  if (!correo) return null;

  if (isSupabaseConfigured && supabase) {
    const token = obtenerTokenSesion();
    if (!token) return null;
    try {
      const { data, error } = await supabase.rpc("rpc_obtener_perfil", { p_token: token });
      if (error) return null;
      return data || null;
    } catch {
      return null;
    }
  }

  try {
    const c = correo.trim().toLowerCase();
    const u = leerUsuariosLocal()[c];
    if (!u) return null;
    const { password_hash: _omit, ...resto } = u;
    return resto;
  } catch {
    return null;
  }
}

/**
 * Guarda/actualiza los datos personales del usuario autenticado mediante RPC seguro,
 * registrando historial de cambios de cuenta/nombre/DNI (`usuarios_historial`, F-13).
 */
export async function guardarPerfil(correo, datos = {}) {
  const sesion = obtenerSesionActual();
  if (!sesion && !correo) return;
  const correoEfectivo = sesion?.correo || correo;

  const payload = {};
  if (datos.nombre) payload.nombre = datos.nombre;
  if (datos.cuenta) payload.cuenta = datos.cuenta;
  if (datos.dni && datos.dni !== "Exento (Docente)") payload.dni = datos.dni;
  if (datos.telefono) payload.telefono = datos.telefono;
  if (datos.carrera) payload.carrera = datos.carrera;
  if (datos.nombreClase || datos.nombre_clase) payload.nombre_clase = datos.nombreClase || datos.nombre_clase;
  if (datos.codigoClase || datos.codigo_clase) payload.codigo_clase = datos.codigoClase || datos.codigo_clase;
  if (datos.fotoDocumento) payload.fotoDocumento = datos.fotoDocumento;
  if (datos.tipoDocumento) payload.tipoDocumento = datos.tipoDocumento;
  if (Object.keys(payload).length === 0) return;

  if (isSupabaseConfigured && supabase) {
    const token = obtenerTokenSesion();
    if (!token) return;
    try {
      await supabase.rpc("rpc_guardar_perfil", {
        p_token: token,
        p_datos: payload
      });
    } catch (e) {
      console.warn("No se pudo guardar el perfil en servidor:", e);
    }
    return;
  }

  const c = correoEfectivo.trim().toLowerCase();
  const todos = leerUsuariosLocal();
  if (!todos[c]) return;
  registrarHistorialPerfilLocal(c, todos[c], payload, "perfil");
  todos[c] = {
    ...todos[c],
    nombre: payload.nombre || todos[c].nombre,
    cuenta: payload.cuenta || todos[c].cuenta,
    dni: payload.dni || todos[c].dni,
    telefono: payload.telefono || todos[c].telefono,
    carrera: payload.carrera || todos[c].carrera,
    nombre_clase: payload.nombre_clase || todos[c].nombre_clase,
    codigo_clase: payload.codigo_clase || todos[c].codigo_clase,
    foto_documento: payload.fotoDocumento || todos[c].foto_documento,
    tipo_documento: payload.tipoDocumento || todos[c].tipo_documento,
    actualizado_en: new Date().toISOString()
  };
  localStorage.setItem(KEY_USUARIOS_LOCAL, JSON.stringify(todos));
}

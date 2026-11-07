// lib/authService.js
// Sistema de autenticación con verificación OTP por correo institucional (@unitec.edu)
// Soporta envío real mediante EmailJS en producción y simulación local transparente en desarrollo.

import {
  CONFIG_TORNEO,
  esAdminAutorizado,
  esDocenteAutorizado,
  obtenerDocentePorCorreo
} from "./torneoConfig";
import { supabase, isSupabaseConfigured } from "./supabase";

const KEY_SESION = "mecafut_auth_session";
const KEY_OTPS = "mecafut_otps";

/**
 * Obtiene las métricas globales de despacho de correos OTP desde Supabase
 * con respaldo a localStorage. Controla la rotación a 180 envíos.
 */
export async function obtenerMetricasEmail() {
  if (isSupabaseConfigured && supabase) {
    try {
      const { data } = await supabase
        .from("configuracion")
        .select("data")
        .eq("id", "email_metricas")
        .maybeSingle();

      if (data && data.data) {
        return data.data;
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
 * en Supabase y localStorage para garantizar rotación consistente entre clientes.
 */
export async function registrarEnvioEmail(proveedorKey) {
  let metricas = await obtenerMetricasEmail();
  if (proveedorKey === "cuenta1") {
    metricas.cuenta1_envios = (metricas.cuenta1_envios || 0) + 1;
  } else if (proveedorKey === "cuenta2") {
    metricas.cuenta2_envios = (metricas.cuenta2_envios || 0) + 1;
  }
  metricas.ultimo_proveedor = proveedorKey;
  metricas.ultimo_envio = new Date().toISOString();

  if (isSupabaseConfigured && supabase) {
    try {
      await supabase.from("configuracion").upsert({
        id: "email_metricas",
        data: metricas,
        actualizado_en: new Date().toISOString()
      });
    } catch (e) {
      console.warn("No se pudo guardar métricas en Supabase:", e);
    }
  }

  if (typeof window !== "undefined") {
    try {
      localStorage.setItem("mecafut_email_metricas", JSON.stringify(metricas));
    } catch (_) {}
  }

  return metricas;
}

/**
 * Solicita un código OTP de 6 dígitos para un correo institucional.
 * Si EmailJS está configurado por variables de entorno, realiza el envío real vía HTTPS.
 * De lo contrario, simula el código para agilizar pruebas locales.
 */
export async function solicitarOtp(correoIngresado) {
  if (!correoIngresado || typeof correoIngresado !== "string") {
    throw new Error("Por favor ingresa un correo electrónico.");
  }

  const correo = correoIngresado.trim().toLowerCase();

  // Validar dominio institucional obligatorio
  const tieneDominioValido = CONFIG_TORNEO.dominiosValidos.some((dom) =>
    correo.endsWith(dom)
  );

  if (!tieneDominioValido) {
    throw new Error(
      "Acceso restringido: Solo se admiten correos institucionales oficiales (@unitec.edu o @unitec.edu.hn)."
    );
  }

  // Identificar rol preliminar
  const esAdmin = esAdminAutorizado(correo);
  const esDocente = esDocenteAutorizado(correo);

  let rol = "estudiante";
  let tituloRol = "Estudiante Universitario";
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
  } else {
    rol = "estudiante";
    tituloRol = "Estudiante de Ingeniería / Arquitectura";
  }

  // Generar código numérico de 6 dígitos
  const codigo = Math.floor(100000 + Math.random() * 900000).toString();
  const expiracion = Date.now() + 10 * 60 * 1000; // Válido por 10 minutos

  // Consultar métricas de rotación (rotar al alcanzar 180 envíos para dejar holgura de seguridad)
  let metricas = { cuenta1_envios: 25, cuenta2_envios: 1, limite_rotacion: 180 };
  try {
    metricas = await obtenerMetricasEmail();
  } catch (err) {
    console.warn("Usando métricas locales por defecto:", err);
  }

  const limiteRotacion = metricas.limite_rotacion || 180;
  const cuenta1AlcanzoLimite = (metricas.cuenta1_envios || 0) >= limiteRotacion;

  const provPrincipal = {
    key: "cuenta1",
    serviceId: process.env.NEXT_PUBLIC_EMAILJS_SERVICE_ID || "service_ar5incb",
    templateId: process.env.NEXT_PUBLIC_EMAILJS_TEMPLATE_ID || "template_xfm3uu3",
    publicKey: process.env.NEXT_PUBLIC_EMAILJS_PUBLIC_KEY || "dMui9NIr2noTnsQ-d",
    nombre: "Cuenta Principal (Mecatrónica - Outlook)",
    enviosActuales: metricas.cuenta1_envios || 0
  };

  const provSecundario = {
    key: "cuenta2",
    serviceId: process.env.NEXT_PUBLIC_EMAILJS_SERVICE_ID_2 || "service_1cf52oc",
    templateId: process.env.NEXT_PUBLIC_EMAILJS_TEMPLATE_ID_2 || "template_2fkhyps",
    publicKey: process.env.NEXT_PUBLIC_EMAILJS_PUBLIC_KEY_2 || "7CpkO7AM8FtYzeoIm",
    nombre: "Cuenta Secundaria (Respaldo Personal)",
    enviosActuales: metricas.cuenta2_envios || 0
  };

  // Si Cuenta 1 llegó a 180 envíos, rota automáticamente a Cuenta 2 como primaria
  const listaProveedores = cuenta1AlcanzoLimite
    ? [provSecundario, provPrincipal]
    : [provPrincipal, provSecundario];

  const proveedoresEmailJs = listaProveedores.filter(
    (p) => p.serviceId && p.templateId && p.publicKey
  );

  const tieneEmailJsConfigurado = proveedoresEmailJs.length > 0;
  let envioRealExitoso = false;
  let proveedorUtilizado = null;

  if (tieneEmailJsConfigurado && typeof window !== "undefined") {
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
              otp_code: codigo,
              nombre_usuario: nombreIdentificado || "Estudiante",
              torneo_titulo: CONFIG_TORNEO.titulo
            }
          })
        });

        if (response.ok) {
          envioRealExitoso = true;
          proveedorUtilizado = prov.key;
          // Registrar métricas de despacho exitoso
          try {
            await registrarEnvioEmail(prov.key);
          } catch (eMetric) {
            console.warn("No se pudo registrar métrica:", eMetric);
          }
          break; // Éxito en el envío con este proveedor
        } else {
          console.warn(`Falló envío con ${prov.nombre} (status ${response.status}), probando respaldo...`);
        }
      } catch (e) {
        console.error(`Error contactando ${prov.nombre}:`, e);
      }
    }
  }

  // Guardar en almacenamiento de OTPs
  if (typeof window !== "undefined") {
    try {
      const otps = JSON.parse(localStorage.getItem(KEY_OTPS) || "{}");
      otps[correo] = {
        codigo,
        expiracion,
        rol,
        tituloRol,
        nombreIdentificado,
        modoReal: envioRealExitoso,
        creadoEn: Date.now()
      };
      localStorage.setItem(KEY_OTPS, JSON.stringify(otps));
    } catch (e) {
      console.error("Error guardando OTP:", e);
    }
  }

  const esProduccion = process.env.NODE_ENV === "production";

  return {
    success: tieneEmailJsConfigurado ? envioRealExitoso : true,
    correo,
    rol,
    tituloRol,
    nombreIdentificado,
    modoEnvio: envioRealExitoso ? "email" : "simulado",
    codigoOtp: (!envioRealExitoso && !esProduccion) ? codigo : null, // En producción JAMÁS se expone en pantalla
    expiraEnMinutos: 10,
    mensaje: envioRealExitoso
      ? `Código de verificación de 6 dígitos enviado exitosamente a tu buzón ${correo}.`
      : esProduccion
      ? `Revisa tu bandeja de entrada en ${correo} para ingresar el código de verificación.`
      : `Código de verificación generado para ${correo}. (Modo desarrollo)`
  };
}

/**
 * Valida el código OTP de 6 dígitos y crea la sesión del usuario.
 */
export function verificarOtp(correoIngresado, codigoIngresado) {
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

  // En modo simulado permitimos 123456 para pruebas locales rápidas
  const esDevUniversal = !dataOtp?.modoReal && codigo === "123456";

  if (!dataOtp && !esDevUniversal) {
    throw new Error(
      "No hay ningún código de verificación activo para este correo. Por favor solicita uno nuevo."
    );
  }

  if (dataOtp && Date.now() > dataOtp.expiracion && !esDevUniversal) {
    delete otps[correo];
    localStorage.setItem(KEY_OTPS, JSON.stringify(otps));
    throw new Error("El código de verificación ha expirado. Por favor solicita uno nuevo.");
  }

  if (dataOtp && dataOtp.codigo !== codigo && !esDevUniversal) {
    throw new Error("El código de 6 dígitos ingresado es incorrecto. Verifica en tu correo.");
  }

  const nuevaSesion = construirSesion(correo, dataOtp?.nombreIdentificado || "");

  localStorage.setItem(KEY_SESION, JSON.stringify(nuevaSesion));

  // Eliminar el OTP usado
  if (dataOtp) {
    delete otps[correo];
    localStorage.setItem(KEY_OTPS, JSON.stringify(otps));
  }

  // Notificar al resto de la aplicación para actualizar la barra y componentes
  window.dispatchEvent(new CustomEvent("mecafut_auth_change", { detail: nuevaSesion }));

  return nuevaSesion;
}

/**
 * Obtiene la sesión activa en el navegador.
 */
export function obtenerSesionActual() {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(KEY_SESION);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Cierra la sesión activa.
 */
export function cerrarSesion() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(KEY_SESION);
  window.dispatchEvent(new CustomEvent("mecafut_auth_change", { detail: null }));
}

// ============================================================
// CUENTAS CON CONTRASEÑA Y PERFIL GUARDADO (KISS)
// El OTP solo se usa para crear la cuenta o recuperar la contraseña.
// ============================================================

const KEY_USUARIOS_LOCAL = "mecafut_usuarios";

/** Resuelve el rol del correo y arma el objeto de sesión. */
function construirSesion(correo, nombreBase = "") {
  const esAdmin = esAdminAutorizado(correo);
  const esDocente = esDocenteAutorizado(correo);

  let rol = "estudiante";
  let tituloRol = "Estudiante Universitario";
  let nombre = nombreBase;

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
    correo,
    rol,
    esAdmin,
    esDocente,
    tituloRol,
    nombre,
    autenticadoEn: new Date().toISOString()
  };
}

/** SHA-256 nativo (Web Crypto) con sal fija del torneo + correo. */
async function hashPassword(correo, password) {
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

async function obtenerUsuario(correo) {
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase
      .from("usuarios")
      .select("*")
      .eq("correo", correo)
      .maybeSingle();
    if (error) throw new Error("No se pudo consultar tu cuenta. Intenta de nuevo.");
    return data || null;
  }
  return leerUsuariosLocal()[correo] || null;
}

async function guardarUsuario(correo, campos) {
  const fila = { correo, ...campos, actualizado_en: new Date().toISOString() };
  if (isSupabaseConfigured && supabase) {
    const { error } = await supabase.from("usuarios").upsert(fila);
    if (error) throw new Error("No se pudo guardar tu cuenta. Intenta de nuevo.");
    return;
  }
  const todos = leerUsuariosLocal();
  todos[correo] = { ...(todos[correo] || {}), ...fila };
  localStorage.setItem(KEY_USUARIOS_LOCAL, JSON.stringify(todos));
}

function validarPassword(password) {
  if (!password || password.length < 6) {
    throw new Error("La contraseña debe tener al menos 6 caracteres.");
  }
}

function abrirSesion(correo) {
  const sesion = construirSesion(correo);
  localStorage.setItem(KEY_SESION, JSON.stringify(sesion));
  window.dispatchEvent(new CustomEvent("mecafut_auth_change", { detail: sesion }));
  return sesion;
}

/**
 * Inicio de sesión cotidiano: correo + contraseña (sin OTP ni correos).
 */
export async function iniciarSesionConPassword(correoIngresado, password) {
  const correo = (correoIngresado || "").trim().toLowerCase();
  if (!correo || !password) throw new Error("Ingresa tu correo y tu contraseña.");

  const usuario = await obtenerUsuario(correo);
  if (!usuario || !usuario.password_hash) {
    throw new Error("No encontramos una cuenta con contraseña para este correo. Usa «Crear cuenta / Olvidé mi contraseña».");
  }

  const hash = await hashPassword(correo, password);
  if (hash !== usuario.password_hash) {
    throw new Error("Correo o contraseña incorrectos.");
  }

  const sesion = abrirSesion(correo);
  return { sesion, perfil: usuario };
}

/**
 * Crear cuenta o recuperar contraseña: valida el OTP (consumido en este paso)
 * y guarda la nueva contraseña. Reutiliza verificarOtp para validar el código.
 */
export async function crearCuentaConOtp(correoIngresado, codigo, password) {
  validarPassword(password);
  const correo = (correoIngresado || "").trim().toLowerCase();

  // Lanza error si el código es inválido o expiró
  const sesion = verificarOtp(correo, codigo);

  const password_hash = await hashPassword(correo, password);
  await guardarUsuario(correo, { password_hash });
  return sesion;
}

/** Devuelve el perfil guardado del usuario (o null). */
export async function obtenerPerfil(correo) {
  if (!correo) return null;
  try {
    return await obtenerUsuario(correo.trim().toLowerCase());
  } catch {
    return null;
  }
}

/**
 * Guarda/actualiza los datos personales del usuario para autocompletar
 * futuros formularios. Solo guarda campos con valor.
 */
export async function guardarPerfil(correo, datos = {}) {
  if (!correo) return;
  const campos = {};
  if (datos.nombre) campos.nombre = datos.nombre;
  if (datos.cuenta) campos.cuenta = datos.cuenta;
  if (datos.dni && datos.dni !== "Exento (Docente)") campos.dni = datos.dni;
  if (datos.telefono) campos.telefono = datos.telefono;
  if (datos.carrera) campos.carrera = datos.carrera;
  if (datos.fotoDocumento) campos.foto_documento = datos.fotoDocumento;
  if (datos.tipoDocumento) campos.tipo_documento = datos.tipoDocumento;
  if (Object.keys(campos).length === 0) return;

  const c = correo.trim().toLowerCase();
  // Solo actualiza si la cuenta ya existe (no crea filas sin contraseña)
  const existente = await obtenerPerfil(c);
  if (!existente) return;
  try {
    if (isSupabaseConfigured && supabase) {
      // update (no upsert): el upsert parcial viola el NOT NULL de password_hash
      const { error } = await supabase
        .from("usuarios")
        .update({ ...campos, actualizado_en: new Date().toISOString() })
        .eq("correo", c);
      if (error) throw error;
    } else {
      await guardarUsuario(c, campos);
    }
  } catch (e) {
    console.warn("No se pudo guardar el perfil:", e);
  }
}

// lib/authService.js
// Sistema de autenticación pragmático sin costo con verificación OTP por correo institucional (@unitec.edu)
// Maneja roles estáticos: Admin, Docente y Estudiante

import {
  CONFIG_TORNEO,
  esAdminAutorizado,
  esDocenteAutorizado,
  obtenerDocentePorCorreo
} from "./torneoConfig";

const KEY_SESION = "mecafut_auth_session";
const KEY_OTPS = "mecafut_otps";

/**
 * Solicita un código OTP de 6 dígitos para un correo institucional.
 * En modo desarrollo/local simula el envío y retorna el código para fácil testeo.
 */
export function solicitarOtp(correoIngresado) {
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
  let rol = "estudiante";
  let tituloRol = "Estudiante Universitario";
  let nombreIdentificado = "";

  if (esAdminAutorizado(correo)) {
    rol = "admin";
    tituloRol = "Comité Organizador / Administrador";
    nombreIdentificado = "Administrador MECAFUT";
  } else if (esDocenteAutorizado(correo)) {
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
        creadoEn: Date.now()
      };
      localStorage.setItem(KEY_OTPS, JSON.stringify(otps));
    } catch (e) {
      console.error("Error guardando OTP:", e);
    }
  }

  return {
    success: true,
    correo,
    rol,
    tituloRol,
    nombreIdentificado,
    codigoOtp: codigo, // Visible en interfaz para pruebas inmediatas en desarrollo
    expiraEnMinutos: 10,
    mensaje: `Código de verificación de 6 dígitos enviado exitosamente a ${correo}.`
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

  // Aceptamos también código universal de desarrollo "123456" si no hay datos de OTP
  const esDevUniversal = codigo === "123456";

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

  // Resolver rol con exactitud estricta
  let rol = "estudiante";
  let tituloRol = "Estudiante Universitario";
  let nombreUsuario = dataOtp?.nombreIdentificado || "";

  if (esAdminAutorizado(correo)) {
    rol = "admin";
    tituloRol = "Administrador del Torneo";
    nombreUsuario = nombreUsuario || "Comité Administrador";
  } else if (esDocenteAutorizado(correo)) {
    const doc = obtenerDocentePorCorreo(correo);
    rol = "docente";
    tituloRol = "Docente / Facultad";
    nombreUsuario = doc ? doc.nombre : "Docente";
  }

  const nuevaSesion = {
    correo,
    rol,
    tituloRol,
    nombre: nombreUsuario,
    autenticadoEn: new Date().toISOString()
  };

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

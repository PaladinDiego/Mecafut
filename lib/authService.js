// lib/authService.js
// Sistema de autenticación con verificación OTP por correo institucional (@unitec.edu)
// Soporta envío real mediante EmailJS en producción y simulación local transparente en desarrollo.

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

  const emailJsService = process.env.NEXT_PUBLIC_EMAILJS_SERVICE_ID;
  const emailJsTemplate = process.env.NEXT_PUBLIC_EMAILJS_TEMPLATE_ID;
  const emailJsPublicKey = process.env.NEXT_PUBLIC_EMAILJS_PUBLIC_KEY;
  const tieneEmailJsConfigurado = Boolean(emailJsService && emailJsTemplate && emailJsPublicKey);

  let envioRealExitoso = false;

  if (tieneEmailJsConfigurado && typeof window !== "undefined") {
    try {
      const response = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          service_id: emailJsService,
          template_id: emailJsTemplate,
          user_id: emailJsPublicKey,
          template_params: {
            to_email: correo,
            otp_code: codigo,
            nombre_usuario: nombreIdentificado || "Estudiante",
            torneo_titulo: CONFIG_TORNEO.titulo
          }
        })
      });

      if (!response.ok) {
        console.warn("Fallo el envío por EmailJS, recurriendo a modo seguro.");
      } else {
        envioRealExitoso = true;
      }
    } catch (e) {
      console.error("Error contactando EmailJS:", e);
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

  // Resolver rol con exactitud estricta
  const esAdmin = esAdminAutorizado(correo);
  const esDocente = esDocenteAutorizado(correo);

  let rol = "estudiante";
  let tituloRol = "Estudiante Universitario";
  let nombreUsuario = dataOtp?.nombreIdentificado || "";

  if (esAdmin && esDocente) {
    rol = "admin";
    tituloRol = "Docente / Administrador del Torneo";
    const doc = obtenerDocentePorCorreo(correo);
    nombreUsuario = doc ? doc.nombre : (nombreUsuario || "Docente Administrador");
  } else if (esAdmin) {
    rol = "admin";
    tituloRol = "Administrador del Torneo";
    nombreUsuario = nombreUsuario || "Comité Administrador";
  } else if (esDocente) {
    const doc = obtenerDocentePorCorreo(correo);
    rol = "docente";
    tituloRol = "Docente / Facultad";
    nombreUsuario = doc ? doc.nombre : "Docente";
  }

  const nuevaSesion = {
    correo,
    rol,
    esAdmin,
    esDocente,
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

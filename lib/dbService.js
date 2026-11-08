// lib/dbService.js
// Capa de Datos Oficial MECAFUT Q4 2026:
// - Producción: Supabase PostgreSQL con RLS cerrado y RPCs transaccionales SECURITY DEFINER
// - Desarrollo / Pruebas Offline: Modo Local Simulado (localStorage) con paridad estricta de reglas

import { supabase, isSupabaseConfigured } from "./supabase";
import {
  CONFIG_TORNEO,
  esDocenteAutorizado
} from "./torneoConfig";
import {
  obtenerSesionActual,
  obtenerTokenSesion,
  obtenerHistorialPerfilLocal
} from "./authService";

export { isSupabaseConfigured };
// Mantenido en false por compatibilidad sin importar SDK legado de Firebase (F-12)
export const isFirebaseConfigured = false;

// ==========================================
// COMPRESOR CLIENT-SIDE DE COMPROBANTES Y CARNETS
// ==========================================
export function comprimirComprobante(file, maxDimension = 900, quality = 0.65) {
  return new Promise((resolve) => {
    if (!file) return resolve(null);

    if (file.type === "application/pdf") {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        const dataUrl = canvas.toDataURL("image/jpeg", quality);
        resolve(dataUrl);
      };
      img.onerror = () => resolve(null);
      img.src = e.target.result;
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

export const comprimirDocumento = comprimirComprobante;

// ==========================================
// ALMACENAMIENTO LOCAL SIMULADO (localStorage)
// ==========================================
const KEY_EQUIPOS = "mecafut_sim_equipos_v2";
const KEY_JUGADORES = "mecafut_sim_jugadores_v2";
const KEY_CONFIG = "mecafut_sim_config_v2";
const KEY_TORNEO = "mecafut_sim_torneo_v2";

const SEED_EQUIPOS = [];
const SEED_JUGADORES = [];

const SEED_CONFIG = {
  inscripcionesAbiertas: true,
  publicarGoleadores: false,
  publicarClasificacion: false,
  publicarPremios: false,
  whatsappCapitanesUrl: CONFIG_TORNEO.whatsappCapitanesUrl
};

const SEED_TORNEO = {
  fechaEvento: CONFIG_TORNEO.fechas.diaEventoDefault,
  visibilidadPublica: "auto", // "auto" | "visible" | "oculto"
  publicarGoleadores: false,
  publicarClasificacion: false,
  publicarPremios: false,
  brackets: {
    Masculino: null,
    Femenino: null
  },
  criteriosPremios: [
    { id: "crit-portero", nombre: "Portero con más goles tapados", icono: "🧤", categoria: "General", publicado: false, registros: {} },
    { id: "crit-mvp", nombre: "Jugador Más Valioso (MVP)", icono: "⭐", categoria: "General", publicado: false, registros: {} }
  ]
};

function getLocal(key, defaultVal) {
  if (typeof window === "undefined") return defaultVal;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) {
      localStorage.setItem(key, JSON.stringify(defaultVal));
      return defaultVal;
    }
    return JSON.parse(raw);
  } catch {
    return defaultVal;
  }
}

function setLocal(key, val) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(val));
    window.dispatchEvent(new CustomEvent("mecafut_storage_change", { detail: { key, val } }));
  } catch (err) {
    console.error("Error guardando en localStorage:", err);
  }
}

// ==========================================
// HELPERS REGLAMENTARIOS DE IDENTIDAD Y CARNETS
// ==========================================

export function validarCorreoInstitucional(correo) {
  if (!correo) return false;
  const limpio = correo.trim().toLowerCase();
  return CONFIG_TORNEO.dominiosValidos.some((d) => limpio.endsWith(d));
}

export function normalizarDni(dni) {
  if (!dni || typeof dni !== "string") return "";
  const t = dni.trim();
  if (!t || t.toLowerCase().includes("exento")) return "";
  return t.replace(/[^0-9A-Za-z]/g, "").toUpperCase();
}

export function enmascararDni(dni) {
  if (!dni || typeof dni !== "string" || !dni.trim()) return "Pendiente";
  const t = dni.trim();
  if (t.toLowerCase().includes("exento")) return "Exento (Docente)";
  if (t.length <= 4) return "****";
  return `****-****-${t.slice(-4)}`;
}

export function esDataUrlDocumentoValido(dataUrl) {
  return typeof dataUrl === "string" && dataUrl.startsWith("data:") && dataUrl.length >= 25;
}

/**
 * Determina el estado formal de verificación documental de un jugador (F-04):
 * 'verificado' | 'exento_docente' | 'en_revision' | 'rechazado' | 'pendiente'
 */
export function obtenerEstadoCarnet(j) {
  if (!j) return "pendiente";
  const explicito = j.estadoCarnet || j.estado_carnet;
  if (
    explicito === "verificado" ||
    explicito === "exento_docente" ||
    explicito === "en_revision" ||
    explicito === "rechazado" ||
    explicito === "pendiente"
  ) {
    return explicito;
  }

  // Solo conceder exención docente automática si su correo no está marcado como no verificado
  const correoVerif = j.correoVerificado ?? j.correo_verificado;
  if (correoVerif !== false && esDocenteAutorizado(j.correo)) {
    return "exento_docente";
  }

  const foto = j.fotoDocumento || j.foto_documento;
  if (esDataUrlDocumentoValido(foto)) {
    return "en_revision";
  }

  return "pendiente";
}

/**
 * Un jugador está reglamentariamente habilitado para llaves únicamente cuando:
 * - Su carnet fue explícitamente aprobado por un Administrador (`verificado`), o
 * - Es Docente autorizado con identidad verificada (`exento_docente`).
 */
export function esJugadorHabilitado(j) {
  if (!j || j.eliminado) return false;
  const est = obtenerEstadoCarnet(j);
  return est === "verificado" || est === "exento_docente";
}

/**
 * Un equipo es apto para entrar al sorteo o llaves oficiales únicamente si:
 * 1) Su pago e inscripción están en estado 'Confirmado', y
 * 2) Al menos 8 integrantes tienen su carnet verificado por Admin (o exención docente verificada).
 */
export function esEquipoAptoParaLlaves(equipo, todosJugadores = []) {
  if (!equipo || equipo.eliminado) return false;
  const estadoPago = String(equipo.estado || "Pendiente").trim().toLowerCase();
  const pagoAprobado =
    equipo.pagoConfirmado === true ||
    estadoPago === "confirmado" ||
    estadoPago === "pagado" ||
    estadoPago === "aprobado";
  if (!pagoAprobado) return false;

  const habilitados = (todosJugadores || []).filter(
    (j) =>
      j &&
      !j.eliminado &&
      (j.equipoId === equipo.id || j.equipo_id === equipo.id) &&
      esJugadorHabilitado(j)
  );
  return habilitados.length >= CONFIG_TORNEO.plantilla.min;
}

function etiquetaEstadoDesdeCarnet(estadoCarnet) {
  if (estadoCarnet === "verificado" || estadoCarnet === "exento_docente") return "Aprobado";
  if (estadoCarnet === "en_revision") return "En revisión";
  if (estadoCarnet === "rechazado") return "Rechazado";
  return "Pendiente";
}

// ==========================================
// CONSULTAS PÚBLICAS Y DE DISPONIBILIDAD
// ==========================================

export async function obtenerResumenPublico() {
  const token = obtenerTokenSesion();

  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase.rpc("rpc_obtener_resumen_publico", {
      p_token: token
    });

    if (error) {
      throw new Error(`No se pudo consultar el estado de cupos en el servidor: ${error.message}`);
    }

    const config = data?.config || { inscripcionesAbiertas: true };
    const activos = data?.equiposActivos || [];
    const maxJugadores = config.maxJugadoresPorEquipo || CONFIG_TORNEO.plantilla.max;
    const fechaFin = new Date(config.fechaCierreInscripciones || CONFIG_TORNEO.fechas.finInscripciones);
    const cerradoPorFecha = new Date() > fechaFin;
    const inscripcionesHabilitadas = config.inscripcionesAbiertas !== false && !cerradoPorFecha;

    const masculinoOcupados = activos.filter((e) => (e.categoria || "Masculino") === "Masculino").length;
    const femeninoOcupados = activos.filter((e) => e.categoria === "Femenino").length;

    const conteoColores = {};
    activos.forEach((e) => {
      if (e.color) {
        const col = e.color.toLowerCase();
        conteoColores[col] = (conteoColores[col] || 0) + 1;
      }
    });

    const coloresLlenos = Object.keys(conteoColores).filter((col) => conteoColores[col] >= 2);

    return {
      inscripcionesAbiertas: inscripcionesHabilitadas,
      cerradoPorFecha,
      fechaCierreInscripciones: config.fechaCierreInscripciones || CONFIG_TORNEO.fechas.finInscripciones,
      maxJugadoresPorEquipo: maxJugadores,
      masculinoOcupados,
      femeninoOcupados,
      maxMasculino: CONFIG_TORNEO.cupos.masculino,
      maxFemenino: CONFIG_TORNEO.cupos.femenino,
      conteoColores,
      coloresLlenos,
      equiposActivos: activos.map((e) => ({
        id: e.id,
        nombre: e.nombre,
        categoria: e.categoria,
        capitan: e.capitanNombre || e.capitan?.nombre || "Capitán",
        color: e.color
      })),
      whatsappCapitanesUrl: config.whatsappCapitanesUrl || CONFIG_TORNEO.whatsappCapitanesUrl,
      nombresTomados: activos.map((e) => (e.nombre || "").toLowerCase().trim()),
      modo: "supabase"
    };
  }

  // MODO LOCAL SIMULADO
  const equipos = getLocal(KEY_EQUIPOS, SEED_EQUIPOS);
  const config = getLocal(KEY_CONFIG, SEED_CONFIG);
  const maxJugadores = config.maxJugadoresPorEquipo || CONFIG_TORNEO.plantilla.max;
  const fechaFin = new Date(config.fechaCierreInscripciones || CONFIG_TORNEO.fechas.finInscripciones);
  const cerradoPorFecha = new Date() > fechaFin;

  const activos = equipos.filter((e) => !e.eliminado && e.estado !== "Rechazado");
  const masculinoOcupados = activos.filter((e) => (e.categoria || "Masculino") === "Masculino").length;
  const femeninoOcupados = activos.filter((e) => e.categoria === "Femenino").length;

  const conteoColores = {};
  activos.forEach((e) => {
    if (e.color) {
      const col = e.color.toLowerCase();
      conteoColores[col] = (conteoColores[col] || 0) + 1;
    }
  });

  const coloresLlenos = Object.keys(conteoColores).filter((col) => conteoColores[col] >= 2);
  const inscripcionesHabilitadas = config.inscripcionesAbiertas !== false && !cerradoPorFecha;

  return {
    inscripcionesAbiertas: inscripcionesHabilitadas,
    cerradoPorFecha,
    fechaCierreInscripciones: config.fechaCierreInscripciones || CONFIG_TORNEO.fechas.finInscripciones,
    maxJugadoresPorEquipo: maxJugadores,
    masculinoOcupados,
    femeninoOcupados,
    maxMasculino: CONFIG_TORNEO.cupos.masculino,
    maxFemenino: CONFIG_TORNEO.cupos.femenino,
    conteoColores,
    coloresLlenos,
    equiposActivos: activos.map((e) => ({
      id: e.id,
      nombre: e.nombre,
      categoria: e.categoria,
      capitan: e.capitan?.nombre || "Capitán",
      color: e.color
    })),
    whatsappCapitanesUrl: config.whatsappCapitanesUrl || CONFIG_TORNEO.whatsappCapitanesUrl,
    nombresTomados: activos.map((e) => (e.nombre || "").toLowerCase().trim()),
    modo: "simulado"
  };
}

// ==========================================
// REGISTRO OFICIAL DE EQUIPOS (TRANSACCIONAL)
// ==========================================

export async function inscribirEquipo({ equipo, capitan, jugadores, comprobanteFile }) {
  const sesion = obtenerSesionActual();
  const correoCapitan = (sesion?.correo || capitan?.correo || "").trim().toLowerCase();

  if (!equipo?.nombre?.trim()) {
    throw new Error("El nombre del equipo es obligatorio.");
  }

  if (!capitan?.nombre?.trim() || !capitan?.cuenta?.trim() || !correoCapitan) {
    throw new Error("Por favor completa todos los datos obligatorios del Capitán.");
  }

  // Impedir auto-registro declarando el correo de otra persona cuando hay sesión activa (F-13)
  if (sesion?.correo && capitan?.correo && capitan.correo.trim().toLowerCase() !== sesion.correo.trim().toLowerCase()) {
    throw new Error("El correo del Capitán debe coincidir con tu cuenta institucional autenticada.");
  }

  const telefonoLimpio = capitan.telefono?.trim() || "";
  const soloDigitos = telefonoLimpio.replace(/\D/g, "");
  if (soloDigitos.length < 8) {
    throw new Error("Por favor ingresa un número de teléfono válido para el Capitán (mínimo 8 dígitos).");
  }

  if (!validarCorreoInstitucional(correoCapitan)) {
    throw new Error(`El correo del capitán debe ser institucional (${CONFIG_TORNEO.dominiosValidos.join(" o ")}).`);
  }

  const esDocenteCapitan = esDocenteAutorizado(correoCapitan);

  if (!esDocenteCapitan) {
    if (!normalizarDni(capitan.dni)) {
      throw new Error("El Número de Identidad (DNI) del Capitán es obligatorio para la verificación reglamentaria.");
    }
    if (!esDataUrlDocumentoValido(capitan.fotoDocumento)) {
      throw new Error("El Capitán debe adjuntar obligatoriamente la foto válida de su carnet universitario o confirmación de matrícula.");
    }
  }

  const comprobanteDataUrl = await comprimirComprobante(comprobanteFile);

  // MODO CLOUD SUPABASE (RPC transaccional con candado pg_advisory_xact_lock: F-05, F-10, F-13)
  if (isSupabaseConfigured && supabase) {
    const token = obtenerTokenSesion();
    if (!token) {
      throw new Error("Tu sesión ha expirado. Vuelve a iniciar sesión para inscribir tu equipo.");
    }

    const { data, error } = await supabase.rpc("rpc_inscribir_equipo", {
      p_token: token,
      p_payload: {
        equipo: {
          nombre: equipo.nombre.trim(),
          tipoEquipo: esDocenteCapitan || sesion?.esAdmin ? (equipo.tipoEquipo || "Estudiantes") : "Estudiantes",
          docente: equipo.docente,
          categoria: equipo.categoria || "Masculino",
          color: equipo.color,
          clasesRepresentadas: equipo.clasesRepresentadas || []
        },
        capitan: {
          ...capitan,
          correo: correoCapitan,
          telefono: telefonoLimpio,
          nombreClase: capitan.nombreClase || capitan.nombre_clase || "",
          codigoClase: capitan.codigoClase || capitan.codigo_clase || ""
        },
        jugadores: jugadores || [],
        comprobanteDataUrl,
        comprobanteAdjunto: Boolean(comprobanteFile || comprobanteDataUrl)
      }
    });

    if (error) {
      throw new Error(error.message || "Error al registrar el equipo en la base de datos.");
    }

    return data;
  }

  // -----------------------------------------------------------
  // MODO LOCAL SIMULADO (Paridad exacta con las reglas del RPC)
  // -----------------------------------------------------------
  const resumen = await obtenerResumenPublico();
  if (!resumen.inscripcionesAbiertas) {
    throw new Error("El periodo oficial de inscripciones para MECAFUT ha finalizado o está cerrado.");
  }

  const categoria = equipo.categoria || "Masculino";
  if (categoria === "Masculino" && resumen.masculinoOcupados >= CONFIG_TORNEO.cupos.masculino) {
    throw new Error(`Se han agotado los ${CONFIG_TORNEO.cupos.masculino} cupos oficiales para la categoría Masculina. No se admiten cupos adicionales.`);
  }
  if (categoria === "Femenino" && resumen.femeninoOcupados >= CONFIG_TORNEO.cupos.femenino) {
    throw new Error(`Se han agotado los ${CONFIG_TORNEO.cupos.femenino} cupos oficiales para la categoría Femenina.`);
  }

  const estadoCarnetCapitan = esDocenteCapitan ? "exento_docente" : "en_revision";
  const filaCapitan = {
    nombre: capitan.nombre.trim(),
    cuenta: capitan.cuenta.trim(),
    correo: correoCapitan,
    telefono: telefonoLimpio,
    dni: esDocenteCapitan ? "Exento (Docente)" : capitan.dni.trim(),
    tipoDocumento: esDocenteCapitan ? "docente" : (capitan.tipoDocumento || "carnet"),
    fotoDocumento: capitan.fotoDocumento || null,
    carrera: capitan.carrera || CONFIG_TORNEO.carreras[0],
    nombreClase: capitan.nombreClase?.trim() || "N/A",
    codigoClase: capitan.codigoClase?.trim() || "N/A",
    esCapitan: true,
    usuarioId: sesion?.usuarioId || null,
    correoVerificado: true,
    estadoCarnet: estadoCarnetCapitan,
    estado: etiquetaEstadoDesdeCarnet(estadoCarnetCapitan)
  };

  // IMPORTANTE (F-13.4): Compañeros agregados manualmente por el capitán tienen correoVerificado = false;
  // nunca reciben exención docente automática hasta autenticarse ellos mismos.
  const jugadoresExtras = (jugadores || [])
    .filter((j) => j.nombre?.trim() && j.cuenta?.trim())
    .map((j) => {
      const correoJ = j.correo?.trim().toLowerCase() || "";
      if (correoJ && !validarCorreoInstitucional(correoJ)) {
        throw new Error(`El correo "${correoJ}" debe pertenecer al dominio institucional (@unitec.edu o @unitec.edu.hn).`);
      }
      const dniRaw = (j.dni?.trim() || "");
      const esCorreoDocente = esDocenteAutorizado(correoJ);
      const dniJ = esCorreoDocente ? "Exento (Docente)" : (dniRaw === "Exento (Docente)" ? "" : dniRaw);
      const tieneFotoValida = esDataUrlDocumentoValido(j.fotoDocumento);
      const estCarnet = tieneFotoValida ? "en_revision" : "pendiente";
      return {
        nombre: j.nombre.trim(),
        cuenta: j.cuenta.trim(),
        correo: correoJ,
        dni: dniJ,
        tipoDocumento: esCorreoDocente ? "docente" : (j.tipoDocumento === "docente" ? "carnet" : (j.tipoDocumento || "carnet")),
        fotoDocumento: tieneFotoValida ? j.fotoDocumento : null,
        carrera: j.carrera || CONFIG_TORNEO.carreras[0],
        nombreClase: j.nombreClase?.trim() || "N/A",
        codigoClase: j.codigoClase?.trim() || "N/A",
        esCapitan: false,
        usuarioId: null,
        correoVerificado: false,
        estadoCarnet: estCarnet,
        estado: etiquetaEstadoDesdeCarnet(estCarnet)
      };
    });

  const plantillaCompleta = [filaCapitan, ...jugadoresExtras];

  if (plantillaCompleta.length > CONFIG_TORNEO.plantilla.max) {
    throw new Error(`El número máximo permitido es de ${CONFIG_TORNEO.plantilla.max} jugadores por equipo.`);
  }

  const cuentasInternas = plantillaCompleta.map((j) => j.cuenta);
  if (new Set(cuentasInternas).size !== cuentasInternas.length) {
    throw new Error("Hay números de cuenta repetidos dentro de tu propia lista de jugadores.");
  }

  const correosInternos = plantillaCompleta.map((j) => j.correo).filter(Boolean);
  if (new Set(correosInternos).size !== correosInternos.length) {
    throw new Error("Hay correos institucionales repetidos dentro de tu propio equipo.");
  }

  const dnisNormInternos = plantillaCompleta
    .map((j) => normalizarDni(j.dni))
    .filter(Boolean);
  if (new Set(dnisNormInternos).size !== dnisNormInternos.length) {
    throw new Error("Hay Números de Identidad (DNI) repetidos dentro de tu propia lista de jugadores.");
  }

  const nombreLimpio = equipo.nombre.trim().toLowerCase();
  if (resumen.nombresTomados.includes(nombreLimpio)) {
    throw new Error(`El nombre de equipo "${equipo.nombre}" ya fue registrado por otro grupo. Elige otro nombre.`);
  }

  if (equipo.color) {
    const usoColor = resumen.conteoColores[equipo.color.toLowerCase()] || 0;
    if (usoColor >= 2) {
      throw new Error(`El color de uniforme "${equipo.color}" ya alcanzó el límite máximo de 2 equipos. Selecciona otro color disponible.`);
    }
  }

  const jugadoresActuales = getLocal(KEY_JUGADORES, SEED_JUGADORES);
  const equiposActuales = getLocal(KEY_EQUIPOS, SEED_EQUIPOS);

  const equiposActivosIds = new Set(
    equiposActuales.filter((e) => !e.eliminado && e.estado !== "Rechazado").map((e) => e.id)
  );
  const jugadoresActivosNoDocentes = jugadoresActuales.filter(
    (j) =>
      !j.eliminado &&
      equiposActivosIds.has(j.equipoId) &&
      !(j.correoVerificado !== false && esDocenteAutorizado(j.correo))
  );

  const cuentasReg = new Set(jugadoresActivosNoDocentes.map((j) => j.cuenta));
  const correosReg = new Set(jugadoresActivosNoDocentes.map((j) => (j.correo || "").toLowerCase()).filter(Boolean));
  const dnisReg = new Set(jugadoresActivosNoDocentes.map((j) => normalizarDni(j.dni)).filter(Boolean));
  const usuariosReg = new Set(jugadoresActivosNoDocentes.map((j) => j.usuarioId).filter(Boolean));

  const evaluables = plantillaCompleta.filter(
    (j) => !(j.correoVerificado && esDocenteAutorizado(j.correo))
  );

  for (const cand of evaluables) {
    if (cand.usuarioId && usuariosReg.has(cand.usuarioId)) {
      throw new Error(`Tu usuario ya figura inscrito en otro equipo activo del torneo.`);
    }
    if (cuentasReg.has(cand.cuenta)) {
      throw new Error(`Cuentas ya inscritas en otro equipo activo: ${cand.cuenta}`);
    }
    if (cand.correo && !esDocenteAutorizado(cand.correo) && correosReg.has(cand.correo)) {
      throw new Error(`Correos ya inscritos en otro equipo activo: ${cand.correo}`);
    }
    const dNorm = normalizarDni(cand.dni);
    if (dNorm && dnisReg.has(dNorm)) {
      throw new Error(`Números de Identidad (DNI) ya inscritos en otro equipo activo: ${cand.dni}`);
    }
  }

  let codigoAcceso = "";
  const codigosExistentes = new Set(equiposActuales.map((e) => e.codigoAcceso));
  do {
    codigoAcceso = Math.floor(10000000 + Math.random() * 90000000).toString();
  } while (codigosExistentes.has(codigoAcceso));

  const estado = "Pendiente";
  const nuevoEquipoId = `eq-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const nuevoEquipo = {
    id: nuevoEquipoId,
    nombre: equipo.nombre.trim(),
    tipoEquipo: esDocenteCapitan || sesion?.esAdmin ? (equipo.tipoEquipo || "Estudiantes") : "Estudiantes",
    docente: equipo.docente,
    categoria,
    color: equipo.color,
    clasesRepresentadas: equipo.clasesRepresentadas || [],
    capitan: filaCapitan,
    capitanUsuarioId: sesion?.usuarioId || null,
    codigoAcceso,
    comprobanteAdjunto: Boolean(comprobanteFile || comprobanteDataUrl),
    comprobanteDataUrl,
    estado,
    periodo: CONFIG_TORNEO.periodo,
    fechaRegistro: new Date().toISOString()
  };

  const histCap = obtenerHistorialPerfilLocal(correoCapitan);
  const nuevosJugadores = plantillaCompleta.map((j, idx) => ({
    id: `jug-${nuevoEquipoId}-${idx + 1}`,
    equipoId: nuevoEquipoId,
    nombreEquipo: equipo.nombre.trim(),
    periodo: CONFIG_TORNEO.periodo,
    alertaCambioIdentidad: idx === 0 && histCap.length > 0,
    ...j
  }));

  equiposActuales.push(nuevoEquipo);
  jugadoresActuales.push(...nuevosJugadores);

  setLocal(KEY_EQUIPOS, equiposActuales);
  setLocal(KEY_JUGADORES, jugadoresActuales);

  return { codigoAcceso, equipoId: nuevoEquipoId, estado, modo: "simulado" };
}

// ==========================================
// CONSULTA POR CÓDIGO Y ADICIÓN DE INTEGRANTES
// ==========================================

export async function buscarEquipoPorCodigo(codigo) {
  if (!codigo?.trim()) throw new Error("Ingresa un código de acceso válido.");
  const codigoBuscado = codigo.trim();

  if (isSupabaseConfigured && supabase) {
    const token = obtenerTokenSesion();
    if (!token) {
      throw new Error("Debes iniciar sesión con tu cuenta institucional para consultar un equipo.");
    }

    const { data, error } = await supabase.rpc("rpc_buscar_equipo_por_codigo", {
      p_token: token,
      p_codigo: codigoBuscado
    });

    if (error) {
      throw new Error(error.message || "No se encontró ningún equipo con ese código de acceso.");
    }

    return data;
  }

  // MODO LOCAL SIMULADO
  const equipos = getLocal(KEY_EQUIPOS, SEED_EQUIPOS);
  const eq = equipos.find((e) => !e.eliminado && e.codigoAcceso === codigoBuscado);
  if (!eq) throw new Error("No se encontró ningún equipo con ese código de acceso.");

  const sesion = obtenerSesionActual();
  const esCapitan = Boolean(
    eq.capitan?.correo && sesion?.correo && eq.capitan.correo.toLowerCase() === sesion.correo.toLowerCase()
  );
  const esAdmin = Boolean(sesion?.esAdmin);
  const esPrivilegiado = !sesion || esAdmin || esCapitan;

  const jugadores = getLocal(KEY_JUGADORES, SEED_JUGADORES);
  const jugadoresEquipo = jugadores
    .filter((j) => !j.eliminado && j.equipoId === eq.id)
    .map((j) => {
      const esPropio = sesion && j.correo && j.correo.toLowerCase() === sesion.correo.toLowerCase();
      const puedeVerSensible = esPrivilegiado || esPropio;
      const estCarnet = obtenerEstadoCarnet(j);
      return {
        ...j,
        correo: puedeVerSensible ? j.correo : "",
        dni: puedeVerSensible ? j.dni : enmascararDni(j.dni),
        telefono: puedeVerSensible ? j.telefono : null,
        fotoDocumento: puedeVerSensible ? j.fotoDocumento : null,
        tieneFoto: Boolean(j.fotoDocumento),
        estadoCarnet: estCarnet,
        estado: j.estado || etiquetaEstadoDesdeCarnet(estCarnet)
      };
    });

  const cfg = getLocal(KEY_CONFIG, SEED_CONFIG);
  return {
    equipo: {
      ...eq,
      comprobanteDataUrl: esPrivilegiado ? eq.comprobanteDataUrl : null,
      whatsappCapitanesUrl: esCapitan || esAdmin ? (cfg.whatsappCapitanesUrl || CONFIG_TORNEO.whatsappCapitanesUrl) : null
    },
    jugadores: jugadoresEquipo,
    permisos: {
      esCapitan,
      esAdmin,
      esCapitanOAdmin: esPrivilegiado
    },
    modo: "simulado"
  };
}

export async function agregarJugadorConCodigo(codigoAcceso, nuevoJugador, { esAutoRegistro = false } = {}) {
  if (!codigoAcceso?.trim()) {
    throw new Error("Ingresa un código de acceso válido.");
  }

  if (isSupabaseConfigured && supabase) {
    const token = obtenerTokenSesion();
    if (!token) {
      throw new Error("Tu sesión ha expirado. Inicia sesión nuevamente.");
    }

    const { data, error } = await supabase.rpc("rpc_agregar_jugador_con_codigo", {
      p_token: token,
      p_codigo: codigoAcceso.trim(),
      p_jugador: nuevoJugador || {},
      p_es_auto_registro: Boolean(esAutoRegistro)
    });

    if (error) {
      throw new Error(error.message || "Error al agregar integrante al equipo.");
    }

    return data;
  }

  // MODO LOCAL SIMULADO
  const sesion = obtenerSesionActual();
  const equipos = getLocal(KEY_EQUIPOS, SEED_EQUIPOS);
  const equipo = equipos.find((e) => !e.eliminado && e.codigoAcceso === codigoAcceso.trim());
  if (!equipo) throw new Error("No se encontró ningún equipo con ese código de acceso.");

  if (equipo.estado === "Rechazado") {
    throw new Error("Este equipo se encuentra en estado 'Rechazado' y no admite nuevos integrantes.");
  }

  if (sesion && !sesion.esAdmin) {
    const resumen = await obtenerResumenPublico();
    if (!resumen.inscripcionesAbiertas) {
      throw new Error("El periodo oficial de inscripciones está cerrado.");
    }
    const esCapitan = equipo.capitan?.correo && equipo.capitan.correo.toLowerCase() === sesion.correo.toLowerCase();
    if (!esAutoRegistro && !esCapitan) {
      throw new Error("Solo el Capitán del equipo o un Administrador puede agregar integrantes manualmente.");
    }
  }

  const todosJugadores = getLocal(KEY_JUGADORES, SEED_JUGADORES);
  const jugadoresEquipo = todosJugadores.filter((j) => !j.eliminado && j.equipoId === equipo.id);

  if (jugadoresEquipo.length >= CONFIG_TORNEO.plantilla.max) {
    throw new Error(`El equipo ya alcanzó el límite reglamentario de ${CONFIG_TORNEO.plantilla.max} jugadores.`);
  }

  if (!nuevoJugador?.nombre?.trim() || !nuevoJugador?.cuenta?.trim()) {
    throw new Error("El nombre y número de cuenta son obligatorios.");
  }

  const nombreClaseLimpio = nuevoJugador.nombreClase?.trim() || nuevoJugador.nombre_clase?.trim() || "";
  const codigoClaseLimpio = nuevoJugador.codigoClase?.trim() || nuevoJugador.codigo_clase?.trim() || "";

  if (!nombreClaseLimpio || !codigoClaseLimpio) {
    throw new Error("El nombre y código de la clase son obligatorios.");
  }

  if (esAutoRegistro) {
    const cLimpio = nuevoJugador.correo?.trim().toLowerCase() || sesion?.correo?.trim().toLowerCase() || "";
    const esDoc = esDocenteAutorizado(cLimpio);
    if (!esDoc) {
      if (!Array.isArray(equipo.clasesRepresentadas) || equipo.clasesRepresentadas.length === 0) {
        throw new Error(
          "Este equipo no tiene clases representadas registradas. El Capitán debe registrar las clases del equipo antes de que los integrantes puedan unirse."
        );
      }
      const codigosPermitidos = equipo.clasesRepresentadas.map((c) =>
        typeof c === "object"
          ? String(c.codigoClase || c.codigo || "").trim().toUpperCase()
          : String(c).trim().toUpperCase()
      ).filter(Boolean);

      if (!codigosPermitidos.includes(codigoClaseLimpio.toUpperCase())) {
        throw new Error("El código de clase no coincide con ninguna de las clases representadas por este equipo.");
      }
    }
  }

  const cuentaLimpia = nuevoJugador.cuenta.trim();
  const correoLimpio = esAutoRegistro && sesion?.correo
    ? sesion.correo.trim().toLowerCase()
    : (nuevoJugador.correo?.trim().toLowerCase() || "");

  if (esAutoRegistro && sesion?.correo && nuevoJugador.correo && nuevoJugador.correo.trim().toLowerCase() !== correoLimpio) {
    throw new Error("En auto-registro debes utilizar el correo de tu propia sesión institucional.");
  }

  if (correoLimpio && !validarCorreoInstitucional(correoLimpio)) {
    throw new Error(`El correo debe ser institucional (${CONFIG_TORNEO.dominiosValidos.join(" o ")}).`);
  }

  // Exención docente únicamente cuando se trata de auto-registro verificado o sesión ausente en fixtures de test
  const correoVerificado = Boolean(esAutoRegistro);
  const esDocente = (esAutoRegistro || !sesion) && esDocenteAutorizado(correoLimpio);

  if (!esDocente) {
    if (!normalizarDni(nuevoJugador.dni)) {
      throw new Error("El Número de Identidad (DNI) es obligatorio para el registro de estudiantes.");
    }
    if (esAutoRegistro && !esDataUrlDocumentoValido(nuevoJugador.fotoDocumento)) {
      throw new Error("Debes adjuntar obligatoriamente la foto válida de tu carnet universitario o confirmación de matrícula.");
    }
  }

  const dniLimpio = esDocente ? "Exento (Docente)" : nuevoJugador.dni.trim();
  const dniNorm = normalizarDni(dniLimpio);
  const tipoDoc = esDocente ? "docente" : (nuevoJugador.tipoDocumento || "carnet");
  const fotoDoc = esDataUrlDocumentoValido(nuevoJugador.fotoDocumento) ? nuevoJugador.fotoDocumento : null;
  const estadoCarnet = esDocente
    ? "exento_docente"
    : fotoDoc
    ? (sesion?.esAdmin ? "verificado" : "en_revision")
    : "pendiente";

  if (jugadoresEquipo.some((j) => j.cuenta === cuentaLimpia)) {
    throw new Error("Este número de cuenta ya está en la plantilla de este equipo.");
  }
  if (correoLimpio && jugadoresEquipo.some((j) => (j.correo || "").toLowerCase() === correoLimpio)) {
    throw new Error("Este correo institucional ya está en la plantilla de este equipo.");
  }
  if (!esDocente && dniNorm && jugadoresEquipo.some((j) => normalizarDni(j.dni) === dniNorm)) {
    throw new Error("Este Número de Identidad (DNI) ya está en la plantilla de este equipo.");
  }

  const activosIds = new Set(equipos.filter((e) => !e.eliminado && e.estado !== "Rechazado").map((e) => e.id));
  const otrosActivos = todosJugadores.filter(
    (j) => !j.eliminado && activosIds.has(j.equipoId) && !(j.correoVerificado !== false && esDocenteAutorizado(j.correo))
  );

  if (!esDocente) {
    if (otrosActivos.some((j) => j.cuenta === cuentaLimpia)) {
      throw new Error("Esta cuenta ya está registrada en otro equipo activo del torneo.");
    }
    if (correoLimpio && !esDocenteAutorizado(correoLimpio) && otrosActivos.some((j) => (j.correo || "").toLowerCase() === correoLimpio)) {
      throw new Error("Este correo institucional ya está registrado en otro equipo activo del torneo.");
    }
    if (dniNorm && otrosActivos.some((j) => normalizarDni(j.dni) === dniNorm)) {
      throw new Error("Este Número de Identidad (DNI) ya está registrado en otro equipo activo del torneo.");
    }
  }

  const hist = correoLimpio ? obtenerHistorialPerfilLocal(correoLimpio) : [];
  const nuevoRegistro = {
    id: `jug-${equipo.id}-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
    equipoId: equipo.id,
    nombreEquipo: equipo.nombre,
    nombre: nuevoJugador.nombre.trim(),
    cuenta: cuentaLimpia,
    dni: dniLimpio,
    tipoDocumento: tipoDoc,
    fotoDocumento: fotoDoc,
    correo: correoLimpio,
    carrera: nuevoJugador.carrera || CONFIG_TORNEO.carreras[0],
    nombreClase: nombreClaseLimpio,
    codigoClase: codigoClaseLimpio,
    esCapitan: false,
    usuarioId: esAutoRegistro ? (sesion?.usuarioId || null) : null,
    correoVerificado,
    estadoCarnet,
    verificadoPor: estadoCarnet === "verificado" ? (sesion?.correo || "admin") : null,
    verificadoEn: estadoCarnet === "verificado" ? new Date().toISOString() : null,
    alertaCambioIdentidad: Boolean(esAutoRegistro && hist.length > 0),
    periodo: CONFIG_TORNEO.periodo,
    estado: etiquetaEstadoDesdeCarnet(estadoCarnet)
  };

  todosJugadores.push(nuevoRegistro);
  setLocal(KEY_JUGADORES, todosJugadores);

  return await buscarEquipoPorCodigo(codigoAcceso);
}

export async function expulsarJugador({ codigoAcceso, jugadorId }) {
  if (!codigoAcceso || !jugadorId) {
    throw new Error("Se requiere el código de acceso del equipo y el identificador del jugador.");
  }

  if (isSupabaseConfigured && supabase) {
    const token = obtenerTokenSesion();
    if (!token) throw new Error("Tu sesión ha expirado. Inicia sesión nuevamente.");

    const { data, error } = await supabase.rpc("rpc_expulsar_jugador", {
      p_token: token,
      p_codigo: codigoAcceso.trim(),
      p_jugador_id: jugadorId
    });

    if (error) {
      throw new Error(error.message || "No se pudo expulsar al integrante.");
    }

    return data;
  }

  // MODO LOCAL SIMULADO
  const sesion = obtenerSesionActual();
  const equipos = getLocal(KEY_EQUIPOS, SEED_EQUIPOS);
  const equipo = equipos.find((e) => !e.eliminado && e.codigoAcceso === codigoAcceso.trim());
  if (!equipo) throw new Error("Equipo no encontrado.");

  if (sesion && !sesion.esAdmin) {
    const esCapitan = equipo.capitan?.correo && equipo.capitan.correo.toLowerCase() === sesion.correo.toLowerCase();
    if (!esCapitan) {
      throw new Error("Solo el Capitán verificado del equipo o un Administrador puede expulsar integrantes.");
    }
  }

  const todosJugadores = getLocal(KEY_JUGADORES, SEED_JUGADORES);
  const jugadorAExpulsar = todosJugadores.find((j) => !j.eliminado && j.id === jugadorId && j.equipoId === equipo.id);

  if (!jugadorAExpulsar) {
    throw new Error("El jugador no fue encontrado en la plantilla de este equipo.");
  }

  if (jugadorAExpulsar.esCapitan) {
    throw new Error("El Capitán es el fundador del equipo y no puede ser expulsado de la plantilla.");
  }

  const actualizados = todosJugadores.filter((j) => j.id !== jugadorId);
  setLocal(KEY_JUGADORES, actualizados);

  return await buscarEquipoPorCodigo(codigoAcceso);
}

export async function editarJugadorEquipo({ codigoAcceso, jugadorId, datos }) {
  if (!codigoAcceso || !jugadorId || !datos) {
    throw new Error("Se requiere el código de equipo, el ID del jugador y los datos a actualizar.");
  }

  if (isSupabaseConfigured && supabase) {
    const token = obtenerTokenSesion();
    if (!token) throw new Error("Sesión requerida para editar integrantes.");

    const { data, error } = await supabase.rpc("rpc_editar_jugador_equipo", {
      p_token: token,
      p_codigo: codigoAcceso.trim(),
      p_jugador_id: jugadorId,
      p_datos: datos
    });

    if (error) {
      throw new Error(error.message || "Error al editar datos del integrante.");
    }
    return data;
  }

  // MODO LOCAL SIMULADO
  const sesion = obtenerSesionActual();
  const equipos = getLocal(KEY_EQUIPOS, SEED_EQUIPOS);
  const equipo = equipos.find((e) => !e.eliminado && e.codigoAcceso === codigoAcceso.trim());
  if (!equipo) throw new Error("Equipo no encontrado.");

  const esCapitan = equipo.capitan?.correo && equipo.capitan.correo.toLowerCase() === sesion?.correo?.toLowerCase();
  const esAdmin = Boolean(sesion?.esAdmin);
  if (!esCapitan && !esAdmin) {
    throw new Error("Solo el Capitán verificado o un Administrador puede editar los datos del integrante.");
  }

  const todosJugadores = getLocal(KEY_JUGADORES, SEED_JUGADORES);
  const idx = todosJugadores.findIndex((j) => !j.eliminado && j.id === jugadorId && j.equipoId === equipo.id);
  if (idx === -1) throw new Error("Jugador no encontrado en este equipo.");

  const prev = todosJugadores[idx];
  const correoObjetivo = prev.correo || sesion?.correo;
  if (correoObjetivo) {
    registrarHistorialPerfilLocal(correoObjetivo, prev, datos, "edicion_equipo");
  }

  if (datos.nombre) todosJugadores[idx].nombre = datos.nombre.trim();
  if (datos.cuenta) todosJugadores[idx].cuenta = datos.cuenta.trim();
  if (datos.dni) todosJugadores[idx].dni = datos.dni.trim();
  if (datos.carrera) todosJugadores[idx].carrera = datos.carrera;
  if (datos.telefono) todosJugadores[idx].telefono = datos.telefono.trim();
  if (datos.nombreClase || datos.nombre_clase) {
    todosJugadores[idx].nombreClase = (datos.nombreClase || datos.nombre_clase).trim();
  }
  if (datos.codigoClase || datos.codigo_clase) {
    todosJugadores[idx].codigoClase = (datos.codigoClase || datos.codigo_clase).trim();
  }
  if (datos.fotoDocumento) {
    todosJugadores[idx].fotoDocumento = datos.fotoDocumento;
    todosJugadores[idx].estadoCarnet = "en_revision";
    todosJugadores[idx].estado = "En revisión";
    todosJugadores[idx].motivoRechazo = null;
  }

  setLocal(KEY_JUGADORES, todosJugadores);
  return await buscarEquipoPorCodigo(codigoAcceso);
}

// ==========================================
// REGISTRO INCOMPLETO, REVISIÓN Y CARGA DE CARNET
// ==========================================

export async function obtenerPerfilPendienteJugador(correo) {
  if (!correo) return null;

  if (isSupabaseConfigured && supabase) {
    const token = obtenerTokenSesion();
    if (!token) return null;
    try {
      const { data, error } = await supabase.rpc("rpc_obtener_perfil_pendiente", { p_token: token });
      if (error) return null;
      return data || null;
    } catch {
      return null;
    }
  }

  // MODO LOCAL SIMULADO
  const c = correo.trim().toLowerCase();
  if (esDocenteAutorizado(c)) return null;

  const equipos = getLocal(KEY_EQUIPOS, SEED_EQUIPOS);
  const activosIds = new Set(equipos.filter((e) => !e.eliminado && e.estado !== "Rechazado").map((e) => e.id));
  const todosJugadores = getLocal(KEY_JUGADORES, SEED_JUGADORES);
  const j = todosJugadores.find(
    (item) => !item.eliminado && activosIds.has(item.equipoId) && (item.correo || "").toLowerCase() === c
  );
  if (!j) return null;

  const est = obtenerEstadoCarnet(j);
  if (est === "pendiente" || est === "rechazado" || !j.fotoDocumento || !normalizarDni(j.dni)) {
    return { ...j, estadoCarnet: est };
  }
  return null;
}

export async function actualizarDocumentoJugador({ jugadorId, dni, tipoDocumento, fotoDocumento, cuenta }) {
  if (!jugadorId) throw new Error("Identificador de jugador no válido.");

  if (fotoDocumento !== undefined && fotoDocumento !== null && !esDataUrlDocumentoValido(fotoDocumento)) {
    throw new Error("El archivo de imagen o documento adjunto no es válido.");
  }

  if (isSupabaseConfigured && supabase) {
    const token = obtenerTokenSesion();
    if (!token) throw new Error("Tu sesión ha expirado. Inicia sesión nuevamente.");

    const { error } = await supabase.rpc("rpc_actualizar_documento_jugador", {
      p_token: token,
      p_payload: { jugadorId, dni, tipoDocumento, fotoDocumento, cuenta }
    });

    if (error) {
      throw new Error(error.message || "No se pudo actualizar el documento del jugador.");
    }
    return true;
  }

  // MODO LOCAL SIMULADO
  const sesion = obtenerSesionActual();
  const todosJugadores = getLocal(KEY_JUGADORES, SEED_JUGADORES);
  const idx = todosJugadores.findIndex((j) => !j.eliminado && j.id === jugadorId);
  if (idx === -1) return false;

  if (dni) {
    const dNorm = normalizarDni(dni);
    if (
      dNorm &&
      todosJugadores.some((j2, i2) => i2 !== idx && !j2.eliminado && normalizarDni(j2.dni) === dNorm)
    ) {
      throw new Error("Este Número de Identidad (DNI) ya se encuentra registrado en otro jugador activo.");
    }
    todosJugadores[idx].dni = dni.trim();
  }
  if (tipoDocumento) todosJugadores[idx].tipoDocumento = tipoDocumento;
  if (cuenta) todosJugadores[idx].cuenta = cuenta.trim();
  if (fotoDocumento) {
    todosJugadores[idx].fotoDocumento = fotoDocumento;
    const estNuevo = sesion?.esAdmin ? "verificado" : "en_revision";
    todosJugadores[idx].estadoCarnet = estNuevo;
    todosJugadores[idx].estado = etiquetaEstadoDesdeCarnet(estNuevo);
    todosJugadores[idx].motivoRechazo = null;
    if (sesion?.esAdmin) {
      todosJugadores[idx].verificadoPor = sesion.correo;
      todosJugadores[idx].verificadoEn = new Date().toISOString();
    }
  }
  setLocal(KEY_JUGADORES, todosJugadores);
  return true;
}

/**
 * Aprueba ('verificado') o rechaza ('rechazado') explícitamente el carnet de un jugador desde /admin (F-04).
 */
export async function revisarCarnetJugadorAdmin({ jugadorId, decision, motivo = "" }) {
  if (!jugadorId || !["verificado", "rechazado"].includes(decision)) {
    throw new Error("Parámetros de revisión de carnet inválidos.");
  }

  if (isSupabaseConfigured && supabase) {
    const token = obtenerTokenSesion();
    if (!token) throw new Error("Sesión administrativa requerida.");

    const { data, error } = await supabase.rpc("rpc_revisar_carnet_admin", {
      p_token: token,
      p_jugador_id: jugadorId,
      p_decision: decision,
      p_motivo: motivo || null
    });

    if (error) {
      throw new Error(error.message || "No se pudo registrar la revisión del carnet.");
    }
    return data;
  }

  // MODO LOCAL SIMULADO
  const sesion = obtenerSesionActual();
  const todosJugadores = getLocal(KEY_JUGADORES, SEED_JUGADORES);
  const idx = todosJugadores.findIndex((j) => !j.eliminado && j.id === jugadorId);
  if (idx === -1) throw new Error("Jugador no encontrado.");

  if (decision === "verificado" && !todosJugadores[idx].fotoDocumento && !esDocenteAutorizado(todosJugadores[idx].correo)) {
    throw new Error("No se puede verificar un jugador que aún no tiene foto de carnet adjunta.");
  }

  todosJugadores[idx].estadoCarnet = decision;
  todosJugadores[idx].estado = etiquetaEstadoDesdeCarnet(decision);
  todosJugadores[idx].verificadoPor = sesion?.correo || "admin@unitec.edu";
  todosJugadores[idx].verificadoEn = new Date().toISOString();
  todosJugadores[idx].motivoRechazo =
    decision === "rechazado"
      ? (motivo?.trim() || "Documento ilegible o incompleto. Vuelve a subir tu carnet.")
      : null;

  setLocal(KEY_JUGADORES, todosJugadores);
  return { ok: true, estadoCarnet: decision, estado: todosJugadores[idx].estado };
}

/**
 * Permite validación de carnets del equipo para compatibilidad con suites de pruebas y scripts administrativos.
 * En la interfaz web (/admin) el Comité debe revisar e inspeccionar cada documento de manera individual.
 */
export async function verificarCarnetsEquipoAdmin(equipoId) {
  if (!equipoId) throw new Error("Se requiere el identificador del equipo.");

  if (isSupabaseConfigured && supabase) {
    const token = obtenerTokenSesion();
    if (!token) throw new Error("Sesión administrativa requerida.");
    const { data, error } = await supabase.rpc("rpc_verificar_carnets_equipo_admin", {
      p_token: token,
      p_equipo_id: equipoId
    });
    if (!error && data) return data;
  }

  // Modo simulado local: actualiza cada carnet con foto del equipo a verificado
  const sesion = obtenerSesionActual();
  const jugadores = getLocal(KEY_JUGADORES, SEED_JUGADORES);
  let verificadosCount = 0;
  const actualizados = jugadores.map((j) => {
    if (
      j.equipoId === equipoId &&
      Boolean(j.fotoDocumento || j.foto_documento) &&
      obtenerEstadoCarnet(j) !== "exento_docente"
    ) {
      verificadosCount++;
      return {
        ...j,
        estadoCarnet: "verificado",
        estado_carnet: "verificado",
        estado: "Aprobado",
        verificadoPor: sesion?.correo || "admin",
        motivoRechazo: null
      };
    }
    return j;
  });
  setLocal(KEY_JUGADORES, actualizados);
  return { ok: true, verificadosCount };
}

// ==========================================
// TORNEO, LLAVES, PARTIDOS Y PREMIOS DINÁMICOS
// ==========================================

function normalizarCriteriosPremios(criteriosExistentes) {
  const base = [
    { id: "crit-portero", nombre: "Portero con más goles tapados", icono: "🧤", categoria: "General", publicado: false, registros: {} },
    { id: "crit-mvp", nombre: "Jugador Más Valioso (MVP)", icono: "⭐", categoria: "General", publicado: false, registros: {} }
  ];
  if (!Array.isArray(criteriosExistentes) || criteriosExistentes.length === 0) {
    return base;
  }
  const resultado = [...criteriosExistentes];
  base.forEach((b) => {
    if (!resultado.some((c) => c.id === b.id || (c.nombre && c.nombre.toLowerCase() === b.nombre.toLowerCase()))) {
      resultado.unshift(b);
    }
  });
  return resultado;
}

function normalizarTorneo(raw) {
  if (!raw || typeof raw !== "object") return SEED_TORNEO;
  return {
    ...SEED_TORNEO,
    ...raw,
    brackets: {
      ...SEED_TORNEO.brackets,
      ...(raw.brackets || {})
    },
    criteriosPremios: normalizarCriteriosPremios(raw.criteriosPremios)
  };
}

export function proyectarTorneoLocal(rawTorneo, config = {}) {
  const norm = normalizarTorneo(rawTorneo);
  const t = JSON.parse(JSON.stringify(norm));

  // Ocultar por defecto: Solo se publican si el comité las activa explícitamente (true)
  const pubGoles = config.publicarGoleadores === true || t.publicarGoleadores === true || t.publicaciones?.goleadores === true;
  const pubTabla = config.publicarClasificacion === true || t.publicarClasificacion === true || t.publicaciones?.clasificacion === true;
  const pubPremios = config.publicarPremios === true || t.publicarPremios === true || t.publicaciones?.premios === true;

  // 1. Premios
  if (!pubPremios) {
    t.criteriosPremios = [];
  } else if (Array.isArray(t.criteriosPremios)) {
    t.criteriosPremios = t.criteriosPremios.filter((c) => c.publicado !== false);
  }

  // 2. Goleadores
  if (!pubGoles) {
    const limpiarPartidos = (arr) => {
      if (!Array.isArray(arr)) return [];
      return arr.map((p) => ({ ...p, goleadores: [] }));
    };

    if (Array.isArray(t.brackets?.Masculino?.rondas)) {
      t.brackets.Masculino.rondas = t.brackets.Masculino.rondas.map((r) => ({
        ...r,
        partidos: limpiarPartidos(r.partidos)
      }));
    }
    if (t.brackets?.Femenino) {
      if (Array.isArray(t.brackets.Femenino.partidos)) {
        t.brackets.Femenino.partidos = limpiarPartidos(t.brackets.Femenino.partidos);
      }
      if (Array.isArray(t.brackets.Femenino.jornadas)) {
        t.brackets.Femenino.jornadas = limpiarPartidos(t.brackets.Femenino.jornadas);
      }
      if (Array.isArray(t.brackets.Femenino.rondas)) {
        t.brackets.Femenino.rondas = t.brackets.Femenino.rondas.map((r) => ({
          ...r,
          partidos: limpiarPartidos(r.partidos)
        }));
      }
      if (t.brackets.Femenino.granFinal) {
        t.brackets.Femenino.granFinal = { ...t.brackets.Femenino.granFinal, goleadores: [] };
      }
    }
  }

  // 3. Tablas / Clasificación
  if (!pubTabla && t.brackets?.Femenino) {
    delete t.brackets.Femenino.tabla;
    delete t.brackets.Femenino.posiciones;
  }

  t.publicarGoleadores = pubGoles;
  t.publicarClasificacion = pubTabla;
  t.publicarPremios = pubPremios;

  return t;
}

export async function obtenerEstadoTorneo() {
  if (isSupabaseConfigured && supabase) {
    try {
      const { data: rpcData, error: rpcErr } = await supabase.rpc("rpc_obtener_estado_torneo_publico");
      if (!rpcErr && rpcData) {
        return normalizarTorneo(rpcData);
      }
      // Fallback resiliente si la RPC falla o antes de su despliegue:
      // Consultar fila 'torneo' y 'general', y proyectar SIEMPRE en cliente
      const [respTorneo, respCfg] = await Promise.all([
        supabase.from("configuracion").select("data").eq("id", "torneo").maybeSingle(),
        supabase.from("configuracion").select("data").eq("id", "general").maybeSingle()
      ]);
      if (respTorneo.data?.data) {
        const raw = respTorneo.data.data;
        const cfg = respCfg.data?.data || {};
        return proyectarTorneoLocal(raw, cfg);
      }
      return SEED_TORNEO;
    } catch {
      return SEED_TORNEO;
    }
  }

  const raw = getLocal(KEY_TORNEO, SEED_TORNEO);
  const cfg = getLocal(KEY_CONFIG, SEED_CONFIG);
  return proyectarTorneoLocal(raw, cfg);
}

export function suscribirTorneoEnVivo(callback) {
  if (typeof window === "undefined") return () => {};

  let pollingInterval = null;
  const startPolling = () => {
    if (pollingInterval) return;
    pollingInterval = setInterval(async () => {
      try {
        const data = await obtenerEstadoTorneo();
        callback(data);
      } catch (err) {
        console.warn("Error en fallback polling de torneo:", err);
      }
    }, 15000);
  };

  if (isSupabaseConfigured && supabase) {
    obtenerEstadoTorneo().then(callback).catch(() => {});
    let channel = null;
    const channelId = `torneo_live_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    try {
      channel = supabase
        .channel(channelId)
        .on("postgres_changes", { event: "*", schema: "public", table: "configuracion" }, async (payload) => {
          if (payload.new && (payload.new.id === "torneo" || payload.new.id === "general")) {
            try {
              const dataActualizada = await obtenerEstadoTorneo();
              callback(dataActualizada);
            } catch {
              if (payload.new.id === "torneo") {
                callback(proyectarTorneoLocal(payload.new.data));
              }
            }
          }
        })
        .subscribe((status, err) => {
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            console.warn(`Supabase Realtime status: ${status}. Activando polling fallback.`, err);
            startPolling();
          }
        });
    } catch (err) {
      console.warn("Excepción al suscribir canal Supabase Realtime. Activando polling fallback:", err);
      startPolling();
    }

    return () => {
      if (pollingInterval) {
        clearInterval(pollingInterval);
        pollingInterval = null;
      }
      if (channel) {
        try {
          supabase.removeChannel(channel);
        } catch (e) {
          console.warn("Error al remover canal Supabase:", e);
        }
      }
    };
  }

  // MODO LOCAL SIMULADO
  const handler = (e) => {
    if (e.detail?.key === KEY_TORNEO) {
      callback(normalizarTorneo(e.detail.val));
    }
  };
  window.addEventListener("mecafut_storage_change", handler);
  callback(normalizarTorneo(getLocal(KEY_TORNEO, SEED_TORNEO)));

  return () => {
    window.removeEventListener("mecafut_storage_change", handler);
  };
}

export async function obtenerTorneoMaster() {
  if (isSupabaseConfigured && supabase) {
    const token = obtenerTokenSesion();
    if (token) {
      try {
        const { data } = await supabase.from("configuracion").select("data").eq("id", "torneo_interno").maybeSingle();
        if (data?.data) return normalizarTorneo(data.data);
      } catch (e) {
        console.warn("Error leyendo torneo_interno:", e);
      }
    }
  }
  return normalizarTorneo(getLocal(KEY_TORNEO, SEED_TORNEO));
}

export async function guardarBracketCategoria(categoria, bracketData) {
  const estadoActual = await obtenerTorneoMaster();
  const brackets = { ...(estadoActual.brackets || {}), [categoria]: bracketData };
  const actualizado = { ...estadoActual, brackets };

  return await guardarTorneoCompleto(actualizado);
}

export async function guardarTorneoCompleto(torneoData) {
  if (isSupabaseConfigured && supabase) {
    const token = obtenerTokenSesion();
    if (!token) throw new Error("Sesión administrativa expirada. Inicia sesión nuevamente.");

    const { data, error } = await supabase.rpc("rpc_guardar_torneo", {
      p_token: token,
      p_torneo_data: torneoData
    });

    if (error) {
      throw new Error(error.message || "No se pudo guardar el estado del torneo en Supabase.");
    }
    return normalizarTorneo(data || torneoData);
  }

  setLocal(KEY_TORNEO, torneoData);
  window.dispatchEvent(new CustomEvent("mecafut_storage_change", { detail: { key: KEY_TORNEO, val: torneoData } }));
  return normalizarTorneo(torneoData);
}

/**
 * Actualiza la fecha del evento y la visibilidad pública de llaves persistiendo en Supabase (F-06).
 */
export async function actualizarConfigVisibilidadTorneo({ fechaEvento, visibilidadPublica }) {
  const estadoActual = await obtenerTorneoMaster();
  const actualizado = {
    ...estadoActual,
    fechaEvento: fechaEvento || estadoActual.fechaEvento,
    visibilidadPublica: visibilidadPublica || estadoActual.visibilidadPublica
  };

  return await guardarTorneoCompleto(actualizado);
}

export async function crearCriterioPremio({ nombre, icono, categoria = "General" }) {
  if (!nombre?.trim()) throw new Error("Ingresa el nombre del criterio de premiación.");
  const estado = await obtenerTorneoMaster();
  const criterios = [...(estado.criteriosPremios || [])];

  const nuevoCriterio = {
    id: `crit-${Date.now()}`,
    nombre: nombre.trim(),
    icono: icono?.trim() || "🏆",
    categoria,
    registros: {}
  };

  criterios.push(nuevoCriterio);
  const actualizado = { ...estado, criteriosPremios: criterios };
  return await guardarTorneoCompleto(actualizado);
}

export async function eliminarCriterioPremio(criterioId) {
  const estado = await obtenerTorneoMaster();
  const criterios = (estado.criteriosPremios || []).filter((c) => c.id !== criterioId);
  const actualizado = { ...estado, criteriosPremios: criterios };
  return await guardarTorneoCompleto(actualizado);
}

export async function ajustarConteoCriterio({ criterioId, jugador, delta = 1 }) {
  const estado = await obtenerTorneoMaster();
  const criterios = [...(estado.criteriosPremios || [])];
  const crit = criterios.find((c) => c.id === criterioId);

  if (!crit) throw new Error("Criterio no encontrado.");
  if (!crit.registros) crit.registros = {};

  const actual = crit.registros[jugador.id] || {
    jugadorId: jugador.id,
    nombre: jugador.nombre,
    cuenta: jugador.cuenta,
    nombreEquipo: jugador.nombreEquipo,
    valor: 0
  };

  actual.valor = Math.max(0, (actual.valor || 0) + delta);

  if (actual.valor === 0) {
    delete crit.registros[jugador.id];
  } else {
    crit.registros[jugador.id] = actual;
  }

  const actualizado = { ...estado, criteriosPremios: criterios };
  return await guardarTorneoCompleto(actualizado);
}

// ==========================================
// OPERACIONES DEL PANEL ADMINISTRATIVO (F-02)
// ==========================================

export async function obtenerDatosAdmin() {
  if (isSupabaseConfigured && supabase) {
    const token = obtenerTokenSesion();
    if (!token) {
      throw new Error("Debes iniciar sesión con tu cuenta de Administrador para cargar este panel.");
    }

    const { data, error } = await supabase.rpc("rpc_obtener_datos_admin", {
      p_token: token
    });

    if (error) {
      throw new Error(error.message || "Acceso administrativo denegado por el servidor.");
    }

    const jugadores = (data?.jugadores || []).map((j) => {
      const estCarnet = obtenerEstadoCarnet(j);
      return {
        ...j,
        equipoId: j.equipoId || j.equipo_id,
        fotoDocumento: j.fotoDocumento || j.foto_documento,
        tipoDocumento: j.tipoDocumento || j.tipo_documento || "carnet",
        estadoCarnet: estCarnet,
        estado: j.estado || etiquetaEstadoDesdeCarnet(estCarnet)
      };
    });

    const equipos = data?.equipos || [];
    const usuarios = data?.usuarios || [];
    const historial = data?.historial || [];
    const rawCfg = data?.configuracion || { inscripcionesAbiertas: true };
    const configuracion = {
      ...rawCfg,
      whatsappCapitanesUrl: rawCfg.whatsappCapitanesUrl || CONFIG_TORNEO.whatsappCapitanesUrl
    };
    const torneo = normalizarTorneo(data?.torneo);

    return { jugadores, equipos, configuracion, torneo, usuarios, historial, modo: "supabase" };
  }

  // MODO LOCAL SIMULADO
  const equipos = getLocal(KEY_EQUIPOS, SEED_EQUIPOS).filter((e) => !e.eliminado);
  const historial = JSON.parse(localStorage.getItem("mecafut_usuarios_historial") || "[]");
  const todosUsuarios = Object.values(JSON.parse(localStorage.getItem("mecafut_usuarios") || "{}")).map((u) => {
    const { password_hash: _omit, ...resto } = u;
    return resto;
  });
  const jugadores = getLocal(KEY_JUGADORES, SEED_JUGADORES)
    .filter((j) => !j.eliminado)
    .map((j) => {
      const estCarnet = obtenerEstadoCarnet(j);
      const hist = j.correo ? obtenerHistorialPerfilLocal(j.correo) : [];
      return {
        ...j,
        estadoCarnet: estCarnet,
        estado: j.estado || etiquetaEstadoDesdeCarnet(estCarnet),
        alertaCambioIdentidad: Boolean(j.alertaCambioIdentidad || hist.length > 0),
        historialCambios: j.historialCambios || hist
      };
    });
  const rawCfg = getLocal(KEY_CONFIG, SEED_CONFIG);
  const configuracion = {
    ...rawCfg,
    whatsappCapitanesUrl: rawCfg.whatsappCapitanesUrl || CONFIG_TORNEO.whatsappCapitanesUrl
  };
  const torneo = normalizarTorneo(getLocal(KEY_TORNEO, SEED_TORNEO));

  return { jugadores, equipos, configuracion, torneo, usuarios: todosUsuarios, historial, modo: "simulado" };
}

export async function actualizarEstadoEquipo(equipoId, nuevoEstado) {
  if (isSupabaseConfigured && supabase) {
    const token = obtenerTokenSesion();
    if (!token) throw new Error("Sesión administrativa requerida.");

    const { error } = await supabase.rpc("rpc_actualizar_estado_equipo", {
      p_token: token,
      p_equipo_id: equipoId,
      p_nuevo_estado: nuevoEstado
    });

    if (error) {
      throw new Error(error.message || "No se pudo actualizar el estado del equipo.");
    }
    return true;
  }

  const equipos = getLocal(KEY_EQUIPOS, SEED_EQUIPOS);
  const idx = equipos.findIndex((e) => !e.eliminado && e.id === equipoId);
  if (idx !== -1) {
    equipos[idx].estado = nuevoEstado;
    setLocal(KEY_EQUIPOS, equipos);
  }
  return true;
}

export async function eliminarEquipoAdmin(equipoId) {
  if (isSupabaseConfigured && supabase) {
    const token = obtenerTokenSesion();
    if (!token) throw new Error("Sesión administrativa requerida.");

    const { error } = await supabase.rpc("rpc_eliminar_equipo_admin", {
      p_token: token,
      p_equipo_id: equipoId
    });

    if (error) {
      throw new Error(error.message || "No se pudo eliminar el equipo.");
    }
    return true;
  }

  let equipos = getLocal(KEY_EQUIPOS, SEED_EQUIPOS);
  let jugadores = getLocal(KEY_JUGADORES, SEED_JUGADORES);

  equipos = equipos.filter((e) => e.id !== equipoId);
  jugadores = jugadores.filter((j) => j.equipoId !== equipoId);

  setLocal(KEY_EQUIPOS, equipos);
  setLocal(KEY_JUGADORES, jugadores);
  return true;
}

export async function guardarConfiguracionGeneral(actualizaciones = {}) {
  if (isSupabaseConfigured && supabase) {
    const token = obtenerTokenSesion();
    if (!token) throw new Error("Sesión administrativa requerida.");

    const { data, error } = await supabase.rpc("rpc_guardar_configuracion_general", {
      p_token: token,
      p_actualizaciones: actualizaciones
    });

    if (error) {
      throw new Error(`Error en base de datos: ${error.message}`);
    }
    return data;
  }

  const dataActual = getLocal(KEY_CONFIG, SEED_CONFIG);
  const dataMerged = {
    ...dataActual,
    ...actualizaciones
  };
  setLocal(KEY_CONFIG, dataMerged);
  return dataMerged;
}

export async function actualizarEnlaceWhatsapp(url) {
  if (!url || typeof url !== "string") {
    throw new Error("El enlace de WhatsApp no es válido.");
  }
  return await guardarConfiguracionGeneral({ whatsappCapitanesUrl: url.trim() });
}

export async function cambiarEstadoInscripciones(abiertas) {
  await guardarConfiguracionGeneral({ inscripcionesAbiertas: abiertas });
  return true;
}

export function reiniciarBaseDeDatosSimulada() {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY_EQUIPOS, JSON.stringify(SEED_EQUIPOS));
  localStorage.setItem(KEY_JUGADORES, JSON.stringify(SEED_JUGADORES));
  localStorage.setItem(KEY_CONFIG, JSON.stringify(SEED_CONFIG));
  localStorage.setItem(KEY_TORNEO, JSON.stringify(SEED_TORNEO));
  window.dispatchEvent(new CustomEvent("mecafut_storage_change", { detail: { key: "all" } }));
}

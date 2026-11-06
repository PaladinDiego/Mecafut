// lib/dbService.js
// Capa de Datos Híbrida Inteligente: Local Simulado (localStorage) y Cloud Firebase Firestore

import { initializeApp, getApps } from "firebase/app";
import {
  getFirestore,
  collection,
  query,
  where,
  getDocs,
  writeBatch,
  doc,
  getDoc,
  updateDoc,
  deleteDoc,
  setDoc,
  onSnapshot
} from "firebase/firestore";
import {
  CONFIG_TORNEO,
  esDocenteAutorizado
} from "./torneoConfig";

// ==========================================
// CONFIGURACIÓN DE FIREBASE
// ==========================================
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "TU_API_KEY",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "TU_AUTH_DOMAIN",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "TU_PROJECT_ID",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "TU_STORAGE_BUCKET",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "TU_MESSAGING_SENDER_ID",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "TU_APP_ID",
};

export const isFirebaseConfigured = Boolean(
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID &&
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID !== "TU_PROJECT_ID"
);

let db = null;
if (isFirebaseConfigured) {
  const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
  db = getFirestore(app);
}

// ==========================================
// COMPRESOR CLIENT-SIDE DE COMPROBANTES Y CARNETS
// ==========================================
export function comprimirComprobante(file, maxDimension = 900, quality = 0.65) {
  return new Promise((resolve) => {
    if (!file) return resolve(null);

    // Si es un PDF, leerlo directamente como dataURL
    if (file.type === "application/pdf") {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
      return;
    }

    // Si es imagen, redimensionar y comprimir en canvas a JPEG ligero (~50-80KB)
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

// Alias para comprimir fotos de carnet o confirmación de matrícula
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
  inscripcionesAbiertas: true
};

const SEED_TORNEO = {
  fechaEvento: CONFIG_TORNEO.fechas.diaEventoDefault,
  visibilidadPublica: "auto", // "auto" | "visible" | "oculto"
  brackets: {
    Masculino: null,
    Femenino: null
  },
  criteriosPremios: [
    { id: "crit-portero", nombre: "Portero con más goles tapados", icono: "🧤", categoria: "General", registros: {} },
    { id: "crit-mvp", nombre: "Jugador Más Valioso (MVP)", icono: "⭐", categoria: "General", registros: {} }
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

// Validador de formato de correo institucional
export function validarCorreoInstitucional(correo) {
  if (!correo) return false;
  const limpio = correo.trim().toLowerCase();
  return CONFIG_TORNEO.dominiosValidos.some(d => limpio.endsWith(d));
}

// ==========================================
// CONSULTAS PÚBLICAS Y DE DISPONIBILIDAD
// ==========================================

export async function obtenerResumenPublico() {
  const ahora = new Date();
  const fechaFin = new Date(CONFIG_TORNEO.fechas.finInscripciones);
  const cerradoPorFecha = ahora > fechaFin;

  if (isFirebaseConfigured && db) {
    const [eSnap, configDoc] = await Promise.all([
      getDocs(collection(db, "equipos")),
      getDoc(doc(db, "configuracion", "general"))
    ]);

    const equipos = eSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const config = configDoc.exists() ? configDoc.data() : { inscripcionesAbiertas: true };

    const activos = equipos.filter(e => e.estado !== "Rechazado");
    const masculinoOcupados = activos.filter(e => (e.categoria || "Masculino") === "Masculino").length;
    const femeninoOcupados = activos.filter(e => e.categoria === "Femenino").length;

    const conteoColores = {};
    activos.forEach(e => {
      if (e.color) {
        const col = e.color.toLowerCase();
        conteoColores[col] = (conteoColores[col] || 0) + 1;
      }
    });

    const coloresLlenos = Object.keys(conteoColores).filter(col => conteoColores[col] >= 2);

    const inscripcionesHabilitadas = config.inscripcionesAbiertas !== false && !cerradoPorFecha;

    return {
      inscripcionesAbiertas: inscripcionesHabilitadas,
      cerradoPorFecha,
      masculinoOcupados,
      femeninoOcupados,
      maxMasculino: CONFIG_TORNEO.cupos.masculino,
      maxFemenino: CONFIG_TORNEO.cupos.femenino,
      conteoColores,
      coloresLlenos,
      equiposActivos: activos.map(e => ({
        id: e.id,
        nombre: e.nombre,
        categoria: e.categoria,
        capitan: e.capitan?.nombre,
        codigoAcceso: e.codigoAcceso,
        color: e.color
      })),
      nombresTomados: activos.map(e => e.nombre.toLowerCase().trim()),
      modo: "firebase"
    };
  }

  // MODO LOCAL SIMULADO
  const equipos = getLocal(KEY_EQUIPOS, SEED_EQUIPOS);
  const config = getLocal(KEY_CONFIG, SEED_CONFIG);

  const activos = equipos.filter(e => e.estado !== "Rechazado");
  const masculinoOcupados = activos.filter(e => (e.categoria || "Masculino") === "Masculino").length;
  const femeninoOcupados = activos.filter(e => e.categoria === "Femenino").length;

  const conteoColores = {};
  activos.forEach(e => {
    if (e.color) {
      const col = e.color.toLowerCase();
      conteoColores[col] = (conteoColores[col] || 0) + 1;
    }
  });

  const coloresLlenos = Object.keys(conteoColores).filter(col => conteoColores[col] >= 2);
  const inscripcionesHabilitadas = config.inscripcionesAbiertas !== false && !cerradoPorFecha;

  return {
    inscripcionesAbiertas: inscripcionesHabilitadas,
    cerradoPorFecha,
    masculinoOcupados,
    femeninoOcupados,
    maxMasculino: CONFIG_TORNEO.cupos.masculino,
    maxFemenino: CONFIG_TORNEO.cupos.femenino,
    conteoColores,
    coloresLlenos,
    equiposActivos: activos.map(e => ({
      id: e.id,
      nombre: e.nombre,
      categoria: e.categoria,
      capitan: e.capitan?.nombre,
      codigoAcceso: e.codigoAcceso,
      color: e.color
    })),
    nombresTomados: activos.map(e => (e.nombre || "").toLowerCase().trim()),
    modo: "simulado"
  };
}

// ==========================================
// REGISTRO OFICIAL DE EQUIPOS
// ==========================================

export async function inscribirEquipo({ equipo, capitan, jugadores, comprobanteFile }) {
  // 1. Validar que las inscripciones estén abiertas
  const resumen = await obtenerResumenPublico();
  if (!resumen.inscripcionesAbiertas) {
    throw new Error("El periodo oficial de inscripciones para MECAFUT ha finalizado o está cerrado.");
  }

  // 2. Validar cupos estrictos por categoría (Sin lista de espera)
  const categoria = equipo.categoria || "Masculino";
  if (categoria === "Masculino" && resumen.masculinoOcupados >= CONFIG_TORNEO.cupos.masculino) {
    throw new Error(`Se han agotado los ${CONFIG_TORNEO.cupos.masculino} cupos oficiales para la categoría Masculina. No se admiten cupos adicionales.`);
  }
  if (categoria === "Femenino" && resumen.femeninoOcupados >= CONFIG_TORNEO.cupos.femenino) {
    throw new Error(`Se han agotado los ${CONFIG_TORNEO.cupos.femenino} cupos oficiales para la categoría Femenina.`);
  }

  // 3. Validar datos mínimos del Capitán
  if (!capitan.nombre?.trim() || !capitan.cuenta?.trim() || !capitan.correo?.trim() || !capitan.telefono?.trim()) {
    throw new Error("Por favor completa todos los datos obligatorios del Capitán.");
  }

  if (!validarCorreoInstitucional(capitan.correo)) {
    throw new Error(`El correo del capitán debe ser institucional (${CONFIG_TORNEO.dominiosValidos.join(" o ")}).`);
  }

  const esDocenteCapitan = esDocenteAutorizado(capitan.correo);

  // Estudiantes: DNI y Foto de carnet/matrícula son obligatorios para el Capitán
  if (!esDocenteCapitan) {
    if (!capitan.dni?.trim()) {
      throw new Error("El Número de Identidad (DNI) del Capitán es obligatorio para la verificación reglamentaria.");
    }
    if (!capitan.fotoDocumento) {
      throw new Error("El Capitán debe adjuntar obligatoriamente la foto de su carnet universitario o confirmación de matrícula.");
    }
  }

  // 4. El Capitán se sincroniza automáticamente como el Jugador #1
  const filaCapitan = {
    nombre: capitan.nombre.trim(),
    cuenta: capitan.cuenta.trim(),
    correo: capitan.correo.trim().toLowerCase(),
    dni: esDocenteCapitan ? "Exento (Docente)" : (capitan.dni?.trim() || ""),
    tipoDocumento: esDocenteCapitan ? "docente" : (capitan.tipoDocumento || "carnet"),
    fotoDocumento: capitan.fotoDocumento || null,
    carrera: capitan.carrera || CONFIG_TORNEO.carreras[0],
    codigoClase: capitan.codigoClase?.trim() || "N/A",
    esCapitan: true
  };

  // Filtrar jugadores extras
  const jugadoresExtras = (jugadores || [])
    .filter(j => j.nombre?.trim() && j.cuenta?.trim())
    .map(j => {
      const jEsDocente = esDocenteAutorizado(j.correo);
      return {
        nombre: j.nombre.trim(),
        cuenta: j.cuenta.trim(),
        correo: j.correo?.trim().toLowerCase() || "",
        dni: jEsDocente ? "Exento (Docente)" : (j.dni?.trim() || ""),
        tipoDocumento: jEsDocente ? "docente" : (j.tipoDocumento || "carnet"),
        fotoDocumento: j.fotoDocumento || null,
        carrera: j.carrera || CONFIG_TORNEO.carreras[0],
        codigoClase: j.codigoClase?.trim() || "N/A",
        esCapitan: false
      };
    });

  const plantillaCompleta = [filaCapitan, ...jugadoresExtras];

  if (plantillaCompleta.length > CONFIG_TORNEO.plantilla.max) {
    throw new Error(`El número máximo permitido es de ${CONFIG_TORNEO.plantilla.max} jugadores por equipo.`);
  }

  // 5. Validar unicidad interna de cuentas, correos y DNI
  const cuentasInternas = plantillaCompleta.map(j => j.cuenta);
  if (new Set(cuentasInternas).size !== cuentasInternas.length) {
    throw new Error("Hay números de cuenta repetidos dentro de tu propia lista de jugadores.");
  }

  const correosInternos = plantillaCompleta.map(j => j.correo).filter(Boolean);
  if (new Set(correosInternos).size !== correosInternos.length) {
    throw new Error("Hay correos institucionales repetidos dentro de tu propio equipo.");
  }

  const dnisEstudiantesInternos = plantillaCompleta
    .filter(j => j.dni && j.dni !== "Exento (Docente)")
    .map(j => j.dni.trim());
  if (new Set(dnisEstudiantesInternos).size !== dnisEstudiantesInternos.length) {
    throw new Error("Hay Números de Identidad (DNI) repetidos dentro de tu propia lista de jugadores.");
  }

  // 6. Validar unicidad de nombre de equipo
  const nombreLimpio = equipo.nombre.trim().toLowerCase();
  if (resumen.nombresTomados.includes(nombreLimpio)) {
    throw new Error(`El nombre de equipo "${equipo.nombre}" ya fue registrado por otro grupo. Elige otro nombre.`);
  }

  // 7. Validar disponibilidad de color de uniforme (máximo 2 equipos por color)
  if (equipo.color) {
    const usoColor = resumen.conteoColores[equipo.color.toLowerCase()] || 0;
    if (usoColor >= 2) {
      throw new Error(`El color de uniforme "${equipo.color}" ya alcanzó el límite máximo de 2 equipos. Selecciona otro color disponible.`);
    }
  }

  // 8. Comprimir comprobante de pago
  const comprobanteDataUrl = await comprimirComprobante(comprobanteFile);
  const codigoAcceso = Math.floor(10000000 + Math.random() * 90000000).toString();
  const estado = "Pendiente"; // Todo registro entra a validación de pago

  // -----------------------------------------------------------
  // MODO CLOUD FIREBASE
  // -----------------------------------------------------------
  if (isFirebaseConfigured && db) {
    for (let i = 0; i < cuentasInternas.length; i += 10) {
      const chunk = cuentasInternas.slice(i, i + 10);
      const q = query(collection(db, "jugadores"), where("cuenta", "in", chunk));
      const snap = await getDocs(q);
      if (!snap.empty) {
        // Eximir docentes si están en más de un equipo
        const invalidos = snap.docs
          .map(d => d.data())
          .filter(j => !esDocenteAutorizado(j.correo))
          .map(j => j.cuenta);
        if (invalidos.length > 0) {
          throw new Error(`Cuentas de estudiantes ya inscritas en otro equipo: ${invalidos.join(", ")}`);
        }
      }
    }

    const batch = writeBatch(db);
    const equipoRef = doc(collection(db, "equipos"));

    batch.set(equipoRef, {
      nombre: equipo.nombre.trim(),
      tipoEquipo: equipo.tipoEquipo || "Estudiantes",
      docente: equipo.docente,
      categoria: equipo.categoria || "Masculino",
      color: equipo.color,
      capitan: filaCapitan,
      codigoAcceso,
      comprobanteAdjunto: Boolean(comprobanteFile),
      comprobanteDataUrl,
      estado,
      fechaRegistro: new Date().toISOString()
    });

    plantillaCompleta.forEach(j => {
      const jRef = doc(collection(db, "jugadores"));
      batch.set(jRef, {
        ...j,
        equipoId: equipoRef.id,
        nombreEquipo: equipo.nombre.trim()
      });
    });

    await batch.commit();
    return { codigoAcceso, estado, modo: "firebase" };
  }

  // -----------------------------------------------------------
  // MODO LOCAL SIMULADO
  // -----------------------------------------------------------
  const jugadoresActuales = getLocal(KEY_JUGADORES, SEED_JUGADORES);
  const equiposActuales = getLocal(KEY_EQUIPOS, SEED_EQUIPOS);

  const equiposActivosIds = new Set(equiposActuales.filter(e => e.estado !== "Rechazado").map(e => e.id));
  const jugadoresActivos = jugadoresActuales.filter(j => equiposActivosIds.has(j.equipoId));

  // Filtrar solo estudiantes para candados de unicidad cruzada
  const jugadoresEstudiantesActivos = jugadoresActivos.filter(j => !esDocenteAutorizado(j.correo));

  const cuentasRegistradas = new Set(jugadoresEstudiantesActivos.map(j => j.cuenta));
  const correosRegistrados = new Set(jugadoresEstudiantesActivos.map(j => j.correo).filter(Boolean));
  const dnisRegistrados = new Set(
    jugadoresEstudiantesActivos
      .filter(j => j.dni && j.dni !== "Exento (Docente)")
      .map(j => j.dni.trim())
  );

  const estudiantesEnPlantilla = plantillaCompleta.filter(j => !esDocenteAutorizado(j.correo));

  const yaCuentas = estudiantesEnPlantilla.map(j => j.cuenta).filter(c => cuentasRegistradas.has(c));
  if (yaCuentas.length > 0) {
    throw new Error(`Cuentas ya inscritas en otro equipo activo: ${yaCuentas.join(", ")}`);
  }

  const yaCorreos = estudiantesEnPlantilla.map(j => j.correo).filter(Boolean).filter(c => correosRegistrados.has(c));
  if (yaCorreos.length > 0) {
    throw new Error(`Correos ya inscritos en otro equipo activo: ${yaCorreos.join(", ")}`);
  }

  const yaDnis = estudiantesEnPlantilla.map(j => j.dni).filter(Boolean).filter(d => dnisRegistrados.has(d));
  if (yaDnis.length > 0) {
    throw new Error(`Números de Identidad (DNI) ya inscritos en otro equipo activo: ${yaDnis.join(", ")}`);
  }

  const nuevoEquipoId = "eq-" + Date.now();
  const nuevoEquipo = {
    id: nuevoEquipoId,
    nombre: equipo.nombre.trim(),
    tipoEquipo: equipo.tipoEquipo || "Estudiantes",
    docente: equipo.docente,
    categoria: equipo.categoria || "Masculino",
    color: equipo.color,
    capitan: filaCapitan,
    codigoAcceso,
    comprobanteAdjunto: Boolean(comprobanteFile),
    comprobanteDataUrl,
    estado,
    fechaRegistro: new Date().toISOString()
  };

  const nuevosJugadores = plantillaCompleta.map((j, idx) => ({
    id: `jug-${nuevoEquipoId}-${idx + 1}`,
    equipoId: nuevoEquipoId,
    nombreEquipo: equipo.nombre.trim(),
    ...j
  }));

  equiposActuales.push(nuevoEquipo);
  jugadoresActuales.push(...nuevosJugadores);

  setLocal(KEY_EQUIPOS, equiposActuales);
  setLocal(KEY_JUGADORES, jugadoresActuales);

  return { codigoAcceso, estado, modo: "simulado" };
}

// ==========================================
// CONSULTA POR CÓDIGO Y ADICIÓN DE INTEGRANTES
// ==========================================

export async function buscarEquipoPorCodigo(codigo) {
  if (!codigo?.trim()) throw new Error("Ingresa un código de acceso válido.");
  const codigoBuscado = codigo.trim();

  if (isFirebaseConfigured && db) {
    const q = query(collection(db, "equipos"), where("codigoAcceso", "==", codigoBuscado));
    const snap = await getDocs(q);
    if (snap.empty) throw new Error("No se encontró ningún equipo con ese código de acceso.");

    const equipoData = { id: snap.docs[0].id, ...snap.docs[0].data() };
    const qJ = query(collection(db, "jugadores"), where("equipoId", "==", equipoData.id));
    const snapJ = await getDocs(qJ);

    return {
      equipo: equipoData,
      jugadores: snapJ.docs.map(d => ({ id: d.id, ...d.data() })),
      modo: "firebase"
    };
  }

  // MODO LOCAL SIMULADO
  const equipos = getLocal(KEY_EQUIPOS, SEED_EQUIPOS);
  const eq = equipos.find(e => e.codigoAcceso === codigoBuscado);
  if (!eq) throw new Error("No se encontró ningún equipo con el código ingresado. Código demo: '12345678'.");

  const jugadores = getLocal(KEY_JUGADORES, SEED_JUGADORES);
  const jugadoresEquipo = jugadores.filter(j => j.equipoId === eq.id);

  return {
    equipo: eq,
    jugadores: jugadoresEquipo,
    modo: "simulado"
  };
}

export async function agregarJugadorConCodigo(codigoAcceso, nuevoJugador, { esAutoRegistro = false } = {}) {
  const { equipo, jugadores } = await buscarEquipoPorCodigo(codigoAcceso);

  if (equipo.estado === "Rechazado") {
    throw new Error("Este equipo se encuentra en estado 'Rechazado' y no admite nuevos integrantes.");
  }

  if (jugadores.length >= CONFIG_TORNEO.plantilla.max) {
    throw new Error(`El equipo ya alcanzó el límite reglamentario de ${CONFIG_TORNEO.plantilla.max} jugadores.`);
  }

  if (!nuevoJugador.nombre?.trim() || !nuevoJugador.cuenta?.trim()) {
    throw new Error("El nombre y número de cuenta son obligatorios.");
  }

  const cuentaLimpia = nuevoJugador.cuenta.trim();
  const correoLimpio = nuevoJugador.correo?.trim().toLowerCase() || "";

  if (correoLimpio && !validarCorreoInstitucional(correoLimpio)) {
    throw new Error(`El correo debe ser institucional (${CONFIG_TORNEO.dominiosValidos.join(" o ")}).`);
  }

  const esDocente = esDocenteAutorizado(correoLimpio);

  // Si es auto-registro de estudiante, exigir DNI y Foto carnet obligatoria
  if (!esDocente) {
    if (!nuevoJugador.dni?.trim()) {
      throw new Error("El Número de Identidad (DNI) es obligatorio para el registro de estudiantes.");
    }
    if (esAutoRegistro && !nuevoJugador.fotoDocumento) {
      throw new Error("Debes adjuntar obligatoriamente la foto de tu carnet universitario o confirmación de matrícula.");
    }
  }

  const dniLimpio = esDocente ? "Exento (Docente)" : (nuevoJugador.dni?.trim() || "");
  const tipoDoc = esDocente ? "docente" : (nuevoJugador.tipoDocumento || "carnet");
  const fotoDoc = nuevoJugador.fotoDocumento || null;

  // Unicidad dentro del mismo equipo
  if (jugadores.some(j => j.cuenta === cuentaLimpia)) {
    throw new Error("Este número de cuenta ya está en la plantilla de este equipo.");
  }

  if (!esDocente && dniLimpio && jugadores.some(j => j.dni === dniLimpio)) {
    throw new Error("Este Número de Identidad (DNI) ya está en la plantilla de este equipo.");
  }

  // MODO CLOUD FIREBASE
  if (isFirebaseConfigured && db) {
    if (!esDocente) {
      const q = query(collection(db, "jugadores"), where("cuenta", "==", cuentaLimpia));
      const snap = await getDocs(q);
      if (!snap.empty) throw new Error("Esta cuenta ya está registrada en otro equipo del torneo.");
    }

    const jRef = doc(collection(db, "jugadores"));
    const registro = {
      nombre: nuevoJugador.nombre.trim(),
      cuenta: cuentaLimpia,
      dni: dniLimpio,
      tipoDocumento: tipoDoc,
      fotoDocumento: fotoDoc,
      correo: correoLimpio,
      carrera: nuevoJugador.carrera || CONFIG_TORNEO.carreras[0],
      codigoClase: nuevoJugador.codigoClase?.trim() || "N/A",
      esCapitan: false,
      equipoId: equipo.id,
      nombreEquipo: equipo.nombre
    };

    await setDoc(jRef, registro);
    return await buscarEquipoPorCodigo(codigoAcceso);
  }

  // MODO LOCAL SIMULADO
  const todosJugadores = getLocal(KEY_JUGADORES, SEED_JUGADORES);
  const equipos = getLocal(KEY_EQUIPOS, SEED_EQUIPOS);
  const activosIds = new Set(equipos.filter(e => e.estado !== "Rechazado").map(e => e.id));

  if (!esDocente) {
    if (todosJugadores.some(j => j.cuenta === cuentaLimpia && activosIds.has(j.equipoId))) {
      throw new Error("Esta cuenta ya está registrada en otro equipo activo del torneo.");
    }
    if (dniLimpio && todosJugadores.some(j => j.dni === dniLimpio && activosIds.has(j.equipoId))) {
      throw new Error("Este Número de Identidad (DNI) ya está registrado en otro equipo activo del torneo.");
    }
  }

  const nuevoRegistro = {
    id: `jug-${equipo.id}-${Date.now()}`,
    equipoId: equipo.id,
    nombreEquipo: equipo.nombre,
    nombre: nuevoJugador.nombre.trim(),
    cuenta: cuentaLimpia,
    dni: dniLimpio,
    tipoDocumento: tipoDoc,
    fotoDocumento: fotoDoc,
    correo: correoLimpio,
    carrera: nuevoJugador.carrera || CONFIG_TORNEO.carreras[0],
    codigoClase: nuevoJugador.codigoClase?.trim() || "N/A",
    esCapitan: false
  };

  todosJugadores.push(nuevoRegistro);
  setLocal(KEY_JUGADORES, todosJugadores);

  return await buscarEquipoPorCodigo(codigoAcceso);
}

// Expulsión de integrante por parte del Capitán o Administrador
export async function expulsarJugador({ codigoAcceso, jugadorId }) {
  if (!codigoAcceso || !jugadorId) {
    throw new Error("Se requiere el código de acceso del equipo y el identificador del jugador.");
  }

  const { equipo, jugadores } = await buscarEquipoPorCodigo(codigoAcceso);
  const jugadorAExpulsar = jugadores.find(j => j.id === jugadorId);

  if (!jugadorAExpulsar) {
    throw new Error("El jugador no fue encontrado en la plantilla de este equipo.");
  }

  if (jugadorAExpulsar.esCapitan) {
    throw new Error("El Capitán es el fundador del equipo y no puede ser expulsado de la plantilla.");
  }

  if (isFirebaseConfigured && db) {
    await deleteDoc(doc(db, "jugadores", jugadorId));
    return await buscarEquipoPorCodigo(codigoAcceso);
  }

  // MODO LOCAL SIMULADO
  const todosJugadores = getLocal(KEY_JUGADORES, SEED_JUGADORES);
  const actualizados = todosJugadores.filter(j => j.id !== jugadorId);
  setLocal(KEY_JUGADORES, actualizados);

  return await buscarEquipoPorCodigo(codigoAcceso);
}

// ==========================================
// REGISTRO INCOMPLETO Y CARGA DE CARNET
// ==========================================

export async function obtenerPerfilPendienteJugador(correo) {
  if (!correo) return null;
  const c = correo.trim().toLowerCase();

  if (isFirebaseConfigured && db) {
    const q = query(collection(db, "jugadores"), where("correo", "==", c));
    const snap = await getDocs(q);
    if (snap.empty) return null;

    const j = { id: snap.docs[0].id, ...snap.docs[0].data() };
    const esDocente = esDocenteAutorizado(j.correo);

    if (!esDocente && (!j.fotoDocumento || !j.dni || j.dni === "Exento (Docente)")) {
      return j;
    }
    return null;
  }

  // MODO LOCAL SIMULADO
  const todosJugadores = getLocal(KEY_JUGADORES, SEED_JUGADORES);
  const j = todosJugadores.find(item => (item.correo || "").toLowerCase() === c);
  if (!j) return null;

  const esDocente = esDocenteAutorizado(j.correo);
  if (!esDocente && (!j.fotoDocumento || !j.dni || j.dni === "Exento (Docente)")) {
    return j;
  }
  return null;
}

export async function actualizarDocumentoJugador({ jugadorId, dni, tipoDocumento, fotoDocumento, cuenta }) {
  if (!jugadorId) throw new Error("Identificador de jugador no válido.");

  if (isFirebaseConfigured && db) {
    const jRef = doc(db, "jugadores", jugadorId);
    const updates = {};
    if (dni) updates.dni = dni.trim();
    if (tipoDocumento) updates.tipoDocumento = tipoDocumento;
    if (fotoDocumento) updates.fotoDocumento = fotoDocumento;
    if (cuenta) updates.cuenta = cuenta.trim();

    await updateDoc(jRef, updates);
    return true;
  }

  // MODO LOCAL SIMULADO
  const todosJugadores = getLocal(KEY_JUGADORES, SEED_JUGADORES);
  const idx = todosJugadores.findIndex(j => j.id === jugadorId);
  if (idx !== -1) {
    if (dni) todosJugadores[idx].dni = dni.trim();
    if (tipoDocumento) todosJugadores[idx].tipoDocumento = tipoDocumento;
    if (fotoDocumento) todosJugadores[idx].fotoDocumento = fotoDocumento;
    if (cuenta) todosJugadores[idx].cuenta = cuenta.trim();
    setLocal(KEY_JUGADORES, todosJugadores);
  }
  return true;
}

// ==========================================
// TORNEO, LLAVES, PARTIDOS Y PREMIOS DINÁMICOS
// ==========================================

export async function obtenerEstadoTorneo() {
  if (isFirebaseConfigured && db) {
    const tDoc = await getDoc(doc(db, "torneo", "oficial"));
    if (tDoc.exists()) {
      return tDoc.data();
    }
    return SEED_TORNEO;
  }

  return getLocal(KEY_TORNEO, SEED_TORNEO);
}

export function suscribirTorneoEnVivo(callback) {
  if (typeof window === "undefined") return () => {};

  if (isFirebaseConfigured && db) {
    return onSnapshot(doc(db, "torneo", "oficial"), (snap) => {
      if (snap.exists()) {
        callback(snap.data());
      } else {
        callback(SEED_TORNEO);
      }
    });
  }

  // MODO LOCAL SIMULADO (Event listener)
  const handler = (e) => {
    if (e.detail?.key === KEY_TORNEO) {
      callback(e.detail.val);
    }
  };
  window.addEventListener("mecafut_storage_change", handler);
  // Llamar inmediatamente
  callback(getLocal(KEY_TORNEO, SEED_TORNEO));

  return () => {
    window.removeEventListener("mecafut_storage_change", handler);
  };
}

export async function guardarBracketCategoria(categoria, bracketData) {
  const estadoActual = await obtenerEstadoTorneo();
  const brackets = { ...(estadoActual.brackets || {}), [categoria]: bracketData };
  const actualizado = { ...estadoActual, brackets };

  if (isFirebaseConfigured && db) {
    await setDoc(doc(db, "torneo", "oficial"), actualizado, { merge: true });
    return actualizado;
  }

  setLocal(KEY_TORNEO, actualizado);
  return actualizado;
}

export async function guardarTorneoCompleto(torneoData) {
  if (isFirebaseConfigured && db) {
    await setDoc(doc(db, "torneo", "oficial"), torneoData, { merge: true });
    return torneoData;
  }
  setLocal(KEY_TORNEO, torneoData);
  return torneoData;
}

export async function actualizarConfigVisibilidadTorneo({ fechaEvento, visibilidadPublica }) {
  const estadoActual = await obtenerEstadoTorneo();
  const actualizado = {
    ...estadoActual,
    fechaEvento: fechaEvento || estadoActual.fechaEvento,
    visibilidadPublica: visibilidadPublica || estadoActual.visibilidadPublica
  };

  if (isFirebaseConfigured && db) {
    await setDoc(doc(db, "torneo", "oficial"), actualizado, { merge: true });
    return actualizado;
  }
  setLocal(KEY_TORNEO, actualizado);
  return actualizado;
}

// Criterios Dinámicos de Premios
export async function crearCriterioPremio({ nombre, icono, categoria = "General" }) {
  if (!nombre?.trim()) throw new Error("Ingresa el nombre del criterio de premiación.");
  const estado = await obtenerEstadoTorneo();
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
  const estado = await obtenerEstadoTorneo();
  const criterios = (estado.criteriosPremios || []).filter(c => c.id !== criterioId);
  const actualizado = { ...estado, criteriosPremios: criterios };
  return await guardarTorneoCompleto(actualizado);
}

export async function ajustarConteoCriterio({ criterioId, jugador, delta = 1 }) {
  const estado = await obtenerEstadoTorneo();
  const criterios = [...(estado.criteriosPremios || [])];
  const crit = criterios.find(c => c.id === criterioId);

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
// OPERACIONES DEL PANEL ADMINISTRATIVO
// ==========================================

export async function obtenerDatosAdmin() {
  if (isFirebaseConfigured && db) {
    const [jSnap, eSnap, cSnap] = await Promise.all([
      getDocs(collection(db, "jugadores")),
      getDocs(collection(db, "equipos")),
      getDoc(doc(db, "configuracion", "general"))
    ]);

    const jugadores = jSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const equipos = eSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const config = cSnap.exists() ? cSnap.data() : { inscripcionesAbiertas: true };
    const torneo = await obtenerEstadoTorneo();

    return { jugadores, equipos, configuracion: config, torneo, modo: "firebase" };
  }

  // MODO LOCAL SIMULADO
  const equipos = getLocal(KEY_EQUIPOS, SEED_EQUIPOS);
  const jugadores = getLocal(KEY_JUGADORES, SEED_JUGADORES);
  const config = getLocal(KEY_CONFIG, SEED_CONFIG);
  const torneo = getLocal(KEY_TORNEO, SEED_TORNEO);

  return { jugadores, equipos, configuracion: config, torneo, modo: "simulado" };
}

export async function actualizarEstadoEquipo(equipoId, nuevoEstado) {
  if (isFirebaseConfigured && db) {
    const eqRef = doc(db, "equipos", equipoId);
    await updateDoc(eqRef, { estado: nuevoEstado });
    return true;
  }

  const equipos = getLocal(KEY_EQUIPOS, SEED_EQUIPOS);
  const idx = equipos.findIndex(e => e.id === equipoId);
  if (idx !== -1) {
    equipos[idx].estado = nuevoEstado;
    setLocal(KEY_EQUIPOS, equipos);
  }
  return true;
}

export async function eliminarEquipoAdmin(equipoId) {
  if (isFirebaseConfigured && db) {
    const batch = writeBatch(db);
    batch.delete(doc(db, "equipos", equipoId));

    const jQ = query(collection(db, "jugadores"), where("equipoId", "==", equipoId));
    const snap = await getDocs(jQ);
    snap.docs.forEach(d => batch.delete(d.ref));

    await batch.commit();
    return true;
  }

  let equipos = getLocal(KEY_EQUIPOS, SEED_EQUIPOS);
  let jugadores = getLocal(KEY_JUGADORES, SEED_JUGADORES);

  equipos = equipos.filter(e => e.id !== equipoId);
  jugadores = jugadores.filter(j => j.equipoId !== equipoId);

  setLocal(KEY_EQUIPOS, equipos);
  setLocal(KEY_JUGADORES, jugadores);
  return true;
}

export async function cambiarEstadoInscripciones(abiertas) {
  if (isFirebaseConfigured && db) {
    await setDoc(doc(db, "configuracion", "general"), { inscripcionesAbiertas: abiertas }, { merge: true });
    return true;
  }

  const config = getLocal(KEY_CONFIG, SEED_CONFIG);
  config.inscripcionesAbiertas = abiertas;
  setLocal(KEY_CONFIG, config);
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

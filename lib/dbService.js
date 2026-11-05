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
  setDoc
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
// COMPRESOR CLIENT-SIDE DE COMPROBANTES (Cero Costo en Firestore)
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

const SEED_EQUIPOS = [
  {
    id: "eq-demo-1",
    nombre: "Mecatrónica Alpha",
    tipoEquipo: "Estudiantes",
    docente: "Ing. Jared Sauceda",
    categoria: "Masculino",
    color: "Azul Rey",
    capitan: {
      nombre: "Diego Ramos",
      cuenta: "20211005555",
      correo: "diegoramos@unitec.edu",
      telefono: "9876-5432",
      carrera: "Ingeniería Mecatrónica",
      codigoClase: "MEC308"
    },
    codigoAcceso: "12345678",
    comprobanteAdjunto: true,
    comprobanteDataUrl: null,
    estado: "Confirmado",
    fechaRegistro: new Date(Date.now() - 86400000).toISOString()
  }
];

const SEED_JUGADORES = [
  { id: "jug-1", equipoId: "eq-demo-1", nombreEquipo: "Mecatrónica Alpha", esCapitan: true, nombre: "Diego Ramos", cuenta: "20211005555", dni: "0801-2002-12345", tipoDocumento: "carnet", correo: "diegoramos@unitec.edu", carrera: "Ingeniería Mecatrónica", codigoClase: "MEC308" },
  { id: "jug-2", equipoId: "eq-demo-1", nombreEquipo: "Mecatrónica Alpha", esCapitan: false, nombre: "Carlos Rubi", cuenta: "20221120601", dni: "0801-2003-23456", tipoDocumento: "carnet", correo: "carlosrubi@unitec.edu", carrera: "Ingeniería Mecatrónica", codigoClase: "MEC308" },
  { id: "jug-3", equipoId: "eq-demo-1", nombreEquipo: "Mecatrónica Alpha", esCapitan: false, nombre: "Alejandro Gómez", cuenta: "20211001111", dni: "0801-2002-34567", tipoDocumento: "carnet", correo: "alejandrog@unitec.edu", carrera: "Ingeniería Mecatrónica", codigoClase: "MEC308" },
  { id: "jug-4", equipoId: "eq-demo-1", nombreEquipo: "Mecatrónica Alpha", esCapitan: false, nombre: "Mateo Fernández", cuenta: "20211002222", dni: "0801-2002-45678", tipoDocumento: "carnet", correo: "mateof@unitec.edu", carrera: "Ingeniería Industrial", codigoClase: "IND201" },
  { id: "jug-5", equipoId: "eq-demo-1", nombreEquipo: "Mecatrónica Alpha", esCapitan: false, nombre: "Sofía Martínez", cuenta: "20211003333", dni: "0801-2003-56789", tipoDocumento: "hoja_confirmacion", correo: "sofiam@unitec.edu", carrera: "Ingeniería Biomédica", codigoClase: "BIO102" },
  { id: "jug-6", equipoId: "eq-demo-1", nombreEquipo: "Mecatrónica Alpha", esCapitan: false, nombre: "Lucas Salgado", cuenta: "20211004444", dni: "0801-2002-67890", tipoDocumento: "carnet", correo: "lucass@unitec.edu", carrera: "Ingeniería en Sistemas", codigoClase: "SIS405" },
  { id: "jug-7", equipoId: "eq-demo-1", nombreEquipo: "Mecatrónica Alpha", esCapitan: false, nombre: "Gabriel Pineda", cuenta: "20211005556", dni: "0801-2002-78901", tipoDocumento: "carnet", correo: "gabrielp@unitec.edu", carrera: "Ingeniería Mecatrónica", codigoClase: "MEC308" },
  { id: "jug-8", equipoId: "eq-demo-1", nombreEquipo: "Mecatrónica Alpha", esCapitan: false, nombre: "Daniela Cruz", cuenta: "20211006666", dni: "0801-2003-89012", tipoDocumento: "carnet", correo: "danielac@unitec.edu", carrera: "Ingeniería en Telecomunicaciones", codigoClase: "TEL301" },
  { id: "jug-9", equipoId: "eq-demo-1", nombreEquipo: "Mecatrónica Alpha", esCapitan: false, nombre: "Fernando Castro", cuenta: "20211007777", dni: "0801-2001-90123", tipoDocumento: "hoja_confirmacion", correo: "fernandoc@unitec.edu", carrera: "Ingeniería Civil", codigoClase: "CIV203" },
  { id: "jug-10", equipoId: "eq-demo-1", nombreEquipo: "Mecatrónica Alpha", esCapitan: false, nombre: "Andrea Valladares", cuenta: "20211008888", dni: "0801-2003-01234", tipoDocumento: "carnet", correo: "andreav@unitec.edu", carrera: "Arquitectura", codigoClase: "ARQ105" }
];

const SEED_CONFIG = {
  inscripcionesAbiertas: true
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
  if (isFirebaseConfigured && db) {
    const [eSnap, configDoc] = await Promise.all([
      getDocs(collection(db, "equipos")),
      getDoc(doc(db, "configuracion", "general"))
    ]);

    const equipos = eSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const config = configDoc.exists() ? configDoc.data() : { inscripcionesAbiertas: true };

    const activos = equipos.filter(e => e.estado !== "Rechazado");
    const estudiantesOcupados = activos.filter(e => e.tipoEquipo === "Estudiantes" && e.estado !== "Lista de espera").length;
    const docentesOcupados = activos.filter(e => e.tipoEquipo === "Docentes" && e.estado !== "Lista de espera").length;

    // Conteo de uso de colores (máximo 2 equipos por color en todo el torneo)
    const conteoColores = {};
    activos.forEach(e => {
      if (e.color) {
        const col = e.color.toLowerCase();
        conteoColores[col] = (conteoColores[col] || 0) + 1;
      }
    });

    const coloresLlenos = Object.keys(conteoColores).filter(col => conteoColores[col] >= 2);

    return {
      inscripcionesAbiertas: config.inscripcionesAbiertas !== false,
      estudiantesOcupados,
      docentesOcupados,
      maxEstudiantes: CONFIG_TORNEO.cupos.estudiantes,
      maxDocentes: CONFIG_TORNEO.cupos.docentes,
      conteoColores,
      coloresLlenos,
      equiposActivos: activos.map(e => ({ id: e.id, nombre: e.nombre, categoria: e.categoria, capitan: e.capitan?.nombre, codigoAcceso: e.codigoAcceso })),
      nombresTomados: activos.map(e => e.nombre.toLowerCase().trim()),
      modo: "firebase"
    };
  }

  // MODO LOCAL SIMULADO
  const equipos = getLocal(KEY_EQUIPOS, SEED_EQUIPOS);
  const config = getLocal(KEY_CONFIG, SEED_CONFIG);

  const activos = equipos.filter(e => e.estado !== "Rechazado");
  const estudiantesOcupados = activos.filter(e => (e.tipoEquipo || "Estudiantes") === "Estudiantes" && e.estado !== "Lista de espera").length;
  const docentesOcupados = activos.filter(e => e.tipoEquipo === "Docentes" && e.estado !== "Lista de espera").length;

  const conteoColores = {};
  activos.forEach(e => {
    if (e.color) {
      const col = e.color.toLowerCase();
      conteoColores[col] = (conteoColores[col] || 0) + 1;
    }
  });

  const coloresLlenos = Object.keys(conteoColores).filter(col => conteoColores[col] >= 2);

  return {
    inscripcionesAbiertas: config.inscripcionesAbiertas !== false,
    estudiantesOcupados,
    docentesOcupados,
    maxEstudiantes: CONFIG_TORNEO.cupos.estudiantes,
    maxDocentes: CONFIG_TORNEO.cupos.docentes,
    conteoColores,
    coloresLlenos,
    equiposActivos: activos.map(e => ({ id: e.id, nombre: e.nombre, categoria: e.categoria, capitan: e.capitan?.nombre, codigoAcceso: e.codigoAcceso })),
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
    throw new Error("El periodo oficial de inscripciones para MECAFUT ha finalizado o está temporalmente cerrado.");
  }

  // 2. Validar datos mínimos del Capitán
  if (!capitan.nombre?.trim() || !capitan.cuenta?.trim() || !capitan.correo?.trim() || !capitan.telefono?.trim()) {
    throw new Error("Por favor completa todos los datos obligatorios del Capitán.");
  }

  if (!validarCorreoInstitucional(capitan.correo)) {
    throw new Error(`El correo del capitán debe ser institucional (${CONFIG_TORNEO.dominiosValidos.join(" o ")}).`);
  }

  const tipo = equipo.tipoEquipo || "Estudiantes";

  // Control estricto de roles: si es equipo docente, el capitán DEBE estar en la lista autorizada de docentes
  if (tipo === "Docentes" && !esDocenteAutorizado(capitan.correo)) {
    throw new Error(
      `Para inscribir un equipo en la categoría 'Docentes', el correo del Capitán (${capitan.correo}) debe pertenecer a la lista autorizada de docentes de la facultad. Los estudiantes deben inscribirse en la categoría 'Estudiantes'.`
    );
  }

  // Estudiantes: el DNI es obligatorio para el capitán (los docentes están exentos)
  if (tipo === "Estudiantes" && !capitan.dni?.trim()) {
    throw new Error("El Número de Identidad (DNI) del Capitán es obligatorio para la verificación reglamentaria.");
  }

  // 3. El Capitán se sincroniza automáticamente como el Jugador #1
  const filaCapitan = {
    nombre: capitan.nombre.trim(),
    cuenta: capitan.cuenta.trim(),
    correo: capitan.correo.trim().toLowerCase(),
    dni: tipo === "Docentes" ? "Exento (Docente)" : (capitan.dni?.trim() || ""),
    tipoDocumento: capitan.tipoDocumento || (tipo === "Docentes" ? "docente" : "carnet"),
    fotoDocumento: capitan.fotoDocumento || null,
    carrera: capitan.carrera || CONFIG_TORNEO.carreras[0],
    codigoClase: capitan.codigoClase?.trim() || "N/A",
    esCapitan: true
  };

  // Filtrar jugadores adicionales válidos
  const jugadoresExtras = jugadores
    .filter(j => j.nombre?.trim() && j.cuenta?.trim())
    .map(j => ({
      nombre: j.nombre.trim(),
      cuenta: j.cuenta.trim(),
      correo: j.correo?.trim().toLowerCase() || "",
      dni: tipo === "Docentes" ? "Exento (Docente)" : (j.dni?.trim() || ""),
      tipoDocumento: j.tipoDocumento || (tipo === "Docentes" ? "docente" : "carnet"),
      fotoDocumento: j.fotoDocumento || null,
      carrera: j.carrera || CONFIG_TORNEO.carreras[0],
      codigoClase: j.codigoClase?.trim() || "N/A",
      esCapitan: false
    }));

  const plantillaCompleta = [filaCapitan, ...jugadoresExtras];

  if (plantillaCompleta.length < 1) {
    throw new Error("El equipo debe contar al menos con los datos del Capitán.");
  }

  if (plantillaCompleta.length > CONFIG_TORNEO.plantilla.max) {
    throw new Error(`El número máximo permitido es de ${CONFIG_TORNEO.plantilla.max} jugadores por equipo.`);
  }

  const cumpleMinimoInicial = plantillaCompleta.length >= CONFIG_TORNEO.plantilla.min;

  // 4. Validar unicidad interna de cuentas, correos y DNI
  const cuentasInternas = plantillaCompleta.map(j => j.cuenta);
  if (new Set(cuentasInternas).size !== cuentasInternas.length) {
    throw new Error("Hay números de cuenta repetidos dentro de tu propia lista de jugadores.");
  }

  const correosInternos = plantillaCompleta.map(j => j.correo).filter(Boolean);
  if (new Set(correosInternos).size !== correosInternos.length) {
    throw new Error("Hay correos institucionales repetidos dentro de tu propio equipo.");
  }

  if (tipo === "Estudiantes") {
    const dnisInternos = plantillaCompleta.map(j => j.dni).filter(Boolean);
    if (new Set(dnisInternos).size !== dnisInternos.length) {
      throw new Error("Hay Números de Identidad (DNI) repetidos dentro de tu propia lista de jugadores.");
    }
  }

  // 5. Validar unicidad de nombre de equipo
  const nombreLimpio = equipo.nombre.trim().toLowerCase();
  if (resumen.nombresTomados.includes(nombreLimpio)) {
    throw new Error(`El nombre de equipo "${equipo.nombre}" ya fue registrado por otro grupo. Elige otro nombre.`);
  }

  // 6. Validar disponibilidad de color de uniforme (máximo 2 equipos por color)
  if (equipo.color) {
    const usoColor = resumen.conteoColores[equipo.color.toLowerCase()] || 0;
    if (usoColor >= 2) {
      throw new Error(`El color de uniforme "${equipo.color}" ya alcanzó el límite máximo de 2 equipos. Por favor selecciona otro color disponible.`);
    }
  }

  // 7. Determinar asignación de Cupo o Lista de Espera
  let estado = "Pendiente";
  if (tipo === "Estudiantes" && resumen.estudiantesOcupados >= CONFIG_TORNEO.cupos.estudiantes) {
    estado = "Lista de espera";
  } else if (tipo === "Docentes" && resumen.docentesOcupados >= CONFIG_TORNEO.cupos.docentes) {
    estado = "Lista de espera";
  }

  // 8. Comprimir comprobante de pago
  const comprobanteDataUrl = await comprimirComprobante(comprobanteFile);
  const codigoAcceso = Math.floor(10000000 + Math.random() * 90000000).toString();

  // -----------------------------------------------------------
  // MODO CLOUD FIREBASE
  // -----------------------------------------------------------
  if (isFirebaseConfigured && db) {
    // Validar cuentas existentes en Firestore
    for (let i = 0; i < cuentasInternas.length; i += 10) {
      const chunk = cuentasInternas.slice(i, i + 10);
      const q = query(collection(db, "jugadores"), where("cuenta", "in", chunk));
      const snap = await getDocs(q);
      if (!snap.empty) {
        const dup = snap.docs.map(d => d.data().cuenta).join(", ");
        throw new Error(`Cuentas ya inscritas en otro equipo: ${dup}`);
      }
    }

    const batch = writeBatch(db);
    const equipoRef = doc(collection(db, "equipos"));

    batch.set(equipoRef, {
      nombre: equipo.nombre.trim(),
      tipoEquipo: tipo,
      docente: equipo.docente,
      categoria: equipo.categoria,
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

  // Validar cuentas y correos contra la base simulada (excluyendo equipos rechazados)
  const equiposActivosIds = new Set(equiposActuales.filter(e => e.estado !== "Rechazado").map(e => e.id));
  const jugadoresActivos = jugadoresActuales.filter(j => equiposActivosIds.has(j.equipoId));

  const cuentasRegistradas = new Set(jugadoresActivos.map(j => j.cuenta));
  const correosRegistrados = new Set(jugadoresActivos.map(j => j.correo).filter(Boolean));

  const yaRegistrados = cuentasInternas.filter(c => cuentasRegistradas.has(c));
  if (yaRegistrados.length > 0) {
    throw new Error(`Cuentas ya inscritas en otro equipo activo: ${yaRegistrados.join(", ")}`);
  }

  const correosYaRegistrados = correosInternos.filter(c => correosRegistrados.has(c));
  if (correosYaRegistrados.length > 0) {
    throw new Error(`Correos ya inscritos en otro equipo activo: ${correosYaRegistrados.join(", ")}`);
  }

  // Validar unicidad de DNI en todo el torneo para estudiantes
  if (tipo === "Estudiantes") {
    const dnisRegistrados = new Set(
      jugadoresActivos
        .filter(j => j.dni && j.dni !== "Exento (Docente)")
        .map(j => j.dni.trim())
    );
    const dnisNuevos = plantillaCompleta.map(j => j.dni?.trim()).filter(Boolean);
    const yaDnis = dnisNuevos.filter(d => dnisRegistrados.has(d));
    if (yaDnis.length > 0) {
      throw new Error(`Números de Identidad (DNI) ya inscritos en otro equipo activo: ${yaDnis.join(", ")}`);
    }
  }

  const nuevoEquipoId = "eq-" + Date.now();
  const nuevoEquipo = {
    id: nuevoEquipoId,
    nombre: equipo.nombre.trim(),
    tipoEquipo: tipo,
    docente: equipo.docente,
    categoria: equipo.categoria,
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
  if (!eq) throw new Error("No se encontró ningún equipo con el código ingresado. Código semilla de prueba: '12345678'.");

  const jugadores = getLocal(KEY_JUGADORES, SEED_JUGADORES);
  const jugadoresEquipo = jugadores.filter(j => j.equipoId === eq.id);

  return {
    equipo: eq,
    jugadores: jugadoresEquipo,
    modo: "simulado"
  };
}

export async function agregarJugadorConCodigo(codigoAcceso, nuevoJugador) {
  const { equipo, jugadores } = await buscarEquipoPorCodigo(codigoAcceso);

  if (equipo.estado === "Rechazado") {
    throw new Error("Este equipo se encuentra en estado 'Rechazado' y no admite nuevos integrantes.");
  }

  if (jugadores.length >= CONFIG_TORNEO.plantilla.max) {
    throw new Error(`El equipo ya alcanzó el límite máximo reglamentario de ${CONFIG_TORNEO.plantilla.max} jugadores.`);
  }

  if (!nuevoJugador.nombre?.trim() || !nuevoJugador.cuenta?.trim()) {
    throw new Error("El nombre y número de cuenta son obligatorios.");
  }

  if (nuevoJugador.correo?.trim() && !validarCorreoInstitucional(nuevoJugador.correo)) {
    throw new Error(`El correo debe ser institucional (${CONFIG_TORNEO.dominiosValidos.join(" o ")}).`);
  }

  const cuentaLimpia = nuevoJugador.cuenta.trim();
  const correoLimpio = nuevoJugador.correo?.trim().toLowerCase() || "";
  const esDocente = equipo.tipoEquipo === "Docentes";

  if (!esDocente && !nuevoJugador.dni?.trim()) {
    throw new Error("El Número de Identidad (DNI) es obligatorio para la inscripción de estudiantes.");
  }

  const dniLimpio = esDocente ? "Exento (Docente)" : (nuevoJugador.dni?.trim() || "");
  const tipoDoc = nuevoJugador.tipoDocumento || (esDocente ? "docente" : "carnet");
  const fotoDoc = nuevoJugador.fotoDocumento || null;

  // Verificar que no esté en este equipo
  if (jugadores.some(j => j.cuenta === cuentaLimpia)) {
    throw new Error("Este número de cuenta ya está en la plantilla de este equipo.");
  }

  if (!esDocente && dniLimpio && jugadores.some(j => j.dni === dniLimpio)) {
    throw new Error("Este Número de Identidad (DNI) ya está en la plantilla de este equipo.");
  }

  // MODO CLOUD FIREBASE
  if (isFirebaseConfigured && db) {
    const q = query(collection(db, "jugadores"), where("cuenta", "==", cuentaLimpia));
    const snap = await getDocs(q);
    if (!snap.empty) throw new Error("Esta cuenta ya está registrada en otro equipo del torneo.");

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

  if (todosJugadores.some(j => j.cuenta === cuentaLimpia && activosIds.has(j.equipoId))) {
    throw new Error("Esta cuenta ya está registrada en otro equipo activo del torneo.");
  }

  if (!esDocente && dniLimpio && todosJugadores.some(j => j.dni === dniLimpio && activosIds.has(j.equipoId))) {
    throw new Error("Este Número de Identidad (DNI) ya está registrado en otro equipo activo del torneo.");
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

  // MODO CLOUD FIREBASE
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

    return { jugadores, equipos, configuracion: config, modo: "firebase" };
  }

  // MODO LOCAL SIMULADO
  const equipos = getLocal(KEY_EQUIPOS, SEED_EQUIPOS);
  const jugadores = getLocal(KEY_JUGADORES, SEED_JUGADORES);
  const config = getLocal(KEY_CONFIG, SEED_CONFIG);

  return { jugadores, equipos, configuracion: config, modo: "simulado" };
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
}

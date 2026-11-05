// lib/torneoConfig.js
// Configuración centralizada y reglas reglamentarias del torneo MECAFUT

export const CONFIG_TORNEO = {
  titulo: "MECAFUT Q4 2026",
  subtitulo: "Torneo Oficial de Fútbol — Facultad de Ingeniería Mecatrónica",
  periodo: "Q4 2026",

  // Cupos máximos reglamentarios (Fórmula 12 + 2)
  cupos: {
    estudiantes: 12,
    docentes: 2,
    total: 14
  },

  // Límites de plantilla por equipo
  plantilla: {
    min: 10,
    max: 20
  },

  // Dominios de correo institucional aceptados
  dominiosValidos: ["@unitec.edu", "@unitec.edu.hn"],

  // Información bancaria para el pago único del equipo (L. 450.00)
  pago: {
    monto: "L. 450.00",
    banco: "BAC Credomatic",
    tipoCuenta: "Cuenta de Ahorros",
    numeroCuenta: "755022091",
    idBeneficiario: "0512-2008-00608",
    beneficiario: "JOSE ALEJANDRO RODAS GODOY",
    instrucciones: "Realiza la transferencia o depósito bancario único por tu equipo y sube la captura de pantalla o PDF del comprobante."
  },

  // Enlace oficial de coordinación para capitanes
  whatsappCapitanesUrl: "https://chat.whatsapp.com/Hfxdwzc2IPOAhbLA1GqxwN",

  // Reglamento oficial para consulta rápida
  reglamento: [
    "Precio de inscripción: L. 450.00 por equipo (gestión de logística, canchas y contratación de árbitros).",
    "Tope máximo de 14 equipos inscritos asignados por estricto orden de llegada: 12 cupos para estudiantes y 2 para docentes.",
    "Los estudiantes NO pueden jugar en más de un equipo. Todo intento de inscripción duplicada queda bloqueado automáticamente.",
    "El mínimo reglamentario por equipo es de 10 integrantes (incluyendo al Capitán como Jugador #1) y el máximo es de 20.",
    "Solo podrán participar estudiantes activos de la facultad de ingeniería y arquitectura con correo institucional @unitec.edu.",
    "Los equipos que se registren después de agotados los 14 cupos ingresan automáticamente a Lista de Espera por si se libera un cupo.",
    "La confirmación definitiva de la plaza requiere la validación del comprobante de pago por parte del comité organizador."
  ],

  // Catálogo de colores de uniforme con código hexadecimal para previsualización visual
  coloresUniforme: [
    { nombre: "Negro", hex: "#18181b", textoClaro: true },
    { nombre: "Blanco", hex: "#f8fafc", borde: true },
    { nombre: "Azul Rey", hex: "#1d4ed8", textoClaro: true },
    { nombre: "Celeste", hex: "#38bdf8" },
    { nombre: "Rojo", hex: "#dc2626", textoClaro: true },
    { nombre: "Vino", hex: "#831843", textoClaro: true },
    { nombre: "Verde Esmeralda", hex: "#059669", textoClaro: true },
    { nombre: "Verde Neón", hex: "#84cc16" },
    { nombre: "Amarillo", hex: "#facc15" },
    { nombre: "Naranja", hex: "#ea580c", textoClaro: true },
    { nombre: "Rosado", hex: "#f43f5e", textoClaro: true },
    { nombre: "Morado", hex: "#7c3aed", textoClaro: true },
    { nombre: "Turquesa", hex: "#0d9488", textoClaro: true },
    { nombre: "Gris", hex: "#64748b", textoClaro: true },
    { nombre: "Dorado", hex: "#d97706", textoClaro: true }
  ],

  // Carreras universitarias elegibles
  carreras: [
    "Ingeniería Mecatrónica",
    "Ingeniería en Sistemas",
    "Ingeniería Industrial",
    "Ingeniería Biomédica",
    "Ingeniería Civil",
    "Ingeniería en Telecomunicaciones",
    "Ingeniería en Ciencia de Datos",
    "Ingeniería en Energía",
    "Arquitectura",
    "Docente / Facultad"
  ],

  // Lista oficial estática de correos autorizados para el Comité Administrador
  admins: [
    "admin@unitec.edu",
    "diego.paladin@unitec.edu",
    "carlos.rubi@unitec.edu",
    "organizacion.mecafut@unitec.edu"
  ],

  // Lista estática autorizada de Docentes y sus correos institucionales
  docentesAutorizados: [
    { nombre: "Ing. Jared Sauceda", correo: "jared.sauceda@unitec.edu" },
    { nombre: "Ing. Orlando Aguiluz", correo: "orlando.aguiluz@unitec.edu" },
    { nombre: "Ing. Ricardo Maldonado", correo: "ricardo.maldonado@unitec.edu" },
    { nombre: "Ing. José Luis Ordoñez", correo: "jose.ordonez@unitec.edu" },
    { nombre: "Ing. Pedro Vásquez", correo: "pedro.vasquez@unitec.edu" },
    { nombre: "Ing. Hegel López", correo: "hegel.lopez@unitec.edu" },
    { nombre: "Ing. David Gonzales", correo: "david.gonzales@unitec.edu" },
    { nombre: "Ing. Juan Miguel Mejía", correo: "juan.mejia@unitec.edu" },
    { nombre: "Ing. Roque López", correo: "roque.lopez@unitec.edu" },
    { nombre: "Ing. Josué Pérez", correo: "josue.perez@unitec.edu" },
    { nombre: "Ing. Winder Matamoros", correo: "winder.matamoros@unitec.edu" },
    { nombre: "Ing. Elvin Ledezma", correo: "elvin.ledezma@unitec.edu" },
    { nombre: "Ing. André Colindres", correo: "andre.colindres@unitec.edu" },
    { nombre: "Ing. Cristhyan Rivera", correo: "cristhyan.rivera@unitec.edu" },
    { nombre: "Ing. Vielka Barahona", correo: "vielka.barahona@unitec.edu" },
    { nombre: "Equipo de Docentes (General)", correo: "docentes.mecafut@unitec.edu" }
  ],

  // Docentes e ingenieros representantes (nombres para selectores)
  docentes: [
    "Ing. Jared Sauceda",
    "Ing. Orlando Aguiluz",
    "Ing. Ricardo Maldonado",
    "Ing. José Luis Ordoñez",
    "Ing. Pedro Vásquez",
    "Ing. Hegel López",
    "Ing. David Gonzales",
    "Ing. Juan Miguel Mejía",
    "Ing. Roque López",
    "Ing. Josué Pérez",
    "Ing. Winder Matamoros",
    "Ing. Elvin Ledezma",
    "Ing. André Colindres",
    "Ing. Cristhyan Rivera",
    "Ing. Vielka Barahona",
    "Equipo de Docentes (General)"
  ]
};

// Funciones de validación de roles estáticos
export function esAdminAutorizado(correo) {
  if (!correo) return false;
  const c = correo.trim().toLowerCase();
  return CONFIG_TORNEO.admins.some(a => a.toLowerCase() === c);
}

export function esDocenteAutorizado(correo) {
  if (!correo) return false;
  const c = correo.trim().toLowerCase();
  return CONFIG_TORNEO.docentesAutorizados.some(d => d.correo.toLowerCase() === c);
}

export function obtenerDocentePorCorreo(correo) {
  if (!correo) return null;
  const c = correo.trim().toLowerCase();
  return CONFIG_TORNEO.docentesAutorizados.find(d => d.correo.toLowerCase() === c) || null;
}

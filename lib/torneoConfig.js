// lib/torneoConfig.js
// Configuración centralizada y reglas reglamentarias del torneo MECAFUT

export const CONFIG_TORNEO = {
  titulo: "MECAFUT Q4 2026",
  subtitulo: "Torneo Oficial de Fútbol — Facultad de Ingeniería Mecatrónica",
  periodo: "Q4 2026",

  // Cupos máximos reglamentarios por categoría (Sin lista de espera)
  cupos: {
    masculino: 12,
    femenino: 4,
    docentesNota: "Participación libre multiequipo con autorización de capitanes"
  },

  // Límites de plantilla por equipo
  plantilla: {
    min: 8,
    max: 15,
    enCancha: 8 // 7 de campo + 1 portero
  },

  // Fechas oficiales del torneo
  fechas: {
    inicioInscripciones: "2026-11-06T00:00:00-06:00",
    finInscripciones: "2026-11-08T23:59:59-06:00",
    diaEventoDefault: "2026-11-13"
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

  // Lista oficial de correos autorizados para el Comité Administrador de MECAFUT 2026
  // Al registrarse o iniciar sesión con cualquiera de estos correos institucionales,
  // el usuario adquiere automáticamente el rol de Administrador.
  admins: [
    "andresvalle@unitec.edu",
    "carlos.rubi@unitec.edu",
    "juan.mejia@unitec.edu.hn",
    "cristhyan.rivera@unitec.edu.hn",
    "joserodasgodoy@unitec.edu",
    "c.marcelo.al@unitec.edu",
    "cesar_lopez@unitec.edu",
    "adioyuela@unitec.edu",
    "maria_giron@unitec.edu",
    "dereck.beltrand@unitec.edu",
    "jalfaro@unitec.edu",
    ...(process.env.NEXT_PUBLIC_ADMIN_EMAILS
      ? process.env.NEXT_PUBLIC_ADMIN_EMAILS.split(",").map((e) => e.trim().toLowerCase())
      : [])
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

// Reglamento Oficial íntegro y estructurado para MECAFUT 2026
export const REGLAMENTO_OFICIAL_SECCIONES = [
  {
    numero: 1,
    titulo: "1. Inscripción de equipos",
    puntos: [
      "Las inscripciones se realizarán exclusivamente mediante la plataforma web oficial de MECAFUT 2026.",
      "El capitán será responsable de crear el equipo y compartir el código de acceso con sus integrantes.",
      "Cada jugador deberá ingresar a la plataforma y registrar personalmente sus datos para unirse al equipo.",
      "Las inscripciones estarán habilitadas desde el viernes 6 hasta el domingo 8 de noviembre de 2026.",
      "Únicamente podrán participar los primeros 12 equipos creados en la plataforma. No se habilitarán cupos adicionales.",
      "Todos los jugadores deberán completar su registro dentro del plazo establecido.",
      "El registro de un equipo no garantiza su participación si incumple los requisitos del reglamento."
    ],
    destacados: [4] // Índice 4 resaltado en negrita
  },
  {
    numero: 2,
    titulo: "2. Integrantes y participación",
    puntos: [
      "Cada equipo podrá registrar un máximo de 15 jugadores.",
      "Cada equipo jugará con 8 jugadores en cancha: 7 jugadores de campo y 1 portero.",
      "Cada estudiante podrá inscribirse y participar únicamente en un equipo durante todo el torneo.",
      "Queda estrictamente prohibido que un estudiante forme parte de dos o más equipos.",
      "Los equipos que registren, incluyan o permitan participar a jugadores pertenecientes a otro equipo serán descalificados.",
      "Los docentes podrán participar en más de un equipo, siempre que los capitanes correspondientes lo autoricen."
    ],
    destacados: [2, 3]
  },
  {
    numero: 3,
    titulo: "3. Verificación de jugadores",
    puntos: [
      "Se verificará que los participantes sean estudiantes de Ingeniería mediante los registros institucionales correspondientes.",
      "Los datos registrados en la plataforma deberán coincidir con la información institucional del estudiante.",
      "Cada participante deberá proporcionar correctamente su información académica y correo institucional cuando sea requerido.",
      "Los jugadores deberán portar su carné estudiantil u hoja de confirmación para poder acceder a la cancha.",
      "La organización podrá solicitar una verificación adicional de identidad cuando sea necesario.",
      "No se permitirá la participación de jugadores que no cumplan los requisitos de inscripción o verificación."
    ]
  },
  {
    numero: 4,
    titulo: "4. Modalidad y duración de los partidos",
    puntos: [
      "El torneo se desarrollará bajo la modalidad de eliminación directa.",
      "El equipo que gane avanzará a la siguiente ronda y el equipo que pierda quedará eliminado.",
      "Cada partido tendrá una duración de 20 minutos, divididos en dos tiempos de 10 minutos.",
      "En caso de empate al finalizar el tiempo reglamentario, el ganador se determinará mediante una tanda de penales.",
      "La organización establecerá el orden de los encuentros de acuerdo con el sorteo oficial."
    ]
  },
  {
    numero: 5,
    titulo: "5. Puntualidad",
    puntos: [
      "Todos los equipos deberán presentarse puntualmente a sus encuentros.",
      "Si un equipo se retrasa más de 5 minutos respecto a la hora establecida para su partido, será descalificado.",
      "Los capitanes serán responsables de garantizar que sus jugadores estén preparados antes del inicio de cada encuentro."
    ],
    destacados: [1]
  },
  {
    numero: 6,
    titulo: "6. Balones y materiales",
    puntos: [
      "Cada equipo será responsable de recuperar los balones que saque fuera de la cancha.",
      "Si un equipo pierde un balón durante su encuentro, deberá asumir el costo de reposición correspondiente.",
      "Los jugadores deberán cuidar las instalaciones y los materiales utilizados durante el torneo."
    ]
  },
  {
    numero: 7,
    titulo: "7. Orden, disciplina y juego limpio",
    puntos: [
      "Todos los participantes deberán mantener el orden, la limpieza y el respeto dentro y fuera de la cancha.",
      "Se deberá respetar en todo momento a los árbitros, jugadores, organizadores y espectadores.",
      "No se tolerarán conductas antideportivas, agresiones físicas, insultos ni faltas graves de respeto.",
      "Las decisiones arbitrales deberán respetarse durante el desarrollo de los encuentros.",
      "La organización podrá aplicar sanciones o descalificaciones por incumplimiento de las normas de convivencia y juego limpio."
    ]
  },
  {
    numero: 8,
    titulo: "8. Control de asistencia",
    puntos: [
      "Todos los jugadores deberán completar el formulario de asistencia mediante el código QR proporcionado por la organización.",
      "El registro de asistencia será obligatorio para los participantes.",
      "Cada jugador deberá registrar sus propios datos de manera correcta."
    ]
  },
  {
    numero: 9,
    titulo: "9. Descalificaciones",
    puntos: [
      "Registrar o permitir la participación de un jugador que pertenezca a otro equipo.",
      "Presentar jugadores que no cumplan los requisitos institucionales de participación.",
      "Proporcionar información falsa durante el proceso de inscripción o verificación.",
      "Presentarse con más de 5 minutos de retraso a un encuentro.",
      "Incurrir en faltas graves de respeto, agresiones o conductas antideportivas.",
      "Incumplir las disposiciones obligatorias de la organización."
    ]
  },
  {
    numero: 10,
    titulo: "10. Disposiciones generales",
    puntos: [
      "Los capitanes serán responsables de comunicar el reglamento a todos los integrantes de sus equipos.",
      "La organización será responsable de verificar el cumplimiento de los requisitos establecidos.",
      "Cualquier situación no contemplada en este reglamento será evaluada y resuelta por el comité organizador de MECAFUT 2026.",
      "La inscripción y participación en el torneo implican la aceptación de todas las disposiciones establecidas en el presente reglamento."
    ]
  }
];

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

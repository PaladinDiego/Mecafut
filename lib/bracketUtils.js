// lib/bracketUtils.js
// Algoritmos y generadores de llaves del torneo MECAFUT 2026

/**
 * Mezcla aleatoriamente un arreglo (Fisher-Yates) sin mutar el original.
 */
export function mezclarArreglo(arr) {
  const copia = [...arr];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}

/**
 * Genera el cuadro de Eliminación Directa con pases directos (BYEs) simétricos.
 * Para N equipos (ej. 12):
 * - Potencia de 2 más cercana P = 16.
 * - BYEs = 16 - 12 = 4 equipos con pase directo a Cuartos de Final.
 * - 8 equipos juegan la Ronda Preliminar (4 partidos).
 */
export function generarBracketEliminacion(equipos = [], aleatorio = false) {
  const lista = aleatorio ? mezclarArreglo(equipos) : [...equipos];
  const N = lista.length;

  if (N < 2) {
    return { tipo: "eliminacion", rondas: [], campeon: null };
  }

  // Determinar tamaño de la potencia de 2 (8 o 16 generalmente)
  let P = 2;
  while (P < N) {
    P *= 2;
  }

  const byesCount = P - N;
  const numPartidosR1 = P / 2;

  // Repartir equipos y BYEs en la primera ronda
  // Los primeros byesCount equipos recibirán BYE
  const equiposConBye = lista.slice(0, byesCount);
  const equiposQueJueganR1 = lista.slice(byesCount);

  const rondas = [];
  const partidosR1 = [];

  let idxEquipos = 0;
  let idxByes = 0;

  for (let i = 0; i < numPartidosR1; i++) {
    const id = `p-r1-${i + 1}`;
    // Si aún tenemos BYEs para colocar en slots alternados
    if (idxByes < byesCount && (i % 2 === 0 || idxEquipos >= equiposQueJueganR1.length)) {
      const eq = equiposConBye[idxByes++];
      partidosR1.push({
        id,
        nombre: `Preliminar ${i + 1}`,
        equipo1: eq ? { id: eq.id, nombre: eq.nombre, color: eq.color } : null,
        equipo2: { id: "BYE", nombre: "Pase Directo (BYE)", esBye: true },
        goles1: null,
        goles2: null,
        penales1: null,
        penales2: null,
        goleadores: [],
        estado: "Finalizado", // Automáticamente completado por BYE
        ganador: eq ? { id: eq.id, nombre: eq.nombre, color: eq.color } : null
      });
    } else {
      const eq1 = equiposQueJueganR1[idxEquipos++] || null;
      const eq2 = equiposQueJueganR1[idxEquipos++] || null;
      partidosR1.push({
        id,
        nombre: `Preliminar ${i + 1}`,
        equipo1: eq1 ? { id: eq1.id, nombre: eq1.nombre, color: eq1.color } : null,
        equipo2: eq2 ? { id: eq2.id, nombre: eq2.nombre, color: eq2.color } : null,
        goles1: null,
        goles2: null,
        penales1: null,
        penales2: null,
        goleadores: [],
        estado: "Programado",
        ganador: null
      });
    }
  }

  rondas.push({
    nombreRonda: P === 16 ? "Ronda Preliminar" : "Cuartos de Final",
    numeroRonda: 1,
    partidos: partidosR1
  });

  // Generar rondas sucesivas vacías conectadas
  let partidosEnRonda = numPartidosR1 / 2;
  let numR = 2;

  while (partidosEnRonda >= 1) {
    const partidos = [];
    const etiqueta =
      partidosEnRonda === 4
        ? "Cuartos de Final"
        : partidosEnRonda === 2
        ? "Semifinales"
        : "Gran Final";

    for (let i = 0; i < partidosEnRonda; i++) {
      partidos.push({
        id: `p-r${numR}-${i + 1}`,
        nombre: `${etiqueta} ${partidosEnRonda > 1 ? i + 1 : ""}`.trim(),
        equipo1: null,
        equipo2: null,
        goles1: null,
        goles2: null,
        penales1: null,
        penales2: null,
        goleadores: [],
        estado: "Programado",
        ganador: null
      });
    }

    rondas.push({
      nombreRonda: etiqueta,
      numeroRonda: numR,
      partidos
    });

    partidosEnRonda /= 2;
    numR++;
  }

  // Propagar los ganadores automáticos de BYE hacia la ronda 2
  for (let i = 0; i < partidosR1.length; i++) {
    const p = partidosR1[i];
    if (p.ganador && rondas[1]) {
      const targetPartidoIdx = Math.floor(i / 2);
      const slot = i % 2 === 0 ? "equipo1" : "equipo2";
      if (rondas[1].partidos[targetPartidoIdx]) {
        rondas[1].partidos[targetPartidoIdx][slot] = p.ganador;
      }
    }
  }

  return {
    tipo: "eliminacion",
    rondas,
    campeon: null,
    actualizadoEn: new Date().toISOString()
  };
}

/**
 * Genera el formato especial Femenino cuando se inscriben 3 equipos:
 * - Triangular Todos contra Todos (3 partidos)
 * - Tabla clasificatoria de puntos y goles
 * - Gran Final entre el 1° y 2° lugar
 */
export function generarTriangularFemenino(equipos = [], aleatorio = false) {
  const lista = aleatorio ? mezclarArreglo(equipos) : [...equipos];
  const eq1 = lista[0] ? { id: lista[0].id, nombre: lista[0].nombre, color: lista[0].color } : null;
  const eq2 = lista[1] ? { id: lista[1].id, nombre: lista[1].nombre, color: lista[1].color } : null;
  const eq3 = lista[2] ? { id: lista[2].id, nombre: lista[2].nombre, color: lista[2].color } : null;

  const jornadas = [
    {
      id: "fem-j1",
      nombre: "Jornada 1 — Triangular",
      equipo1: eq1,
      equipo2: eq2,
      goles1: null,
      goles2: null,
      penales1: null,
      penales2: null,
      goleadores: [],
      estado: "Programado",
      ganador: null
    },
    {
      id: "fem-j2",
      nombre: "Jornada 2 — Triangular",
      equipo1: eq2,
      equipo2: eq3,
      goles1: null,
      goles2: null,
      penales1: null,
      penales2: null,
      goleadores: [],
      estado: "Programado",
      ganador: null
    },
    {
      id: "fem-j3",
      nombre: "Jornada 3 — Triangular",
      equipo1: eq1,
      equipo2: eq3,
      goles1: null,
      goles2: null,
      penales1: null,
      penales2: null,
      goleadores: [],
      estado: "Programado",
      ganador: null
    }
  ];

  const granFinal = {
    id: "fem-final",
    nombre: "Gran Final Femenina (1° vs 2°)",
    equipo1: null,
    equipo2: null,
    goles1: null,
    goles2: null,
    penales1: null,
    penales2: null,
    goleadores: [],
    estado: "Programado",
    ganador: null
  };

  return {
    tipo: "triangular_final",
    reglamentoEspecial: "Reglamento Especial Femenino (3 Equipos): Triangular Todos contra Todos (3 partidos). Los 2 mejores posicionados en la tabla clasifican a la Gran Final.",
    equiposBase: [eq1, eq2, eq3].filter(Boolean),
    jornadas,
    granFinal,
    tabla: calcularTablaTriangular([eq1, eq2, eq3].filter(Boolean), jornadas),
    campeon: null,
    actualizadoEn: new Date().toISOString()
  };
}

/**
 * Calcula la tabla de posiciones del Triangular Femenino.
 * Sistema de puntos:
 * - Victoria en tiempo regular: 3 pts
 * - Victoria en penales: 2 pts
 * - Derrota en penales: 1 pt
 * - Derrota en tiempo regular: 0 pts
 */
export function calcularTablaTriangular(equiposBase = [], jornadas = []) {
  const stats = {};

  equiposBase.forEach(eq => {
    if (eq && eq.id) {
      stats[eq.id] = {
        id: eq.id,
        nombre: eq.nombre,
        color: eq.color,
        pj: 0,
        pg: 0,
        pp: 0,
        gf: 0,
        gc: 0,
        dg: 0,
        pts: 0
      };
    }
  });

  jornadas.forEach(p => {
    if (p.estado === "Finalizado" && p.equipo1 && p.equipo2 && stats[p.equipo1.id] && stats[p.equipo2.id]) {
      const s1 = stats[p.equipo1.id];
      const s2 = stats[p.equipo2.id];

      s1.pj += 1;
      s2.pj += 1;

      const g1 = parseInt(p.goles1 || 0, 10);
      const g2 = parseInt(p.goles2 || 0, 10);

      s1.gf += g1;
      s1.gc += g2;
      s2.gf += g2;
      s2.gc += g1;

      if (g1 > g2) {
        s1.pg += 1;
        s1.pts += 3;
        s2.pp += 1;
      } else if (g2 > g1) {
        s2.pg += 1;
        s2.pts += 3;
        s1.pp += 1;
      } else {
        // Empate -> Decidido por penales
        const pen1 = parseInt(p.penales1 || 0, 10);
        const pen2 = parseInt(p.penales2 || 0, 10);
        if (pen1 > pen2) {
          s1.pg += 1;
          s1.pts += 2;
          s2.pp += 1;
          s2.pts += 1;
        } else {
          s2.pg += 1;
          s2.pts += 2;
          s1.pp += 1;
          s1.pts += 1;
        }
      }

      s1.dg = s1.gf - s1.gc;
      s2.dg = s2.gf - s2.gc;
    }
  });

  // Ordenar por Puntos desc, DG desc, GF desc
  return Object.values(stats).sort((a, b) => b.pts - a.pts || b.dg - a.dg || b.gf - a.gf);
}

/**
 * Propaga el ganador de un partido a la siguiente ronda del bracket de eliminación directa.
 */
export function propagarGanadorEliminacion(bracket, partidoActualizado) {
  const nuevoBracket = JSON.parse(JSON.stringify(bracket));
  const { rondas } = nuevoBracket;

  let rondaIdx = -1;
  let partidoIdx = -1;

  for (let r = 0; r < rondas.length; r++) {
    const idx = rondas[r].partidos.findIndex(p => p.id === partidoActualizado.id);
    if (idx !== -1) {
      rondaIdx = r;
      partidoIdx = idx;
      break;
    }
  }

  if (rondaIdx === -1) return nuevoBracket;

  // Actualizar el partido en su ronda
  rondas[rondaIdx].partidos[partidoIdx] = { ...partidoActualizado };

  const ganador = partidoActualizado.ganador;

  // Si es la última ronda (Gran Final), definir campeón
  if (rondaIdx === rondas.length - 1) {
    nuevoBracket.campeon = ganador;
    nuevoBracket.actualizadoEn = new Date().toISOString();
    return nuevoBracket;
  }

  // Propagar a la siguiente ronda
  const siguienteRonda = rondas[rondaIdx + 1];
  if (siguienteRonda) {
    const siguientePartidoIdx = Math.floor(partidoIdx / 2);
    const slot = partidoIdx % 2 === 0 ? "equipo1" : "equipo2";
    if (siguienteRonda.partidos[siguientePartidoIdx]) {
      siguienteRonda.partidos[siguientePartidoIdx][slot] = ganador;
    }
  }

  nuevoBracket.actualizadoEn = new Date().toISOString();
  return nuevoBracket;
}

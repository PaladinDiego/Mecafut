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
 * Para 4 equipos (ej. Femenino con cupo completo):
 * - P = 4, BYEs = 0 -> Semifinales (2 partidos) + Gran Final.
 */
export function generarBracketEliminacion(equipos = [], aleatorio = false) {
  const lista = aleatorio ? mezclarArreglo(equipos) : [...equipos];
  const N = lista.length;

  if (N < 2) {
    return { tipo: "eliminacion", rondas: [], campeon: null };
  }

  let P = 2;
  while (P < N) {
    P *= 2;
  }

  const byesCount = P - N;
  const numPartidosR1 = P / 2;

  const equiposConBye = lista.slice(0, byesCount);
  const equiposQueJueganR1 = lista.slice(byesCount);

  const rondas = [];
  const partidosR1 = [];

  const etiquetaR1 =
    numPartidosR1 === 8
      ? "Ronda Preliminar"
      : numPartidosR1 === 4
      ? "Cuartos de Final"
      : numPartidosR1 === 2
      ? "Semifinales"
      : "Gran Final";

  const prefijoPartidoR1 =
    numPartidosR1 === 8
      ? "Preliminar"
      : numPartidosR1 === 4
      ? "Cuartos de Final"
      : numPartidosR1 === 2
      ? "Semifinal"
      : "Gran Final";

  let idxEquipos = 0;
  let idxByes = 0;

  for (let i = 0; i < numPartidosR1; i++) {
    const id = `p-r1-${i + 1}`;
    const nombrePartido = numPartidosR1 > 1 ? `${prefijoPartidoR1} ${i + 1}` : prefijoPartidoR1;

    if (idxByes < byesCount && (i % 2 === 0 || idxEquipos >= equiposQueJueganR1.length)) {
      const eq = equiposConBye[idxByes++];
      partidosR1.push({
        id,
        nombre: nombrePartido,
        equipo1: eq ? { id: eq.id, nombre: eq.nombre, color: eq.color } : null,
        equipo2: { id: "BYE", nombre: "Pase Directo (BYE)", esBye: true },
        goles1: null,
        goles2: null,
        penales1: null,
        penales2: null,
        goleadores: [],
        estado: "Finalizado",
        ganador: eq ? { id: eq.id, nombre: eq.nombre, color: eq.color } : null
      });
    } else {
      const eq1 = equiposQueJueganR1[idxEquipos++] || null;
      const eq2 = equiposQueJueganR1[idxEquipos++] || null;
      partidosR1.push({
        id,
        nombre: nombrePartido,
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
    nombreRonda: etiquetaR1,
    numeroRonda: 1,
    partidos: partidosR1
  });

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

  return Object.values(stats).sort((a, b) => b.pts - a.pts || b.dg - a.dg || b.gf - a.gf);
}

function limpiarResultadoPartido(partido) {
  if (!partido) return;
  partido.goles1 = null;
  partido.goles2 = null;
  partido.penales1 = null;
  partido.penales2 = null;
  partido.goleadores = [];
  partido.estado = "Programado";
  partido.ganador = null;
}

function invalidarDescendientesDesde(rondas, rIdx, pIdx, bracketRef) {
  if (!rondas[rIdx] || !rondas[rIdx].partidos[pIdx]) return;
  const partido = rondas[rIdx].partidos[pIdx];
  const ganadorAnteriorId = partido.ganador?.id || null;

  limpiarResultadoPartido(partido);

  if (rIdx === rondas.length - 1) {
    bracketRef.campeon = null;
    return;
  }

  const sigRonda = rondas[rIdx + 1];
  if (!sigRonda) return;

  const sigIdx = Math.floor(pIdx / 2);
  const sigSlot = pIdx % 2 === 0 ? "equipo1" : "equipo2";
  const sigPartido = sigRonda.partidos[sigIdx];

  if (sigPartido) {
    const teniaEquipoEnSlot = Boolean(sigPartido[sigSlot]?.id);
    sigPartido[sigSlot] = null;
    if (ganadorAnteriorId || teniaEquipoEnSlot || sigPartido.estado === "Finalizado" || sigPartido.goles1 !== null) {
      invalidarDescendientesDesde(rondas, rIdx + 1, sigIdx, bracketRef);
    }
  }
}

/**
 * Verifica si cambiar el ganador de `partidoId` a `nuevoGanadorId` invalidaría
 * algún encuentro posterior que ya tiene marcador o estado Finalizado (F-07).
 */
export function tieneDescendientesConResultado(bracket, partidoId, nuevoGanadorId) {
  if (!bracket) return false;

  if (bracket.tipo === "triangular_final") {
    if (partidoId === "fem-final") return false;
    const gf = bracket.granFinal;
    return Boolean(gf && (gf.estado === "Finalizado" || gf.goles1 !== null || gf.goles2 !== null));
  }

  const rondas = bracket.rondas || [];
  let rIdx = -1;
  let pIdx = -1;
  for (let r = 0; r < rondas.length; r++) {
    const idx = rondas[r].partidos.findIndex(p => p.id === partidoId);
    if (idx !== -1) {
      rIdx = r;
      pIdx = idx;
      break;
    }
  }

  if (rIdx === -1 || rIdx === rondas.length - 1) return false;

  const actualGanadorId = rondas[rIdx].partidos[pIdx]?.ganador?.id || null;
  if (actualGanadorId === (nuevoGanadorId || null)) return false;

  let curR = rIdx + 1;
  let curP = Math.floor(pIdx / 2);
  while (curR < rondas.length) {
    const m = rondas[curR]?.partidos?.[curP];
    if (m && (m.estado === "Finalizado" || m.goles1 !== null || m.goles2 !== null)) {
      return true;
    }
    curP = Math.floor(curP / 2);
    curR++;
  }
  return false;
}

/**
 * Propaga el ganador de un partido a la siguiente ronda del bracket de eliminación directa.
 * Si el ganador cambia respecto al registrado previamente, limpia en cascada los resultados
 * posteriores dependientes y recalcula/limpia `campeon` para impedir llaves incoherentes (F-07).
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

  const ganadorPrevioId = rondas[rondaIdx].partidos[partidoIdx]?.ganador?.id || null;
  const ganadorNuevo = partidoActualizado.ganador || null;
  const ganadorNuevoId = ganadorNuevo?.id || null;

  rondas[rondaIdx].partidos[partidoIdx] = { ...partidoActualizado };

  if (rondaIdx === rondas.length - 1) {
    nuevoBracket.campeon = partidoActualizado.estado === "Finalizado" ? ganadorNuevo : null;
    nuevoBracket.actualizadoEn = new Date().toISOString();
    return nuevoBracket;
  }

  const siguienteRonda = rondas[rondaIdx + 1];
  if (siguienteRonda) {
    const siguientePartidoIdx = Math.floor(partidoIdx / 2);
    const slot = partidoIdx % 2 === 0 ? "equipo1" : "equipo2";
    const siguientePartido = siguienteRonda.partidos[siguientePartidoIdx];

    if (siguientePartido) {
      siguientePartido[slot] = partidoActualizado.estado === "Finalizado" ? ganadorNuevo : null;

      if (ganadorPrevioId !== (partidoActualizado.estado === "Finalizado" ? ganadorNuevoId : null)) {
        invalidarDescendientesDesde(rondas, rondaIdx + 1, siguientePartidoIdx, nuevoBracket);
      }
    }
  }

  nuevoBracket.actualizadoEn = new Date().toISOString();
  return nuevoBracket;
}

/**
 * Actualiza un partido del formato Triangular Femenino, recalcula la tabla de posiciones,
 * clasifica automáticamente al 1° y 2° a la Gran Final al concluir las 3 jornadas,
 * e invalida la Gran Final si una corrección en fase regular cambia a las finalistas (F-07, F-08).
 */
export function actualizarPartidoTriangular(bracket, partidoActualizado) {
  const b = JSON.parse(JSON.stringify(bracket));

  if (partidoActualizado.id === "fem-final") {
    b.granFinal = { ...partidoActualizado };
    b.campeon = partidoActualizado.estado === "Finalizado" ? (partidoActualizado.ganador || null) : null;
    b.actualizadoEn = new Date().toISOString();
    return b;
  }

  b.jornadas = (b.jornadas || []).map(p =>
    p.id === partidoActualizado.id ? { ...partidoActualizado } : p
  );

  b.tabla = calcularTablaTriangular(b.equiposBase || [], b.jornadas);

  const todasFinalizadas = (b.jornadas || []).length > 0 && b.jornadas.every(p => p.estado === "Finalizado");

  if (todasFinalizadas && b.tabla.length >= 2) {
    const primero = { id: b.tabla[0].id, nombre: b.tabla[0].nombre, color: b.tabla[0].color };
    const segundo = { id: b.tabla[1].id, nombre: b.tabla[1].nombre, color: b.tabla[1].color };
    const cambiaronFinalistas =
      b.granFinal?.equipo1?.id !== primero.id || b.granFinal?.equipo2?.id !== segundo.id;

    b.granFinal.equipo1 = primero;
    b.granFinal.equipo2 = segundo;

    if (cambiaronFinalistas) {
      limpiarResultadoPartido(b.granFinal);
      b.campeon = null;
    }
  } else if (b.granFinal) {
    b.granFinal.equipo1 = null;
    b.granFinal.equipo2 = null;
    limpiarResultadoPartido(b.granFinal);
    b.campeon = null;
  }

  b.actualizadoEn = new Date().toISOString();
  return b;
}

/**
 * Genera el formato Femenino cuando se inscriben 2 equipos:
 * - "final_unica": 1 partido único Gran Final.
 * - "ida_vuelta": 2 partidos (Ida y Vuelta). Si empatan en global (goles acumulados),
 *   se define por tanda de penales en el Partido 2 o partido extra.
 */
export function generarSerieDosEquiposFemenino(equipos = [], { formato = "final_unica", aleatorio = false } = {}) {
  const lista = aleatorio ? mezclarArreglo(equipos) : [...equipos];
  const eq1 = lista[0] ? { id: lista[0].id, nombre: lista[0].nombre, color: lista[0].color } : null;
  const eq2 = lista[1] ? { id: lista[1].id, nombre: lista[1].nombre, color: lista[1].color } : null;

  if (formato === "mejor_de_tres") {
    const partidos = [
      {
        id: "fem-s3-1",
        nombre: "Juego 1 — Serie Mejor de 3",
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
        id: "fem-s3-2",
        nombre: "Juego 2 — Serie Mejor de 3",
        equipo1: eq2,
        equipo2: eq1,
        goles1: null,
        goles2: null,
        penales1: null,
        penales2: null,
        goleadores: [],
        estado: "Programado",
        ganador: null
      },
      {
        id: "fem-s3-3",
        nombre: "Juego 3 (Desempate si aplica) — Serie Mejor de 3",
        equipo1: eq1,
        equipo2: eq2,
        goles1: null,
        goles2: null,
        penales1: null,
        penales2: null,
        goleadores: [],
        estado: "Programado",
        ganador: null
      }
    ];

    return {
      tipo: "serie_dos_equipos",
      formato: "mejor_de_tres",
      reglamentoEspecial: "Serie Final Femenina (Mejor de 3). Se corona Campeón el primer equipo en alcanzar 2 victorias.",
      equiposBase: [eq1, eq2].filter(Boolean),
      partidos,
      victoriasA: 0,
      victoriasB: 0,
      campeon: null,
      actualizadoEn: new Date().toISOString()
    };
  }

  if (formato === "ida_vuelta") {
    const partidos = [
      {
        id: "fem-s2-ida",
        nombre: "Partido de Ida — Serie Final",
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
        id: "fem-s2-vuelta",
        nombre: "Partido de Vuelta — Serie Final",
        equipo1: eq2,
        equipo2: eq1,
        goles1: null,
        goles2: null,
        penales1: null,
        penales2: null,
        goleadores: [],
        estado: "Programado",
        ganador: null
      }
    ];

    return {
      tipo: "serie_dos_equipos",
      formato: "ida_vuelta",
      reglamentoEspecial: "Serie Final Femenina (2 Equipos — Ida y Vuelta). Campeón definido por marcador global acumulado. En caso de empate global al término del partido de vuelta, se ejecuta tanda de penales.",
      equiposBase: [eq1, eq2].filter(Boolean),
      partidos,
      globalA: 0,
      globalB: 0,
      campeon: null,
      actualizadoEn: new Date().toISOString()
    };
  }

  // Final única por defecto
  const partidoFinal = {
    id: "fem-final-unica",
    nombre: "Gran Final Femenina (Partido Único)",
    equipo1: eq1,
    equipo2: eq2,
    goles1: null,
    goles2: null,
    penales1: null,
    penales2: null,
    goleadores: [],
    estado: "Programado",
    ganador: null
  };

  return {
    tipo: "serie_dos_equipos",
    formato: "final_unica",
    reglamentoEspecial: "Gran Final Femenina a Partido Único (2 Equipos). El ganador se corona Campeón Oficial.",
    equiposBase: [eq1, eq2].filter(Boolean),
    partidos: [partidoFinal],
    campeon: null,
    actualizadoEn: new Date().toISOString()
  };
}

/**
 * Actualiza un encuentro de la serie de 2 equipos y recalcula global / campeón.
 */
export function actualizarPartidoSerieDos(bracket, partidoActualizado) {
  const b = JSON.parse(JSON.stringify(bracket));
  b.partidos = (b.partidos || []).map((p) =>
    p.id === partidoActualizado.id ? { ...partidoActualizado } : p
  );

  if (b.formato === "final_unica") {
    const f = b.partidos[0];
    b.campeon = f && f.estado === "Finalizado" ? (f.ganador || null) : null;
    b.actualizadoEn = new Date().toISOString();
    return b;
  }

  if (b.formato === "mejor_de_tres") {
    const eqA = b.equiposBase?.[0];
    const eqB = b.equiposBase?.[1];
    let vA = 0;
    let vB = 0;

    (b.partidos || []).forEach((p) => {
      if (p.estado === "Finalizado" && p.ganador) {
        if (p.ganador.id === eqA?.id) vA++;
        if (p.ganador.id === eqB?.id) vB++;
      }
    });

    b.victoriasA = vA;
    b.victoriasB = vB;

    if (vA >= 2) {
      b.campeon = eqA;
    } else if (vB >= 2) {
      b.campeon = eqB;
    } else {
      b.campeon = null;
    }

    b.actualizadoEn = new Date().toISOString();
    return b;
  }

  // Ida y Vuelta
  const pIda = b.partidos.find((p) => p.id === "fem-s2-ida");
  const pVuelta = b.partidos.find((p) => p.id === "fem-s2-vuelta");
  const eqA = b.equiposBase?.[0];
  const eqB = b.equiposBase?.[1];

  let golesA = 0;
  let golesB = 0;

  if (pIda && pIda.goles1 !== null && pIda.goles2 !== null) {
    golesA += parseInt(pIda.goles1 || 0, 10);
    golesB += parseInt(pIda.goles2 || 0, 10);
  }
  if (pVuelta && pVuelta.goles1 !== null && pVuelta.goles2 !== null) {
    golesB += parseInt(pVuelta.goles1 || 0, 10);
    golesA += parseInt(pVuelta.goles2 || 0, 10);
  }

  b.globalA = golesA;
  b.globalB = golesB;

  if (pIda?.estado === "Finalizado" && pVuelta?.estado === "Finalizado") {
    if (golesA > golesB) {
      b.campeon = eqA;
    } else if (golesB > golesA) {
      b.campeon = eqB;
    } else {
      if (pVuelta.ganador) {
        b.campeon = pVuelta.ganador;
      } else if (pVuelta.penales1 !== null && pVuelta.penales2 !== null) {
        b.campeon = pVuelta.penales1 > pVuelta.penales2 ? pVuelta.equipo1 : pVuelta.equipo2;
      } else {
        b.campeon = null;
      }
    }
  } else {
    b.campeon = null;
  }

  b.actualizadoEn = new Date().toISOString();
  return b;
}

/**
 * Valida la coherencia reglamentaria e integridad de un cuadro del torneo.
 */
export function validarBracketCompleto(bracket) {
  if (!bracket || typeof bracket !== "object") {
    return { valido: false, errores: ["El bracket no existe o está vacío."] };
  }

  const errores = [];

  if (bracket.tipo === "serie_dos_equipos") {
    if (!Array.isArray(bracket.partidos) || bracket.partidos.length === 0) {
      errores.push("La serie de 2 equipos no contiene partidos programados.");
    }
  } else if (bracket.tipo === "triangular_final") {
    if (!Array.isArray(bracket.jornadas) || bracket.jornadas.length !== 3) {
      errores.push("El triangular femenino debe tener exactamente 3 jornadas.");
    }
    if (!bracket.granFinal) {
      errores.push("Falta definir el partido de Gran Final del triangular.");
    }
  } else if (bracket.tipo === "eliminacion") {
    if (!Array.isArray(bracket.rondas) || bracket.rondas.length === 0) {
      errores.push("El bracket de eliminación directa no tiene rondas configuradas.");
    }
  } else {
    errores.push(`Tipo de bracket desconocido: ${bracket.tipo}`);
  }

  return {
    valido: errores.length === 0,
    errores
  };
}

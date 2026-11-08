"use client";
import { useState, useEffect } from "react";
import BracketTorneo from "../../components/BracketTorneo";
import { suscribirTorneoEnVivo } from "../../lib/dbService";
import { obtenerSesionActual } from "../../lib/authService";
import { CONFIG_TORNEO, obtenerFechaLocalHonduras } from "../../lib/torneoConfig";

export default function TorneoEnVivo() {
  const [torneo, setTorneo] = useState(null);
  const [categoriaSeleccionada, setCategoriaSeleccionada] = useState("Masculino");
  const [sesion, setSesion] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const syncSesion = () => {
      try {
        setSesion(obtenerSesionActual());
      } catch (e) {
        console.warn("Error leyendo sesión:", e);
      }
    };
    syncSesion();
    window.addEventListener("mecafut_auth_change", syncSesion);

    const unsub = suscribirTorneoEnVivo((data) => {
      setTorneo(data || {});
      setLoading(false);
    });

    return () => {
      window.removeEventListener("mecafut_auth_change", syncSesion);
      if (typeof unsub === "function") unsub();
    };
  }, []);

  // Cálculo defensivo de la Tabla de Goleadores a partir de todos los goles registrados
  const calcularTablaGoleadores = () => {
    if (!torneo?.brackets) return [];

    const conteo = {};

    const procesarPartido = (partido) => {
      if (!partido || !Array.isArray(partido.goleadores)) return;
      partido.goleadores.forEach((g) => {
        if (!g) return;
        const key = g.jugadorId || g.nombreJugador || "anonimo";
        if (!conteo[key]) {
          conteo[key] = {
            jugadorId: g.jugadorId,
            nombre: g.nombreJugador || "Jugador",
            nombreEquipo: g.nombreEquipo || "Equipo",
            goles: 0
          };
        }
        conteo[key].goles += parseInt(g.cantidad || 1, 10);
      });
    };

    // Revisar Masculino
    const bMasc = torneo?.brackets?.Masculino;
    if (Array.isArray(bMasc?.rondas)) {
      bMasc.rondas.forEach((r) => {
        if (Array.isArray(r?.partidos)) {
          r.partidos.forEach(procesarPartido);
        }
      });
    }

    // Revisar Femenino (soporta formato triangular y eliminación directa)
    const bFem = torneo?.brackets?.Femenino;
    if (Array.isArray(bFem?.jornadas)) {
      bFem.jornadas.forEach(procesarPartido);
    }
    if (Array.isArray(bFem?.partidos)) {
      bFem.partidos.forEach(procesarPartido);
    }
    if (Array.isArray(bFem?.rondas)) {
      bFem.rondas.forEach((r) => {
        if (Array.isArray(r?.partidos)) {
          r.partidos.forEach(procesarPartido);
        }
      });
    }
    if (bFem?.granFinal) {
      procesarPartido(bFem.granFinal);
    }

    return Object.values(conteo).sort((a, b) => b.goles - a.goles);
  };

  const tablaGoleadores = calcularTablaGoleadores();
  const criteriosPremios = Array.isArray(torneo?.criteriosPremios) ? torneo.criteriosPremios : [];

  const bracketActual =
    categoriaSeleccionada === "Masculino"
      ? torneo?.brackets?.Masculino
      : torneo?.brackets?.Femenino;

  const esAdmin = sesion?.rol === "admin";
  const hoyStr = obtenerFechaLocalHonduras();
  const esFechaLlegada = torneo?.fechaEvento ? hoyStr >= torneo.fechaEvento : false;
  const esVisibleAlPublico =
    torneo?.visibilidadPublica === "visible" ||
    (torneo?.visibilidadPublica === "auto" && esFechaLlegada);

  const publicarGoleadores = torneo?.publicarGoleadores === true;
  const publicarPremios = torneo?.publicarPremios === true;

  const formatearFechaEvento = (fechaStr) => {
    if (!fechaStr) return "Próximamente";
    try {
      const cleanStr = fechaStr.includes("T") ? fechaStr : `${fechaStr}T12:00:00`;
      const d = new Date(cleanStr);
      return isNaN(d.getTime()) ? fechaStr : d.toLocaleDateString("es-HN", { dateStyle: "long" });
    } catch {
      return fechaStr;
    }
  };

  const formatearHoraActualizado = (fechaStr) => {
    if (!fechaStr) return "En espera";
    try {
      const d = new Date(fechaStr);
      return isNaN(d.getTime()) ? "En espera" : `Actualizado: ${d.toLocaleTimeString("es-HN")}`;
    } catch {
      return "En espera";
    }
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-4" role="status" aria-live="polite">
        <div className="text-center space-y-2">
          <div className="w-8 h-8 border-4 border-blue-900 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-xs text-gray-500 font-semibold">Cargando marcadores y estadísticas en vivo...</p>
        </div>
      </div>
    );
  }

  // Si no está habilitado para el público y no es admin, mostrar pantalla de cuenta regresiva/aviso
  if (!esVisibleAlPublico && !esAdmin) {
    return (
      <div className="page-shell max-w-2xl text-center py-20">
        <div className="surface-card p-8 space-y-4">
          <span className="text-5xl block" aria-hidden="true">⏳</span>
          <p className="page-kicker">MECAFUT · UNITEC</p>
          <h1 className="page-heading">Resultados en vivo del torneo</h1>
          <p className="text-sm text-gray-600 max-w-md mx-auto">
            La tabla de cruces, resultados minuto a minuto y premios individuales se activarán el día oficial del evento deportivo:
          </p>
          <div className="inline-block bg-blue-50 border border-blue-200 px-4 py-2 rounded-xl text-blue-950 font-mono font-bold text-base">
            📅 {formatearFechaEvento(torneo?.fechaEvento)}
          </div>
          <p className="text-xs text-gray-400">
            ¡Prepárate con tu equipo! Los administradores publicarán los goles en directo desde la cancha.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-shell max-w-6xl pb-20 space-y-8">
      {/* Banner Superior */}
      <header className="live-hero text-white p-6 sm:p-8 rounded-3xl shadow-md relative overflow-hidden">
        <div className="relative z-10 space-y-2">
          <span className="live-hero__eyebrow">
            <span className="live-pulse" aria-hidden="true" /> Marcadores oficiales
          </span>
          <p className="page-kicker text-emerald-200">MECAFUT · {CONFIG_TORNEO.periodo}</p>
          <h1 className="text-3xl sm:text-5xl font-black tracking-tight">El torneo, en la cancha</h1>
          <p className="text-sm sm:text-base text-blue-100 max-w-2xl">
            Consulta cruces, marcadores y estadísticas oficiales de cada categoría.
          </p>
        </div>
      </header>

      {/* Selector de Categoría (Varones / Chicas) */}
      <div className="category-switch" role="group" aria-label="Categoría del torneo">
        <button
          type="button"
          aria-pressed={categoriaSeleccionada === "Masculino"}
          onClick={() => setCategoriaSeleccionada("Masculino")}
          className={`px-5 py-2.5 rounded-2xl font-bold text-xs sm:text-sm transition shadow-sm flex items-center gap-2 ${
            categoriaSeleccionada === "Masculino"
              ? "bg-blue-950 text-white ring-2 ring-blue-900"
              : "bg-white text-gray-700 border border-gray-200 hover:bg-gray-50"
          }`}
        >
          <span>⚽</span>
          <span>Categoría Masculina</span>
        </button>

        <button
          type="button"
          aria-pressed={categoriaSeleccionada === "Femenino"}
          onClick={() => setCategoriaSeleccionada("Femenino")}
          className={`px-5 py-2.5 rounded-2xl font-bold text-xs sm:text-sm transition shadow-sm flex items-center gap-2 ${
            categoriaSeleccionada === "Femenino"
              ? "bg-purple-900 text-white ring-2 ring-purple-800"
              : "bg-white text-gray-700 border border-gray-200 hover:bg-gray-50"
          }`}
        >
          <span>⭐</span>
          <span>Categoría Femenina</span>
        </button>
      </div>

      {/* Diagrama de Llaves y Partidos */}
      <section className="surface-card p-4 sm:p-8 space-y-4" aria-labelledby="bracket-heading">
        <div className="flex justify-between items-center border-b pb-3">
          <h2 id="bracket-heading" className="text-lg font-black text-blue-950 flex items-center gap-2">
            <span aria-hidden="true">🏆</span>
            <span>Partidos · {categoriaSeleccionada}</span>
          </h2>
          <span className="text-[11px] text-gray-400 font-mono">
            {formatearHoraActualizado(bracketActual?.actualizadoEn)}
          </span>
        </div>

        <div className="bracket-scroll" tabIndex={0} aria-label="Desplazamiento horizontal del cuadro de partidos">
          <BracketTorneo bracketData={bracketActual} editableAdmin={false} />
        </div>
      </section>

      {/* Estadísticas de Premios y Goleadores Oficiales */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Tabla de Goleadores */}
        <div className="bg-white p-6 rounded-3xl border border-gray-200 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-center mb-4 pb-2 border-b">
              <div className="flex items-center gap-2">
                <h4 className="text-base font-black text-blue-950 flex items-center gap-2">
                  <span>⚽</span> Tabla de Goleadores Oficial
                </h4>
                {!publicarGoleadores && esAdmin && (
                  <span className="text-[10px] bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded-full border border-amber-200">
                    🔒 Oculto al público
                  </span>
                )}
              </div>
              <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full">
                Premio Botín de Oro
              </span>
            </div>

            {!publicarGoleadores && !esAdmin ? (
              <div className="text-center py-10 space-y-2">
                <span className="text-2xl block">⚽</span>
                <p className="text-xs font-bold text-gray-700">Estadísticas de Goleadores</p>
                <p className="text-[11px] text-gray-400 max-w-xs mx-auto">
                  La tabla de goleadores y líderes de goleo será publicada oficialmente por el Comité Organizador al concluir la jornada de encuentros.
                </p>
              </div>
            ) : tablaGoleadores.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-8">
                Aún no se han registrado goles en los partidos.
              </p>
            ) : (
              <div className="space-y-2">
                {tablaGoleadores.map((g, idx) => (
                  <div
                    key={idx}
                    className={`flex justify-between items-center p-2.5 rounded-xl text-xs ${
                      idx === 0 ? "bg-amber-50 border border-amber-200 font-bold" : "bg-gray-50"
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <span className={`w-5 h-5 rounded-full text-[10px] flex items-center justify-center font-mono font-bold ${
                        idx === 0 ? "bg-amber-400 text-amber-950" : "bg-gray-200 text-gray-700"
                      }`}>
                        {idx + 1}
                      </span>
                      <div>
                        <strong className="block text-gray-900">{g.nombre}</strong>
                        <span className="text-[10px] text-gray-400">{g.nombreEquipo}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-base font-mono font-black text-blue-950">{g.goles}</span>
                      <span className="text-[10px] text-gray-500 ml-1">goles</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Criterios Dinámicos de Premiación (Portero, MVP, etc.) */}
        <div className="bg-white p-6 rounded-3xl border border-gray-200 shadow-sm space-y-4">
          <div className="flex justify-between items-center mb-2 pb-2 border-b">
            <div className="flex items-center gap-2">
              <h4 className="text-base font-black text-blue-950 flex items-center gap-2">
                <span>🎖️</span> Premios y Criterios Oficiales
              </h4>
              {!publicarPremios && esAdmin && (
                <span className="text-[10px] bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded-full border border-amber-200">
                  🔒 Oculto al público
                </span>
              )}
            </div>
            <span className="text-[10px] bg-blue-100 text-blue-900 font-bold px-2 py-0.5 rounded-full">
              Votación y Conteo en Vivo
            </span>
          </div>

          {!publicarPremios && !esAdmin ? (
            <div className="text-center py-10 space-y-2">
              <span className="text-2xl block">🏆</span>
              <p className="text-xs font-bold text-gray-700">Premiaciones Especiales</p>
              <p className="text-[11px] text-gray-400 max-w-xs mx-auto">
                Los criterios de premiación (Portero menos goleado, MVP, etc.) y ganadores serán anunciados y publicados por el Comité Organizador al finalizar el torneo.
              </p>
            </div>
          ) : criteriosPremios.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-8">
              No hay criterios de premiación adicionales creados por el administrador.
            </p>
          ) : (
            criteriosPremios.map((crit) => {
              if (!crit) return null;
              const registros = Object.values(crit.registros || {}).sort((a, b) => (b.valor || 0) - (a.valor || 0));
              return (
                <div key={crit.id || crit.nombre} className="p-3.5 bg-gray-50 rounded-2xl border border-gray-200 space-y-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-blue-950">
                    <span className="text-base">{crit.icono || "🏆"}</span>
                    <span>{crit.nombre}</span>
                  </div>

                  {registros.length === 0 ? (
                    <p className="text-[11px] text-gray-400 italic">Sin registros contabilizados aún.</p>
                  ) : (
                    <div className="space-y-1.5 pt-1">
                      {registros.slice(0, 3).map((r, rIdx) => (
                        <div key={r.jugadorId || rIdx} className="flex justify-between items-center text-xs bg-white p-2 rounded-lg border border-gray-100">
                          <span className="font-medium text-gray-800">
                            {rIdx === 0 ? "🥇 " : rIdx === 1 ? "🥈 " : "🥉 "}
                            {r.nombre} ({r.nombreEquipo})
                          </span>
                          <span className="font-mono font-bold text-blue-900">{r.valor} pts</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

"use client";
import { useState, useEffect } from "react";
import BracketTorneo from "../../components/BracketTorneo";
import { suscribirTorneoEnVivo, obtenerDatosAdmin } from "../../lib/dbService";
import { obtenerSesionActual } from "../../lib/authService";

export default function TorneoEnVivo() {
  const [torneo, setTorneo] = useState(null);
  const [categoriaSeleccionada, setCategoriaSeleccionada] = useState("Masculino");
  const [sesion, setSesion] = useState(null);
  const [loading, setLoading] = useState(true);
  const [jugadoresDB, setJugadoresDB] = useState([]);

  useEffect(() => {
    setSesion(obtenerSesionActual());
    cargarJugadores();

    const unsub = suscribirTorneoEnVivo((data) => {
      setTorneo(data);
      setLoading(false);
    });

    return () => {
      if (typeof unsub === "function") unsub();
    };
  }, []);

  const cargarJugadores = async () => {
    try {
      const data = await obtenerDatosAdmin();
      setJugadoresDB(data.jugadores || []);
    } catch (e) {
      console.error("Error cargando jugadores para ranking:", e);
    }
  };

  // Cálculo de la Tabla de Goleadores a partir de todos los goles registrados en los partidos
  const calcularTablaGoleadores = () => {
    if (!torneo?.brackets) return [];

    const conteo = {};

    const procesarPartido = (partido) => {
      if (partido?.goleadores && Array.isArray(partido.goleadores)) {
        partido.goleadores.forEach((g) => {
          const key = g.jugadorId || g.nombreJugador;
          if (!conteo[key]) {
            conteo[key] = {
              jugadorId: g.jugadorId,
              nombre: g.nombreJugador,
              nombreEquipo: g.nombreEquipo || "Equipo",
              goles: 0
            };
          }
          conteo[key].goles += parseInt(g.cantidad || 1, 10);
        });
      }
    };

    // Revisar Masculino
    const bMasc = torneo.brackets.Masculino;
    if (bMasc?.rondas) {
      bMasc.rondas.forEach((r) => r.partidos.forEach(procesarPartido));
    }

    // Revisar Femenino
    const bFem = torneo.brackets.Femenino;
    if (bFem?.jornadas) {
      bFem.jornadas.forEach(procesarPartido);
    }
    if (bFem?.granFinal) {
      procesarPartido(bFem.granFinal);
    }

    return Object.values(conteo).sort((a, b) => b.goles - a.goles);
  };

  const tablaGoleadores = calcularTablaGoleadores();
  const criteriosPremios = torneo?.criteriosPremios || [];

  const bracketActual =
    categoriaSeleccionada === "Masculino"
      ? torneo?.brackets?.Masculino
      : torneo?.brackets?.Femenino;

  const esAdmin = sesion?.rol === "admin";
  const hoyStr = new Date().toISOString().split("T")[0];
  const esFechaLlegada = torneo?.fechaEvento ? hoyStr >= torneo.fechaEvento : false;
  const esVisibleAlPublico =
    torneo?.visibilidadPublica === "visible" ||
    (torneo?.visibilidadPublica === "auto" && esFechaLlegada);

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-4">
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
      <div className="max-w-2xl mx-auto p-6 text-center py-20">
        <div className="bg-white rounded-3xl p-8 border border-gray-200 shadow-sm space-y-4">
          <span className="text-5xl block animate-bounce">⏳</span>
          <h2 className="text-2xl font-black text-blue-950">Resultados en Vivo del Torneo</h2>
          <p className="text-sm text-gray-600 max-w-md mx-auto">
            La tabla de cruces, resultados minuto a minuto y premios individuales se activarán el día oficial del evento deportivo:
          </p>
          <div className="inline-block bg-blue-50 border border-blue-200 px-4 py-2 rounded-xl text-blue-950 font-mono font-bold text-base">
            📅 {torneo?.fechaEvento ? new Date(torneo.fechaEvento + "T12:00:00").toLocaleDateString("es-HN", { dateStyle: "long" }) : "Próximamente"}
          </div>
          <p className="text-xs text-gray-400">
            ¡Prepárate con tu equipo! Los administradores publicarán los goles en directo desde la cancha.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 pb-20 space-y-8">
      {/* Banner Superior */}
      <div className="bg-blue-950 text-white p-6 sm:p-8 rounded-3xl shadow-md text-center relative overflow-hidden">
        <div className="relative z-10 space-y-2">
          <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-black uppercase tracking-widest px-3 py-1 rounded-full inline-block">
            🔴 Transmisión y Marcadores Oficiales
          </span>
          <h1 className="text-3xl sm:text-4xl font-black tracking-tight">MECAFUT 2026 — En Vivo</h1>
          <p className="text-xs sm:text-sm text-blue-200 max-w-lg mx-auto">
            Seguimiento de cruces, goles oficiales y estadísticas en tiempo real para las premiaciones.
          </p>
        </div>
      </div>

      {/* Selector de Categoría (Varones / Chicas) */}
      <div className="flex justify-center gap-3">
        <button
          type="button"
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
      <div className="bg-white p-5 sm:p-8 rounded-3xl border border-gray-200 shadow-sm space-y-4">
        <div className="flex justify-between items-center border-b pb-3">
          <h3 className="text-lg font-black text-blue-950 flex items-center gap-2">
            <span>🏆</span>
            <span>Cuadro del Torneo — {categoriaSeleccionada}</span>
          </h3>
          <span className="text-[11px] text-gray-400 font-mono">
            {bracketActual?.actualizadoEn
              ? `Actualizado: ${new Date(bracketActual.actualizadoEn).toLocaleTimeString("es-HN")}`
              : "En espera"}
          </span>
        </div>

        <BracketTorneo bracketData={bracketActual} editableAdmin={false} />
      </div>

      {/* Estadísticas de Premios y Goleadores Oficiales */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Tabla de Goleadores */}
        <div className="bg-white p-6 rounded-3xl border border-gray-200 shadow-sm">
          <div className="flex justify-between items-center mb-4 pb-2 border-b">
            <h4 className="text-base font-black text-blue-950 flex items-center gap-2">
              <span>⚽</span> Tabla de Goleadores Oficial
            </h4>
            <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full">
              Premio Botín de Oro
            </span>
          </div>

          {tablaGoleadores.length === 0 ? (
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

        {/* Criterios Dinámicos de Premiación (Portero, MVP, etc.) */}
        <div className="bg-white p-6 rounded-3xl border border-gray-200 shadow-sm space-y-4">
          <div className="flex justify-between items-center mb-2 pb-2 border-b">
            <h4 className="text-base font-black text-blue-950 flex items-center gap-2">
              <span>🎖️</span> Premios y Criterios Oficiales
            </h4>
            <span className="text-[10px] bg-blue-100 text-blue-900 font-bold px-2 py-0.5 rounded-full">
              Votación y Conteo en Vivo
            </span>
          </div>

          {criteriosPremios.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-8">
              No hay criterios de premiación adicionales creados por el administrador.
            </p>
          ) : (
            criteriosPremios.map((crit) => {
              const registros = Object.values(crit.registros || {}).sort((a, b) => b.valor - a.valor);
              return (
                <div key={crit.id} className="p-3.5 bg-gray-50 rounded-2xl border border-gray-200 space-y-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-blue-950">
                    <span className="text-base">{crit.icono || "🏆"}</span>
                    <span>{crit.nombre}</span>
                  </div>

                  {registros.length === 0 ? (
                    <p className="text-[11px] text-gray-400 italic">Sin registros contabilizados aún.</p>
                  ) : (
                    <div className="space-y-1.5 pt-1">
                      {registros.slice(0, 3).map((r, rIdx) => (
                        <div key={r.jugadorId} className="flex justify-between items-center text-xs bg-white p-2 rounded-lg border border-gray-100">
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

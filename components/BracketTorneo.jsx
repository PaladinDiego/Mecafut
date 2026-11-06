"use client";

export default function BracketTorneo({ bracketData, editableAdmin = false, onRegistrarGol, onCambiarGanador }) {
  if (!bracketData || (!bracketData.rondas && !bracketData.jornadas && bracketData.tipo !== "triangular_final")) {
    return (
      <div className="bg-white p-8 rounded-2xl border text-center text-gray-400 text-xs sm:text-sm">
        Aún no se han generado los cruces para esta categoría.
      </div>
    );
  }

  // 1. FORMATO ESPECIAL FEMENINO: TRIANGULAR + FINAL
  if (bracketData.tipo === "triangular_final") {
    const { reglamentoEspecial, jornadas, granFinal, tabla, campeon } = bracketData;

    return (
      <div className="space-y-6">
        {/* Banner de Reglamento Especial */}
        <div className="bg-purple-50 border-2 border-purple-200 p-4 rounded-2xl flex items-start gap-3">
          <span className="text-2xl">📋</span>
          <div>
            <h4 className="text-sm font-black text-purple-950 uppercase tracking-wider">
              Reglamento Especial Femenino (3 Equipos)
            </h4>
            <p className="text-xs text-purple-900 mt-0.5 leading-relaxed">
              {reglamentoEspecial || "Triangular Todos contra Todos (3 partidos). Los 2 primeros lugares de la tabla de posiciones avanzan a la Gran Final."}
            </p>
          </div>
        </div>

        {/* Campeón del Torneo Femenino */}
        {campeon && (
          <div className="bg-gradient-to-r from-amber-100 via-yellow-100 to-amber-200 border-2 border-amber-400 p-5 rounded-2xl text-center shadow-md animate-fade-in">
            <span className="text-3xl block">🏆</span>
            <span className="text-xs uppercase font-extrabold text-amber-900 tracking-widest block mt-1">
              ¡Campeonas MECAFUT 2026!
            </span>
            <h3 className="text-2xl font-black text-blue-950">{campeon.nombre}</h3>
          </div>
        )}

        {/* Tabla de Posiciones en Vivo */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 sm:p-5">
          <h4 className="text-sm font-extrabold text-blue-950 mb-3 flex items-center gap-2">
            <span>📊</span> Tabla de Posiciones — Triangular Femenino
          </h4>

          <div className="overflow-x-auto">
            <table className="w-full text-xs sm:text-sm text-left border-collapse">
              <thead>
                <tr className="bg-blue-950 text-white uppercase text-[10px] tracking-wider">
                  <th className="p-2.5">Pos</th>
                  <th className="p-2.5">Equipo</th>
                  <th className="p-2.5 text-center">PJ</th>
                  <th className="p-2.5 text-center">PG</th>
                  <th className="p-2.5 text-center">PP</th>
                  <th className="p-2.5 text-center">GF</th>
                  <th className="p-2.5 text-center">GC</th>
                  <th className="p-2.5 text-center">DG</th>
                  <th className="p-2.5 text-center font-black bg-blue-900">PTS</th>
                  <th className="p-2.5 text-center">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(tabla || []).map((fila, idx) => {
                  if (!fila) return null;
                  return (
                    <tr key={fila.id || idx} className={`hover:bg-gray-50 ${idx < 2 ? "bg-purple-50/40" : ""}`}>
                      <td className="p-2.5 font-bold font-mono text-center">{idx + 1}</td>
                      <td className="p-2.5 font-bold text-gray-900 flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full border" style={{ backgroundColor: fila.color || "#cbd5e1" }} />
                        <span>{fila.nombre}</span>
                      </td>
                      <td className="p-2.5 text-center font-mono">{fila.pj}</td>
                      <td className="p-2.5 text-center font-mono">{fila.pg}</td>
                      <td className="p-2.5 text-center font-mono">{fila.pp}</td>
                      <td className="p-2.5 text-center font-mono">{fila.gf}</td>
                      <td className="p-2.5 text-center font-mono">{fila.gc}</td>
                      <td className="p-2.5 text-center font-mono font-semibold">{fila.dg > 0 ? `+${fila.dg}` : fila.dg}</td>
                      <td className="p-2.5 text-center font-mono font-black text-blue-950 bg-blue-50/80">{fila.pts}</td>
                      <td className="p-2.5 text-center">
                        {idx < 2 ? (
                          <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full">
                            Zona Final
                          </span>
                        ) : (
                          <span className="text-[10px] text-gray-400">Eliminada</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Jornadas del Triangular */}
        <div>
          <h4 className="text-sm font-extrabold text-blue-950 mb-3 flex items-center gap-2">
            <span>⚽</span> Encuentros del Triangular (20 min — 2 tiempos de 10)
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {(jornadas || []).map((partido, i) => (
              <TarjetaPartido
                key={partido?.id || i}
                partido={partido}
                editableAdmin={editableAdmin}
                onRegistrarGol={onRegistrarGol}
                onCambiarGanador={onCambiarGanador}
              />
            ))}
          </div>
        </div>

        {/* Gran Final Femenina */}
        {granFinal && (
          <div className="border-t pt-5">
            <h4 className="text-sm font-black text-purple-950 mb-3 flex items-center gap-2">
              <span>⭐</span> Gran Final Femenina (1° vs 2° de la Tabla)
            </h4>
            <div className="max-w-md mx-auto">
              <TarjetaPartido
                partido={granFinal}
                esFinal={true}
                editableAdmin={editableAdmin}
                onRegistrarGol={onRegistrarGol}
                onCambiarGanador={onCambiarGanador}
              />
            </div>
          </div>
        )}
      </div>
    );
  }

  // 2. FORMATO ELIMINACIÓN DIRECTA (VARONES / CUADRO PRINCIPAL)
  const { rondas, campeon } = bracketData;

  return (
    <div className="space-y-6">
      {/* Campeón del Torneo */}
      {campeon && (
        <div className="bg-gradient-to-r from-amber-100 via-yellow-100 to-amber-200 border-2 border-amber-400 p-5 rounded-2xl text-center shadow-md animate-fade-in">
          <span className="text-3xl block">🏆</span>
          <span className="text-xs uppercase font-extrabold text-amber-900 tracking-widest block mt-1">
            ¡Campeones MECAFUT 2026!
          </span>
          <h3 className="text-2xl font-black text-blue-950">{campeon.nombre}</h3>
        </div>
      )}

      {/* Rondas Horizontales con Scroll */}
      <div className="overflow-x-auto pb-4">
        <div className="flex items-start gap-4 sm:gap-6 min-w-[700px]">
          {(rondas || []).map((ronda, rIdx) => {
            const partidosRonda = ronda?.partidos || [];
            return (
              <div key={rIdx} className="flex-1 min-w-[240px] space-y-3">
                <div className="bg-blue-950 text-white text-center py-2 px-3 rounded-xl shadow-sm">
                  <span className="text-xs font-black uppercase tracking-wider block">
                    {ronda?.nombreRonda || `Ronda ${rIdx + 1}`}
                  </span>
                  <span className="text-[10px] text-blue-200">
                    {partidosRonda.length} {partidosRonda.length === 1 ? "Encuentro" : "Partidos"}
                  </span>
                </div>

                <div className="space-y-3">
                  {partidosRonda.map((partido, pIdx) => (
                    <TarjetaPartido
                      key={partido?.id || pIdx}
                      partido={partido}
                      esFinal={rIdx === (rondas || []).length - 1}
                      editableAdmin={editableAdmin}
                      onRegistrarGol={onRegistrarGol}
                      onCambiarGanador={onCambiarGanador}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function TarjetaPartido({ partido, esFinal = false, editableAdmin, onRegistrarGol, onCambiarGanador }) {
  if (!partido) return null;
  const { equipo1, equipo2, goles1, goles2, penales1, penales2, estado, ganador, goleadores, nombre } = partido;

  const esBye = equipo2?.esBye;
  const enVivo = estado === "En Vivo";
  const finalizado = estado === "Finalizado";

  return (
    <div className={`p-3.5 rounded-2xl border text-xs shadow-sm bg-white transition ${
      enVivo ? "border-red-500 ring-2 ring-red-300 animate-pulse" : esFinal ? "border-amber-400 bg-amber-50/20" : "border-gray-200"
    }`}>
      <div className="flex justify-between items-center mb-2 pb-1.5 border-b border-gray-100 text-[10px]">
        <span className="font-bold text-gray-500 truncate max-w-[130px]">{nombre}</span>
        <span className={`px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
          enVivo
            ? "bg-red-600 text-white animate-bounce"
            : finalizado
            ? "bg-gray-100 text-gray-700"
            : "bg-blue-50 text-blue-800"
        }`}>
          {enVivo ? "🔴 En Vivo" : estado || "Programado"}
        </span>
      </div>

      {/* Fila Equipo 1 */}
      <div className={`flex justify-between items-center py-1.5 px-2 rounded-lg ${
        ganador?.id === equipo1?.id ? "bg-emerald-50 font-black text-emerald-950" : "text-gray-800"
      }`}>
        <div className="flex items-center gap-1.5 truncate max-w-[170px]">
          <span
            className="w-2.5 h-2.5 rounded-full border flex-shrink-0"
            style={{ backgroundColor: equipo1?.color || "#94a3b8" }}
          />
          <span className="truncate">{equipo1?.nombre || "Por definir"}</span>
        </div>
        <div className="flex items-center gap-1 font-mono font-bold">
          {goles1 !== null && goles1 !== undefined ? <span>{goles1}</span> : <span className="text-gray-300">-</span>}
          {penales1 !== null && penales1 !== undefined && <span className="text-[10px] text-gray-400">({penales1})</span>}
        </div>
      </div>

      {/* Fila Equipo 2 */}
      <div className={`flex justify-between items-center py-1.5 px-2 rounded-lg mt-1 ${
        ganador?.id === equipo2?.id ? "bg-emerald-50 font-black text-emerald-950" : "text-gray-800"
      }`}>
        <div className="flex items-center gap-1.5 truncate max-w-[170px]">
          <span
            className="w-2.5 h-2.5 rounded-full border flex-shrink-0"
            style={{ backgroundColor: esBye ? "#e2e8f0" : equipo2?.color || "#94a3b8" }}
          />
          <span className={`truncate ${esBye ? "italic text-gray-400" : ""}`}>
            {equipo2?.nombre || "Por definir"}
          </span>
        </div>
        <div className="flex items-center gap-1 font-mono font-bold">
          {esBye ? (
            <span className="text-[10px] text-emerald-700 font-bold">BYE</span>
          ) : goles2 !== null && goles2 !== undefined ? (
            <span>{goles2}</span>
          ) : (
            <span className="text-gray-300">-</span>
          )}
          {penales2 !== null && penales2 !== undefined && <span className="text-[10px] text-gray-400">({penales2})</span>}
        </div>
      </div>

      {/* Detalle de Goleadores (si existen) */}
      {Array.isArray(goleadores) && goleadores.length > 0 && (
        <div className="mt-2 pt-1.5 border-t border-gray-100 text-[10px] text-gray-500">
          <span className="font-bold block text-blue-950 mb-0.5">⚽ Goles anotados:</span>
          <div className="flex flex-wrap gap-1">
            {goleadores.map((g, idx) => (
              <span key={idx} className="bg-gray-100 px-1.5 py-0.5 rounded text-gray-700">
                {g?.nombreJugador} ({g?.minuto ? `${g.minuto}'` : `x${g?.cantidad || 1}`})
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Controles de Administración Rápida */}
      {editableAdmin && !esBye && (
        <div className="mt-2.5 pt-2 border-t flex flex-wrap gap-1 justify-end">
          <button
            type="button"
            onClick={() => onRegistrarGol?.(partido)}
            className="text-[10px] bg-blue-900 hover:bg-blue-800 text-white font-bold px-2 py-1 rounded transition"
          >
            ⚽ Anotar Gol
          </button>
          <button
            type="button"
            onClick={() => onCambiarGanador?.(partido)}
            className="text-[10px] bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold px-2 py-1 rounded transition"
          >
            ⚙️ Estado / Ganador
          </button>
        </div>
      )}
    </div>
  );
}

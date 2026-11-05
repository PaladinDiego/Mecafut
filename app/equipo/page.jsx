"use client";
import { useState, useEffect } from "react";
import {
  buscarEquipoPorCodigo,
  agregarJugadorConCodigo,
  expulsarJugador,
  validarCorreoInstitucional
} from "../../lib/dbService";
import { CONFIG_TORNEO } from "../../lib/torneoConfig";

export default function VerEquipo() {
  const [codigo, setCodigo] = useState("");
  const [equipo, setEquipo] = useState(null);
  const [jugadores, setJugadores] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Formulario para sumar jugador extra con código
  const [mostrarFormNuevo, setMostrarFormNuevo] = useState(false);
  const [nuevoJugador, setNuevoJugador] = useState({
    nombre: "",
    cuenta: "",
    correo: "",
    dni: "",
    tipoDocumento: "carnet",
    fotoDocumento: null,
    carrera: CONFIG_TORNEO.carreras[0],
    codigoClase: ""
  });
  const [guardandoJugador, setGuardandoJugador] = useState(false);
  const [mensajeJugador, setMensajeJugador] = useState("");

  // Detectar código en URL (?codigo=12345678)
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const codUrl = params.get("codigo");
      if (codUrl) {
        setCodigo(codUrl);
        ejecutarBusqueda(codUrl);
      }
    }
  }, []);

  const ejecutarBusqueda = async (cod) => {
    setLoading(true);
    setError("");
    setEquipo(null);
    setJugadores([]);
    setMensajeJugador("");

    try {
      const res = await buscarEquipoPorCodigo(cod);
      setEquipo(res.equipo);
      setJugadores(res.jugadores);
    } catch (err) {
      setError(err.message || "Error al buscar el equipo.");
    } finally {
      setLoading(false);
    }
  };

  const handleBuscar = (e) => {
    e.preventDefault();
    if (codigo.trim()) {
      ejecutarBusqueda(codigo);
    }
  };

  const handleAgregarJugador = async (e) => {
    e.preventDefault();
    setGuardandoJugador(true);
    setMensajeJugador("");

    try {
      const res = await agregarJugadorConCodigo(codigo, nuevoJugador);
      setEquipo(res.equipo);
      setJugadores(res.jugadores);
      setMensajeJugador("¡Jugador agregado exitosamente a la plantilla!");
      setMostrarFormNuevo(false);
      setNuevoJugador({
        nombre: "",
        cuenta: "",
        correo: "",
        carrera: CONFIG_TORNEO.carreras[0],
        codigoClase: ""
      });
    } catch (err) {
      setMensajeJugador(err.message || "Error al agregar jugador.");
    } finally {
      setGuardandoJugador(false);
    }
  };

  const handleExpulsarJugador = async (jugador) => {
    if (confirm(`¿Expulsar a "${jugador.nombre}" de la plantilla? Se liberará su cupo y su número de cuenta/DNI para que otro equipo o él mismo pueda usarlo.`)) {
      setLoading(true);
      setError("");
      setMensajeJugador("");
      try {
        const res = await expulsarJugador({ codigoAcceso: codigo, jugadorId: jugador.id });
        setEquipo(res.equipo);
        setJugadores(res.jugadores);
        setMensajeJugador(`Se ha expulsado a ${jugador.nombre} de la plantilla correctamente.`);
      } catch (err) {
        setError(err.message || "Error al expulsar integrante.");
      } finally {
        setLoading(false);
      }
    }
  };

  const colorHex = CONFIG_TORNEO.coloresUniforme.find(c => c.nombre.toLowerCase() === (equipo?.color || "").toLowerCase())?.hex || "#2563eb";

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 pb-20">
      {/* Caja de Búsqueda */}
      <div className="bg-white p-6 sm:p-8 rounded-2xl border border-gray-200 shadow-sm text-center max-w-lg mx-auto mb-8">
        <h2 className="text-2xl font-black text-blue-950 mb-1">Consultar mi Equipo</h2>
        <p className="text-gray-500 text-xs sm:text-sm mb-6">
          Ingresa el código numérico de 8 dígitos para consultar la plantilla oficial o añadir compañeros.
        </p>

        <form onSubmit={handleBuscar} className="flex flex-col sm:flex-row gap-2">
          <input
            required
            maxLength={10}
            placeholder="Ej. 12345678"
            className="border border-gray-300 p-3 rounded-xl flex-1 text-center font-mono text-xl tracking-widest focus:ring-2 focus:ring-blue-900 focus:outline-none"
            value={codigo}
            onChange={e => setCodigo(e.target.value)}
          />
          <button
            type="submit"
            disabled={loading}
            className="bg-blue-950 hover:bg-blue-900 text-white px-6 py-3 rounded-xl font-bold text-sm transition disabled:opacity-50"
          >
            {loading ? "Buscando..." : "Buscar Equipo"}
          </button>
        </form>

        <p className="text-[11px] text-gray-400 mt-3">
          Código demo para pruebas: <span className="font-mono font-bold text-blue-900">12345678</span>
        </p>

        {error && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl font-medium">
            {error}
          </div>
        )}
      </div>

      {/* Resultados de la búsqueda */}
      {equipo && (
        <div className="bg-white p-6 sm:p-8 rounded-2xl border border-gray-200 shadow-sm space-y-6">
          {/* Header del Equipo */}
          <div className="flex flex-wrap justify-between items-start border-b pb-5 gap-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-bold px-2.5 py-0.5 rounded bg-blue-100 text-blue-900 uppercase">
                  {equipo.categoria}
                </span>
                <span className="text-xs font-bold px-2.5 py-0.5 rounded bg-gray-100 text-gray-700">
                  {equipo.tipoEquipo || "Estudiantes"}
                </span>
                <span className={`text-xs font-bold px-2.5 py-0.5 rounded ${
                  equipo.estado === "Confirmado"
                    ? "bg-emerald-100 text-emerald-800"
                    : equipo.estado === "Lista de espera"
                    ? "bg-amber-100 text-amber-800"
                    : equipo.estado === "Rechazado"
                    ? "bg-red-100 text-red-800"
                    : "bg-blue-100 text-blue-800"
                }`}>
                  Estado: {equipo.estado || "Pendiente"}
                </span>
              </div>

              <h3 className="text-3xl font-black text-blue-950">{equipo.nombre}</h3>
              <p className="text-xs text-gray-400 mt-0.5">
                Inscrito el: {new Date(equipo.fechaRegistro).toLocaleDateString("es-HN", { dateStyle: "long" })}
              </p>
            </div>

            <div className="flex items-center gap-2 bg-gray-50 p-2.5 rounded-xl border">
              <span className="w-5 h-5 rounded-full border shadow-sm" style={{ backgroundColor: colorHex }} />
              <div className="text-left text-xs">
                <span className="text-gray-400 block text-[10px] uppercase font-bold">Uniforme</span>
                <strong className="text-gray-900">{equipo.color}</strong>
              </div>
            </div>
          </div>

          {/* Ficha Resumen */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 bg-gray-50/70 p-4 rounded-xl border text-xs sm:text-sm">
            <div>
              <span className="text-gray-400 block text-[11px]">Capitán:</span>
              <strong className="text-gray-900">{equipo.capitan?.nombre}</strong>
            </div>
            <div>
              <span className="text-gray-400 block text-[11px]">Teléfono WhatsApp:</span>
              <strong className="text-gray-900">{equipo.capitan?.telefono}</strong>
            </div>
            <div>
              <span className="text-gray-400 block text-[11px]">Docente Asesor:</span>
              <strong className="text-gray-900">{equipo.docente}</strong>
            </div>
            <div>
              <span className="text-gray-400 block text-[11px]">Total Integrantes:</span>
              <strong className="text-blue-900">{jugadores.length} / {CONFIG_TORNEO.plantilla.max}</strong>
            </div>
          </div>

          {/* Acción para agregar jugador si hay cupo */}
          {jugadores.length < CONFIG_TORNEO.plantilla.max && equipo.estado !== "Rechazado" && (
            <div className="bg-blue-50/50 border border-blue-200 rounded-xl p-4">
              <div className="flex flex-wrap justify-between items-center gap-2">
                <div>
                  <h4 className="font-bold text-xs sm:text-sm text-blue-950">¿Necesitas sumar un compañero al equipo?</h4>
                  <p className="text-xs text-gray-500">
                    Aún tienes {CONFIG_TORNEO.plantilla.max - jugadores.length} cupos libres en tu plantilla reglamentaria.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setMostrarFormNuevo(!mostrarFormNuevo)}
                  className="bg-blue-900 hover:bg-blue-800 text-white font-bold text-xs px-3.5 py-2 rounded-lg transition"
                >
                  {mostrarFormNuevo ? "Cancelar" : "+ Agregar Integrante"}
                </button>
              </div>

              {mensajeJugador && (
                <div className="mt-3 p-2.5 rounded-lg bg-white border text-xs font-semibold text-center text-blue-900">
                  {mensajeJugador}
                </div>
              )}

              {mostrarFormNuevo && (
                <form onSubmit={handleAgregarJugador} className="mt-4 pt-4 border-t border-blue-200 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Nombre Completo *</label>
                    <input
                      required
                      placeholder="Nombre y Apellido"
                      className="w-full border border-gray-300 p-2 rounded-lg text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-900"
                      value={nuevoJugador.nombre}
                      onChange={e => setNuevoJugador({ ...nuevoJugador, nombre: e.target.value })}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">N° de Cuenta *</label>
                    <input
                      required
                      placeholder="Ej. 20211009999"
                      className="w-full border border-gray-300 p-2 rounded-lg text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-900 font-mono"
                      value={nuevoJugador.cuenta}
                      onChange={e => setNuevoJugador({ ...nuevoJugador, cuenta: e.target.value })}
                    />
                  </div>

                  {equipo?.tipoEquipo === "Estudiantes" && (
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">
                        N° de Identidad (DNI) *
                      </label>
                      <input
                        required
                        placeholder="Ej. 0801-2003-99999"
                        className="w-full border border-gray-300 p-2 rounded-lg text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-900 font-mono"
                        value={nuevoJugador.dni}
                        onChange={e => setNuevoJugador({ ...nuevoJugador, dni: e.target.value })}
                      />
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Correo Institucional (@unitec.edu) *</label>
                    <input
                      required
                      type="email"
                      placeholder="alumno@unitec.edu"
                      className="w-full border border-gray-300 p-2 rounded-lg text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-900 font-mono"
                      value={nuevoJugador.correo}
                      onChange={e => setNuevoJugador({ ...nuevoJugador, correo: e.target.value })}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Carrera *</label>
                    <select
                      className="w-full border border-gray-300 p-2 rounded-lg text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-900"
                      value={nuevoJugador.carrera}
                      onChange={e => setNuevoJugador({ ...nuevoJugador, carrera: e.target.value })}
                    >
                      {CONFIG_TORNEO.carreras.map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>

                  <div className="sm:col-span-2">
                    <button
                      type="submit"
                      disabled={guardandoJugador}
                      className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 rounded-lg text-xs transition disabled:opacity-50 shadow-sm"
                    >
                      {guardandoJugador ? "Validando e incorporando..." : "Confirmar e Incorporar a la Plantilla"}
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          {/* Estado de la Plantilla (Modo Híbrido) */}
          {jugadores.length < CONFIG_TORNEO.plantilla.min ? (
            <div className="bg-amber-50 border border-amber-300 p-4 rounded-xl text-xs text-amber-900 shadow-sm">
              <div className="flex flex-wrap justify-between items-center gap-1 mb-1.5">
                <strong className="text-sm font-bold flex items-center gap-1.5">
                  <span>⚠️</span> Plantilla en Construcción ({jugadores.length} / {CONFIG_TORNEO.plantilla.min} mínimos)
                </strong>
                <span className="bg-amber-200 text-amber-950 font-bold px-2 py-0.5 rounded text-[10px]">
                  Faltan {CONFIG_TORNEO.plantilla.min - jugadores.length} para completar
                </span>
              </div>
              <p className="text-[11px] text-amber-800">
                Tu cupo y color están reservados, pero el reglamento exige al menos 10 integrantes para jugar. Puedes agregar compañeros manualmente con el botón verde o pasarles el código de equipo para que se unan desde sus teléfonos.
              </p>
              <div className="w-full bg-amber-200/70 h-2 rounded-full overflow-hidden mt-2.5">
                <div
                  className="bg-amber-600 h-full rounded-full transition-all duration-300"
                  style={{ width: `${Math.min(100, (jugadores.length / CONFIG_TORNEO.plantilla.min) * 100)}%` }}
                />
              </div>
            </div>
          ) : (
            <div className="bg-emerald-50 border border-emerald-300 p-4 rounded-xl text-xs text-emerald-950 flex flex-wrap items-center justify-between gap-2 shadow-sm">
              <div>
                <strong className="text-sm font-bold flex items-center gap-1.5">
                  <span>✅</span> Plantilla Reglamentaria Completa ({jugadores.length} / {CONFIG_TORNEO.plantilla.max})
                </strong>
                <p className="text-[11px] text-emerald-800 mt-0.5">
                  Tu equipo cumple con el mínimo de 10 integrantes reglamentarios y está listo para la programación de partidos.
                </p>
              </div>
              <span className="bg-emerald-200 text-emerald-900 font-extrabold px-2.5 py-1 rounded text-xs">
                Apto para Torneo
              </span>
            </div>
          )}

          {/* Tabla Oficial de Jugadores */}
          <div>
            <div className="flex flex-wrap justify-between items-center mb-3 gap-2">
              <h4 className="font-bold text-gray-900 text-sm sm:text-base">
                Plantilla Oficial de Jugadores ({jugadores.length})
              </h4>
              <p className="text-[11px] text-gray-500">
                El Capitán puede expulsar integrantes para liberar cupos o cuentas erróneas.
              </p>
            </div>

            <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
              <table className="w-full text-left text-xs sm:text-sm border-collapse">
                <thead>
                  <tr className="bg-blue-950 text-white uppercase text-[11px] tracking-wider">
                    <th className="p-3">#</th>
                    <th className="p-3">Jugador</th>
                    <th className="p-3">N° Cuenta</th>
                    <th className="p-3">DNI (Identidad)</th>
                    <th className="p-3">Correo</th>
                    <th className="p-3">Carrera</th>
                    <th className="p-3 text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {jugadores.map((j, i) => (
                    <tr key={i} className={`hover:bg-gray-50 ${j.esCapitan ? "bg-blue-50/40 font-semibold" : ""}`}>
                      <td className="p-3 text-gray-400 font-mono text-xs">{i + 1}</td>
                      <td className="p-3 text-gray-900">
                        {j.nombre}
                        {j.esCapitan && (
                          <span className="ml-2 text-[10px] bg-blue-100 text-blue-800 font-bold px-1.5 py-0.5 rounded">
                            Capitán
                          </span>
                        )}
                      </td>
                      <td className="p-3 font-mono text-gray-600">{j.cuenta}</td>
                      <td className="p-3 font-mono text-gray-800 text-xs font-semibold">{j.dni || "N/A"}</td>
                      <td className="p-3 font-mono text-gray-500 text-xs">{j.correo || "N/A"}</td>
                      <td className="p-3 text-gray-700">{j.carrera}</td>
                      <td className="p-3 text-center">
                        {j.esCapitan ? (
                          <span className="text-[11px] text-gray-400 font-semibold italic">Fundador</span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleExpulsarJugador(j)}
                            className="bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 px-2.5 py-1 rounded-lg text-xs font-bold transition inline-flex items-center gap-1 shadow-sm"
                            title="Expulsar jugador y liberar su cuenta"
                          >
                            <span>🗑️</span>
                            <span>Expulsar</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

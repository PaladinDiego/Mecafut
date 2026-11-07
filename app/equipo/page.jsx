"use client";
import { useState, useEffect } from "react";
import {
  buscarEquipoPorCodigo,
  agregarJugadorConCodigo,
  expulsarJugador,
  actualizarDocumentoJugador,
  comprimirDocumento,
  esJugadorHabilitado,
  obtenerResumenPublico
} from "../../lib/dbService";
import { CONFIG_TORNEO, esDocenteAutorizado } from "../../lib/torneoConfig";
import { obtenerSesionActual } from "../../lib/authService";

export default function VerEquipo() {
  const [codigo, setCodigo] = useState("");
  const [equipo, setEquipo] = useState(null);
  const [jugadores, setJugadores] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sesion, setSesion] = useState(null);

  // Formulario para sumar jugador extra con código
  const [mostrarFormNuevo, setMostrarFormNuevo] = useState(false);
  const [nuevoJugador, setNuevoJugador] = useState({
    nombre: "",
    cuenta: "",
    correo: "",
    dni: "",
    tipoDocumento: "carnet",
    fotoDocumento: null,
    fotoDocumentoPreview: null,
    carrera: CONFIG_TORNEO.carreras[0],
    codigoClase: ""
  });
  const [guardandoJugador, setGuardandoJugador] = useState(false);
  const [mensajeJugador, setMensajeJugador] = useState("");

  // Modal para que el Capitán o Admin suba/actualice el carnet de un integrante
  const [modalCarnetJugador, setModalCarnetJugador] = useState(null);
  const [carnetFotoData, setCarnetFotoData] = useState(null);
  const [carnetPreview, setCarnetPreview] = useState(null);
  const [carnetDni, setCarnetDni] = useState("");
  const [carnetTipoDoc, setCarnetTipoDoc] = useState("carnet");
  const [guardandoCarnet, setGuardandoCarnet] = useState(false);

  // Modal visor de imagen
  const [visorModal, setVisorModal] = useState(null);
  const [whatsappCapitanesUrl, setWhatsappCapitanesUrl] = useState(CONFIG_TORNEO.whatsappCapitanesUrl);

  useEffect(() => {
    setSesion(obtenerSesionActual());
    obtenerResumenPublico().then(res => {
      if (res?.whatsappCapitanesUrl) {
        setWhatsappCapitanesUrl(res.whatsappCapitanesUrl);
      }
    }).catch(() => {});

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
        dni: "",
        tipoDocumento: "carnet",
        fotoDocumento: null,
        fotoDocumentoPreview: null,
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

  const abrirModalCarnet = (jugador) => {
    setModalCarnetJugador(jugador);
    setCarnetDni(jugador.dni === "Exento (Docente)" ? "" : (jugador.dni || ""));
    setCarnetTipoDoc(jugador.tipoDocumento || "carnet");
    setCarnetFotoData(jugador.fotoDocumento || null);
    setCarnetPreview(jugador.fotoDocumento || null);
  };

  const handleGuardarCarnetJugador = async (e) => {
    e.preventDefault();
    if (!carnetFotoData) {
      alert("Por favor selecciona la foto del carnet o matrícula.");
      return;
    }
    setGuardandoCarnet(true);
    try {
      await actualizarDocumentoJugador({
        jugadorId: modalCarnetJugador.id,
        dni: carnetDni.trim(),
        tipoDocumento: carnetTipoDoc,
        fotoDocumento: carnetFotoData
      });
      // Refrescar
      ejecutarBusqueda(codigo);
      setModalCarnetJugador(null);
    } catch (err) {
      alert("Error actualizando carnet: " + err.message);
    } finally {
      setGuardandoCarnet(false);
    }
  };

  const colorHex = CONFIG_TORNEO.coloresUniforme.find(c => c.nombre.toLowerCase() === (equipo?.color || "").toLowerCase())?.hex || "#2563eb";
  const esCapitanOAdmin = sesion && (sesion.rol === "admin" || (equipo?.capitan?.correo && sesion.correo?.toLowerCase() === equipo.capitan.correo?.toLowerCase()));
  const jugadoresConCarnet = jugadores.filter(esJugadorHabilitado);

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 pb-20">
      {/* Modal para ver imagen */}
      {visorModal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-5 max-w-lg w-full text-center shadow-2xl">
            <div className="flex justify-between items-center mb-3 border-b pb-2">
              <h4 className="font-bold text-blue-950 text-sm truncate">{visorModal.titulo}</h4>
              <button onClick={() => setVisorModal(null)} className="text-gray-400 hover:text-gray-700 font-bold">✕</button>
            </div>
            {visorModal.url ? (
              <img src={visorModal.url} alt="Doc" className="max-h-[60vh] mx-auto rounded border" />
            ) : (
              <p className="text-xs text-gray-400 py-6">Sin imagen registrada.</p>
            )}
            <button
              onClick={() => setVisorModal(null)}
              className="mt-4 bg-gray-100 hover:bg-gray-200 text-gray-800 text-xs font-bold px-4 py-2 rounded-lg"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}

      {/* Modal para que Capitán/Admin suba el carnet de un integrante (Requisito 5) */}
      {modalCarnetJugador && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border-2 border-blue-900 text-left animate-fade-in">
            <div className="flex justify-between items-center mb-3 border-b pb-2">
              <div>
                <span className="text-[10px] font-bold uppercase text-blue-900 tracking-wider">Gestión del Capitán</span>
                <h4 className="text-base font-black text-blue-950">Subir Carnet de {modalCarnetJugador.nombre}</h4>
              </div>
              <button onClick={() => setModalCarnetJugador(null)} className="text-gray-400 hover:text-gray-700 font-bold">✕</button>
            </div>

            <form onSubmit={handleGuardarCarnetJugador} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">DNI del Jugador *</label>
                <input
                  required
                  placeholder="Ej. 0801-2003-12345"
                  value={carnetDni}
                  onChange={(e) => setCarnetDni(e.target.value)}
                  className="w-full border border-gray-300 p-2.5 rounded-xl text-xs font-mono"
                />
              </div>

              <div className="bg-blue-50/50 p-3 rounded-xl border border-blue-100">
                <label className="block text-xs font-bold text-blue-950 uppercase mb-1">Tipo de Documento</label>
                <div className="flex gap-4 text-xs mb-2">
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input
                      type="radio"
                      name="tipoDocAdminMod"
                      value="carnet"
                      checked={carnetTipoDoc === "carnet"}
                      onChange={() => setCarnetTipoDoc("carnet")}
                    />
                    <span>🪪 Carnet</span>
                  </label>
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input
                      type="radio"
                      name="tipoDocAdminMod"
                      value="hoja_confirmacion"
                      checked={carnetTipoDoc === "hoja_confirmacion"}
                      onChange={() => setCarnetTipoDoc("hoja_confirmacion")}
                    />
                    <span>📄 Matrícula</span>
                  </label>
                </div>

                <input
                  type="file"
                  required
                  accept="image/*,.pdf"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const dataUrl = await comprimirDocumento(file);
                      setCarnetFotoData(dataUrl);
                      setCarnetPreview(dataUrl);
                    }
                  }}
                  className="w-full text-xs text-gray-600 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-[10px] file:bg-blue-950 file:text-white"
                />

                {carnetPreview && (
                  <div className="mt-2 p-1 bg-white rounded border inline-block">
                    <img src={carnetPreview} alt="Preview" className="max-h-20 rounded border" />
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setModalCarnetJugador(null)}
                  className="w-1/3 border border-gray-300 py-2.5 rounded-xl text-xs font-bold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardandoCarnet}
                  className="w-2/3 bg-blue-950 hover:bg-blue-900 text-white font-bold py-2.5 rounded-xl text-xs transition disabled:opacity-50"
                >
                  {guardandoCarnet ? "Guardando..." : "Guardar Carnet"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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

          {/* Banner de Recomendación al Capitán */}
          {esCapitanOAdmin && (
            <div className="p-4 bg-blue-50/80 border border-blue-200 rounded-xl text-xs text-blue-950 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
              <div className="flex items-start gap-2.5">
                <span className="text-xl flex-shrink-0">💡</span>
                <div>
                  <strong>Consejo para el Capitán:</strong> Puedes compartir el código{" "}
                  <span className="font-mono font-bold bg-white px-1.5 py-0.5 rounded border text-blue-900">{codigo}</span> con tus compañeros para que se sumen solos y suban su carnet desde su teléfono, o puedes usar el botón azul de cada fila para subir el carnet tú mismo.
                </div>
              </div>
              <a
                href={whatsappCapitanesUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-3.5 py-2 rounded-lg shadow-sm transition whitespace-nowrap self-start sm:self-auto"
              >
                <span>💬</span> Grupo de Capitanes WhatsApp
              </a>
            </div>
          )}

          {/* Acción para agregar jugador si hay cupo */}
          {jugadores.length < CONFIG_TORNEO.plantilla.max && equipo.estado !== "Rechazado" && (
            <div className="bg-blue-50/50 border border-blue-200 rounded-xl p-4">
              <div className="flex flex-wrap justify-between items-center gap-2">
                <div>
                  <h4 className="font-bold text-xs sm:text-sm text-blue-950">¿Necesitas sumar un compañero al equipo?</h4>
                  <p className="text-xs text-gray-500">
                    Aún tienes {CONFIG_TORNEO.plantilla.max - jugadores.length} cupos libres en tu plantilla reglamentaria (máximo 15).
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

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      N° de Identidad (DNI) *
                    </label>
                    <input
                      placeholder="Ej. 0801-2003-99999"
                      className="w-full border border-gray-300 p-2 rounded-lg text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-900 font-mono"
                      value={nuevoJugador.dni}
                      onChange={e => setNuevoJugador({ ...nuevoJugador, dni: e.target.value })}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Correo Institucional (@unitec.edu)</label>
                    <input
                      type="email"
                      placeholder="alumno@unitec.edu"
                      className="w-full border border-gray-300 p-2 rounded-lg text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-900 font-mono"
                      value={nuevoJugador.correo}
                      onChange={e => setNuevoJugador({ ...nuevoJugador, correo: e.target.value })}
                    />
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

          {/* Estado de la Plantilla (Mínimo 8 reglamentario con carnet) */}
          {jugadoresConCarnet.length < CONFIG_TORNEO.plantilla.min ? (
            <div className="bg-amber-50 border border-amber-300 p-4 rounded-xl text-xs text-amber-900 shadow-sm">
              <div className="flex flex-wrap justify-between items-center gap-1 mb-1.5">
                <strong className="text-sm font-bold flex items-center gap-1.5">
                  <span>⚠️</span> Plantilla en Construcción ({jugadoresConCarnet.length} / {CONFIG_TORNEO.plantilla.min} jugadores con carnet verificados)
                </strong>
                <span className="bg-amber-200 text-amber-950 font-bold px-2 py-0.5 rounded text-[10px]">
                  Faltan {CONFIG_TORNEO.plantilla.min - jugadoresConCarnet.length} para completar
                </span>
              </div>
              <p className="text-[11px] text-amber-800">
                ⚠️ Plantilla en Construcción ({jugadoresConCarnet.length} / 8 jugadores con carnet verificados). Faltan {8 - jugadoresConCarnet.length} para completar el mínimo reglamentario de 8 jugadores para ser elegibles a las llaves del torneo.
              </p>
              <div className="w-full bg-amber-200/70 h-2 rounded-full overflow-hidden mt-2.5">
                <div
                  className="bg-amber-600 h-full rounded-full transition-all duration-300"
                  style={{ width: `${Math.min(100, (jugadoresConCarnet.length / CONFIG_TORNEO.plantilla.min) * 100)}%` }}
                />
              </div>
            </div>
          ) : (
            <div className="bg-emerald-50 border border-emerald-300 p-4 rounded-xl text-xs text-emerald-950 flex flex-wrap items-center justify-between gap-2 shadow-sm">
              <div>
                <strong className="text-sm font-bold flex items-center gap-1.5">
                  <span>✅</span> Plantilla Completa ({jugadoresConCarnet.length} jugadores con carnet verificados — Equipo Apto para Sorteo de Llaves)
                </strong>
                <p className="text-[11px] text-emerald-800 mt-0.5">
                  Cumple con el mínimo reglamentario de 8 jugadores con carnet verificado y el equipo es elegible para el sorteo de llaves.
                </p>
              </div>
              <span className="bg-emerald-200 text-emerald-900 font-extrabold px-2.5 py-1 rounded text-xs">
                Apto para Sorteo de Llaves
              </span>
            </div>
          )}

          {/* Tabla Oficial de Jugadores con gestión de carnets */}
          <div>
            <div className="flex flex-wrap justify-between items-center mb-3 gap-2">
              <h4 className="font-bold text-gray-900 text-sm sm:text-base">
                Plantilla Oficial de Jugadores ({jugadores.length})
              </h4>
              <p className="text-[11px] text-gray-500">
                Verificación de Carnet estudiantil obligatoria.
              </p>
            </div>

            <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
              <table className="w-full text-left text-xs sm:text-sm border-collapse">
                <thead>
                  <tr className="bg-blue-950 text-white uppercase text-[11px] tracking-wider">
                    <th className="p-3">#</th>
                    <th className="p-3">Jugador</th>
                    <th className="p-3">N° Cuenta</th>
                    <th className="p-3">DNI</th>
                    <th className="p-3">Carnet / Doc</th>
                    <th className="p-3 text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {jugadores.map((j, i) => {
                    const habilitado = esJugadorHabilitado(j);
                    const tieneCarnet = Boolean(j.fotoDocumento || j.foto_documento);
                    const esDocente = esDocenteAutorizado(j.correo);

                    return (
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
                        <td className="p-3 font-mono text-gray-800 text-xs font-semibold">{j.dni || "Pendiente"}</td>
                        <td className="p-3">
                          <div className="flex items-center gap-1.5">
                            {tieneCarnet ? (
                              <button
                                type="button"
                                onClick={() => setVisorModal({
                                  titulo: `Carnet de ${j.nombre} (${j.cuenta})`,
                                  url: j.fotoDocumento || j.foto_documento
                                })}
                                className="bg-emerald-50 text-emerald-800 border border-emerald-300 hover:bg-emerald-100 text-[10px] font-bold px-2 py-0.5 rounded flex items-center gap-1 shadow-sm"
                              >
                                <span>🪪</span>
                                <span>Ver Carnet</span>
                              </button>
                            ) : esDocente ? (
                              <span className="text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded font-semibold">
                                👨‍🏫 Docente Exento
                              </span>
                            ) : (
                              <span className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded font-semibold">
                                ⚠️ Pendiente (Sin carnet - no suma al cupo)
                              </span>
                            )}

                            {/* Botón para que Capitán o Admin suba el carnet si falta o desea cambiarlo */}
                            {esCapitanOAdmin && !esDocente && (
                              <button
                                type="button"
                                onClick={() => abrirModalCarnet(j)}
                                className="text-[10px] text-blue-700 hover:text-blue-900 hover:underline font-bold ml-1"
                                title="Subir o actualizar foto del carnet"
                              >
                                {tieneCarnet ? "Cambiar" : "+ Subir"}
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="p-3 text-center">
                          {j.esCapitan ? (
                            <span className="text-[11px] text-gray-400 font-semibold italic">Fundador</span>
                          ) : esCapitanOAdmin ? (
                            <button
                              type="button"
                              onClick={() => handleExpulsarJugador(j)}
                              className="bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 px-2 py-1 rounded-lg text-xs font-bold transition inline-flex items-center gap-1 shadow-sm"
                              title="Expulsar jugador y liberar su cuenta"
                            >
                              <span>🗑️</span>
                              <span>Expulsar</span>
                            </button>
                          ) : (
                            <span className="text-[10px] text-gray-400">Miembro</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

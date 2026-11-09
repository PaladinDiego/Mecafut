"use client";
import { useState, useEffect } from "react";
import {
  buscarEquipoPorCodigo,
  agregarJugadorConCodigo,
  expulsarJugador,
  editarJugadorEquipo,
  actualizarDocumentoJugador,
  comprimirDocumento,
  esJugadorHabilitado,
  obtenerEstadoCarnet,
  obtenerResumenPublico
} from "../../lib/dbService";
import { CONFIG_TORNEO, esDocenteAutorizado } from "../../lib/torneoConfig";
import { obtenerSesionActual } from "../../lib/authService";
import { notifyUser } from "../../lib/uiFeedback";
import Link from "next/link";

export default function VerEquipo() {
  const [codigo, setCodigo] = useState("");
  const [equipo, setEquipo] = useState(null);
  const [jugadores, setJugadores] = useState([]);
  const [permisos, setPermisos] = useState({ esCapitan: false, esAdmin: false, esCapitanOAdmin: false });
  const [permisoServidor, setPermisoServidor] = useState(false);
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
    nombreClase: "",
    codigoClase: ""
  });
  const [guardandoJugador, setGuardandoJugador] = useState(false);
  const [cargandoDocumento, setCargandoDocumento] = useState(false);
  const [mensajeJugador, setMensajeJugador] = useState("");

  // Modal para editar jugador (Capitán o Admin)
  const [modalEditarJugador, setModalEditarJugador] = useState(null);
  const [datosEdicion, setDatosEdicion] = useState({
    nombre: "",
    cuenta: "",
    dni: "",
    carrera: CONFIG_TORNEO.carreras[0],
    telefono: "",
    nombreClase: "",
    codigoClase: ""
  });
  const [guardandoEdicion, setGuardandoEdicion] = useState(false);

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
  const [maxJugadores, setMaxJugadores] = useState(CONFIG_TORNEO.plantilla.max);

  useEffect(() => {
    const recuperarCodigoCapitan = (correoUsuario) => {
      if (!correoUsuario || typeof window === "undefined") return null;
      try {
        const correo = correoUsuario.trim().toLowerCase();
        let cod = localStorage.getItem(`mecafut_codigo_capitan:${correo}`);
        if (!cod) {
          const raw = localStorage.getItem("mecafut_equipos");
          if (raw) {
            const equipos = JSON.parse(raw);
            const eq = Array.isArray(equipos)
              ? equipos.find((e) => !e.eliminado && e.capitan?.correo?.trim().toLowerCase() === correo)
              : null;
            if (eq?.codigoAcceso) {
              cod = eq.codigoAcceso;
              localStorage.setItem(`mecafut_codigo_capitan:${correo}`, cod);
            }
          }
        }
        return cod || null;
      } catch (_) {
        return null;
      }
    };

    const syncSesion = () => {
      const s = obtenerSesionActual();
      setSesion(s);
      if (s?.correo) {
        const codCap = recuperarCodigoCapitan(s.correo);
        if (codCap) {
          setCodigo((prev) => (prev ? prev : codCap));
        }
      }
    };

    syncSesion();
    window.addEventListener("mecafut_auth_change", syncSesion);

    obtenerResumenPublico().then(res => {
      if (res?.whatsappCapitanesUrl) {
        setWhatsappCapitanesUrl(res.whatsappCapitanesUrl);
      }
      if (res?.maxJugadoresPorEquipo) {
        setMaxJugadores(res.maxJugadoresPorEquipo);
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

    return () => window.removeEventListener("mecafut_auth_change", syncSesion);
  }, []);

  const ejecutarBusqueda = async (cod) => {
    setLoading(true);
    setError("");
    setEquipo(null);
    setJugadores([]);
    setPermisoServidor(false);
    setMensajeJugador("");

    try {
      const res = await buscarEquipoPorCodigo(cod);
      setEquipo(res.equipo);
      setJugadores(res.jugadores);
      setPermisos(res.permisos || {});
      setPermisoServidor(Boolean(res.permisos?.esCapitanOAdmin));
      if (res.permisos?.esCapitan) {
        try {
          const correo = obtenerSesionActual()?.correo?.trim().toLowerCase();
          if (correo) localStorage.setItem(`mecafut_codigo_capitan:${correo}`, cod.trim());
        } catch (_) { /* La consulta sigue funcionando sin almacenamiento. */ }
      }
      if (res.equipo?.whatsappCapitanesUrl) {
        setWhatsappCapitanesUrl(res.equipo.whatsappCapitanesUrl);
      }
    } catch (err) {
      setError(err.message || "Error al buscar el equipo.");
    } finally {
      setLoading(false);
    }
  };

  const abrirModalEditar = (jugador) => {
    setModalEditarJugador(jugador);
    setDatosEdicion({
      nombre: jugador.nombre || "",
      cuenta: jugador.cuenta || "",
      dni: jugador.dni === "Exento (Docente)" ? "" : (jugador.dni || ""),
      carrera: jugador.carrera || CONFIG_TORNEO.carreras[0],
      telefono: jugador.telefono || "",
      nombreClase: jugador.nombreClase || jugador.nombre_clase || "",
      codigoClase: jugador.codigoClase || jugador.codigo_clase || ""
    });
  };

  const handleGuardarEdicion = async (e) => {
    e.preventDefault();
    setGuardandoEdicion(true);
    try {
      await editarJugadorEquipo({
        codigoAcceso: codigo,
        jugadorId: modalEditarJugador.id,
        datos: datosEdicion
      });
      ejecutarBusqueda(codigo);
      setModalEditarJugador(null);
      setMensajeJugador("Datos del integrante actualizados con éxito.");
    } catch (err) {
      notifyUser("Error actualizando integrante: " + err.message);
    } finally {
      setGuardandoEdicion(false);
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
      if (res?.equipo && res?.jugadores) {
        setEquipo(res.equipo);
        setJugadores(res.jugadores);
      } else {
        const fullData = await buscarEquipoPorCodigo(codigo);
        setEquipo(fullData.equipo);
        setJugadores(fullData.jugadores);
      }
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
        nombreClase: "",
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
        if (res?.equipo && res?.jugadores) {
          setEquipo(res.equipo);
          setJugadores(res.jugadores);
        } else {
          const fullData = await buscarEquipoPorCodigo(codigo);
          setEquipo(fullData.equipo);
          setJugadores(fullData.jugadores);
        }
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
      notifyUser("Por favor selecciona la foto del carnet o matrícula.");
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
      notifyUser("Error actualizando carnet: " + err.message);
    } finally {
      setGuardandoCarnet(false);
    }
  };

  const colorHex = CONFIG_TORNEO.coloresUniforme.find(c => c.nombre.toLowerCase() === (equipo?.color || "").toLowerCase())?.hex || "#2563eb";
  const esCapitanOAdmin = Boolean(
    permisoServidor ||
    (sesion && (sesion.rol === "admin" || (equipo?.capitan?.correo && sesion.correo?.toLowerCase() === equipo.capitan.correo?.toLowerCase())))
  );
  const jugadoresConCarnet = jugadores.filter(esJugadorHabilitado);
  const jugadoresEnRevision = jugadores.filter(j => obtenerEstadoCarnet(j) === "en_revision");

  return (
    <div className="page-shell max-w-4xl pb-20">
      {/* Modal para ver imagen */}
      {visorModal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-5 max-w-lg w-full text-center shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="team-image-dialog-title">
            <div className="flex justify-between items-center mb-3 border-b pb-2">
              <h2 id="team-image-dialog-title" className="font-bold text-blue-950 text-sm truncate">{visorModal.titulo}</h2>
              <button type="button" onClick={() => setVisorModal(null)} aria-label="Cerrar vista previa" className="text-gray-400 hover:text-gray-700 font-bold">✕</button>
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
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border-2 border-blue-900 text-left animate-fade-in" role="dialog" aria-modal="true" aria-labelledby="upload-document-title">
            <div className="flex justify-between items-center mb-3 border-b pb-2">
              <div>
                <span className="text-[10px] font-bold uppercase text-blue-900 tracking-wider">Gestión del Capitán</span>
                <h2 id="upload-document-title" className="text-base font-black text-blue-950">Subir Carnet de {modalCarnetJugador.nombre}</h2>
              </div>
              <button type="button" onClick={() => setModalCarnetJugador(null)} aria-label="Cerrar carga de carnet" className="text-gray-400 hover:text-gray-700 font-bold">✕</button>
            </div>

            <form onSubmit={handleGuardarCarnetJugador} className="space-y-4">
              <div>
                <label htmlFor="member-document-number" className="block text-xs font-bold text-gray-700 mb-1">DNI del Jugador *</label>
                <input
                  id="member-document-number"
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

                <label htmlFor="member-document-file" className="sr-only">Foto del carnet o matrícula</label>
                <input
                  id="member-document-file"
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

      {/* Modal para Editar Datos del Integrante (Capitán o Admin) */}
      {modalEditarJugador && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border-2 border-blue-900 text-left animate-fade-in" role="dialog" aria-modal="true" aria-labelledby="edit-player-title">
            <div className="flex justify-between items-center mb-3 border-b pb-2">
              <div>
                <span className="text-[10px] font-bold uppercase text-blue-900 tracking-wider">Edición de Integrante</span>
                <h2 id="edit-player-title" className="text-base font-black text-blue-950">Editar {modalEditarJugador.nombre}</h2>
              </div>
              <button type="button" onClick={() => setModalEditarJugador(null)} aria-label="Cerrar edición del jugador" className="text-gray-400 hover:text-gray-700 font-bold">✕</button>
            </div>

            <form onSubmit={handleGuardarEdicion} className="space-y-3">
              <div>
                <label htmlFor="edit-member-name" className="block text-xs font-bold text-gray-700 mb-1">Nombre Completo *</label>
                <input
                  id="edit-member-name"
                  required
                  value={datosEdicion.nombre}
                  onChange={(e) => setDatosEdicion({ ...datosEdicion, nombre: e.target.value })}
                  className="w-full border border-gray-300 p-2 rounded-xl text-xs"
                />
              </div>

              <div>
                <label htmlFor="edit-member-account" className="block text-xs font-bold text-gray-700 mb-1">N° Cuenta *</label>
                <input
                  id="edit-member-account"
                  required
                  value={datosEdicion.cuenta}
                  onChange={(e) => setDatosEdicion({ ...datosEdicion, cuenta: e.target.value })}
                  className="w-full border border-gray-300 p-2 rounded-xl text-xs font-mono"
                />
              </div>

              <div>
                <label htmlFor="edit-member-dni" className="block text-xs font-bold text-gray-700 mb-1">DNI *</label>
                <input
                  id="edit-member-dni"
                  required
                  value={datosEdicion.dni}
                  onChange={(e) => setDatosEdicion({ ...datosEdicion, dni: e.target.value })}
                  className="w-full border border-gray-300 p-2 rounded-xl text-xs font-mono"
                />
              </div>

              <div>
                <label htmlFor="edit-member-class-name" className="block text-xs font-bold text-gray-700 mb-1">Nombre de la Clase *</label>
                <input
                  id="edit-member-class-name"
                  required
                  value={datosEdicion.nombreClase}
                  onChange={(e) => setDatosEdicion({ ...datosEdicion, nombreClase: e.target.value })}
                  className="w-full border border-gray-300 p-2 rounded-xl text-xs"
                />
              </div>

              <div>
                <label htmlFor="edit-member-class-code" className="block text-xs font-bold text-gray-700 mb-1">Código de la Clase *</label>
                <input
                  id="edit-member-class-code"
                  required
                  value={datosEdicion.codigoClase}
                  onChange={(e) => setDatosEdicion({ ...datosEdicion, codigoClase: e.target.value.toUpperCase() })}
                  className="w-full border border-gray-300 p-2 rounded-xl text-xs uppercase font-mono"
                />
              </div>

              <div>
                <label htmlFor="edit-member-career" className="block text-xs font-bold text-gray-700 mb-1">Carrera *</label>
                <select
                  id="edit-member-career"
                  value={datosEdicion.carrera}
                  onChange={(e) => setDatosEdicion({ ...datosEdicion, carrera: e.target.value })}
                  className="w-full border border-gray-300 p-2 rounded-xl text-xs bg-white"
                >
                  {CONFIG_TORNEO.carreras.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalEditarJugador(null)}
                  className="w-1/3 border border-gray-300 py-2.5 rounded-xl text-xs font-bold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardandoEdicion}
                  className="w-2/3 bg-blue-950 hover:bg-blue-900 text-white font-bold py-2.5 rounded-xl text-xs transition disabled:opacity-50"
                >
                  {guardandoEdicion ? "Guardando..." : "Guardar Cambios"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="page-intro">
        <p className="page-kicker">Portal del equipo</p>
        <h1 className="page-heading">Consulta y gestiona tu plantilla</h1>
        <p className="page-description">Revisa el estado de inscripción, los documentos y las personas registradas con el código de acceso.</p>
      </div>

      {/* Caja de Búsqueda */}
      <div className="surface-card p-5 sm:p-8 text-center max-w-lg mx-auto mb-8">
        <h2 className="text-xl font-black text-blue-950 mb-1">Buscar equipo</h2>
        <p className="text-gray-500 text-xs sm:text-sm mb-5">
          El código de acceso tiene 8 dígitos y lo comparte la persona capitana.
        </p>

        <form onSubmit={handleBuscar} className="flex flex-col sm:flex-row gap-2">
          <label htmlFor="team-access-code" className="sr-only">Código de acceso del equipo</label>
          <input
            id="team-access-code"
            required
            maxLength={10}
            placeholder="Código de 8 dígitos"
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

        {error && (
          <div className="mt-4 state-message state-message--error text-xs font-medium" role="alert">
            {error}
          </div>
        )}
      </div>

      {/* Resultados de la búsqueda */}
      {equipo && (
        <div className="surface-card p-5 sm:p-8 space-y-6">
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

          <section className="status-overview" aria-label="Estado y documentos del equipo">
            <div className="status-overview__item">
              <span className="status-overview__label">Estado de inscripción</span>
              <strong className={`status-pill status-pill--${equipo.estado === "Confirmado" ? "success" : equipo.estado === "Rechazado" ? "error" : "pending"}`}>
                {equipo.estado || "Pendiente"}
              </strong>
            </div>
            <div className="status-overview__item">
              <span className="status-overview__label">Integrantes en padrón</span>
              <strong className="status-overview__value">{jugadores.length}</strong>
            </div>
            <div className="status-overview__item">
              <span className="status-overview__label">Carnets habilitados</span>
              <strong className="status-overview__value">{jugadoresConCarnet.length}</strong>
            </div>
            <div className="status-overview__item">
              <span className="status-overview__label">En revisión</span>
              <strong className="status-overview__value">{jugadoresEnRevision.length}</strong>
            </div>
          </section>

          {/* Ficha Resumen */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 bg-gray-50/70 p-4 rounded-xl border text-xs sm:text-sm">
            <div>
              <span className="text-gray-400 block text-[11px]">Capitán:</span>
              <strong className="text-gray-900">{equipo.capitan?.nombre}</strong>
            </div>
            <div>
              <span className="text-gray-400 block text-[11px]">Teléfono WhatsApp:</span>
              <strong className="text-gray-900">{equipo.capitan?.telefono || "Privado"}</strong>
            </div>
            <div>
              <span className="text-gray-400 block text-[11px]">Docente Asesor:</span>
              <strong className="text-gray-900">{equipo.docente}</strong>
            </div>
            <div>
              <span className="text-gray-400 block text-[11px]">Total Integrantes:</span>
              <strong className="text-blue-900">{jugadores.length} / {maxJugadores}</strong>
            </div>
            {Array.isArray(equipo.clasesRepresentadas) && equipo.clasesRepresentadas.length > 0 && (
              <div className="col-span-2 sm:col-span-4 border-t pt-2 mt-1">
                <span className="text-gray-400 block text-[11px] mb-1">Clases Representadas:</span>
                <div className="flex flex-wrap gap-2">
                  {equipo.clasesRepresentadas.map((c, idx) => (
                    <span key={idx} className="bg-blue-50 text-blue-900 border border-blue-200 px-2 py-0.5 rounded text-xs font-semibold">
                      📚 {c.codigo} — {c.nombre}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Banner de Recomendación al Capitán */}
          {esCapitanOAdmin && (
            <div className="p-4 bg-blue-50/80 border border-blue-200 rounded-xl text-xs text-blue-950 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
              <div className="flex items-start gap-2.5">
                <span className="text-xl flex-shrink-0">💡</span>
                <div>
                  <strong>Gestión de Equipo:</strong> Puedes compartir el código{" "}
                  <span className="font-mono font-bold bg-white px-1.5 py-0.5 rounded border text-blue-900">{codigo}</span> con tus compañeros de clase para que se sumen solos y suban su carnet.
                </div>
              </div>
              {permisos?.esCapitan && whatsappCapitanesUrl && (
                <a
                  href={whatsappCapitanesUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-3.5 py-2 rounded-lg shadow-sm transition whitespace-nowrap self-start sm:self-auto"
                >
                  <span>💬</span> Grupo de Capitanes WhatsApp
                </a>
              )}
            </div>
          )}

          {/* Acción para agregar jugador si hay cupo (Capitán o Admin) */}
          {jugadores.length < CONFIG_TORNEO.plantilla.max && equipo.estado !== "Rechazado" && (
            esCapitanOAdmin ? (
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
                  <div className="mt-3 p-2.5 rounded-lg bg-white border text-xs font-semibold text-center text-blue-900" role="status">
                    {mensajeJugador}
                  </div>
                )}

                {mostrarFormNuevo && (
                  <form onSubmit={handleAgregarJugador} className="mt-4 pt-4 border-t border-blue-200 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="new-member-name" className="block text-xs font-semibold text-gray-700 mb-1">Nombre Completo *</label>
                      <input
                        id="new-member-name"
                        required
                        placeholder="Nombre y Apellido"
                        className="w-full border border-gray-300 p-2 rounded-lg text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-900"
                        value={nuevoJugador.nombre}
                        onChange={e => setNuevoJugador({ ...nuevoJugador, nombre: e.target.value })}
                      />
                    </div>

                    <div>
                      <label htmlFor="new-member-account" className="block text-xs font-semibold text-gray-700 mb-1">N° de Cuenta *</label>
                      <input
                        id="new-member-account"
                        required
                        placeholder="Ej. 20211009999"
                        className="w-full border border-gray-300 p-2 rounded-lg text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-900 font-mono"
                        value={nuevoJugador.cuenta}
                        onChange={e => setNuevoJugador({ ...nuevoJugador, cuenta: e.target.value })}
                      />
                    </div>

                    <div>
                      <label htmlFor="new-member-dni" className="block text-xs font-semibold text-gray-700 mb-1">
                        N° de Identidad (DNI) *
                      </label>
                      <input
                        id="new-member-dni"
                        required
                        placeholder="Ej. 0801-2003-99999"
                        className="w-full border border-gray-300 p-2 rounded-lg text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-900 font-mono"
                        value={nuevoJugador.dni}
                        onChange={e => setNuevoJugador({ ...nuevoJugador, dni: e.target.value })}
                      />
                    </div>

                    <div>
                      <label htmlFor="new-member-email" className="block text-xs font-semibold text-gray-700 mb-1">Correo Institucional (@unitec.edu)</label>
                      <input
                        id="new-member-email"
                        type="email"
                        placeholder="alumno@unitec.edu"
                        className="w-full border border-gray-300 p-2 rounded-lg text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-900 font-mono"
                        value={nuevoJugador.correo}
                        onChange={e => setNuevoJugador({ ...nuevoJugador, correo: e.target.value })}
                      />
                    </div>

                    <div>
                      <label htmlFor="new-member-class-name" className="block text-xs font-semibold text-gray-700 mb-1">Nombre de la Clase *</label>
                      <input
                        id="new-member-class-name"
                        required
                        placeholder="Ej. Robótica Industrial"
                        className="w-full border border-gray-300 p-2 rounded-lg text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-900"
                        value={nuevoJugador.nombreClase || ""}
                        onChange={e => setNuevoJugador({ ...nuevoJugador, nombreClase: e.target.value })}
                      />
                    </div>

                    <div>
                      <label htmlFor="new-member-class-code" className="block text-xs font-semibold text-gray-700 mb-1">Código de la Clase *</label>
                      <input
                        id="new-member-class-code"
                        required
                        placeholder="Ej. MEC308"
                        className="w-full border border-gray-300 p-2 rounded-lg text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-900 uppercase font-mono"
                        value={nuevoJugador.codigoClase || ""}
                        onChange={e => setNuevoJugador({ ...nuevoJugador, codigoClase: e.target.value.toUpperCase() })}
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label htmlFor="new-member-document-type" className="block text-xs font-semibold text-gray-700 mb-1">Tipo de documento</label>
                      <select
                        id="new-member-document-type"
                        value={nuevoJugador.tipoDocumento}
                        onChange={e => setNuevoJugador(prev => ({ ...prev, tipoDocumento: e.target.value }))}
                        className="w-full border border-gray-300 p-2 rounded-lg text-xs bg-white mb-2"
                      >
                        <option value="carnet">Carnet Universitario</option>
                        <option value="hoja_confirmacion">Hoja de confirmación de matrícula</option>
                      </select>
                      <label htmlFor="new-member-document" className="block text-xs font-semibold text-gray-700 mb-1">
                        Foto de carnet o matrícula (opcional por Capitán)
                      </label>
                      <input
                        id="new-member-document"
                        type="file"
                        accept="image/*,.pdf"
                        className="w-full text-xs text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-blue-900 file:text-white hover:file:bg-blue-800 cursor-pointer"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) {
                            setNuevoJugador(prev => ({ ...prev, fotoDocumento: null, fotoDocumentoPreview: null }));
                            return;
                          }
                          setCargandoDocumento(true);
                          try {
                            const dataUrl = await comprimirDocumento(file);
                            setNuevoJugador(prev => ({ ...prev, fotoDocumento: dataUrl, fotoDocumentoPreview: dataUrl }));
                          } catch (_) {
                            setNuevoJugador(prev => ({ ...prev, fotoDocumento: null, fotoDocumentoPreview: null }));
                            setMensajeJugador("No se pudo procesar el documento. Intenta con otra imagen o PDF.");
                          } finally {
                            setCargandoDocumento(false);
                          }
                        }}
                      />
                      {cargandoDocumento && <span className="block mt-1 text-[11px] text-blue-700 font-medium">⏳ Comprimiendo documento...</span>}
                      {nuevoJugador.fotoDocumentoPreview && !cargandoDocumento && (
                        <div className="mt-2 flex items-center gap-2">
                          <span className="text-[11px] text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                            ✓ Documento adjunto listo (quedará En revisión)
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="sm:col-span-2">
                      <button
                        type="submit"
                        disabled={guardandoJugador || cargandoDocumento}
                        className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 rounded-lg text-xs transition disabled:opacity-50 shadow-sm"
                      >
                        {guardandoJugador ? "Validando e incorporando..." : "Confirmar e Incorporar a la Plantilla"}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            ) : (
              <div className="bg-blue-50/40 border border-blue-100 rounded-xl p-3.5 flex flex-wrap justify-between items-center gap-2 text-xs text-blue-950">
                <span>
                  ¿Aún no estás en esta plantilla? Únete personalmente con tu cuenta institucional ({CONFIG_TORNEO.plantilla.max - jugadores.length} cupos disponibles).
                </span>
                <Link
                  href="/"
                  className="bg-blue-950 hover:bg-blue-900 text-white font-bold px-3 py-1.5 rounded-lg text-xs transition"
                >
                  Unirme desde Inicio →
                </Link>
              </div>
            )
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
                ⚠️ Plantilla en Construcción ({jugadoresConCarnet.length} / {CONFIG_TORNEO.plantilla.min} verificados por el Comité
                {jugadoresEnRevision.length > 0 ? ` • ${jugadoresEnRevision.length} en revisión` : ""}). Se requieren mínimo {CONFIG_TORNEO.plantilla.min} carnets verificados para ser elegibles a las llaves del torneo.
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
                    const estadoCarnet = obtenerEstadoCarnet(j);
                    const tieneCarnetVisible = Boolean(j.fotoDocumento || j.foto_documento);
                    const tieneFotoEnServidor = Boolean(tieneCarnetVisible || j.tieneFoto);
                    const esDocente = estadoCarnet === "exento_docente" || (j.correoVerificado !== false && esDocenteAutorizado(j.correo));
                    const esPropioJugador = Boolean(sesion?.correo && j.correo && sesion.correo.toLowerCase() === j.correo.toLowerCase());

                    return (
                      <tr key={j.id || i} className={`hover:bg-gray-50 ${j.esCapitan ? "bg-blue-50/40 font-semibold" : ""}`}>
                        <td className="p-3 text-gray-400 font-mono text-xs">{i + 1}</td>
                        <td className="p-3 text-gray-900">
                          <div className="font-semibold">{j.nombre}</div>
                          {(j.codigoClase || j.codigo_clase) && (
                            <div className="text-[11px] text-gray-500 font-mono">
                              📚 {j.codigoClase || j.codigo_clase} {j.nombreClase || j.nombre_clase ? `— ${j.nombreClase || j.nombre_clase}` : ''}
                            </div>
                          )}
                          {j.esCapitan && (
                            <span className="mt-1 inline-block text-[10px] bg-blue-100 text-blue-800 font-bold px-1.5 py-0.5 rounded">
                              Capitán
                            </span>
                          )}
                        </td>
                        <td className="p-3 font-mono text-gray-600">{j.cuenta}</td>
                        <td className="p-3 font-mono text-gray-800 text-xs font-semibold">{j.dni || "Pendiente"}</td>
                        <td className="p-3">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {estadoCarnet === "exento_docente" || esDocente ? (
                              <span className="text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded font-semibold">
                                👨‍🏫 Docente Exento
                              </span>
                            ) : estadoCarnet === "verificado" ? (
                              <span className="text-[10px] text-emerald-800 bg-emerald-50 border border-emerald-300 px-2 py-0.5 rounded font-bold">
                                ✅ Verificado
                              </span>
                            ) : estadoCarnet === "en_revision" ? (
                              <span className="text-[10px] text-blue-800 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded font-semibold">
                                ⏳ En revisión
                              </span>
                            ) : estadoCarnet === "rechazado" ? (
                              <span className="text-[10px] text-red-800 bg-red-50 border border-red-300 px-2 py-0.5 rounded font-bold">
                                ❌ Rechazado
                              </span>
                            ) : (
                              <span className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded font-semibold">
                                ⚠️ Pendiente (Sin carnet)
                              </span>
                            )}

                            {tieneCarnetVisible ? (
                              <button
                                type="button"
                                onClick={() => setVisorModal({
                                  titulo: `Carnet de ${j.nombre} (${j.cuenta})`,
                                  url: j.fotoDocumento || j.foto_documento
                                })}
                                className="bg-white text-blue-950 border border-gray-300 hover:bg-gray-50 text-[10px] font-bold px-2 py-0.5 rounded flex items-center gap-1 shadow-sm"
                              >
                                <span>🪪</span>
                                <span>Ver Carnet</span>
                              </button>
                            ) : tieneFotoEnServidor ? (
                              <span className="text-[10px] text-gray-500 bg-gray-100 border border-gray-200 px-2 py-0.5 rounded">
                                🔒 Adjunto (privado)
                              </span>
                            ) : null}

                            {(esCapitanOAdmin || esPropioJugador) && !esDocente && (
                              <button
                                type="button"
                                onClick={() => abrirModalCarnet(j)}
                                className="text-[10px] text-blue-700 hover:text-blue-900 hover:underline font-bold ml-1"
                                title="Subir o actualizar foto del carnet"
                              >
                                {tieneFotoEnServidor ? "Cambiar" : "+ Subir"}
                              </button>
                            )}
                          </div>
                          {estadoCarnet === "rechazado" && j.motivoRechazo && (
                            <p className="text-[10px] text-red-700 mt-1">
                              Motivo: {j.motivoRechazo}
                            </p>
                          )}
                        </td>
                        <td className="p-3 text-center">
                          {esCapitanOAdmin ? (
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => abrirModalEditar(j)}
                                className="bg-blue-50 hover:bg-blue-100 text-blue-900 border border-blue-200 px-2 py-1 rounded-lg text-xs font-bold transition inline-flex items-center gap-1 shadow-sm"
                                title="Editar datos del jugador"
                              >
                                <span>✏️</span>
                                <span>Editar</span>
                              </button>
                              {!j.esCapitan && (
                                <button
                                  type="button"
                                  onClick={() => handleExpulsarJugador(j)}
                                  className="bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 px-2 py-1 rounded-lg text-xs font-bold transition inline-flex items-center gap-1 shadow-sm"
                                  title="Expulsar jugador y liberar su cuenta"
                                >
                                  <span>🗑️</span>
                                  <span>Expulsar</span>
                                </button>
                              )}
                            </div>
                          ) : (
                            <span className="text-[10px] text-gray-400">
                              {j.esCapitan ? "Fundador" : "Miembro"}
                            </span>
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

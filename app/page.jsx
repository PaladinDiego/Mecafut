"use client";
import { useState, useEffect } from "react";
import {
  inscribirEquipo,
  obtenerResumenPublico,
  agregarJugadorConCodigo,
  validarCorreoInstitucional,
  comprimirDocumento,
  isFirebaseConfigured
} from "../lib/dbService";
import { CONFIG_TORNEO, esDocenteAutorizado } from "../lib/torneoConfig";
import { obtenerSesionActual } from "../lib/authService";
import Link from "next/link";

export default function Registro() {
  const [resumen, setResumen] = useState(null);
  const [mostrarReglamento, setMostrarReglamento] = useState(false);
  const [rolSeleccionado, setRolSeleccionado] = useState("capitan"); // "capitan" | "jugador"
  const [sesion, setSesion] = useState(null);

  // ==========================================
  // ESTADOS PARA CAPITÁN (EQUIPO NUEVO)
  // ==========================================
  const [capitan, setCapitan] = useState({
    nombre: "",
    cuenta: "",
    correo: "",
    telefono: "",
    dni: "",
    tipoDocumento: "carnet", // "carnet" | "hoja_confirmacion"
    fotoDocumento: null,
    fotoDocumentoPreview: null,
    carrera: CONFIG_TORNEO.carreras[0],
    codigoClase: ""
  });

  const [equipo, setEquipo] = useState({
    nombre: "",
    tipoEquipo: "Estudiantes",
    docente: CONFIG_TORNEO.docentes[0],
    categoria: "Masculino",
    color: ""
  });

  // 9 jugadores extras (para sumar 10 en total con el Capitán)
  const [jugadores, setJugadores] = useState(
    Array(9).fill(null).map(() => ({
      nombre: "",
      cuenta: "",
      correo: "",
      dni: "",
      carrera: CONFIG_TORNEO.carreras[0],
      codigoClase: ""
    }))
  );

  const [comprobante, setComprobante] = useState(null);
  const [comprobantePreview, setComprobantePreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const [resultado, setResultado] = useState(null);
  const [copiadoCodigo, setCopiadoCodigo] = useState(false);
  const [copiadoLink, setCopiadoLink] = useState(false);
  const [copiadoBac, setCopiadoBac] = useState(false);

  // ==========================================
  // ESTADOS PARA JUGADOR INDIVIDUAL (UNIRSE)
  // ==========================================
  const [codigoEquipoElegido, setCodigoEquipoElegido] = useState("");
  const [jugadorSelf, setJugadorSelf] = useState({
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
  const [loadingJugador, setLoadingJugador] = useState(false);
  const [mensajeJugador, setMensajeJugador] = useState("");
  const [resultadoJugador, setResultadoJugador] = useState(null);

  useEffect(() => {
    cargarResumen();
    sincronizarSesion();
    const handleAuth = () => sincronizarSesion();
    window.addEventListener("mecafut_auth_change", handleAuth);
    return () => window.removeEventListener("mecafut_auth_change", handleAuth);
  }, []);

  const sincronizarSesion = () => {
    const s = obtenerSesionActual();
    setSesion(s);
    if (s) {
      if (s.correo) {
        setCapitan(prev => ({ ...prev, correo: prev.correo || s.correo }));
        setJugadorSelf(prev => ({ ...prev, correo: prev.correo || s.correo }));
      }
      if (s.rol === "docente") {
        setEquipo(prev => ({ ...prev, tipoEquipo: "Docentes", docente: s.nombre || prev.docente }));
        setCapitan(prev => ({ ...prev, nombre: s.nombre || prev.nombre }));
      } else if (s.rol === "estudiante") {
        setEquipo(prev => ({ ...prev, tipoEquipo: "Estudiantes" }));
      }
    }
  };

  const cargarResumen = async () => {
    try {
      const res = await obtenerResumenPublico();
      setResumen(res);
      // Asignar primer color que tenga menos de 2 equipos
      const primerLibre = CONFIG_TORNEO.coloresUniforme.find(c => {
        const cant = res.conteoColores?.[c.nombre.toLowerCase()] || 0;
        return cant < 2;
      });
      if (primerLibre && !equipo.color) {
        setEquipo(prev => ({ ...prev, color: primerLibre.nombre }));
      }
      // Si hay equipos registrados, seleccionar el primero para el jugador por conveniencia
      if (res.equiposActivos?.length > 0 && !codigoEquipoElegido) {
        setCodigoEquipoElegido(res.equiposActivos[0].codigoAcceso);
      }
    } catch (err) {
      console.error("Error cargando resumen de cupos:", err);
    }
  };

  const handleJugadorChange = (index, field, value) => {
    const nuevos = [...jugadores];
    nuevos[index] = { ...nuevos[index], [field]: value };
    setJugadores(nuevos);
  };

  const agregarJugador = () => {
    if (jugadores.length + 1 < CONFIG_TORNEO.plantilla.max) {
      setJugadores([...jugadores, {
        nombre: "",
        cuenta: "",
        correo: "",
        dni: "",
        carrera: CONFIG_TORNEO.carreras[0],
        codigoClase: ""
      }]);
    }
  };

  const eliminarJugador = (index) => {
    setJugadores(jugadores.filter((_, i) => i !== index));
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    setComprobante(file || null);
    if (file && file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onloadend = () => setComprobantePreview(reader.result);
      reader.readAsDataURL(file);
    } else {
      setComprobantePreview(null);
    }
  };

  const copiarAlPortapapeles = (texto, setEstado) => {
    navigator.clipboard.writeText(texto);
    setEstado(true);
    setTimeout(() => setEstado(false), 2200);
  };

  // Submit Capitán
  const onSubmitCapitan = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMensaje("");
    setResultado(null);

    try {
      const res = await inscribirEquipo({
        equipo,
        capitan,
        jugadores,
        comprobanteFile: comprobante
      });

      setResultado(res);
      setMensaje("¡Inscripción registrada con éxito!");
      window.scrollTo({ top: 0, behavior: "smooth" });
      cargarResumen();
    } catch (error) {
      setMensaje(error.message || "Error al registrar el equipo");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } finally {
      setLoading(false);
    }
  };

  // Submit Jugador Individual
  const onSubmitJugador = async (e) => {
    e.preventDefault();
    setLoadingJugador(true);
    setMensajeJugador("");
    setResultadoJugador(null);

    try {
      if (!codigoEquipoElegido?.trim()) {
        throw new Error("Por favor selecciona o ingresa el código del equipo al que deseas unirte.");
      }

      const res = await agregarJugadorConCodigo(codigoEquipoElegido, jugadorSelf);
      setResultadoJugador(res);
      setMensajeJugador("¡Te has unido exitosamente al equipo!");
      window.scrollTo({ top: 0, behavior: "smooth" });
      cargarResumen();
    } catch (error) {
      setMensajeJugador(error.message || "Error al unirte al equipo");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } finally {
      setLoadingJugador(false);
    }
  };

  const totalIntegrantesActual = 1 + jugadores.length;
  const esEsperaEstudiantes = (resumen?.estudiantesOcupados || 0) >= CONFIG_TORNEO.cupos.estudiantes;
  const esEsperaDocentes = (resumen?.docentesOcupados || 0) >= CONFIG_TORNEO.cupos.docentes;

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 pb-20">
      {/* Indicador de Estado del Torneo & Modo */}
      <div className="mb-6 p-3 bg-blue-50 border border-blue-200 rounded-xl flex flex-wrap items-center justify-between text-xs sm:text-sm text-blue-900 gap-2">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
          <span>
            <strong>Entorno:</strong> {isFirebaseConfigured ? "Google Cloud Firestore" : "Modo Simulado Local (Almacenamiento Seguro en Navegador)"}
          </span>
        </div>
        <span className="bg-blue-100 text-blue-900 font-semibold px-2.5 py-0.5 rounded text-xs">
          Torneo {CONFIG_TORNEO.periodo}
        </span>
      </div>

      {/* Pantalla si las inscripciones están cerradas */}
      {resumen && !resumen.inscripcionesAbiertas && (
        <div className="bg-red-50 border-2 border-red-300 p-6 rounded-2xl mb-8 text-center">
          <span className="text-3xl block mb-2">🔒</span>
          <h2 className="text-xl font-bold text-red-900">Periodo de Inscripciones Cerrado</h2>
          <p className="text-sm text-red-700 mt-1 max-w-lg mx-auto">
            El comité organizador de MECAFUT ha congelado las inscripciones para proceder al sorteo oficial. Si ya tienes tu equipo registrado, puedes consultar su estado en la pestaña <strong>Consultar Código</strong>.
          </p>
        </div>
      )}

      {/* Título Principal y Tarjetas de Cupos en Vivo */}
      <div className="text-center mb-6">
        <h1 className="text-3xl sm:text-4xl font-extrabold text-blue-950 tracking-tight">{CONFIG_TORNEO.titulo}</h1>
        <p className="text-gray-600 text-sm mt-1">{CONFIG_TORNEO.subtitulo}</p>
      </div>

      {/* Monitor de Cupos Oficiales */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <div className={`p-4 rounded-xl border transition ${
          esEsperaEstudiantes ? "bg-amber-50 border-amber-300" : "bg-white border-gray-200 shadow-sm"
        }`}>
          <div className="flex justify-between items-center">
            <div>
              <span className="text-xs uppercase font-bold text-gray-500">Cupos Estudiantiles</span>
              <h3 className="text-2xl font-black text-blue-950">
                {resumen ? `${resumen.estudiantesOcupados} / ${CONFIG_TORNEO.cupos.estudiantes}` : "Cargando..."}
              </h3>
            </div>
            <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
              esEsperaEstudiantes ? "bg-amber-200 text-amber-900" : "bg-emerald-100 text-emerald-800"
            }`}>
              {esEsperaEstudiantes ? "En Lista de Espera" : "Disponibles"}
            </span>
          </div>
          <p className="text-[11px] text-gray-500 mt-2">
            {esEsperaEstudiantes
              ? "Los nuevos registros entrarán en cola de espera por si un equipo no valida su pago."
              : "Asignados por estricto orden de llegada."}
          </p>
        </div>

        <div className={`p-4 rounded-xl border transition ${
          esEsperaDocentes ? "bg-amber-50 border-amber-300" : "bg-white border-gray-200 shadow-sm"
        }`}>
          <div className="flex justify-between items-center">
            <div>
              <span className="text-xs uppercase font-bold text-gray-500">Cupos Docentes / Facultad</span>
              <h3 className="text-2xl font-black text-blue-950">
                {resumen ? `${resumen.docentesOcupados} / ${CONFIG_TORNEO.cupos.docentes}` : "Cargando..."}
              </h3>
            </div>
            <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
              esEsperaDocentes ? "bg-amber-200 text-amber-900" : "bg-emerald-100 text-emerald-800"
            }`}>
              {esEsperaDocentes ? "En Lista de Espera" : "Disponibles"}
            </span>
          </div>
          <p className="text-[11px] text-gray-500 mt-2">
            Espacios exclusivos reservados para profesores y colaboradores.
          </p>
        </div>
      </div>

      {/* SELECTOR DE ROL: ¿ERES CAPITÁN O JUGADOR? */}
      <div className="bg-white p-4 rounded-2xl border-2 border-blue-900 shadow-sm mb-8 text-center">
        <label className="block text-xs uppercase font-extrabold text-blue-950 tracking-wider mb-3">
          ¿Cuál es tu rol en esta inscripción?
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-xl mx-auto">
          <button
            type="button"
            onClick={() => {
              setRolSeleccionado("capitan");
              setMensaje("");
              setMensajeJugador("");
            }}
            className={`p-3.5 rounded-xl border text-left flex items-center gap-3 transition ${
              rolSeleccionado === "capitan"
                ? "bg-blue-950 text-white border-blue-950 shadow-md ring-2 ring-blue-900"
                : "bg-gray-50 hover:bg-gray-100 text-gray-700 border-gray-200"
            }`}
          >
            <span className="text-2xl">👑</span>
            <div>
              <strong className="block text-sm">Soy Capitán</strong>
              <span className={`text-xs ${rolSeleccionado === "capitan" ? "text-blue-200" : "text-gray-500"}`}>
                Fundar equipo, pagar y elegir uniforme
              </span>
            </div>
          </button>

          <button
            type="button"
            onClick={() => {
              setRolSeleccionado("jugador");
              setMensaje("");
              setMensajeJugador("");
            }}
            className={`p-3.5 rounded-xl border text-left flex items-center gap-3 transition ${
              rolSeleccionado === "jugador"
                ? "bg-blue-950 text-white border-blue-950 shadow-md ring-2 ring-blue-900"
                : "bg-gray-50 hover:bg-gray-100 text-gray-700 border-gray-200"
            }`}
          >
            <span className="text-2xl">⚽</span>
            <div>
              <strong className="block text-sm">Soy Jugador</strong>
              <span className={`text-xs ${rolSeleccionado === "jugador" ? "text-blue-200" : "text-gray-500"}`}>
                Unirme a un equipo ya creado
              </span>
            </div>
          </button>
        </div>
      </div>

      {/* ============================================================ */}
      {/* VISTA 1: SOY JUGADOR (FORMULARIO ÁGIL INDIVIDUAL)              */}
      {/* ============================================================ */}
      {rolSeleccionado === "jugador" && (
        <div className="space-y-6">
          {resultadoJugador && (
            <div className="bg-emerald-50 border-2 border-emerald-400 p-6 rounded-2xl text-center shadow-sm">
              <span className="text-3xl">🎉</span>
              <h3 className="text-xl font-bold text-emerald-950 mt-1">¡Te has unido con éxito!</h3>
              <p className="text-xs text-emerald-800 mt-1">
                Ya figuras en la plantilla oficial de <strong>{resultadoJugador.equipo.nombre}</strong>.
              </p>
              <div className="mt-4">
                <Link
                  href={`/equipo?codigo=${resultadoJugador.equipo.codigoAcceso}`}
                  className="bg-blue-950 hover:bg-blue-900 text-white text-xs font-bold px-4 py-2 rounded-lg inline-block transition"
                >
                  Ver Plantilla de mi Equipo →
                </Link>
              </div>
            </div>
          )}

          {mensajeJugador && !resultadoJugador && (
            <div className="p-4 text-center font-bold rounded-xl border bg-red-50 border-red-300 text-red-800 text-sm">
              {mensajeJugador}
            </div>
          )}

          <form onSubmit={onSubmitJugador} className="bg-white p-6 sm:p-8 rounded-2xl border border-gray-200 shadow-sm space-y-5">
            <div>
              <h3 className="text-lg font-black text-blue-950 flex items-center gap-2">
                <span>⚽</span> Formulario de Inscripción Individual
              </h3>
              <p className="text-xs text-gray-500">
                Selecciona tu equipo e introduce tus datos académicos institucionales para sumarte a la plantilla.
              </p>
            </div>

            {/* Selector de Equipo */}
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                ¿A qué equipo deseas incorporarte? *
              </label>
              {resumen?.equiposActivos?.length > 0 ? (
                <div className="space-y-2">
                  <select
                    className="w-full border border-gray-300 p-2.5 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-900 focus:outline-none"
                    value={codigoEquipoElegido}
                    onChange={e => setCodigoEquipoElegido(e.target.value)}
                  >
                    {resumen.equiposActivos.map(eq => (
                      <option key={eq.id} value={eq.codigoAcceso}>
                        {eq.nombre} ({eq.categoria}) — Cap: {eq.capitan || "N/A"}
                      </option>
                    ))}
                  </select>
                  <p className="text-[11px] text-gray-400">
                    O si tu capitán te dio un código numérico directo, puedes escribirlo abajo:
                  </p>
                  <input
                    placeholder="Código de 8 dígitos del equipo (Opcional si elegiste arriba)"
                    className="w-full sm:max-w-xs border border-gray-300 p-2 rounded-lg text-xs font-mono tracking-wider focus:outline-none focus:ring-1 focus:ring-blue-900"
                    value={codigoEquipoElegido}
                    onChange={e => setCodigoEquipoElegido(e.target.value)}
                  />
                </div>
              ) : (
                <div>
                  <p className="text-xs text-amber-700 bg-amber-50 p-2.5 rounded-lg border border-amber-200 mb-2">
                    Aún no hay equipos inscritos en la base de datos. Pídele a tu capitán que registre primero el equipo.
                  </p>
                  <input
                    required
                    placeholder="Ingresa el código de 8 dígitos de tu equipo"
                    className="w-full border border-gray-300 p-2.5 rounded-lg text-sm font-mono tracking-wider"
                    value={codigoEquipoElegido}
                    onChange={e => setCodigoEquipoElegido(e.target.value)}
                  />
                </div>
              )}
            </div>

            {/* Datos Personales */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-gray-100">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Nombre Completo *</label>
                <input
                  required
                  placeholder="Tu Nombre y Apellido"
                  className="w-full border border-gray-300 p-2.5 rounded-lg text-sm focus:ring-2 focus:ring-blue-900 focus:outline-none"
                  value={jugadorSelf.nombre}
                  onChange={e => setJugadorSelf({ ...jugadorSelf, nombre: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">N° de Cuenta Estudiantil *</label>
                <input
                  required
                  placeholder="Ej. 20221004321"
                  className="w-full border border-gray-300 p-2.5 rounded-lg text-sm focus:ring-2 focus:ring-blue-900 focus:outline-none font-mono"
                  value={jugadorSelf.cuenta}
                  onChange={e => setJugadorSelf({ ...jugadorSelf, cuenta: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  N° de Identidad (DNI) *
                </label>
                <input
                  required
                  placeholder="Ej. 0801-2003-54321"
                  className="w-full border border-gray-300 p-2.5 rounded-lg text-sm focus:ring-2 focus:ring-blue-900 focus:outline-none font-mono"
                  value={jugadorSelf.dni}
                  onChange={e => setJugadorSelf({ ...jugadorSelf, dni: e.target.value })}
                />
                <p className="text-[10px] text-gray-400 mt-0.5">Se cotejará con tu carnet físico en la mesa.</p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Correo Institucional (@unitec.edu) *</label>
                <input
                  required
                  type="email"
                  placeholder="tu.nombre@unitec.edu"
                  className="w-full border border-gray-300 p-2.5 rounded-lg text-sm focus:ring-2 focus:ring-blue-900 focus:outline-none font-mono"
                  value={jugadorSelf.correo}
                  onChange={e => setJugadorSelf({ ...jugadorSelf, correo: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Carrera *</label>
                <select
                  className="w-full border border-gray-300 p-2.5 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-900 focus:outline-none"
                  value={jugadorSelf.carrera}
                  onChange={e => setJugadorSelf({ ...jugadorSelf, carrera: e.target.value })}
                >
                  {CONFIG_TORNEO.carreras.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              {/* Documento de Verificación Estudiantil */}
              <div className="md:col-span-2 pt-2 border-t border-gray-100 bg-blue-50/40 p-3.5 rounded-xl border border-blue-100">
                <label className="block text-xs font-bold text-blue-950 uppercase mb-1">
                  Documento de Verificación Estudiantil *
                </label>
                <p className="text-[11px] text-gray-500 mb-2">
                  Sube foto de tu carnet universitario o captura de tu hoja de confirmación de matrícula (portal UNITEC):
                </p>
                <div className="flex flex-wrap gap-4 text-xs mb-2">
                  <label className="flex items-center gap-1.5 cursor-pointer font-semibold text-blue-950">
                    <input
                      type="radio"
                      name="tipoDocSelf"
                      value="carnet"
                      checked={jugadorSelf.tipoDocumento === "carnet"}
                      onChange={() => setJugadorSelf({ ...jugadorSelf, tipoDocumento: "carnet" })}
                    />
                    <span>🪪 Carnet Universitario (Opción principal / Recomendada)</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer font-semibold text-blue-950">
                    <input
                      type="radio"
                      name="tipoDocSelf"
                      value="hoja_confirmacion"
                      checked={jugadorSelf.tipoDocumento === "hoja_confirmacion"}
                      onChange={() => setJugadorSelf({ ...jugadorSelf, tipoDocumento: "hoja_confirmacion" })}
                    />
                    <span>📄 Hoja de Confirmación de Matrícula (Portal)</span>
                  </label>
                </div>
                <input
                  type="file"
                  accept="image/*,.pdf"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const dataUrl = await comprimirDocumento(file);
                      setJugadorSelf(prev => ({
                        ...prev,
                        fotoDocumento: dataUrl,
                        fotoDocumentoPreview: dataUrl
                      }));
                    }
                  }}
                  className="w-full text-xs text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-blue-900 file:text-white hover:file:bg-blue-800 cursor-pointer"
                />
                {jugadorSelf.fotoDocumentoPreview && (
                  <div className="mt-2.5 p-1.5 bg-white rounded border inline-block">
                    <p className="text-[10px] text-gray-400 mb-1">Vista previa del documento:</p>
                    <img src={jugadorSelf.fotoDocumentoPreview} alt="Doc Jugador" className="max-h-28 rounded shadow-sm border" />
                  </div>
                )}
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-gray-700 mb-1">Código de Clase que Cursas (Opcional)</label>
                <input
                  placeholder="Ej. MEC308"
                  className="w-full border border-gray-300 p-2.5 rounded-lg text-sm focus:ring-2 focus:ring-blue-900 focus:outline-none uppercase"
                  value={jugadorSelf.codigoClase}
                  onChange={e => setJugadorSelf({ ...jugadorSelf, codigoClase: e.target.value })}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loadingJugador || (resumen && !resumen.inscripcionesAbiertas)}
              className="w-full bg-blue-950 hover:bg-blue-900 text-white font-bold py-3.5 rounded-xl text-sm transition shadow disabled:opacity-50"
            >
              {loadingJugador ? "Validando e incorporando a la plantilla..." : "Confirmar mi Registro en este Equipo"}
            </button>
          </form>
        </div>
      )}

      {/* ============================================================ */}
      {/* VISTA 2: SOY CAPITÁN (CREACIÓN COMPLETA DE EQUIPO)             */}
      {/* ============================================================ */}
      {rolSeleccionado === "capitan" && (
        <div>
          {/* Acordeón de Reglamento y Datos Bancarios */}
          <div className="bg-white border border-gray-200 rounded-xl mb-8 overflow-hidden shadow-sm">
            <button
              type="button"
              onClick={() => setMostrarReglamento(!mostrarReglamento)}
              className="w-full p-4 text-left font-semibold text-sm text-blue-950 flex justify-between items-center hover:bg-gray-50 transition"
            >
              <span className="flex items-center gap-2">
                <span>📋</span> Reglamento Oficial y Cuentas Bancarias de Inscripción
              </span>
              <span className="text-xs text-blue-700">{mostrarReglamento ? "Ocultar ▲" : "Ver detalles ▼"}</span>
            </button>

            {mostrarReglamento && (
              <div className="p-4 sm:p-6 bg-gray-50/70 border-t border-gray-200 text-xs sm:text-sm text-gray-700 space-y-4">
                <div>
                  <h4 className="font-bold text-blue-950 mb-2">Reglamento del Evento:</h4>
                  <ul className="list-disc pl-5 space-y-1.5 text-xs text-gray-600">
                    {CONFIG_TORNEO.reglamento.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                </div>

                <div className="bg-white p-4 rounded-xl border border-blue-200">
                  <h4 className="font-bold text-blue-950 mb-1">Datos para Transferencia Bancaria (L. 450.00):</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs mt-2">
                    <p><strong>Banco:</strong> {CONFIG_TORNEO.pago.banco}</p>
                    <p><strong>Monto Único:</strong> <span className="font-bold text-emerald-700">{CONFIG_TORNEO.pago.monto}</span></p>
                    <p><strong>Beneficiario:</strong> {CONFIG_TORNEO.pago.beneficiario}</p>
                    <p><strong>N° Identidad:</strong> {CONFIG_TORNEO.pago.idBeneficiario}</p>
                    <div className="sm:col-span-2 flex items-center gap-2 mt-1">
                      <span className="font-mono bg-gray-100 p-1.5 rounded font-bold text-blue-950 text-sm">
                        {CONFIG_TORNEO.pago.numeroCuenta}
                      </span>
                      <button
                        type="button"
                        onClick={() => copiarAlPortapapeles(CONFIG_TORNEO.pago.numeroCuenta, setCopiadoBac)}
                        className="text-xs bg-blue-900 text-white px-2.5 py-1.5 rounded hover:bg-blue-800 transition"
                      >
                        {copiadoBac ? "✓ ¡Copiado!" : "Copiar Cuenta BAC"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Tarjeta de Éxito Capitán */}
          {resultado && (
            <div className="bg-emerald-50 border-2 border-emerald-400 p-6 sm:p-8 rounded-2xl mb-8 shadow-sm">
              <div className="text-center">
                <span className="text-4xl">🎉</span>
                <h3 className="text-2xl font-extrabold text-emerald-950 mt-2">¡Equipo Registrado Exitosamente!</h3>
                
                <div className="inline-block my-3">
                  <span className={`text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider ${
                    resultado.estado === "Lista de espera"
                      ? "bg-amber-100 text-amber-800 border border-amber-300"
                      : "bg-blue-100 text-blue-800 border border-blue-300"
                  }`}>
                    Estado: {resultado.estado === "Lista de espera" ? "En Lista de Espera (Cupo Agotado)" : "Pendiente de Validación de Pago"}
                  </span>
                </div>

                <p className="text-xs sm:text-sm text-emerald-900 max-w-md mx-auto">
                  {resultado.estado === "Lista de espera"
                    ? "El cupo inicial se encuentra lleno; si algún equipo no valida su pago a tiempo, tu equipo ascenderá por orden de registro."
                    : "Tu comprobante será revisado por el comité organizador para otorgar la confirmación definitiva."}
                </p>
              </div>

              <div className="bg-white border border-emerald-200 rounded-xl p-4 my-6 text-center max-w-md mx-auto">
                <span className="text-xs uppercase text-gray-400 font-semibold tracking-wider">Código de Acceso de tu Equipo</span>
                <div className="text-4xl font-mono font-black text-blue-950 tracking-widest my-1">
                  {resultado.codigoAcceso}
                </div>
                <p className="text-[11px] text-gray-500">
                  Pásale este enlace a tus compañeros para que se agreguen a la plantilla directamente:
                </p>
                <div className="flex flex-wrap justify-center gap-2 mt-3">
                  <button
                    type="button"
                    onClick={() => copiarAlPortapapeles(resultado.codigoAcceso, setCopiadoCodigo)}
                    className="bg-blue-900 hover:bg-blue-800 text-white text-xs font-bold px-3.5 py-2 rounded-lg transition"
                  >
                    {copiadoCodigo ? "✓ ¡Código copiado!" : "📋 Copiar Código"}
                  </button>
                  <button
                    type="button"
                    onClick={() => copiarAlPortapapeles(`${window.location.origin}/equipo?codigo=${resultado.codigoAcceso}`, setCopiadoLink)}
                    className="border border-gray-300 hover:bg-gray-50 text-gray-700 text-xs font-semibold px-3.5 py-2 rounded-lg transition"
                  >
                    {copiadoLink ? "✓ ¡Enlace copiado!" : "🔗 Copiar Enlace Directo"}
                  </button>
                </div>
              </div>

              <div className="text-center pt-2 border-t border-emerald-200/60">
                <a
                  href={CONFIG_TORNEO.whatsappCapitanesUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm px-5 py-2.5 rounded-xl shadow transition"
                >
                  <span>💬</span> Unirse al Grupo de WhatsApp de Capitanes
                </a>
              </div>
            </div>
          )}

          {mensaje && !resultado && (
            <div className="mb-6 p-4 text-center font-bold rounded-xl border bg-red-50 border-red-300 text-red-800 text-sm">
              {mensaje}
            </div>
          )}

          {/* FORMULARIO DE CAPITÁN */}
          <form onSubmit={onSubmitCapitan} className="space-y-6">
            {/* SECCIÓN 1: DATOS DEL EQUIPO */}
            <section className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
              <div className="flex items-center gap-2 mb-1">
                <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-900 text-xs flex items-center justify-center font-black">1</span>
                <h3 className="text-lg font-bold text-blue-950">Datos del Equipo y Uniforme</h3>
              </div>
              <p className="text-xs text-gray-500 mb-4">Elige nombre único, categoría y reserva tu color de uniforme (hasta 2 equipos por color)</p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Nombre del Equipo *</label>
                  <input
                    required
                    placeholder="Ej. Mecatrónicos FC"
                    className="w-full border border-gray-300 p-2.5 rounded-lg text-sm focus:ring-2 focus:ring-blue-900 focus:outline-none"
                    value={equipo.nombre}
                    onChange={e => setEquipo({ ...equipo, nombre: e.target.value })}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Tipo de Equipo *</label>
                  <select
                    className="w-full border border-gray-300 p-2.5 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-900 focus:outline-none"
                    value={equipo.tipoEquipo}
                    onChange={e => setEquipo({ ...equipo, tipoEquipo: e.target.value })}
                  >
                    <option value="Estudiantes">Estudiantes (Cupo regular: 12)</option>
                    <option value="Docentes">Docentes / Colaboradores (Cupo: 2)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Docente / Ingeniero que Representa *</label>
                  <select
                    className="w-full border border-gray-300 p-2.5 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-900 focus:outline-none"
                    value={equipo.docente}
                    onChange={e => setEquipo({ ...equipo, docente: e.target.value })}
                  >
                    {CONFIG_TORNEO.docentes.map(d => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Categoría *</label>
                  <select
                    className="w-full border border-gray-300 p-2.5 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-900 focus:outline-none"
                    value={equipo.categoria}
                    onChange={e => setEquipo({ ...equipo, categoria: e.target.value })}
                  >
                    <option value="Masculino">Masculino</option>
                    <option value="Femenino">Femenino</option>
                  </select>
                </div>

                {/* Selector Visual de Color de Uniforme (Máximo 2 equipos por color) */}
                <div className="md:col-span-2 pt-2">
                  <label className="block text-xs font-semibold text-gray-700 mb-2">
                    Color de Uniforme * <span className="font-normal text-gray-500">(Máximo 2 equipos por color; si coinciden en partido se usan chalecos)</span>
                  </label>

                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2.5">
                    {CONFIG_TORNEO.coloresUniforme.map((c) => {
                      const usoColor = resumen?.conteoColores?.[c.nombre.toLowerCase()] || 0;
                      const estaLleno = usoColor >= 2;
                      const estaSeleccionado = equipo.color === c.nombre;

                      return (
                        <button
                          key={c.nombre}
                          type="button"
                          disabled={estaLleno}
                          onClick={() => setEquipo({ ...equipo, color: c.nombre })}
                          className={`p-2.5 rounded-xl border text-xs font-medium flex items-center gap-2 transition text-left ${
                            estaLleno
                              ? "bg-gray-100 border-gray-200 text-gray-400 opacity-60 cursor-not-allowed"
                              : estaSeleccionado
                              ? "border-blue-900 ring-2 ring-blue-900 bg-blue-50/50 text-blue-950 font-bold"
                              : "border-gray-200 bg-white hover:border-gray-300 text-gray-800"
                          }`}
                        >
                          <span
                            className="w-4 h-4 rounded-full flex-shrink-0"
                            style={{
                              backgroundColor: c.hex,
                              border: c.borde ? "1px solid #cbd5e1" : "none"
                            }}
                          />
                          <span className="truncate flex-1">{c.nombre}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                            estaLleno
                              ? "bg-red-100 text-red-800 font-bold"
                              : usoColor === 1
                              ? "bg-amber-100 text-amber-800"
                              : "bg-gray-100 text-gray-500"
                          }`}>
                            {estaLleno ? "Lleno (2/2)" : `${usoColor}/2`}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </section>

            {/* SECCIÓN 2: DATOS DEL CAPITÁN (JUGADOR #1) */}
            <section className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-900 text-xs flex items-center justify-center font-black">2</span>
                  <h3 className="text-lg font-bold text-blue-950">Datos del Capitán (Jugador #1)</h3>
                </div>
                <span className="text-xs bg-blue-100 text-blue-800 font-bold px-2 py-0.5 rounded">
                  Integrante Oficial #1
                </span>
              </div>
              <p className="text-xs text-gray-500 mb-4">
                El Capitán es el representante oficial ante el torneo y forma parte de la plantilla de jugadores automáticamente.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Nombre Completo *</label>
                  <input
                    required
                    placeholder="Ej. Diego Ramos"
                    className="w-full border border-gray-300 p-2.5 rounded-lg text-sm focus:ring-2 focus:ring-blue-900 focus:outline-none"
                    value={capitan.nombre}
                    onChange={e => setCapitan({ ...capitan, nombre: e.target.value })}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">N° de Cuenta Estudiantil *</label>
                  <input
                    required
                    placeholder="Ej. 20211005555"
                    className="w-full border border-gray-300 p-2.5 rounded-lg text-sm focus:ring-2 focus:ring-blue-900 focus:outline-none font-mono"
                    value={capitan.cuenta}
                    onChange={e => setCapitan({ ...capitan, cuenta: e.target.value })}
                  />
                </div>

                {equipo.tipoEquipo === "Estudiantes" && (
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      N° de Identidad (DNI) *
                    </label>
                    <input
                      required
                      placeholder="Ej. 0801-2003-12345"
                      className="w-full border border-gray-300 p-2.5 rounded-lg text-sm focus:ring-2 focus:ring-blue-900 focus:outline-none font-mono"
                      value={capitan.dni}
                      onChange={e => setCapitan({ ...capitan, dni: e.target.value })}
                    />
                    <p className="text-[10px] text-gray-400 mt-0.5">Se verificará con tu carnet en el partido.</p>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Correo Institucional (@unitec.edu) *</label>
                  <input
                    required
                    type="email"
                    placeholder="nombre@unitec.edu"
                    className="w-full border border-gray-300 p-2.5 rounded-lg text-sm focus:ring-2 focus:ring-blue-900 focus:outline-none font-mono"
                    value={capitan.correo}
                    onChange={e => setCapitan({ ...capitan, correo: e.target.value })}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Teléfono WhatsApp *</label>
                  <input
                    required
                    type="tel"
                    placeholder="Ej. 9988-7766"
                    className="w-full border border-gray-300 p-2.5 rounded-lg text-sm focus:ring-2 focus:ring-blue-900 focus:outline-none"
                    value={capitan.telefono}
                    onChange={e => setCapitan({ ...capitan, telefono: e.target.value })}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Carrera *</label>
                  <select
                    className="w-full border border-gray-300 p-2.5 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-900 focus:outline-none"
                    value={capitan.carrera}
                    onChange={e => setCapitan({ ...capitan, carrera: e.target.value })}
                  >
                    {CONFIG_TORNEO.carreras.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Código de Clase que Cursa</label>
                  <input
                    placeholder="Ej. MEC308"
                    className="w-full border border-gray-300 p-2.5 rounded-lg text-sm focus:ring-2 focus:ring-blue-900 focus:outline-none uppercase"
                    value={capitan.codigoClase}
                    onChange={e => setCapitan({ ...capitan, codigoClase: e.target.value })}
                  />
                </div>

                {/* Documento de Verificación Estudiantil del Capitán */}
                {equipo.tipoEquipo === "Estudiantes" && (
                  <div className="md:col-span-3 pt-3 border-t border-gray-100 bg-blue-50/40 p-3.5 rounded-xl border border-blue-100">
                    <label className="block text-xs font-bold text-blue-950 uppercase mb-1">
                      Foto de Documento Estudiantil del Capitán *
                    </label>
                    <p className="text-[11px] text-gray-500 mb-2">
                      Sube foto de tu carnet universitario o captura de tu hoja de confirmación de matrícula (portal UNITEC):
                    </p>
                    <div className="flex flex-wrap gap-4 text-xs mb-2">
                      <label className="flex items-center gap-1.5 cursor-pointer font-semibold text-blue-950">
                        <input
                          type="radio"
                          name="tipoDocCapitan"
                          value="carnet"
                          checked={capitan.tipoDocumento === "carnet"}
                          onChange={() => setCapitan({ ...capitan, tipoDocumento: "carnet" })}
                        />
                        <span>🪪 Carnet Universitario (Opción principal / Recomendada)</span>
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer font-semibold text-blue-950">
                        <input
                          type="radio"
                          name="tipoDocCapitan"
                          value="hoja_confirmacion"
                          checked={capitan.tipoDocumento === "hoja_confirmacion"}
                          onChange={() => setCapitan({ ...capitan, tipoDocumento: "hoja_confirmacion" })}
                        />
                        <span>📄 Hoja de Confirmación de Matrícula (Portal)</span>
                      </label>
                    </div>
                    <input
                      type="file"
                      accept="image/*,.pdf"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const dataUrl = await comprimirDocumento(file);
                          setCapitan(prev => ({
                            ...prev,
                            fotoDocumento: dataUrl,
                            fotoDocumentoPreview: dataUrl
                          }));
                        }
                      }}
                      className="w-full text-xs text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-blue-900 file:text-white hover:file:bg-blue-800 cursor-pointer"
                    />
                    {capitan.fotoDocumentoPreview && (
                      <div className="mt-2.5 p-1.5 bg-white rounded border inline-block">
                        <p className="text-[10px] text-gray-400 mb-1">Vista previa del documento:</p>
                        <img src={capitan.fotoDocumentoPreview} alt="Doc Capitán" className="max-h-28 rounded shadow-sm border" />
                      </div>
                    )}
                  </div>
                )}
              </div>
            </section>

            {/* SECCIÓN 3: COMPROBANTE DE PAGO ÚNICO */}
            <section className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
              <div className="flex items-center gap-2 mb-1">
                <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-900 text-xs flex items-center justify-center font-black">3</span>
                <h3 className="text-lg font-bold text-blue-950">Comprobante de Pago Único ({CONFIG_TORNEO.pago.monto})</h3>
              </div>
              <p className="text-xs text-gray-500 mb-4">
                Un solo pago por todo el equipo. Adjunta la imagen o PDF legible de la transferencia bancaria.
              </p>

              <div className="border border-dashed border-gray-300 rounded-xl p-4 bg-gray-50/50">
                <input
                  type="file"
                  required
                  accept="image/*,.pdf"
                  className="w-full text-xs text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-blue-900 file:text-white hover:file:bg-blue-800 cursor-pointer"
                  onChange={handleFileChange}
                />

                {comprobantePreview && (
                  <div className="mt-3 p-2 bg-white rounded-lg border inline-block">
                    <p className="text-[11px] text-gray-500 mb-1">Vista previa del comprobante:</p>
                    <img src={comprobantePreview} alt="Comprobante" className="max-h-40 rounded shadow-sm border" />
                  </div>
                )}
              </div>
            </section>

            {/* SECCIÓN 4: PLANTILLA DE JUGADORES */}
            <section className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
              <div className="flex flex-wrap justify-between items-center mb-2 gap-2">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-900 text-xs flex items-center justify-center font-black">4</span>
                  <div>
                    <h3 className="text-lg font-bold text-blue-950">
                      Plantilla de Integrantes ({totalIntegrantesActual} / {CONFIG_TORNEO.plantilla.max})
                    </h3>
                    <p className="text-xs text-gray-500">
                      Mínimo reglamentario: 10 integrantes para jugar. Puedes registrar a los que tengas y completar después.
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setJugadores([])}
                    className="text-xs bg-blue-50 border border-blue-200 hover:bg-blue-100 text-blue-900 px-2.5 py-1.5 rounded-lg font-bold transition shadow-sm"
                  >
                    ⚡ Solo yo por ahora
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const faltan = 9 - jugadores.length;
                      if (faltan > 0) {
                        const nuevos = Array(faltan).fill(null).map(() => ({
                          nombre: "",
                          cuenta: "",
                          correo: "",
                          dni: "",
                          carrera: CONFIG_TORNEO.carreras[0],
                          codigoClase: ""
                        }));
                        setJugadores([...jugadores, ...nuevos]);
                      }
                    }}
                    className="text-xs bg-gray-50 border border-gray-200 hover:bg-gray-100 text-gray-800 px-2.5 py-1.5 rounded-lg font-bold transition shadow-sm"
                  >
                    📋 Plantilla de 10
                  </button>
                  {totalIntegrantesActual < CONFIG_TORNEO.plantilla.max && (
                    <button
                      type="button"
                      onClick={agregarJugador}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition shadow-sm flex items-center gap-1"
                    >
                      + Agregar Fila
                    </button>
                  )}
                </div>
              </div>

              {/* Aviso del Modo Híbrido */}
              {jugadores.length === 0 && (
                <div className="mt-3 p-3.5 bg-blue-50/70 border border-blue-200 rounded-xl text-xs text-blue-900 flex items-center gap-3">
                  <span className="text-2xl">💡</span>
                  <div>
                    <strong>¡Modo Fundación Ágil Seleccionado!</strong>
                    <p className="text-[11px] text-blue-800 mt-0.5">
                      Inscribirás el equipo solo con tus datos de Capitán para apartar de inmediato tu cupo y color. Al finalizar recibirás tu enlace y código de WhatsApp para que tus compañeros se sumen solos desde sus teléfonos.
                    </p>
                  </div>
                </div>
              )}

              <div className="space-y-3 mt-4">
                {/* FILA BLOQUEADA: JUGADOR #1 (CAPITÁN) */}
                <div className="p-3 border-2 border-blue-200 rounded-xl bg-blue-50/40 grid grid-cols-1 md:grid-cols-12 gap-2 items-center">
                  <div className="md:col-span-1 text-center font-black text-xs text-blue-900">
                    #1 (C)
                  </div>
                  <div className="md:col-span-3">
                    <input
                      disabled
                      value={capitan.nombre ? `${capitan.nombre} (Capitán)` : "Nombre del Capitán (Llenar arriba)"}
                      className="w-full border border-blue-200 p-2 rounded text-xs bg-white text-gray-700 font-semibold"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <input
                      disabled
                      value={capitan.cuenta || "Cuenta"}
                      className="w-full border border-blue-200 p-2 rounded text-xs bg-white text-gray-700 font-mono"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <input
                      disabled
                      value={equipo.tipoEquipo === "Docentes" ? "Exento (Docente)" : (capitan.dni || "DNI")}
                      className="w-full border border-blue-200 p-2 rounded text-xs bg-white text-gray-700 font-mono text-[11px]"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <input
                      disabled
                      value={capitan.correo || "correo@unitec.edu"}
                      className="w-full border border-blue-200 p-2 rounded text-xs bg-white text-gray-700 font-mono text-[11px]"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <input
                      disabled
                      value={capitan.carrera}
                      className="w-full border border-blue-200 p-2 rounded text-xs bg-white text-gray-700"
                    />
                  </div>
                </div>

                {/* FILAS DE JUGADORES 2 EN ADELANTE */}
                {jugadores.map((j, i) => (
                  <div key={i} className="p-3 border border-gray-200 rounded-xl bg-gray-50/70 grid grid-cols-1 md:grid-cols-12 gap-2 items-center">
                    <div className="md:col-span-1 text-center font-bold text-xs text-gray-400">
                      #{i + 2}
                    </div>

                    <div className="md:col-span-3">
                      <input
                        required
                        placeholder={`Nombre Jugador ${i + 2} *`}
                        value={j.nombre}
                        className="w-full border border-gray-300 p-2 rounded-lg text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-900"
                        onChange={e => handleJugadorChange(i, "nombre", e.target.value)}
                      />
                    </div>

                    <div className="md:col-span-2">
                      <input
                        required
                        placeholder="N° Cuenta *"
                        value={j.cuenta}
                        className="w-full border border-gray-300 p-2 rounded-lg text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-900 font-mono"
                        onChange={e => handleJugadorChange(i, "cuenta", e.target.value)}
                      />
                    </div>

                    <div className="md:col-span-2">
                      <input
                        placeholder={equipo.tipoEquipo === "Docentes" ? "Docente" : "DNI"}
                        disabled={equipo.tipoEquipo === "Docentes"}
                        value={equipo.tipoEquipo === "Docentes" ? "Exento" : j.dni}
                        className="w-full border border-gray-300 p-2 rounded-lg text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-900 font-mono text-[11px]"
                        onChange={e => handleJugadorChange(i, "dni", e.target.value)}
                      />
                    </div>

                    <div className="md:col-span-2">
                      <input
                        placeholder="Correo @unitec.edu"
                        value={j.correo}
                        className="w-full border border-gray-300 p-2 rounded-lg text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-900 font-mono text-[11px]"
                        onChange={e => handleJugadorChange(i, "correo", e.target.value)}
                      />
                    </div>

                    <div className="md:col-span-2">
                      <select
                        className="w-full border border-gray-300 p-2 rounded-lg text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-900"
                        value={j.carrera}
                        onChange={e => handleJugadorChange(i, "carrera", e.target.value)}
                      >
                        {CONFIG_TORNEO.carreras.map(c => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </div>

                    <div className="md:col-span-1 flex items-center justify-end">
                      <button
                        type="button"
                        onClick={() => eliminarJugador(i)}
                        title="Eliminar este jugador"
                        className="text-red-500 hover:text-red-700 hover:bg-red-50 text-sm font-bold p-1 rounded transition"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* BOTÓN SUBMIT CAPITÁN */}
            <button
              disabled={loading || (resumen && !resumen.inscripcionesAbiertas)}
              type="submit"
              className="w-full bg-blue-950 hover:bg-blue-900 text-white font-bold py-4 rounded-xl text-base sm:text-lg shadow-lg transition disabled:opacity-50"
            >
              {loading ? "Procesando y validando inscripción..." : "Finalizar y Registrar Equipo"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

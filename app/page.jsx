"use client";
import { useState, useEffect, useRef } from "react";
import {
  inscribirEquipo,
  obtenerResumenPublico,
  agregarJugadorConCodigo,
  validarCorreoInstitucional,
  comprimirDocumento
} from "../lib/dbService";
import { CONFIG_TORNEO, esDocenteAutorizado } from "../lib/torneoConfig";
import { obtenerSesionActual, obtenerPerfil, guardarPerfil } from "../lib/authService";
import Link from "next/link";

export default function Registro() {
  const [resumen, setResumen] = useState(null);
  const [rolSeleccionado, setRolSeleccionado] = useState("capitan"); // "capitan" | "jugador"
  const [sesion, setSesion] = useState(null);
  const [pasoJugador, setPasoJugador] = useState(1);
  const [pasoCapitan, setPasoCapitan] = useState(1);
  const jugadorFormRef = useRef(null);
  const capitanFormRef = useRef(null);

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
    nombreClase: "",
    codigoClase: ""
  });

  const [equipo, setEquipo] = useState({
    nombre: "",
    tipoEquipo: "Estudiantes",
    docente: CONFIG_TORNEO.docentes[0],
    categoria: "Masculino",
    color: "",
    cantidadClases: 1,
    clasesRepresentadas: [
      { nombre: "", codigo: "" },
      { nombre: "", codigo: "" }
    ]
  });

  // Por defecto empezamos con lista vacía (Modo Fundación Ágil Recomendado)
  const [jugadores, setJugadores] = useState([]);

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
    nombreClase: "",
    codigoClase: ""
  });
  const [loadingJugador, setLoadingJugador] = useState(false);
  const [mensajeJugador, setMensajeJugador] = useState("");
  const [resultadoJugador, setResultadoJugador] = useState(null);

  useEffect(() => {
    cargarResumen();
    sincronizarSesion();
    const handleAuth = () => {
      sincronizarSesion();
      cargarResumen();
    };
    window.addEventListener("mecafut_auth_change", handleAuth);
    return () => window.removeEventListener("mecafut_auth_change", handleAuth);
  }, []);

  const sincronizarSesion = () => {
    const s = obtenerSesionActual();
    setSesion(s);
    if (s) {
      if (s.correo) {
        setCapitan(prev => ({ ...prev, correo: s.correo }));
        setJugadorSelf(prev => ({ ...prev, correo: s.correo }));
      }
      if (s.rol === "docente") {
        setEquipo(prev => ({ ...prev, tipoEquipo: "Docentes", docente: s.nombre || prev.docente }));
        setCapitan(prev => ({ ...prev, nombre: s.nombre || prev.nombre }));
      } else if (!s.esDocente && !s.esAdmin) {
        setEquipo(prev => ({ ...prev, tipoEquipo: "Estudiantes" }));
      }
      // Autocompletar con el perfil guardado en la cuenta (solo campos vacíos)
      if (s.correo) {
        obtenerPerfil(s.correo).then(p => {
          if (!p) return;
          const rellenar = prev => ({
            ...prev,
            nombre: prev.nombre || p.nombre || "",
            cuenta: prev.cuenta || p.cuenta || "",
            dni: prev.dni || p.dni || "",
            carrera: p.carrera || prev.carrera,
            nombreClase: prev.nombreClase || p.nombre_clase || "",
            codigoClase: prev.codigoClase || p.codigo_clase || "",
            fotoDocumento: prev.fotoDocumento || p.foto_documento || null,
            fotoDocumentoPreview: prev.fotoDocumentoPreview || p.foto_documento || null,
            tipoDocumento: p.tipo_documento || prev.tipoDocumento
          });
          setCapitan(prev => ({ ...rellenar(prev), telefono: prev.telefono || p.telefono || "" }));
          setJugadorSelf(rellenar);
        });
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
    } catch (err) {
      console.error("Error cargando resumen de cupos:", err);
    }
  };

  const handleJugadorChange = (index, fieldOrUpdates, value) => {
    setJugadores(prev => {
      const nuevos = [...prev];
      if (!nuevos[index]) return prev;
      if (typeof fieldOrUpdates === "object" && fieldOrUpdates !== null) {
        nuevos[index] = { ...nuevos[index], ...fieldOrUpdates };
      } else {
        nuevos[index] = { ...nuevos[index], [fieldOrUpdates]: value };
      }
      return nuevos;
    });
  };

  const agregarJugador = () => {
    setJugadores(prev => {
      const maxPermitido = resumen?.maxJugadoresPorEquipo || CONFIG_TORNEO.plantilla.max;
      if (prev.length + 1 >= maxPermitido) return prev;
      return [
        ...prev,
        {
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
        }
      ];
    });
  };

  const eliminarJugador = (index) => {
    setJugadores(prev => prev.filter((_, i) => i !== index));
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
      const clasesLimpias = (equipo.clasesRepresentadas || [])
        .slice(0, equipo.cantidadClases || 1)
        .map(c => ({
          nombre: (c.nombre || "").trim(),
          codigo: (c.codigo || "").trim().toUpperCase()
        }));

      if (clasesLimpias.some(c => !c.nombre || !c.codigo)) {
        throw new Error("Debes indicar el nombre y código de cada clase que el equipo representa.");
      }

      if (!capitan.nombreClase?.trim() || !capitan.codigoClase?.trim()) {
        throw new Error("El nombre y código de la clase del Capitán son obligatorios.");
      }

      const res = await inscribirEquipo({
        equipo: {
          ...equipo,
          clasesRepresentadas: clasesLimpias
        },
        capitan: {
          ...capitan,
          correo: sesion?.correo || capitan.correo
        },
        jugadores,
        comprobanteFile: comprobante
      });

      setResultado(res);
      setMensaje("¡Inscripción registrada con éxito!");
      guardarPerfil(obtenerSesionActual()?.correo, capitan);
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
        throw new Error("Por favor ingresa el código de 8 dígitos del equipo al que deseas unirte.");
      }

      if (!jugadorSelf.nombreClase?.trim() || !jugadorSelf.codigoClase?.trim()) {
        throw new Error("El nombre y código de la clase son obligatorios.");
      }

      const res = await agregarJugadorConCodigo(
        codigoEquipoElegido.trim(),
        {
          ...jugadorSelf,
          correo: sesion?.correo || jugadorSelf.correo
        },
        { esAutoRegistro: true }
      );
      setResultadoJugador(res);
      setMensajeJugador("¡Te has unido exitosamente al equipo!");
      guardarPerfil(obtenerSesionActual()?.correo, jugadorSelf);
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
  const cupoMascLleno = (resumen?.masculinoOcupados || 0) >= CONFIG_TORNEO.cupos.masculino;
  const cupoFemLleno = (resumen?.femeninoOcupados || 0) >= CONFIG_TORNEO.cupos.femenino;

  return (
    <div className="page-shell max-w-4xl pb-20">
      {/* Indicador de Estado del Torneo & Modo */}
      <div className="mb-6 p-3 bg-blue-50 border border-blue-200 rounded-xl flex flex-wrap items-center justify-between text-xs sm:text-sm text-blue-900 gap-2">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
          <span>
            <strong>Servidor Oficial en Línea</strong> — Torneo {CONFIG_TORNEO.periodo}
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
            El comité organizador de MECAFUT ha cerrado las inscripciones reglamentarias (límite alcanzado o fecha límite cumplida). Puedes consultar tu equipo registrado en <strong>Consultar Código</strong> o ver los cruces en <strong>Torneo en Vivo</strong>.
          </p>
        </div>
      )}

      {/* Título Principal */}
      <div className="page-intro">
        <p className="page-kicker">Inscripciones abiertas · Temporada {CONFIG_TORNEO.periodo}</p>
        <h1 className="page-heading">{CONFIG_TORNEO.titulo}</h1>
        <p className="page-description">{CONFIG_TORNEO.subtitulo}</p>
      </div>

      {/* Monitor de Cupos Oficiales (Masculino 12 / Femenino 4 - Sin Lista de Espera) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <div className={`p-4 rounded-xl border transition ${
          cupoMascLleno ? "bg-red-50 border-red-300" : "bg-white border-gray-200 shadow-sm"
        }`}>
          <div className="flex justify-between items-center">
            <div>
              <span className="text-xs uppercase font-bold text-gray-500">Cupos Categoría Masculina</span>
              <h3 className="text-2xl font-black text-blue-950">
                {resumen ? `${resumen.masculinoOcupados} / ${CONFIG_TORNEO.cupos.masculino}` : "Cargando..."}
              </h3>
            </div>
            <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
              cupoMascLleno ? "bg-red-200 text-red-900" : "bg-emerald-100 text-emerald-800"
            }`}>
              {cupoMascLleno ? "Cupo Agotado (12/12)" : "Disponibles"}
            </span>
          </div>
          <p className="text-[11px] text-gray-500 mt-2">
            Únicamente participarán los primeros 12 equipos creados. No hay cupos adicionales.
          </p>
        </div>

        <div className={`p-4 rounded-xl border transition ${
          cupoFemLleno ? "bg-red-50 border-red-300" : "bg-white border-gray-200 shadow-sm"
        }`}>
          <div className="flex justify-between items-center">
            <div>
              <span className="text-xs uppercase font-bold text-gray-500">Cupos Categoría Femenina</span>
              <h3 className="text-2xl font-black text-blue-950">
                {resumen ? `${resumen.femeninoOcupados} / ${CONFIG_TORNEO.cupos.femenino}` : "Cargando..."}
              </h3>
            </div>
            <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
              cupoFemLleno ? "bg-red-200 text-red-900" : "bg-purple-100 text-purple-900"
            }`}>
              {cupoFemLleno ? "Cupo Lleno" : "Disponibles"}
            </span>
          </div>
          <p className="text-[11px] text-gray-500 mt-2">
            3 equipos: Triangular + Gran Final • 4 equipos: Semifinales + Gran Final.
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
              setPasoCapitan(1);
              setMensaje("");
              setMensajeJugador("");
            }}
            aria-pressed={rolSeleccionado === "capitan"}
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
              setPasoJugador(1);
              setMensaje("");
              setMensajeJugador("");
            }}
            aria-pressed={rolSeleccionado === "jugador"}
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
            <div className="bg-emerald-50 border-2 border-emerald-400 p-6 rounded-2xl text-center shadow-sm" role="status">
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
            <div className="state-message state-message--error text-sm font-bold text-center" role="alert">
              {mensajeJugador}
            </div>
          )}

          <form ref={jugadorFormRef} onSubmit={onSubmitJugador} className="surface-card p-5 sm:p-8 space-y-5">
            <div>
              <h2 className="text-lg font-black text-blue-950 flex items-center gap-2">
                <span aria-hidden="true">⚽</span> Inscripción individual
              </h2>
              <p className="text-xs text-gray-500">
                Selecciona tu equipo e introduce tus datos académicos institucionales para sumarte a la plantilla.
              </p>
            </div>

            <ol className="wizard-steps wizard-steps--two" aria-label="Pasos de inscripción individual">
              <li className="wizard-step" aria-current={pasoJugador === 1 ? "step" : undefined}>
                <span className="wizard-step__number">1</span>Equipo
              </li>
              <li className="wizard-step" aria-current={pasoJugador === 2 ? "step" : undefined}>
                <span className="wizard-step__number">2</span>Tus datos y documento
              </li>
            </ol>

            {/* Selector de Equipo */}
            {pasoJugador === 1 && <div data-wizard-panel>
              <label htmlFor="registro-codigo-equipo" className="block text-xs font-semibold text-gray-700 mb-1">
                Código de 8 dígitos de tu equipo *
              </label>
              <input
                id="registro-codigo-equipo"
                required
                maxLength={8}
                placeholder="Ingresa el código compartido por tu capitán"
                className="w-full border border-gray-300 p-2.5 rounded-lg text-sm font-mono tracking-widest text-center text-lg font-bold focus:ring-2 focus:ring-blue-900 focus:outline-none"
                value={codigoEquipoElegido}
                onChange={e => setCodigoEquipoElegido(e.target.value.trim())}
              />
              <p className="text-[11px] text-gray-500 mt-1">
                Pídele a tu capitán el código de 8 dígitos de tu equipo para sumarte a la plantilla.
              </p>
            </div>}

            {/* Datos Personales */}
            {pasoJugador === 2 && (
              <>
              <aside className="registration-summary" aria-label="Resumen de incorporación">
                <strong>Equipo al que te unirás</strong>
                <span>Código de acceso: <b className="font-mono">{codigoEquipoElegido || "Pendiente"}</b></span>
              </aside>
              <div data-wizard-panel className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-gray-100">
              <div>
                <label htmlFor="registro-nombre" className="block text-xs font-semibold text-gray-700 mb-1">Nombre Completo *</label>
                <input
                  id="registro-nombre"
                  required
                  placeholder="Tu Nombre y Apellido"
                  className="w-full border border-gray-300 p-2.5 rounded-lg text-sm focus:ring-2 focus:ring-blue-900 focus:outline-none"
                  value={jugadorSelf.nombre}
                  onChange={e => setJugadorSelf({ ...jugadorSelf, nombre: e.target.value })}
                />
              </div>

              <div>
                <label htmlFor="registro-cuenta" className="block text-xs font-semibold text-gray-700 mb-1">N° de Cuenta Estudiantil *</label>
                <input
                  id="registro-cuenta"
                  required
                  placeholder="Ej. 20221004321"
                  className="w-full border border-gray-300 p-2.5 rounded-lg text-sm focus:ring-2 focus:ring-blue-900 focus:outline-none font-mono"
                  value={jugadorSelf.cuenta}
                  onChange={e => setJugadorSelf({ ...jugadorSelf, cuenta: e.target.value })}
                />
              </div>

              <div>
                <label htmlFor="registro-dni" className="block text-xs font-semibold text-gray-700 mb-1">
                  N° de Identidad (DNI) *
                </label>
                <input
                  id="registro-dni"
                  required
                  placeholder="Ej. 0801-2003-54321"
                  className="w-full border border-gray-300 p-2.5 rounded-lg text-sm focus:ring-2 focus:ring-blue-900 focus:outline-none font-mono"
                  value={jugadorSelf.dni}
                  onChange={e => setJugadorSelf({ ...jugadorSelf, dni: e.target.value })}
                />
                <p className="text-[10px] text-gray-400 mt-0.5">Se cotejará con tu carnet físico en la mesa.</p>
              </div>

              <div>
                <label htmlFor="registro-correo" className="block text-xs font-semibold text-gray-700 mb-1">Correo Institucional (@unitec.edu) *</label>
                <input
                  id="registro-correo"
                  required
                  type="email"
                  readOnly
                  disabled
                  placeholder="tu.nombre@unitec.edu"
                  className="w-full border border-gray-300 p-2.5 rounded-lg text-sm font-mono bg-gray-100 text-gray-600 cursor-not-allowed select-none"
                  value={sesion?.correo || jugadorSelf.correo}
                />
                <p className="text-[10px] text-gray-400 mt-0.5">Asociado permanentemente a tu cuenta activa.</p>
              </div>

              <div>
                <label htmlFor="registro-carrera" className="block text-xs font-semibold text-gray-700 mb-1">Carrera *</label>
                <select
                  id="registro-carrera"
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
                <label htmlFor="registro-documento" className="block text-xs font-bold text-blue-950 uppercase mb-1">
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
                    <span>🪪 Carnet Universitario</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer font-semibold text-blue-950">
                    <input
                      type="radio"
                      name="tipoDocSelf"
                      value="hoja_confirmacion"
                      checked={jugadorSelf.tipoDocumento === "hoja_confirmacion"}
                      onChange={() => setJugadorSelf({ ...jugadorSelf, tipoDocumento: "hoja_confirmacion" })}
                    />
                    <span>📄 Hoja de Matrícula (Portal)</span>
                  </label>
                </div>
                <input
                  id="registro-documento"
                  type="file"
                  required={!jugadorSelf.fotoDocumento}
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

              <div>
                <label htmlFor="registro-clase" className="block text-xs font-semibold text-gray-700 mb-1">Nombre de la Clase *</label>
                <input
                  id="registro-clase"
                  required
                  placeholder="Ej. Robótica Industrial"
                  className="w-full border border-gray-300 p-2.5 rounded-lg text-sm focus:ring-2 focus:ring-blue-900 focus:outline-none"
                  value={jugadorSelf.nombreClase || ""}
                  onChange={e => setJugadorSelf({ ...jugadorSelf, nombreClase: e.target.value })}
                />
              </div>

              <div>
                <label htmlFor="registro-codigo-clase" className="block text-xs font-semibold text-gray-700 mb-1">Código de la Clase *</label>
                <input
                  id="registro-codigo-clase"
                  required
                  placeholder="Ej. MEC308"
                  className="w-full border border-gray-300 p-2.5 rounded-lg text-sm focus:ring-2 focus:ring-blue-900 focus:outline-none uppercase font-mono"
                  value={jugadorSelf.codigoClase || ""}
                  onChange={e => setJugadorSelf({ ...jugadorSelf, codigoClase: e.target.value.toUpperCase() })}
                />
                <p className="text-[10px] text-gray-400 mt-0.5">Debe coincidir con una de las clases representadas por tu equipo.</p>
              </div>
              </div>
              </>
            )}

            <div className="wizard-controls">
              {pasoJugador > 1 ? (
                <button type="button" className="secondary-action" onClick={() => setPasoJugador(1)}>
                  Anterior
                </button>
              ) : <span />}
              {pasoJugador < 2 ? (
                <button
                  type="button"
                  className="primary-action"
                  onClick={() => {
                    if (jugadorFormRef.current?.reportValidity()) setPasoJugador(2);
                  }}
                >
                  Siguiente
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={loadingJugador || (resumen && !resumen.inscripcionesAbiertas)}
                  className="primary-action"
                >
                  {loadingJugador ? "Validando e incorporando a la plantilla..." : "Confirmar mi registro"}
                </button>
              )}
            </div>
          </form>
        </div>
      )}

      {/* ============================================================ */}
      {/* VISTA 2: SOY CAPITÁN (CREACIÓN COMPLETA DE EQUIPO)             */}
      {/* ============================================================ */}
      {rolSeleccionado === "capitan" && (
        <div>
          {/* Tarjeta de Éxito Capitán */}
          {resultado && (
            <div className="bg-emerald-50 border-2 border-emerald-400 p-6 sm:p-8 rounded-2xl mb-8 shadow-sm" role="status">
              <div className="text-center">
                <span className="text-4xl">🎉</span>
                <h3 className="text-2xl font-extrabold text-emerald-950 mt-2">¡Equipo Registrado Exitosamente!</h3>
                
                <div className="inline-block my-3">
                  <span className="text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider bg-blue-100 text-blue-800 border border-blue-300">
                    Estado: Pendiente de Validación de Pago
                  </span>
                </div>

                <p className="text-xs sm:text-sm text-emerald-900 max-w-md mx-auto">
                  Tu comprobante será revisado por el comité organizador para otorgar la confirmación definitiva.
                </p>
              </div>

              <div className="bg-white border border-emerald-200 rounded-xl p-4 my-6 text-center max-w-md mx-auto">
                <span className="text-xs uppercase text-gray-400 font-semibold tracking-wider">Código de Acceso de tu Equipo</span>
                <div className="text-4xl font-mono font-black text-blue-950 tracking-widest my-1">
                  {resultado.codigoAcceso}
                </div>
                <p className="text-[11px] text-gray-500">
                  Comparte este código con tus compañeros para que se sumen personalmente desde su cuenta:
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
                  href={resumen?.whatsappCapitanesUrl || CONFIG_TORNEO.whatsappCapitanesUrl}
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
            <div className="mb-6 state-message state-message--error text-sm font-bold text-center" role="alert">
              {mensaje}
            </div>
          )}

          {/* FORMULARIO DE CAPITÁN */}
          <form ref={capitanFormRef} onSubmit={onSubmitCapitan} className="space-y-6">
            <ol className="wizard-steps" aria-label="Pasos para registrar un equipo">
              <li className="wizard-step" aria-current={pasoCapitan === 1 ? "step" : undefined}><span className="wizard-step__number">1</span>Equipo</li>
              <li className="wizard-step" aria-current={pasoCapitan === 2 ? "step" : undefined}><span className="wizard-step__number">2</span>Capitán</li>
              <li className="wizard-step" aria-current={pasoCapitan === 3 ? "step" : undefined}><span className="wizard-step__number">3</span>Pago</li>
              <li className="wizard-step" aria-current={pasoCapitan === 4 ? "step" : undefined}><span className="wizard-step__number">4</span>Plantilla</li>
            </ol>

            {/* SECCIÓN 1: DATOS DEL EQUIPO */}
            {pasoCapitan === 1 && (
            <section className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
              <div className="flex items-center gap-2 mb-1">
                <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-900 text-xs flex items-center justify-center font-black">1</span>
                <h3 className="text-lg font-bold text-blue-950">Datos del Equipo y Uniforme</h3>
              </div>
              <p className="text-xs text-gray-500 mb-4">Elige nombre único, categoría y reserva tu color de uniforme (hasta 2 equipos por color)</p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="team-name" className="block text-xs font-semibold text-gray-700 mb-1">Nombre del Equipo *</label>
                  <input
                    id="team-name"
                    required
                    placeholder="Ej. Mecatrónicos FC"
                    className="w-full border border-gray-300 p-2.5 rounded-lg text-sm focus:ring-2 focus:ring-blue-900 focus:outline-none"
                    value={equipo.nombre}
                    onChange={e => setEquipo({ ...equipo, nombre: e.target.value })}
                  />
                </div>

                <div>
                  <label htmlFor="team-category" className="block text-xs font-semibold text-gray-700 mb-1">Categoría *</label>
                  <select
                    id="team-category"
                    className="w-full border border-gray-300 p-2.5 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-900 focus:outline-none font-bold text-blue-950"
                    value={equipo.categoria}
                    onChange={e => setEquipo({ ...equipo, categoria: e.target.value })}
                  >
                    <option value="Masculino">Masculino (Cupo oficial: 12 equipos)</option>
                    <option value="Femenino">Femenino (Cupo oficial: 4 equipos)</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="team-type" className="block text-xs font-semibold text-gray-700 mb-1">Tipo de Equipo *</label>
                  <select
                    id="team-type"
                    className="w-full border border-gray-300 p-2.5 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-900 focus:outline-none"
                    value={equipo.tipoEquipo}
                    onChange={e => setEquipo({ ...equipo, tipoEquipo: e.target.value })}
                  >
                    <option value="Estudiantes">Estudiantes</option>
                    <option value="Docentes" disabled={Boolean(sesion && !sesion.esDocente && !sesion.esAdmin)}>
                      Docentes / Colaboradores
                    </option>
                  </select>
                </div>

                <div>
                  <label htmlFor="team-advisor" className="block text-xs font-semibold text-gray-700 mb-1">Docente / Ingeniero que Representa *</label>
                  <select
                    id="team-advisor"
                    className="w-full border border-gray-300 p-2.5 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-900 focus:outline-none"
                    value={equipo.docente}
                    onChange={e => setEquipo({ ...equipo, docente: e.target.value })}
                  >
                    {CONFIG_TORNEO.docentes.map(d => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>

                {/* Clases Representadas (1 o 2 clases) */}
                <div className="md:col-span-2 pt-2 border-t border-gray-100">
                  <div className="flex flex-wrap items-center justify-between mb-2">
                    <label className="block text-xs font-bold text-blue-950 uppercase">
                      Clases Representadas por el Equipo *
                    </label>
                    <div className="flex items-center gap-2 text-xs">
                      <label htmlFor="team-class-count" className="text-gray-500 font-medium">¿Cuántas clases representan?</label>
                      <select
                        id="team-class-count"
                        value={equipo.cantidadClases || 1}
                        onChange={e => {
                          const n = parseInt(e.target.value, 10);
                          setEquipo(prev => ({
                            ...prev,
                            cantidadClases: n,
                            clasesRepresentadas: prev.clasesRepresentadas?.length >= n
                              ? prev.clasesRepresentadas
                              : [...(prev.clasesRepresentadas || []), { nombre: "", codigo: "" }]
                          }));
                        }}
                        className="border border-gray-300 rounded px-2 py-0.5 font-bold text-blue-950 bg-white"
                      >
                        <option value={1}>1 Clase</option>
                        <option value={2}>2 Clases (Alianza / Fusión)</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="p-3 bg-blue-50/50 rounded-xl border border-blue-100 space-y-2">
                      <span className="text-[11px] font-bold text-blue-900 block">Clase Principal #1 *</span>
                      <input
                        aria-label="Nombre de la clase principal"
                        required
                        placeholder="Nombre de la clase (Ej. Robótica Industrial)"
                        className="w-full border border-gray-300 p-2 rounded-lg text-xs bg-white focus:ring-1 focus:ring-blue-900 focus:outline-none"
                        value={equipo.clasesRepresentadas?.[0]?.nombre || ""}
                        onChange={e => {
                          const val = e.target.value;
                          setEquipo(prev => {
                            const arr = [...(prev.clasesRepresentadas || [{ nombre: "", codigo: "" }])];
                            arr[0] = { ...arr[0], nombre: val };
                            return { ...prev, clasesRepresentadas: arr };
                          });
                        }}
                      />
                      <input
                        aria-label="Código de la clase principal"
                        required
                        placeholder="Código de la clase (Ej. MEC308)"
                        className="w-full border border-gray-300 p-2 rounded-lg text-xs font-mono uppercase bg-white focus:ring-1 focus:ring-blue-900 focus:outline-none"
                        value={equipo.clasesRepresentadas?.[0]?.codigo || ""}
                        onChange={e => {
                          const val = e.target.value.toUpperCase();
                          setEquipo(prev => {
                            const arr = [...(prev.clasesRepresentadas || [{ nombre: "", codigo: "" }])];
                            arr[0] = { ...arr[0], codigo: val };
                            return { ...prev, clasesRepresentadas: arr };
                          });
                        }}
                      />
                    </div>

                    {(equipo.cantidadClases || 1) === 2 && (
                      <div className="p-3 bg-purple-50/50 rounded-xl border border-purple-100 space-y-2">
                        <span className="text-[11px] font-bold text-purple-900 block">Segunda Clase #2 *</span>
                        <input
                          aria-label="Nombre de la segunda clase"
                          required
                          placeholder="Nombre de la clase (Ej. Control Automático)"
                          className="w-full border border-gray-300 p-2 rounded-lg text-xs bg-white focus:ring-1 focus:ring-blue-900 focus:outline-none"
                          value={equipo.clasesRepresentadas?.[1]?.nombre || ""}
                          onChange={e => {
                            const val = e.target.value;
                            setEquipo(prev => {
                              const arr = [...(prev.clasesRepresentadas || [{}, {}])];
                              arr[1] = { ...arr[1], nombre: val };
                              return { ...prev, clasesRepresentadas: arr };
                            });
                          }}
                        />
                        <input
                          aria-label="Código de la segunda clase"
                          required
                          placeholder="Código de la clase (Ej. MEC310)"
                          className="w-full border border-gray-300 p-2 rounded-lg text-xs font-mono uppercase bg-white focus:ring-1 focus:ring-blue-900 focus:outline-none"
                          value={equipo.clasesRepresentadas?.[1]?.codigo || ""}
                          onChange={e => {
                            const val = e.target.value.toUpperCase();
                            setEquipo(prev => {
                              const arr = [...(prev.clasesRepresentadas || [{}, {}])];
                              arr[1] = { ...arr[1], codigo: val };
                              return { ...prev, clasesRepresentadas: arr };
                            });
                          }}
                        />
                      </div>
                    )}
                  </div>
                </div>

                {/* Selector Visual de Color de Uniforme */}
                <div className="md:col-span-2 pt-2">
                  <label className="block text-xs font-semibold text-gray-700 mb-2">
                    Color de Uniforme * <span className="font-normal text-gray-500">(Máximo 2 equipos por color en todo el torneo)</span>
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
                          aria-pressed={estaSeleccionado}
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
            )}

            {/* SECCIÓN 2: DATOS DEL CAPITÁN (JUGADOR #1) */}
            {pasoCapitan === 2 && (
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
                El Capitán es el representante oficial ante el torneo y forma parte de la plantilla automáticamente.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label htmlFor="captain-name" className="block text-xs font-semibold text-gray-700 mb-1">Nombre Completo *</label>
                  <input
                    id="captain-name"
                    required
                    placeholder="Ej. Diego Ramos"
                    className="w-full border border-gray-300 p-2.5 rounded-lg text-sm focus:ring-2 focus:ring-blue-900 focus:outline-none"
                    value={capitan.nombre}
                    onChange={e => setCapitan({ ...capitan, nombre: e.target.value })}
                  />
                </div>

                <div>
                  <label htmlFor="captain-account" className="block text-xs font-semibold text-gray-700 mb-1">N° de Cuenta Estudiantil *</label>
                  <input
                    id="captain-account"
                    required
                    placeholder="Ej. 20211005555"
                    className="w-full border border-gray-300 p-2.5 rounded-lg text-sm focus:ring-2 focus:ring-blue-900 focus:outline-none font-mono"
                    value={capitan.cuenta}
                    onChange={e => setCapitan({ ...capitan, cuenta: e.target.value })}
                  />
                </div>

                {!(sesion?.esDocente && equipo.tipoEquipo === "Docentes") && (
                  <div>
                    <label htmlFor="captain-dni" className="block text-xs font-semibold text-gray-700 mb-1">
                      N° de Identidad (DNI) *
                    </label>
                    <input
                      id="captain-dni"
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
                  <label htmlFor="captain-email" className="block text-xs font-semibold text-gray-700 mb-1">Correo Institucional (@unitec.edu) *</label>
                  <input
                    id="captain-email"
                    required
                    type="email"
                    readOnly
                    disabled
                    placeholder="nombre@unitec.edu"
                    className="w-full border border-gray-300 p-2.5 rounded-lg text-sm font-mono bg-gray-100 text-gray-600 cursor-not-allowed select-none"
                    value={sesion?.correo || capitan.correo}
                  />
                  <p className="text-[10px] text-gray-400 mt-0.5">Asociado permanentemente a tu cuenta activa.</p>
                </div>

                <div>
                  <label htmlFor="captain-phone" className="block text-xs font-semibold text-gray-700 mb-1">Teléfono WhatsApp *</label>
                  <input
                    id="captain-phone"
                    required
                    type="tel"
                    placeholder="Ej. 9988-7766"
                    className="w-full border border-gray-300 p-2.5 rounded-lg text-sm focus:ring-2 focus:ring-blue-900 focus:outline-none"
                    value={capitan.telefono}
                    onChange={e => setCapitan({ ...capitan, telefono: e.target.value })}
                  />
                </div>

                <div>
                  <label htmlFor="captain-career" className="block text-xs font-semibold text-gray-700 mb-1">Carrera *</label>
                  <select
                    id="captain-career"
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
                  <label htmlFor="captain-class-name" className="block text-xs font-semibold text-gray-700 mb-1">Nombre de tu Clase *</label>
                  <input
                    id="captain-class-name"
                    required
                    placeholder="Ej. Robótica Industrial"
                    className="w-full border border-gray-300 p-2.5 rounded-lg text-sm focus:ring-2 focus:ring-blue-900 focus:outline-none"
                    value={capitan.nombreClase || ""}
                    onChange={e => setCapitan({ ...capitan, nombreClase: e.target.value })}
                  />
                </div>

                <div>
                  <label htmlFor="captain-class-code" className="block text-xs font-semibold text-gray-700 mb-1">Código de tu Clase *</label>
                  <input
                    id="captain-class-code"
                    required
                    placeholder="Ej. MEC308"
                    className="w-full border border-gray-300 p-2.5 rounded-lg text-sm focus:ring-2 focus:ring-blue-900 focus:outline-none uppercase font-mono"
                    value={capitan.codigoClase || ""}
                    onChange={e => setCapitan({ ...capitan, codigoClase: e.target.value.toUpperCase() })}
                  />
                  <p className="text-[10px] text-gray-400 mt-0.5">Debe ser una de las clases del equipo.</p>
                </div>

                {/* Documento de Verificación Estudiantil del Capitán */}
                {!(sesion?.esDocente && equipo.tipoEquipo === "Docentes") && (
                  <div className="md:col-span-3 pt-3 border-t border-gray-100 bg-blue-50/40 p-3.5 rounded-xl border border-blue-100">
                    <label htmlFor="captain-document" className="block text-xs font-bold text-blue-950 uppercase mb-1">
                      Foto de Documento Estudiantil del Capitán *
                    </label>
                    <p className="text-[11px] text-gray-500 mb-2">
                      Sube foto de tu carnet universitario o confirmación de matrícula (portal UNITEC):
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
                        <span>🪪 Carnet Universitario</span>
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer font-semibold text-blue-950">
                        <input
                          type="radio"
                          name="tipoDocCapitan"
                          value="hoja_confirmacion"
                          checked={capitan.tipoDocumento === "hoja_confirmacion"}
                          onChange={() => setCapitan({ ...capitan, tipoDocumento: "hoja_confirmacion" })}
                        />
                        <span>📄 Hoja de Matrícula (Portal)</span>
                      </label>
                    </div>
                    <input
                      id="captain-document"
                      type="file"
                      required={!capitan.fotoDocumento}
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
            )}

            {/* SECCIÓN 3: COMPROBANTE DE PAGO ÚNICO */}
            {pasoCapitan === 3 && (
            <section className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
              <div className="flex items-center gap-2 mb-1">
                <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-900 text-xs flex items-center justify-center font-black">3</span>
                <h3 className="text-lg font-bold text-blue-950">Comprobante de Pago Único ({CONFIG_TORNEO.pago.monto})</h3>
              </div>
              <p className="text-xs text-gray-500 mb-4">
                Un solo pago por todo el equipo. Cuenta BAC: <strong>{CONFIG_TORNEO.pago.numeroCuenta}</strong>.
              </p>

              <div className="border border-dashed border-gray-300 rounded-xl p-4 bg-gray-50/50">
                <label htmlFor="payment-receipt" className="sr-only">Comprobante de pago del equipo</label>
                <input
                  id="payment-receipt"
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
            )}

            {/* SECCIÓN 4: PLANTILLA DE JUGADORES */}
            {pasoCapitan === 4 && (
            <section className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
              <aside className="registration-summary" aria-label="Resumen de inscripción del equipo">
                <strong>Resumen de inscripción</strong>
                <span>Equipo: <b>{equipo.nombre}</b></span>
                <span>Categoría: <b>{equipo.categoria}</b></span>
                <span>Uniforme: <b>{equipo.color || "Por seleccionar"}</b></span>
                <span>Capitán: <b>{capitan.nombre}</b></span>
                <span>Comprobante: <b>{comprobante ? "Adjunto" : "Pendiente"}</b></span>
                <span>Integrantes agregados: <b>{totalIntegrantesActual}</b></span>
              </aside>
              <div className="flex flex-wrap justify-between items-center mb-2 gap-2">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-900 text-xs flex items-center justify-center font-black">4</span>
                  <div>
                    <h3 className="text-lg font-bold text-blue-950">
                      Plantilla de Integrantes ({totalIntegrantesActual} / {resumen?.maxJugadoresPorEquipo || CONFIG_TORNEO.plantilla.max})
                    </h3>
                    <p className="text-xs text-gray-500">
                      Reglamento: Mínimo 8 integrantes (7 campo + 1 arquero), máximo {resumen?.maxJugadoresPorEquipo || CONFIG_TORNEO.plantilla.max} por equipo.
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
                  {totalIntegrantesActual < (resumen?.maxJugadoresPorEquipo || CONFIG_TORNEO.plantilla.max) && (
                    <button
                      type="button"
                      onClick={agregarJugador}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition shadow-sm flex items-center gap-1"
                    >
                      + Agregar Fila Manual
                    </button>
                  )}
                </div>
              </div>

              {/* Banner de Recomendación al Capitán (Requisito 5) */}
              <div className="mt-3 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-2xl text-xs text-blue-950 flex items-start gap-3 shadow-sm">
                <span className="text-2xl">💡</span>
                <div className="space-y-1">
                  <strong className="text-sm font-black text-blue-950 block">
                    Recomendación Oficial de Registro:
                  </strong>
                  <p className="text-xs text-blue-900 leading-relaxed">
                    Te sugerimos inscribir el equipo solo con tus datos de Capitán para <strong>asegurar inmediatamente tu cupo y color</strong>. Al registrarte recibirás tu código de equipo para que tus compañeros ingresen personalmente con su cuenta y suban su propio carnet.
                  </p>
                  <p className="text-[11px] text-gray-500">
                    * Si decides agregarlos tú mismo manualmente, puedes adjuntar su carnet de una vez o el sistema se lo exigirá a ellos en cuanto inicien sesión.
                  </p>
                </div>
              </div>

              <div className="space-y-3 mt-4">
                {/* FILA BLOQUEADA: JUGADOR #1 (CAPITÁN) */}
                <div className="p-3 border-2 border-blue-200 rounded-xl bg-blue-50/40 grid grid-cols-1 md:grid-cols-12 gap-2 items-center">
                  <div className="md:col-span-1 text-center font-black text-xs text-blue-900">
                    #1 (C)
                  </div>
                  <div className="md:col-span-3">
                    <input
                      disabled
                      aria-label="Nombre de la persona capitana"
                      value={capitan.nombre ? `${capitan.nombre} (Capitán)` : "Nombre del Capitán"}
                      className="w-full border border-blue-200 p-2 rounded text-xs bg-white text-gray-700 font-semibold"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <input
                      disabled
                      aria-label="Número de cuenta de la persona capitana"
                      value={capitan.cuenta || "Cuenta"}
                      className="w-full border border-blue-200 p-2 rounded text-xs bg-white text-gray-700 font-mono"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <input
                      disabled
                      aria-label="Documento de identidad de la persona capitana"
                      value={sesion?.esDocente && equipo.tipoEquipo === "Docentes" ? "Exento (Docente)" : (capitan.dni || "DNI")}
                      className="w-full border border-blue-200 p-2 rounded text-xs bg-white text-gray-700 font-mono text-[11px]"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <input
                      disabled
                      aria-label="Correo de la persona capitana"
                      value={capitan.correo || "correo@unitec.edu"}
                      className="w-full border border-blue-200 p-2 rounded text-xs bg-white text-gray-700 font-mono text-[11px]"
                    />
                  </div>
                  <div className="md:col-span-2 text-center text-xs font-bold text-emerald-700">
                    {sesion?.esDocente && equipo.tipoEquipo === "Docentes"
                      ? "👨‍🏫 Docente Exento"
                      : capitan.fotoDocumento
                      ? "🪪 Carnet Listo"
                      : "⚠️ Subir arriba"}
                  </div>
                </div>

                {/* FILAS DE JUGADORES 2 EN ADELANTE (AGREGADAS MANUALMENTE) */}
                {jugadores.map((j, i) => (
                  <div key={i} className="p-3 border border-gray-200 rounded-xl bg-gray-50/70 space-y-2">
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-center">
                      <div className="md:col-span-1 text-center font-bold text-xs text-gray-400">
                        #{i + 2}
                      </div>

                      <div className="md:col-span-3">
                        <input
                          required
                          aria-label={`Nombre del jugador ${i + 2}`}
                          placeholder={`Nombre Jugador ${i + 2} *`}
                          value={j.nombre}
                          className="w-full border border-gray-300 p-2 rounded-lg text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-900"
                          onChange={e => handleJugadorChange(i, "nombre", e.target.value)}
                        />
                      </div>

                      <div className="md:col-span-2">
                        <input
                          required
                          aria-label={`Número de cuenta del jugador ${i + 2}`}
                          placeholder="N° Cuenta *"
                          value={j.cuenta}
                          className="w-full border border-gray-300 p-2 rounded-lg text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-900 font-mono"
                          onChange={e => handleJugadorChange(i, "cuenta", e.target.value)}
                        />
                      </div>

                      <div className="md:col-span-2">
                        <input
                          aria-label={`DNI del jugador ${i + 2}`}
                          placeholder="DNI"
                          value={j.dni}
                          className="w-full border border-gray-300 p-2 rounded-lg text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-900 font-mono text-[11px]"
                          onChange={e => handleJugadorChange(i, "dni", e.target.value)}
                        />
                      </div>

                      <div className="md:col-span-3">
                        <input
                          aria-label={`Correo institucional del jugador ${i + 2}`}
                          placeholder="Correo @unitec.edu"
                          value={j.correo}
                          className="w-full border border-gray-300 p-2 rounded-lg text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-900 font-mono text-[11px]"
                          onChange={e => handleJugadorChange(i, "correo", e.target.value)}
                        />
                      </div>

                      <div className="md:col-span-1 flex items-center justify-end">
                        <button
                          type="button"
                          onClick={() => eliminarJugador(i)}
                          aria-label={`Eliminar jugador ${i + 2}`}
                          title="Eliminar este jugador"
                          className="text-red-500 hover:text-red-700 hover:bg-red-50 text-sm font-bold p-1 rounded transition"
                        >
                          ✕
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs pt-1">
                      <input
                        required
                        aria-label={`Nombre de la clase del jugador ${i + 2}`}
                        placeholder="Nombre de la Clase *"
                        value={j.nombreClase || ""}
                        className="w-full border border-gray-300 p-1.5 rounded-lg text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-900"
                        onChange={e => handleJugadorChange(i, "nombreClase", e.target.value)}
                      />
                      <input
                        required
                        aria-label={`Código de la clase del jugador ${i + 2}`}
                        placeholder="Código de la Clase *"
                        value={j.codigoClase || ""}
                        className="w-full border border-gray-300 p-1.5 rounded-lg text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-900 uppercase font-mono"
                        onChange={e => handleJugadorChange(i, "codigoClase", e.target.value.toUpperCase())}
                      />
                    </div>

                    {/* Opción de adjuntar carnet para este integrante (Requisito 5) */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-gray-200 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-bold text-gray-600">📷 Foto de Carnet (Opcional por Capitán):</span>
                        <input
                          aria-label={`Documento del jugador ${i + 2}`}
                          type="file"
                          accept="image/*,.pdf"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              const dataUrl = await comprimirDocumento(file);
                              handleJugadorChange(i, {
                                fotoDocumento: dataUrl,
                                fotoDocumentoPreview: dataUrl
                              });
                            }
                          }}
                          className="text-[10px] text-gray-500 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-[10px] file:bg-blue-900 file:text-white"
                        />
                      </div>
                      {j.fotoDocumentoPreview && (
                        <span className="text-[10px] text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                          ✓ Foto adjunta
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
            )}

            <div className="wizard-controls">
              {pasoCapitan > 1 ? (
                <button type="button" className="secondary-action" onClick={() => setPasoCapitan((step) => step - 1)}>
                  Anterior
                </button>
              ) : <span />}
              {pasoCapitan < 4 ? (
                <button
                  type="button"
                  className="primary-action"
                  onClick={() => {
                    if (capitanFormRef.current?.reportValidity()) setPasoCapitan((step) => step + 1);
                  }}
                >
                  Siguiente
                </button>
              ) : (
                <button
                  disabled={loading || (resumen && !resumen.inscripcionesAbiertas)}
                  type="submit"
                  className="primary-action"
                >
                  {loading ? "Procesando y registrando equipo..." : "Finalizar y registrar equipo"}
                </button>
              )}
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

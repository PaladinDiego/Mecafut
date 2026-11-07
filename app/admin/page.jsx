"use client";
import { useState, useEffect } from "react";
import {
  obtenerDatosAdmin,
  actualizarEstadoEquipo,
  eliminarEquipoAdmin,
  cambiarEstadoInscripciones,
  reiniciarBaseDeDatosSimulada,
  guardarBracketCategoria,
  guardarTorneoCompleto,
  actualizarConfigVisibilidadTorneo,
  crearCriterioPremio,
  eliminarCriterioPremio,
  ajustarConteoCriterio,
  actualizarDocumentoJugador,
  comprimirDocumento,
  actualizarEnlaceWhatsapp,
  esJugadorHabilitado
} from "../../lib/dbService";
import { exportarExcelOficial, exportarPDFPlanillas } from "../../lib/exportUtils";
import { CONFIG_TORNEO, esDocenteAutorizado } from "../../lib/torneoConfig";
import { obtenerSesionActual, verificarOtp } from "../../lib/authService";
import {
  generarBracketEliminacion,
  generarTriangularFemenino,
  propagarGanadorEliminacion
} from "../../lib/bracketUtils";
import BracketTorneo from "../../components/BracketTorneo";

export function esEquipoAptoParaLlaves(equipo, todosJugadores = []) {
  if (!equipo) return false;
  const estadoPago = (equipo.estado || "Pendiente").toLowerCase();
  const pagoAprobado =
    equipo.pagoConfirmado === true ||
    estadoPago === "confirmado" ||
    estadoPago === "pagado" ||
    estadoPago === "aprobado";
  if (!pagoAprobado) return false;

  const integrantes = (todosJugadores || []).filter((j) => j.equipoId === equipo.id);
  const habilitados = integrantes.filter(esJugadorHabilitado).length;
  return habilitados >= CONFIG_TORNEO.plantilla.min;
}

export default function Admin() {
  const [isLogged, setIsLogged] = useState(false);
  const [jugadores, setJugadores] = useState([]);
  const [equipos, setEquipos] = useState([]);
  const [configuracion, setConfiguracion] = useState({ inscripcionesAbiertas: true });
  const [torneo, setTorneo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [filtro, setFiltro] = useState("");
  const [pestanaActiva, setPestanaActiva] = useState("equipos"); // "equipos" | "jugadores" | "llaves" | "resultados"
  const [vistaPadron, setVistaPadron] = useState("agrupado"); // "agrupado" | "lista"
  const [modo, setModo] = useState("simulado");
  const [visorModal, setVisorModal] = useState(null);

  // Estados para sorteo y llaves
  const [categoriaSorteo, setCategoriaSorteo] = useState("Masculino");

  // Modal para anotar gol en un partido
  const [modalGolPartido, setModalGolPartido] = useState(null);
  const [jugadorGoleadorElegido, setJugadorGoleadorElegido] = useState("");
  const [equipoGolElegido, setEquipoGolElegido] = useState("1"); // "1" | "2"

  // Modal para estado/ganador de un partido
  const [modalEstadoPartido, setModalEstadoPartido] = useState(null);
  const [nuevoEstadoPartido, setNuevoEstadoPartido] = useState("Programado");
  const [ganadorElegidoId, setGanadorElegidoId] = useState("");
  const [penales1Input, setPenales1Input] = useState("");
  const [penales2Input, setPenales2Input] = useState("");

  // Estado para crear nuevo criterio de premio
  const [nuevoCriterioNombre, setNuevoCriterioNombre] = useState("");
  const [nuevoCriterioIcono, setNuevoCriterioIcono] = useState("🏆");

  // F13: Estados para Editor de Enlace de WhatsApp
  const [urlWhatsappInput, setUrlWhatsappInput] = useState("");
  const [guardandoWhatsapp, setGuardandoWhatsapp] = useState(false);
  const [mensajeWhatsapp, setMensajeWhatsapp] = useState(null);

  // F10: Estados para Modal de Subida / Cambio de Carnet
  const [modalCarnetJugador, setModalCarnetJugador] = useState(null);
  const [carnetDataUrl, setCarnetDataUrl] = useState(null);
  const [subiendoCarnet, setSubiendoCarnet] = useState(false);
  const [carnetError, setCarnetError] = useState("");

  // F12: Estados para Modal de Armado Manual de Llaves
  const [modalArmadoManual, setModalArmadoManual] = useState(false);
  const [tabArmadoManual, setTabArmadoManual] = useState("Masculino");
  const [manualMasc, setManualMasc] = useState({
    bye1: "",
    bye2: "",
    bye3: "",
    bye4: "",
    p1a: "",
    p1b: "",
    p2a: "",
    p2b: "",
    p3a: "",
    p3b: "",
    p4a: "",
    p4b: ""
  });
  const [manualFem, setManualFem] = useState({
    eq1: "",
    eq2: "",
    eq3: ""
  });

  const [sesionActual, setSesionActual] = useState(null);

  useEffect(() => {
    const s = obtenerSesionActual();
    setSesionActual(s);
    if (s && s.rol === "admin") {
      setIsLogged(true);
      fetchData();
    }
  }, []);

  useEffect(() => {
    if (configuracion?.whatsappCapitanesUrl) {
      setUrlWhatsappInput(configuracion.whatsappCapitanesUrl);
    }
  }, [configuracion?.whatsappCapitanesUrl]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const data = await obtenerDatosAdmin();
      setJugadores(data.jugadores || []);
      setEquipos(data.equipos || []);
      const cfg = data.configuracion || { inscripcionesAbiertas: true };
      setConfiguracion(cfg);
      if (cfg.whatsappCapitanesUrl) {
        setUrlWhatsappInput(cfg.whatsappCapitanesUrl);
      }
      setTorneo(data.torneo || null);
      setModo(data.modo);
    } catch (err) {
      alert("Error al cargar datos del panel: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCambiarEstado = async (equipoId, nuevoEstado) => {
    try {
      await actualizarEstadoEquipo(equipoId, nuevoEstado);
      fetchData();
    } catch (err) {
      alert("Error al cambiar estado: " + err.message);
    }
  };

  const handleEliminarEquipo = async (equipoId, nombreEquipo) => {
    if (confirm(`¿Eliminar definitivamente el equipo "${nombreEquipo}" y todos sus jugadores? Esta acción no se puede deshacer.`)) {
      try {
        await eliminarEquipoAdmin(equipoId);
        fetchData();
      } catch (err) {
        alert("Error al eliminar equipo: " + err.message);
      }
    }
  };

  const handleToggleInscripciones = async () => {
    const nuevoEstado = !configuracion.inscripcionesAbiertas;
    try {
      await cambiarEstadoInscripciones(nuevoEstado);
      setConfiguracion({ ...configuracion, inscripcionesAbiertas: nuevoEstado });
    } catch (err) {
      alert("Error actualizando estado de inscripciones: " + err.message);
    }
  };

  const handleResetSimulado = () => {
    if (confirm("¿Deseas reiniciar la base de datos simulada a los datos semilla iniciales? Se borrarán pruebas creadas localmente.")) {
      reiniciarBaseDeDatosSimulada();
      fetchData();
    }
  };

  // ========================================================
  // F13: GESTIÓN DEL ENLACE DE WHATSAPP DE CAPITANES
  // ========================================================
  const handleGuardarWhatsapp = async (e) => {
    if (e) e.preventDefault();
    const urlLimpia = (urlWhatsappInput || "").trim();
    if (!urlLimpia.startsWith("https://")) {
      alert("El enlace debe ser seguro y comenzar con https:// (ej. https://chat.whatsapp.com/...)");
      return;
    }

    setGuardandoWhatsapp(true);
    setMensajeWhatsapp(null);
    try {
      await actualizarEnlaceWhatsapp(urlLimpia);
      setConfiguracion((prev) => ({ ...prev, whatsappCapitanesUrl: urlLimpia }));
      setMensajeWhatsapp({ tipo: "exito", texto: "¡Enlace de WhatsApp actualizado con éxito!" });
      setTimeout(() => setMensajeWhatsapp(null), 4000);
    } catch (err) {
      alert("Error al guardar enlace de WhatsApp: " + err.message);
    } finally {
      setGuardandoWhatsapp(false);
    }
  };

  const handleProbarWhatsapp = () => {
    const url = (urlWhatsappInput || "").trim();
    if (!url.startsWith("https://")) {
      alert("Ingresa un enlace válido que comience con https:// para probarlo.");
      return;
    }
    window.open(url, "_blank");
  };

  // ========================================================
  // F10: GESTIÓN DE CARNETS Y MATRÍCULAS EN EL PADRÓN
  // ========================================================
  const abrirModalCarnet = (jugador) => {
    setModalCarnetJugador(jugador);
    setCarnetDataUrl(jugador.fotoDocumento || jugador.foto_documento || null);
    setCarnetError("");
  };

  const handleArchivoCarnetChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSubiendoCarnet(true);
    setCarnetError("");
    try {
      const dataUrl = await comprimirDocumento(file);
      if (!dataUrl) {
        setCarnetError("No se pudo procesar la imagen o documento. Intenta con otro archivo.");
      } else {
        setCarnetDataUrl(dataUrl);
      }
    } catch (err) {
      setCarnetError("Error al procesar el archivo: " + err.message);
    } finally {
      setSubiendoCarnet(false);
    }
  };

  const handleGuardarCarnet = async (e) => {
    e.preventDefault();
    if (!modalCarnetJugador || !carnetDataUrl) {
      alert("Por favor selecciona una foto de carnet o matrícula.");
      return;
    }
    setSubiendoCarnet(true);
    try {
      await actualizarDocumentoJugador({
        jugadorId: modalCarnetJugador.id,
        fotoDocumento: carnetDataUrl,
        tipoDocumento: "carnet"
      });

      // Actualizar estado local inmediatamente para reflejo instantáneo en la UI
      setJugadores((prev) =>
        prev.map((j) =>
          j.id === modalCarnetJugador.id
            ? {
                ...j,
                fotoDocumento: carnetDataUrl,
                foto_documento: carnetDataUrl,
                estado: "Aprobado"
              }
            : j
        )
      );
      setEquipos((prev) => [...prev]);
      alert(`¡Carnet de ${modalCarnetJugador.nombre} actualizado y verificado con éxito!`);
      setModalCarnetJugador(null);
      setCarnetDataUrl(null);
    } catch (err) {
      alert("Error guardando carnet: " + err.message);
    } finally {
      setSubiendoCarnet(false);
    }
  };

  // ========================================================
  // F11 & F12: LÓGICA DE SORTEO Y GENERACIÓN DE LLAVES
  // ========================================================
  const generarCrucesTorneo = async (aleatorio = false) => {
    const categoria = categoriaSorteo;
    const equiposCategoria = equipos.filter(
      (e) => (e.categoria || "Masculino") === categoria
    );
    const equiposAptos = equiposCategoria.filter((e) => esEquipoAptoParaLlaves(e, jugadores));

    if (equiposAptos.length < 2) {
      alert(
        `Se requieren al menos 2 equipos elegibles (pago confirmado y mínimo ${CONFIG_TORNEO.plantilla.min} carnets verificados) en la categoría ${categoria} para armar el torneo.`
      );
      return;
    }

    let nuevoBracket;
    // Si es Femenino y son exactamente 3 equipos -> Reglamento Especial Triangular + Final
    if (categoria === "Femenino" && equiposAptos.length === 3) {
      nuevoBracket = generarTriangularFemenino(equiposAptos, aleatorio);
    } else {
      nuevoBracket = generarBracketEliminacion(equiposAptos, aleatorio);
    }

    try {
      const actualizado = await guardarBracketCategoria(categoria, nuevoBracket);
      setTorneo(actualizado);
      alert(`¡Cruces generados con éxito para la categoría ${categoria}!`);
    } catch (err) {
      alert("Error guardando cruces: " + err.message);
    }
  };

  // F12: Armado Manual Interactivo de Llaves
  const abrirModalArmadoManual = () => {
    setTabArmadoManual(categoriaSorteo || "Masculino");
    setModalArmadoManual(true);
  };

  const handleAutocompletarManual = (cat) => {
    if (cat === "Masculino") {
      const aptos = equipos.filter(
        (e) => (e.categoria || "Masculino") === "Masculino" && esEquipoAptoParaLlaves(e, jugadores)
      );
      if (aptos.length < 1) {
        alert("No hay equipos masculinos elegibles registrados.");
        return;
      }
      setManualMasc({
        bye1: aptos[0]?.id || "",
        bye2: aptos[1]?.id || "",
        bye3: aptos[2]?.id || "",
        bye4: aptos[3]?.id || "",
        p1a: aptos[4]?.id || "",
        p1b: aptos[5]?.id || "",
        p2a: aptos[6]?.id || "",
        p2b: aptos[7]?.id || "",
        p3a: aptos[8]?.id || "",
        p3b: aptos[9]?.id || "",
        p4a: aptos[10]?.id || "",
        p4b: aptos[11]?.id || ""
      });
    } else {
      const aptos = equipos.filter(
        (e) => e.categoria === "Femenino" && esEquipoAptoParaLlaves(e, jugadores)
      );
      if (aptos.length < 1) {
        alert("No hay equipos femeninos elegibles registrados.");
        return;
      }
      setManualFem({
        eq1: aptos[0]?.id || "",
        eq2: aptos[1]?.id || "",
        eq3: aptos[2]?.id || ""
      });
    }
  };

  const handleGuardarManualMasculino = async (e) => {
    e.preventDefault();
    const keys = ["bye1", "bye2", "bye3", "bye4", "p1a", "p1b", "p2a", "p2b", "p3a", "p3b", "p4a", "p4b"];
    const ids = keys.map((k) => manualMasc[k]);

    if (ids.some((id) => !id)) {
      alert("Debes seleccionar los 12 equipos para los pases directos y los 4 partidos preliminares.");
      return;
    }

    const setIds = new Set(ids);
    if (setIds.size !== 12) {
      alert("Error de validación: Hay equipos repetidos en la selección. Cada uno de los 12 equipos debe ser único.");
      return;
    }

    const orderedTeams = ids.map((id) => equipos.find((eq) => eq.id === id)).filter(Boolean);
    if (orderedTeams.length !== 12) {
      alert("Error al cargar los datos de los equipos seleccionados.");
      return;
    }

    try {
      const bracket = generarBracketEliminacion(orderedTeams, false);
      const actualizado = await guardarBracketCategoria("Masculino", bracket);
      setTorneo(actualizado);
      setModalArmadoManual(false);
      alert("¡Llave Masculina armada y publicada con éxito!");
    } catch (err) {
      alert("Error guardando llave masculina: " + err.message);
    }
  };

  const handleGuardarManualFemenino = async (e) => {
    e.preventDefault();
    const ids = [manualFem.eq1, manualFem.eq2, manualFem.eq3];

    if (ids.some((id) => !id)) {
      alert("Debes seleccionar los 3 equipos para el Triangular Femenino.");
      return;
    }

    const setIds = new Set(ids);
    if (setIds.size !== 3) {
      alert("Error de validación: Hay equipos repetidos en la selección. Los 3 equipos del Triangular deben ser únicos.");
      return;
    }

    const orderedTeams = ids.map((id) => equipos.find((eq) => eq.id === id)).filter(Boolean);
    if (orderedTeams.length !== 3) {
      alert("Error al cargar los datos de los equipos femeninos seleccionados.");
      return;
    }

    try {
      const bracket = generarTriangularFemenino(orderedTeams, false);
      const actualizado = await guardarBracketCategoria("Femenino", bracket);
      setTorneo(actualizado);
      setModalArmadoManual(false);
      alert("¡Triangular Femenino armado y publicado con éxito!");
    } catch (err) {
      alert("Error guardando triangular femenino: " + err.message);
    }
  };

  // ========================================================
  // LÓGICA DE GOLES Y RESULTADOS EN VIVO (Requisito 3)
  // ========================================================
  const abrirModalAnotarGol = (partido) => {
    setModalGolPartido(partido);
    setEquipoGolElegido("1");
    setJugadorGoleadorElegido("");
  };

  const confirmarGolPartido = async (e) => {
    e.preventDefault();
    if (!modalGolPartido) return;

    const partido = modalGolPartido;
    const categoria = categoriaSorteo;
    const bracket = torneo?.brackets?.[categoria];
    if (!bracket) return;

    const eqObjetivo = equipoGolElegido === "1" ? partido.equipo1 : partido.equipo2;
    const jugadoresEquipo = jugadores.filter((j) => j.equipoId === eqObjetivo?.id);
    const jugadorGoleador = jugadoresEquipo.find((j) => j.id === jugadorGoleadorElegido);

    const partidoActualizado = { ...partido };
    if (equipoGolElegido === "1") {
      partidoActualizado.goles1 = (partidoActualizado.goles1 || 0) + 1;
    } else {
      partidoActualizado.goles2 = (partidoActualizado.goles2 || 0) + 1;
    }

    if (partidoActualizado.estado === "Programado") {
      partidoActualizado.estado = "En Vivo";
    }

    const nuevoGoleador = {
      jugadorId: jugadorGoleador?.id || "anon",
      nombreJugador: jugadorGoleador?.nombre || "Jugador del Equipo",
      equipoId: eqObjetivo?.id,
      nombreEquipo: eqObjetivo?.nombre,
      minuto: Math.floor(Math.random() * 20) + 1
    };

    partidoActualizado.goleadores = [...(partidoActualizado.goleadores || []), nuevoGoleador];

    let bracketNuevo;
    if (bracket.tipo === "triangular_final") {
      bracketNuevo = JSON.parse(JSON.stringify(bracket));
      const idxJ = bracketNuevo.jornadas.findIndex((p) => p.id === partido.id);
      if (idxJ !== -1) {
        bracketNuevo.jornadas[idxJ] = partidoActualizado;
      } else if (bracketNuevo.granFinal?.id === partido.id) {
        bracketNuevo.granFinal = partidoActualizado;
      }
    } else {
      bracketNuevo = propagarGanadorEliminacion(bracket, partidoActualizado);
    }

    try {
      const torActualizado = await guardarBracketCategoria(categoria, bracketNuevo);
      setTorneo(torActualizado);
      setModalGolPartido(null);
    } catch (err) {
      alert("Error registrando gol: " + err.message);
    }
  };

  const abrirModalEstadoPartido = (partido) => {
    setModalEstadoPartido(partido);
    setNuevoEstadoPartido(partido.estado || "Programado");
    setGanadorElegidoId(partido.ganador?.id || "");
    setPenales1Input(partido.penales1 !== null ? partido.penales1.toString() : "");
    setPenales2Input(partido.penales2 !== null ? partido.penales2.toString() : "");
  };

  const confirmarEstadoPartido = async (e) => {
    e.preventDefault();
    if (!modalEstadoPartido) return;

    const partido = modalEstadoPartido;
    const categoria = categoriaSorteo;
    const bracket = torneo?.brackets?.[categoria];
    if (!bracket) return;

    const partidoActualizado = {
      ...partido,
      estado: nuevoEstadoPartido,
      penales1: penales1Input ? parseInt(penales1Input, 10) : null,
      penales2: penales2Input ? parseInt(penales2Input, 10) : null
    };

    if (ganadorElegidoId === partido.equipo1?.id) {
      partidoActualizado.ganador = partido.equipo1;
    } else if (ganadorElegidoId === partido.equipo2?.id) {
      partidoActualizado.ganador = partido.equipo2;
    } else if (!ganadorElegidoId) {
      partidoActualizado.ganador = null;
    }

    let bracketNuevo;
    if (bracket.tipo === "triangular_final") {
      bracketNuevo = JSON.parse(JSON.stringify(bracket));
      const idxJ = bracketNuevo.jornadas.findIndex((p) => p.id === partido.id);
      if (idxJ !== -1) {
        bracketNuevo.jornadas[idxJ] = partidoActualizado;
      } else if (bracketNuevo.granFinal?.id === partido.id) {
        bracketNuevo.granFinal = partidoActualizado;
      }
    } else {
      bracketNuevo = propagarGanadorEliminacion(bracket, partidoActualizado);
    }

    try {
      const torActualizado = await guardarBracketCategoria(categoria, bracketNuevo);
      setTorneo(torActualizado);
      setModalEstadoPartido(null);
    } catch (err) {
      alert("Error actualizando partido: " + err.message);
    }
  };

  // Criterios Dinámicos de Premiación
  const handleCrearCriterio = async (e) => {
    e.preventDefault();
    if (!nuevoCriterioNombre.trim()) return;
    try {
      const act = await crearCriterioPremio({
        nombre: nuevoCriterioNombre,
        icono: nuevoCriterioIcono,
        categoria: categoriaSorteo
      });
      setTorneo(act);
      setNuevoCriterioNombre("");
    } catch (err) {
      alert("Error creando criterio: " + err.message);
    }
  };

  const handleEliminarCriterio = async (critId) => {
    if (confirm("¿Eliminar este criterio de premiación?")) {
      try {
        const act = await eliminarCriterioPremio(critId);
        setTorneo(act);
      } catch (err) {
        alert("Error eliminando criterio: " + err.message);
      }
    }
  };

  const handleAjustarPuntosCriterio = async (critId, jugador, delta) => {
    try {
      const act = await ajustarConteoCriterio({ criterioId: critId, jugador, delta });
      setTorneo(act);
    } catch (err) {
      alert("Error ajustando puntaje: " + err.message);
    }
  };

  // Métricas
  const confirmados = equipos.filter((e) => e.estado === "Confirmado").length;
  const pendientes = equipos.filter((e) => e.estado === "Pendiente").length;
  const totalMasc = equipos.filter((e) => (e.categoria || "Masculino") === "Masculino" && e.estado !== "Rechazado").length;
  const totalFem = equipos.filter((e) => e.categoria === "Femenino" && e.estado !== "Rechazado").length;

  const jugadoresFiltrados = jugadores.filter(
    (j) =>
      (j.nombre || "").toLowerCase().includes(filtro.toLowerCase()) ||
      (j.cuenta || "").includes(filtro) ||
      (j.correo || "").toLowerCase().includes(filtro.toLowerCase()) ||
      (j.nombreEquipo || "").toLowerCase().includes(filtro.toLowerCase()) ||
      (j.carrera || "").toLowerCase().includes(filtro.toLowerCase())
  );

  // Agrupamiento por equipos para el padrón (Requisito 4)
  const equiposConJugadores = equipos.map((eq) => ({
    ...eq,
    plantilla: jugadoresFiltrados.filter((j) => j.equipoId === eq.id)
  }));

  if (!isLogged) {
    return (
      <div className="min-h-[75vh] flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-3xl border border-gray-200 shadow-xl w-full max-w-md text-center animate-fade-in">
          <div className="w-14 h-14 bg-red-100 text-red-600 rounded-2xl flex items-center justify-center mx-auto mb-4 text-2xl font-black">
            🔒
          </div>
          <h2 className="text-xl font-black text-blue-950 mb-1">Acceso Administrativo Protegido</h2>
          <p className="text-xs text-gray-500 mb-6">Comité Organizador — MECAFUT 2026</p>

          <div className="bg-gray-50 p-4 rounded-2xl border text-xs text-gray-600 text-left space-y-2 mb-6">
            <p>
              El acceso a este panel está restringido exclusivamente a las cuentas oficiales autorizadas en la lista blanca del Comité Organizador.
            </p>
            {sesionActual ? (
              <p className="text-red-700 font-semibold">
                Has iniciado sesión como <strong>{sesionActual.correo}</strong>, pero esta cuenta no cuenta con rol de Administrador.
              </p>
            ) : (
              <p className="text-blue-900 font-semibold">
                Debes iniciar sesión con tu correo de administrador oficial (@unitec.edu).
              </p>
            )}
          </div>

          {process.env.NODE_ENV !== "production" && (
            <button
              type="button"
              onClick={() => {
                verificarOtp("carlos.rubi@unitec.edu", "123456");
                setIsLogged(true);
                fetchData();
              }}
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2.5 rounded-xl text-xs transition shadow mb-3 flex items-center justify-center gap-2"
            >
              <span>⚡</span>
              <span>Entrar como Admin (carlos.rubi@unitec.edu) [Modo Dev]</span>
            </button>
          )}

          <a
            href="/"
            className="block w-full border border-gray-300 hover:bg-gray-100 text-gray-700 font-bold py-2.5 rounded-xl text-xs transition text-center"
          >
            ← Volver al Inicio
          </a>
        </div>
      </div>
    );
  }

  const bracketCategoriaActual =
    categoriaSorteo === "Masculino"
      ? torneo?.brackets?.Masculino
      : torneo?.brackets?.Femenino;

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 pb-20 space-y-6">
      {/* Modal universal para ver comprobantes / carnet */}
      {visorModal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto text-center shadow-2xl">
            <div className="flex justify-between items-center mb-4 border-b pb-2">
              <h3 className="font-bold text-blue-950 text-sm truncate text-left">{visorModal.titulo}</h3>
              <button onClick={() => setVisorModal(null)} className="text-gray-400 hover:text-gray-700 font-bold">✕</button>
            </div>
            {visorModal.url ? (
              <img src={visorModal.url} alt="Doc" className="max-h-[60vh] mx-auto rounded-xl border shadow" />
            ) : (
              <p className="text-xs text-gray-400 py-8">Sin imagen adjunta.</p>
            )}
            <button
              onClick={() => setVisorModal(null)}
              className="mt-4 bg-gray-100 hover:bg-gray-200 text-gray-800 text-xs font-bold px-4 py-2 rounded-xl"
            >
              Cerrar Visor
            </button>
          </div>
        </div>
      )}

      {/* F10: Modal para Subir o Cambiar Carnet en el Padrón */}
      {modalCarnetJugador && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border-2 border-blue-950 text-left animate-fade-in">
            <div className="flex justify-between items-center mb-3 border-b pb-2">
              <div>
                <h3 className="text-base font-black text-blue-950">
                  {modalCarnetJugador.fotoDocumento || modalCarnetJugador.foto_documento
                    ? "✏️ Cambiar Carnet o Matrícula"
                    : "🪪 Subir Carnet o Matrícula"}
                </h3>
                <p className="text-xs text-gray-500 font-semibold">
                  {modalCarnetJugador.nombre} ({modalCarnetJugador.cuenta})
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setModalCarnetJugador(null);
                  setCarnetDataUrl(null);
                }}
                className="text-gray-400 hover:text-gray-700 font-bold text-lg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleGuardarCarnet} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Foto del Carnet Estudiantil o Comprobante de Matrícula:
                </label>
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  onChange={handleArchivoCarnetChange}
                  className="w-full text-xs text-gray-600 file:mr-3 file:py-2 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-blue-100 file:text-blue-900 hover:file:bg-blue-200 cursor-pointer border rounded-xl p-1"
                />
                <p className="text-[10px] text-gray-400 mt-1">
                  Se comprime automáticamente en el navegador a formato ligero de alta legibilidad.
                </p>
              </div>

              {carnetError && (
                <p className="text-xs text-red-600 bg-red-50 p-2.5 rounded-xl border border-red-200">
                  {carnetError}
                </p>
              )}

              {carnetDataUrl && (
                <div className="border rounded-2xl p-2 bg-gray-50 text-center">
                  <span className="text-[10px] text-gray-500 font-semibold block mb-1">
                    Vista Previa del Carnet:
                  </span>
                  <img
                    src={carnetDataUrl}
                    alt="Carnet Preview"
                    className="max-h-48 mx-auto rounded-xl border shadow-sm object-contain"
                  />
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  disabled={subiendoCarnet}
                  onClick={() => {
                    setModalCarnetJugador(null);
                    setCarnetDataUrl(null);
                  }}
                  className="w-1/3 border py-2.5 rounded-xl text-xs font-bold text-gray-700 hover:bg-gray-100"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={subiendoCarnet || !carnetDataUrl}
                  className="w-2/3 bg-blue-950 hover:bg-blue-900 disabled:opacity-50 text-white font-bold py-2.5 rounded-xl text-xs transition shadow flex items-center justify-center gap-1.5"
                >
                  <span>{subiendoCarnet ? "⏳" : "💾"}</span>
                  <span>{subiendoCarnet ? "Procesando..." : "Guardar y Habilitar"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* F12: Modal Interactivo de Armado Manual de Llaves */}
      {modalArmadoManual && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border-2 border-blue-950 text-left animate-fade-in">
            <div className="flex justify-between items-center mb-4 border-b pb-3">
              <div>
                <h3 className="text-lg font-black text-blue-950 flex items-center gap-2">
                  <span>🎯</span> Armado Manual de Llaves del Torneo
                </h3>
                <p className="text-xs text-gray-500">
                  Selecciona y empareja manualmente los equipos elegibles en los slots del bracket oficial.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setModalArmadoManual(false)}
                className="text-gray-400 hover:text-gray-700 font-bold text-lg"
              >
                ✕
              </button>
            </div>

            {/* Pestañas de Categoría dentro del Modal */}
            <div className="flex gap-2 border-b mb-4">
              <button
                type="button"
                onClick={() => setTabArmadoManual("Masculino")}
                className={`pb-2 px-4 text-xs font-bold border-b-2 transition ${
                  tabArmadoManual === "Masculino"
                    ? "border-blue-950 text-blue-950 font-black"
                    : "border-transparent text-gray-400"
                }`}
              >
                Categoría Masculina (12 Equipos — 4 BYEs + 4 Preliminares)
              </button>
              <button
                type="button"
                onClick={() => setTabArmadoManual("Femenino")}
                className={`pb-2 px-4 text-xs font-bold border-b-2 transition ${
                  tabArmadoManual === "Femenino"
                    ? "border-blue-950 text-blue-950 font-black"
                    : "border-transparent text-gray-400"
                }`}
              >
                Categoría Femenina (Triangular 3 Equipos)
              </button>
            </div>

            {/* Formulario Masculino */}
            {tabArmadoManual === "Masculino" && (
              <form onSubmit={handleGuardarManualMasculino} className="space-y-4">
                {(() => {
                  const aptosMasc = equipos.filter(
                    (e) => (e.categoria || "Masculino") === "Masculino" && esEquipoAptoParaLlaves(e, jugadores)
                  );
                  return (
                    <>
                      <div className="flex flex-wrap justify-between items-center gap-2">
                        <span className="text-xs text-gray-600">
                          Equipos masculinos elegibles registrados: <strong>{aptosMasc.length}</strong> (mínimo 8 carnets + pago)
                        </span>
                        <button
                          type="button"
                          onClick={() => handleAutocompletarManual("Masculino")}
                          className="bg-purple-100 hover:bg-purple-200 text-purple-900 font-bold text-xs px-3 py-1.5 rounded-xl transition flex items-center gap-1"
                        >
                          <span>⚡</span> Autocompletar con elegibles
                        </button>
                      </div>

                      {aptosMasc.length < 12 && (
                        <div className="bg-amber-50 border border-amber-200 text-amber-900 p-3 rounded-2xl text-xs">
                          ⚠️ Hay <strong>{aptosMasc.length}</strong> equipos masculinos elegibles (se requieren 12 para el bracket completo).
                          Puedes habilitar más equipos subiendo sus carnets faltantes en la pestaña &quot;Padrón de Jugadores&quot;.
                        </div>
                      )}

                      {/* 4 BYEs Directos */}
                      <div className="bg-amber-50/70 p-4 rounded-2xl border border-amber-200 space-y-3">
                        <h4 className="text-xs font-black text-amber-950 flex items-center gap-1.5">
                          <span>⭐</span> Pases Directos a Cuartos de Final (4 BYEs)
                        </h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {[
                            { key: "bye1", label: "Pase Directo 1 (BYE Slot 1)" },
                            { key: "bye2", label: "Pase Directo 2 (BYE Slot 2)" },
                            { key: "bye3", label: "Pase Directo 3 (BYE Slot 3)" },
                            { key: "bye4", label: "Pase Directo 4 (BYE Slot 4)" }
                          ].map((slot) => (
                            <div key={slot.key}>
                              <label className="block text-[11px] font-bold text-gray-700 mb-1">
                                {slot.label}:
                              </label>
                              <select
                                required
                                value={manualMasc[slot.key]}
                                onChange={(e) => setManualMasc({ ...manualMasc, [slot.key]: e.target.value })}
                                className="w-full border border-gray-300 p-2 rounded-xl text-xs bg-white font-semibold"
                              >
                                <option value="">-- Seleccionar Equipo --</option>
                                {aptosMasc.map((eq) => (
                                  <option key={eq.id} value={eq.id}>
                                    {eq.nombre}
                                  </option>
                                ))}
                              </select>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* 4 Partidos Preliminares */}
                      <div className="bg-blue-50/70 p-4 rounded-2xl border border-blue-200 space-y-3">
                        <h4 className="text-xs font-black text-blue-950 flex items-center gap-1.5">
                          <span>⚔️</span> Cruces Ronda Preliminar (4 Partidos — 8 Equipos)
                        </h4>
                        <div className="space-y-3">
                          {[
                            { num: 1, kA: "p1a", kB: "p1b" },
                            { num: 2, kA: "p2a", kB: "p2b" },
                            { num: 3, kA: "p3a", kB: "p3b" },
                            { num: 4, kA: "p4a", kB: "p4b" }
                          ].map((partido) => (
                            <div
                              key={partido.num}
                              className="bg-white p-3 rounded-2xl border border-gray-200 flex flex-col sm:flex-row items-center gap-2"
                            >
                              <span className="font-bold text-xs text-blue-950 w-28 shrink-0">
                                Partido {partido.num}:
                              </span>
                              <div className="flex-1 w-full grid grid-cols-1 sm:grid-cols-2 gap-2">
                                <select
                                  required
                                  value={manualMasc[partido.kA]}
                                  onChange={(e) => setManualMasc({ ...manualMasc, [partido.kA]: e.target.value })}
                                  className="w-full border border-gray-300 p-2 rounded-xl text-xs bg-white font-semibold"
                                >
                                  <option value="">-- Equipo Local (A) --</option>
                                  {aptosMasc.map((eq) => (
                                    <option key={eq.id} value={eq.id}>
                                      {eq.nombre}
                                    </option>
                                  ))}
                                </select>

                                <select
                                  required
                                  value={manualMasc[partido.kB]}
                                  onChange={(e) => setManualMasc({ ...manualMasc, [partido.kB]: e.target.value })}
                                  className="w-full border border-gray-300 p-2 rounded-xl text-xs bg-white font-semibold"
                                >
                                  <option value="">-- Equipo Visitante (B) --</option>
                                  {aptosMasc.map((eq) => (
                                    <option key={eq.id} value={eq.id}>
                                      {eq.nombre}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="flex justify-end gap-2 pt-2">
                        <button
                          type="button"
                          onClick={() => setModalArmadoManual(false)}
                          className="border px-4 py-2.5 rounded-xl text-xs font-bold text-gray-700 hover:bg-gray-100"
                        >
                          Cancelar
                        </button>
                        <button
                          type="submit"
                          className="bg-blue-950 hover:bg-blue-900 text-white font-bold px-6 py-2.5 rounded-xl text-xs transition shadow flex items-center gap-1.5"
                        >
                          <span>💾</span> Guardar y Publicar Llave Masculina
                        </button>
                      </div>
                    </>
                  );
                })()}
              </form>
            )}

            {/* Formulario Femenino */}
            {tabArmadoManual === "Femenino" && (
              <form onSubmit={handleGuardarManualFemenino} className="space-y-4">
                {(() => {
                  const aptosFem = equipos.filter(
                    (e) => e.categoria === "Femenino" && esEquipoAptoParaLlaves(e, jugadores)
                  );
                  return (
                    <>
                      <div className="flex flex-wrap justify-between items-center gap-2">
                        <span className="text-xs text-gray-600">
                          Equipos femeninos elegibles registrados: <strong>{aptosFem.length}</strong> (mínimo 8 carnets + pago)
                        </span>
                        <button
                          type="button"
                          onClick={() => handleAutocompletarManual("Femenino")}
                          className="bg-purple-100 hover:bg-purple-200 text-purple-900 font-bold text-xs px-3 py-1.5 rounded-xl transition flex items-center gap-1"
                        >
                          <span>⚡</span> Autocompletar con elegibles
                        </button>
                      </div>

                      {aptosFem.length < 3 && (
                        <div className="bg-amber-50 border border-amber-200 text-amber-900 p-3 rounded-2xl text-xs">
                          ⚠️ Hay <strong>{aptosFem.length}</strong> equipos femeninos elegibles (se requieren 3 para el Triangular).
                          Puedes habilitar más equipos subiendo carnets o confirmando pagos.
                        </div>
                      )}

                      <div className="bg-pink-50/70 p-4 rounded-2xl border border-pink-200 space-y-3">
                        <h4 className="text-xs font-black text-pink-950 flex items-center gap-1.5">
                          <span>🌸</span> Equipos del Triangular Todos contra Todos (3 Equipos)
                        </h4>
                        {[
                          { key: "eq1", label: "Equipo 1 (Jornada 1 vs Eq 2 / Jornada 3 vs Eq 3)" },
                          { key: "eq2", label: "Equipo 2 (Jornada 1 vs Eq 1 / Jornada 2 vs Eq 3)" },
                          { key: "eq3", label: "Equipo 3 (Jornada 2 vs Eq 2 / Jornada 3 vs Eq 1)" }
                        ].map((slot) => (
                          <div key={slot.key}>
                            <label className="block text-[11px] font-bold text-gray-700 mb-1">
                              {slot.label}:
                            </label>
                            <select
                              required
                              value={manualFem[slot.key]}
                              onChange={(e) => setManualFem({ ...manualFem, [slot.key]: e.target.value })}
                              className="w-full border border-gray-300 p-2.5 rounded-xl text-xs bg-white font-semibold"
                            >
                              <option value="">-- Seleccionar Equipo Femenino --</option>
                              {aptosFem.map((eq) => (
                                <option key={eq.id} value={eq.id}>
                                  {eq.nombre}
                                </option>
                              ))}
                            </select>
                          </div>
                        ))}
                      </div>

                      <div className="flex justify-end gap-2 pt-2">
                        <button
                          type="button"
                          onClick={() => setModalArmadoManual(false)}
                          className="border px-4 py-2.5 rounded-xl text-xs font-bold text-gray-700 hover:bg-gray-100"
                        >
                          Cancelar
                        </button>
                        <button
                          type="submit"
                          className="bg-blue-950 hover:bg-blue-900 text-white font-bold px-6 py-2.5 rounded-xl text-xs transition shadow flex items-center gap-1.5"
                        >
                          <span>💾</span> Guardar y Publicar Triangular Femenino
                        </button>
                      </div>
                    </>
                  );
                })()}
              </form>
            )}
          </div>
        </div>
      )}

      {/* Modal Anotar Gol */}
      {modalGolPartido && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border-2 border-blue-900 text-left">
            <h3 className="text-base font-black text-blue-950 mb-1">⚽ Registrar Gol en Vivo</h3>
            <p className="text-xs text-gray-500 mb-4">{modalGolPartido.nombre}</p>

            <form onSubmit={confirmarGolPartido} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">¿Qué equipo anotó el gol?</label>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      setEquipoGolElegido("1");
                      setJugadorGoleadorElegido("");
                    }}
                    className={`p-2.5 rounded-xl border text-center font-bold truncate ${
                      equipoGolElegido === "1" ? "bg-blue-950 text-white" : "bg-gray-50 text-gray-800"
                    }`}
                  >
                    {modalGolPartido.equipo1?.nombre}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEquipoGolElegido("2");
                      setJugadorGoleadorElegido("");
                    }}
                    className={`p-2.5 rounded-xl border text-center font-bold truncate ${
                      equipoGolElegido === "2" ? "bg-blue-950 text-white" : "bg-gray-50 text-gray-800"
                    }`}
                  >
                    {modalGolPartido.equipo2?.nombre}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Seleccionar Jugador Goleador (Plantilla Oficial):
                </label>
                <select
                  required
                  className="w-full border border-gray-300 p-2.5 rounded-xl text-xs bg-white"
                  value={jugadorGoleadorElegido}
                  onChange={(e) => setJugadorGoleadorElegido(e.target.value)}
                >
                  <option value="">-- Elige al goleador --</option>
                  {jugadores
                    .filter((j) => j.equipoId === (equipoGolElegido === "1" ? modalGolPartido.equipo1?.id : modalGolPartido.equipo2?.id))
                    .map((j) => (
                      <option key={j.id} value={j.id}>
                        {j.nombre} ({j.cuenta})
                      </option>
                    ))}
                </select>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalGolPartido(null)}
                  className="w-1/3 border py-2.5 rounded-xl text-xs font-bold text-gray-700"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="w-2/3 bg-blue-950 hover:bg-blue-900 text-white font-bold py-2.5 rounded-xl text-xs"
                >
                  Confirmar Gol (+1)
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Estado / Ganador de Partido */}
      {modalEstadoPartido && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border-2 border-gray-300 text-left">
            <h3 className="text-base font-black text-blue-950 mb-1">⚙️ Gestionar Encuentro</h3>
            <p className="text-xs text-gray-500 mb-4">{modalEstadoPartido.nombre}</p>

            <form onSubmit={confirmarEstadoPartido} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Estado del Partido</label>
                <select
                  className="w-full border p-2.5 rounded-xl text-xs bg-white font-semibold"
                  value={nuevoEstadoPartido}
                  onChange={(e) => setNuevoEstadoPartido(e.target.value)}
                >
                  <option value="Programado">Programado</option>
                  <option value="En Vivo">🔴 En Vivo</option>
                  <option value="Penales">Tanda de Penales</option>
                  <option value="Finalizado">Finalizado</option>
                  <option value="Descalificado">Descalificado (&gt;5 min retraso / falta)</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-bold text-gray-600 mb-1">
                    Penales {modalGolPartido?.equipo1?.nombre || "Eq 1"}
                  </label>
                  <input
                    type="number"
                    placeholder="0"
                    value={penales1Input}
                    onChange={(e) => setPenales1Input(e.target.value)}
                    className="w-full border p-2 rounded-lg text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-gray-600 mb-1">
                    Penales {modalGolPartido?.equipo2?.nombre || "Eq 2"}
                  </label>
                  <input
                    type="number"
                    placeholder="0"
                    value={penales2Input}
                    onChange={(e) => setPenales2Input(e.target.value)}
                    className="w-full border p-2 rounded-lg text-xs font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Declarar Ganador (Avanza a la siguiente ronda):
                </label>
                <select
                  className="w-full border p-2.5 rounded-xl text-xs bg-white font-bold"
                  value={ganadorElegidoId}
                  onChange={(e) => setGanadorElegidoId(e.target.value)}
                >
                  <option value="">-- Por definir / Empate --</option>
                  {modalEstadoPartido.equipo1 && (
                    <option value={modalEstadoPartido.equipo1.id}>
                      🏆 {modalEstadoPartido.equipo1.nombre}
                    </option>
                  )}
                  {modalEstadoPartido.equipo2 && (
                    <option value={modalEstadoPartido.equipo2.id}>
                      🏆 {modalEstadoPartido.equipo2.nombre}
                    </option>
                  )}
                </select>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalEstadoPartido(null)}
                  className="w-1/3 border py-2.5 rounded-xl text-xs font-bold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="w-2/3 bg-blue-950 hover:bg-blue-900 text-white font-bold py-2.5 rounded-xl text-xs"
                >
                  Guardar Cambios
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Barra Superior con Métricas y Botones de Exportación */}
      <div className="flex flex-wrap justify-between items-center gap-4 bg-white p-5 rounded-3xl border border-gray-200 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black text-blue-950">Panel Administrativo</h1>
            <span className="text-[11px] font-bold px-2.5 py-0.5 rounded bg-emerald-100 text-emerald-800 inline-flex items-center gap-1 shadow-sm">
              <span>🟢</span>
              <span>{modo === "supabase" || modo === "firebase" ? "Servidor Cloud Activo" : "Servidor Oficial MECAFUT"}</span>
            </span>
          </div>
          <p className="text-xs text-gray-500">Control de inscripciones, planillas, cruces y estadísticas en directo</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleToggleInscripciones}
            className={`px-3 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 border ${
              configuracion.inscripcionesAbiertas
                ? "bg-emerald-50 border-emerald-300 text-emerald-800"
                : "bg-red-50 border-red-300 text-red-800"
            }`}
          >
            <span>{configuracion.inscripcionesAbiertas ? "🟢" : "🔴"}</span>
            <span>{configuracion.inscripcionesAbiertas ? "Inscripciones Abiertas" : "Inscripciones Cerradas"}</span>
          </button>

          <button
            type="button"
            onClick={() => exportarExcelOficial(equipos, jugadores)}
            className="bg-emerald-700 hover:bg-emerald-800 text-white px-3.5 py-2 rounded-xl font-bold text-xs transition flex items-center gap-1.5 shadow"
          >
            <span>📊</span> Excel (.xlsx)
          </button>

          <button
            type="button"
            onClick={() => exportarPDFPlanillas(equipos, jugadores)}
            className="bg-red-700 hover:bg-red-800 text-white px-3.5 py-2 rounded-xl font-bold text-xs transition flex items-center gap-1.5 shadow"
          >
            <span>📄</span> Planillas PDF
          </button>

          {modo === "simulado" && (
            <button
              type="button"
              onClick={handleResetSimulado}
              className="border border-gray-300 hover:bg-gray-100 text-gray-700 px-2.5 py-2 rounded-xl text-xs font-semibold"
            >
              🔄 Reset Demo
            </button>
          )}
        </div>
      </div>

      {/* Tarjetas de Resumen Rápido */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white p-3.5 rounded-2xl border border-gray-200 shadow-sm">
          <span className="text-[11px] font-bold uppercase text-gray-400 block">Varones</span>
          <div className="flex items-baseline gap-1 mt-0.5">
            <strong className="text-xl text-blue-950 font-black">{totalMasc}</strong>
            <span className="text-xs text-gray-500">/ {CONFIG_TORNEO.cupos.masculino} máx</span>
          </div>
        </div>
        <div className="bg-white p-3.5 rounded-2xl border border-gray-200 shadow-sm">
          <span className="text-[11px] font-bold uppercase text-gray-400 block">Chicas</span>
          <div className="flex items-baseline gap-1 mt-0.5">
            <strong className="text-xl text-blue-950 font-black">{totalFem}</strong>
            <span className="text-xs text-gray-500">/ {CONFIG_TORNEO.cupos.femenino} máx</span>
          </div>
        </div>
        <div className="bg-white p-3.5 rounded-2xl border border-gray-200 shadow-sm">
          <span className="text-[11px] font-bold uppercase text-gray-400 block">Estado Pagos</span>
          <div className="flex items-baseline gap-1 mt-0.5">
            <strong className="text-xl text-emerald-700 font-black">{confirmados}</strong>
            <span className="text-xs text-amber-700 font-semibold">({pendientes} pend.)</span>
          </div>
        </div>
        <div className="bg-white p-3.5 rounded-2xl border border-gray-200 shadow-sm">
          <span className="text-[11px] font-bold uppercase text-gray-400 block">Total Jugadores</span>
          <div className="flex items-baseline gap-1 mt-0.5">
            <strong className="text-xl text-blue-950 font-black">{jugadores.length}</strong>
            <span className="text-xs text-gray-500">registrados</span>
          </div>
        </div>
      </div>

      {/* F13: Card Editor Oficial de Enlace de WhatsApp para Capitanes */}
      <div className="bg-white p-5 rounded-3xl border border-gray-200 shadow-sm space-y-3">
        <div className="flex flex-wrap justify-between items-center gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xl">💬</span>
            <div>
              <h3 className="text-sm font-black text-blue-950">
                Enlace Oficial del Grupo de WhatsApp para Capitanes
              </h3>
              <p className="text-[11px] text-gray-500">
                Este link se presenta automáticamente a los capitanes en la confirmación de registro y en su portal de equipo.
              </p>
            </div>
          </div>
          {mensajeWhatsapp && (
            <span className="text-xs bg-emerald-100 text-emerald-800 font-bold px-3 py-1 rounded-xl animate-fade-in">
              ✅ {mensajeWhatsapp.texto}
            </span>
          )}
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="url"
            placeholder="https://chat.whatsapp.com/..."
            value={urlWhatsappInput}
            onChange={(e) => setUrlWhatsappInput(e.target.value)}
            className="flex-1 border border-gray-300 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-mono bg-white focus:outline-none focus:ring-2 focus:ring-blue-950"
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={guardandoWhatsapp}
              onClick={handleGuardarWhatsapp}
              className="bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white font-bold text-xs px-4 py-2 rounded-xl transition shadow flex items-center gap-1.5"
            >
              <span>💾</span>
              <span>{guardandoWhatsapp ? "Guardando..." : "Guardar Enlace"}</span>
            </button>

            <button
              type="button"
              onClick={handleProbarWhatsapp}
              className="border border-blue-900 text-blue-900 hover:bg-blue-50 font-bold text-xs px-3.5 py-2 rounded-xl transition flex items-center gap-1.5"
            >
              <span>🔗</span>
              <span>Probar Enlace</span>
            </button>
          </div>
        </div>
      </div>

      {/* Pestañas de Navegación del Panel */}
      <div className="flex flex-wrap border-b border-gray-200 gap-2">
        <button
          type="button"
          onClick={() => setPestanaActiva("equipos")}
          className={`pb-3 px-4 text-xs sm:text-sm font-bold border-b-2 transition ${
            pestanaActiva === "equipos" ? "border-blue-950 text-blue-950 font-black" : "border-transparent text-gray-400"
          }`}
        >
          Equipos y Pagos ({equipos.length})
        </button>

        <button
          type="button"
          onClick={() => setPestanaActiva("jugadores")}
          className={`pb-3 px-4 text-xs sm:text-sm font-bold border-b-2 transition ${
            pestanaActiva === "jugadores" ? "border-blue-950 text-blue-950 font-black" : "border-transparent text-gray-400"
          }`}
        >
          Padrón de Jugadores ({jugadores.length})
        </button>

        <button
          type="button"
          onClick={() => setPestanaActiva("llaves")}
          className={`pb-3 px-4 text-xs sm:text-sm font-bold border-b-2 transition flex items-center gap-1 ${
            pestanaActiva === "llaves" ? "border-blue-950 text-blue-950 font-black" : "border-transparent text-gray-400"
          }`}
        >
          <span>🏆</span>
          <span>Llaves y Sorteo</span>
        </button>

        <button
          type="button"
          onClick={() => setPestanaActiva("resultados")}
          className={`pb-3 px-4 text-xs sm:text-sm font-bold border-b-2 transition flex items-center gap-1 ${
            pestanaActiva === "resultados" ? "border-blue-950 text-blue-950 font-black" : "border-transparent text-gray-400"
          }`}
        >
          <span>🔴</span>
          <span>Resultados en Vivo y Premios</span>
        </button>
      </div>

      {/* ======================================================== */}
      {/* PESTAÑA 1: EQUIPOS Y COMPROBANTES                        */}
      {/* ======================================================== */}
      {pestanaActiva === "equipos" && (
        <div className="space-y-4">
          {equipos.length === 0 ? (
            <div className="bg-white p-12 text-center text-gray-400 text-sm rounded-3xl border">
              No hay equipos registrados todavía.
            </div>
          ) : (
            equipos.map((eq) => {
              const cantJugadores = jugadores.filter((j) => j.equipoId === eq.id).length;
              const colorInfo = CONFIG_TORNEO.coloresUniforme.find(
                (c) => c.nombre.toLowerCase() === (eq.color || "").toLowerCase()
              );

              return (
                <div key={eq.id} className="bg-white p-5 rounded-3xl border border-gray-200 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-black text-blue-950">{eq.nombre}</h3>
                      <span className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded font-medium">
                        {eq.categoria}
                      </span>
                      <span className={`text-xs font-bold px-2.5 py-0.5 rounded ${
                        eq.estado === "Confirmado"
                          ? "bg-emerald-100 text-emerald-800"
                          : eq.estado === "Rechazado"
                          ? "bg-red-100 text-red-800"
                          : "bg-blue-100 text-blue-800"
                      }`}>
                        {eq.estado || "Pendiente"}
                      </span>
                    </div>

                    <div className="text-xs text-gray-600 flex flex-wrap gap-x-4 gap-y-1">
                      <span><strong>Capitán:</strong> {eq.capitan?.nombre} ({eq.capitan?.telefono || "Sin tel."})</span>
                      <span><strong>Docente:</strong> {eq.docente}</span>
                      <span><strong>Integrantes:</strong> {cantJugadores} / {CONFIG_TORNEO.plantilla.max}</span>
                      <span className="flex items-center gap-1">
                        <strong>Color:</strong>
                        <span className="w-3 h-3 rounded-full inline-block border" style={{ backgroundColor: colorInfo?.hex || "#94a3b8" }} />
                        {eq.color}
                      </span>
                      <span className="font-mono text-gray-400">Código: {eq.codigoAcceso}</span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 w-full md:w-auto justify-end pt-2 md:pt-0 border-t md:border-t-0">
                    <button
                      type="button"
                      onClick={() => setVisorModal({
                        titulo: `Comprobante de Pago — ${eq.nombre}`,
                        url: eq.comprobanteDataUrl
                      })}
                      className="border border-blue-900 text-blue-900 hover:bg-blue-50 text-xs font-bold px-3 py-1.5 rounded-xl transition"
                    >
                      🖼️ Ver Comprobante
                    </button>

                    <select
                      className="border border-gray-300 p-1.5 rounded-xl text-xs font-semibold bg-white focus:outline-none"
                      value={eq.estado || "Pendiente"}
                      onChange={(e) => handleCambiarEstado(eq.id, e.target.value)}
                    >
                      <option value="Pendiente">Pendiente</option>
                      <option value="Confirmado">Confirmado</option>
                      <option value="Rechazado">Rechazado</option>
                    </select>

                    <button
                      type="button"
                      onClick={() => handleEliminarEquipo(eq.id, eq.nombre)}
                      title="Eliminar equipo"
                      className="text-red-500 hover:text-red-700 text-xs font-bold p-1.5"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ======================================================== */}
      {/* PESTAÑA 2: PADRÓN DE JUGADORES AGRUPADO (Requisito 4)     */}
      {/* ======================================================== */}
      {pestanaActiva === "jugadores" && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-3xl border border-gray-200 shadow-sm flex flex-col sm:flex-row justify-between items-center gap-3">
            <input
              type="search"
              placeholder="Buscar por jugador, cuenta, DNI, equipo o carrera..."
              className="w-full sm:max-w-md border border-gray-300 px-3.5 py-2 rounded-xl text-xs sm:text-sm bg-white"
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
            />

            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 font-semibold">Modo de vista:</span>
              <button
                type="button"
                onClick={() => setVistaPadron("agrupado")}
                className={`text-xs px-3 py-1.5 rounded-lg font-bold transition ${
                  vistaPadron === "agrupado" ? "bg-blue-950 text-white" : "bg-gray-100 text-gray-700"
                }`}
              >
                👥 Agrupado por Equipos (Defecto)
              </button>
              <button
                type="button"
                onClick={() => setVistaPadron("lista")}
                className={`text-xs px-3 py-1.5 rounded-lg font-bold transition ${
                  vistaPadron === "lista" ? "bg-blue-950 text-white" : "bg-gray-100 text-gray-700"
                }`}
              >
                📋 Lista General
              </button>
            </div>
          </div>

          {vistaPadron === "agrupado" ? (
            <div className="space-y-4">
              {equiposConJugadores.map((eq) => {
                const conFoto = eq.plantilla.filter((j) => esJugadorHabilitado(j)).length;
                return (
                  <div key={eq.id} className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden">
                    {/* Cabecera del Equipo Agrupado */}
                    <div className="bg-gray-50/90 p-4 border-b border-gray-100 flex flex-wrap justify-between items-center gap-2">
                      <div className="flex items-center gap-2">
                        <span className="w-4 h-4 rounded-full border" style={{ backgroundColor: eq.color || "#94a3b8" }} />
                        <h4 className="text-base font-black text-blue-950">{eq.nombre}</h4>
                        <span className="text-xs bg-blue-100 text-blue-900 px-2 py-0.5 rounded font-semibold">
                          {eq.categoria}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <span className="bg-gray-200 text-gray-800 font-mono font-bold px-2.5 py-0.5 rounded-full">
                          👥 {eq.plantilla.length} / 15 integrantes
                        </span>
                        <span className={`font-bold px-2.5 py-0.5 rounded-full ${
                          conFoto >= CONFIG_TORNEO.plantilla.min
                            ? "bg-emerald-100 text-emerald-900"
                            : "bg-amber-100 text-amber-900"
                        }`}>
                          🪪 {conFoto} / {eq.plantilla.length} verificados ({conFoto >= CONFIG_TORNEO.plantilla.min ? "Apto" : "Incompleto"})
                        </span>
                      </div>
                    </div>

                    {/* Tabla de Jugadores de este Equipo */}
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs sm:text-sm text-left border-collapse">
                        <thead className="bg-blue-950/95 text-white uppercase text-[10px] tracking-wider">
                          <tr>
                            <th className="p-3">#</th>
                            <th className="p-3">Jugador</th>
                            <th className="p-3">Cuenta</th>
                            <th className="p-3">DNI</th>
                            <th className="p-3">Verificación de Carnet</th>
                            <th className="p-3">Correo</th>
                            <th className="p-3">Carrera</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {eq.plantilla.map((j, i) => (
                            <tr key={j.id || i} className={`hover:bg-blue-50/30 ${j.esCapitan ? "bg-blue-50/20 font-semibold" : ""}`}>
                              <td className="p-3 text-gray-400 font-mono text-xs">{i + 1}</td>
                              <td className="p-3 text-gray-900">
                                {j.nombre}
                                {j.esCapitan && (
                                  <span className="ml-1.5 text-[9px] bg-blue-100 text-blue-800 font-bold px-1.5 py-0.5 rounded">
                                    Capitán
                                  </span>
                                )}
                              </td>
                              <td className="p-3 font-mono text-gray-600">{j.cuenta}</td>
                              <td className="p-3 font-mono text-gray-800 text-xs font-semibold">{j.dni || "N/A"}</td>
                              <td className="p-3">
                                {(() => {
                                  const tieneFoto = Boolean(j.fotoDocumento || j.foto_documento);
                                  const esDocente = esDocenteAutorizado(j.correo);

                                  if (tieneFoto) {
                                    return (
                                      <div className="flex items-center gap-1.5 flex-wrap">
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setVisorModal({
                                              titulo: `Carnet de ${j.nombre} — ${eq.nombre}`,
                                              url: j.fotoDocumento || j.foto_documento
                                            })
                                          }
                                          className="bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold px-2.5 py-1 rounded-lg transition inline-flex items-center gap-1 shadow-sm"
                                        >
                                          <span>🪪</span>
                                          <span>Ver</span>
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => abrirModalCarnet(j)}
                                          className="border border-blue-800 text-blue-900 hover:bg-blue-50 text-[10px] font-bold px-2 py-1 rounded-lg transition inline-flex items-center gap-1"
                                        >
                                          <span>✏️</span>
                                          <span>Cambiar</span>
                                        </button>
                                      </div>
                                    );
                                  }

                                  if (esDocente) {
                                    return (
                                      <span className="text-[10px] text-blue-900 bg-blue-100 border border-blue-200 px-2.5 py-0.5 rounded-lg font-bold inline-flex items-center gap-1">
                                        <span>👨‍🏫</span>
                                        <span>Docente Exento</span>
                                      </span>
                                    );
                                  }

                                  return (
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <span className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded font-semibold">
                                        ⚠️ Pendiente
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() => abrirModalCarnet(j)}
                                        className="bg-blue-950 hover:bg-blue-900 text-white text-[10px] font-bold px-2.5 py-1 rounded-lg transition inline-flex items-center gap-1 shadow-sm"
                                      >
                                        <span>+</span>
                                        <span>Subir Carnet</span>
                                      </button>
                                    </div>
                                  );
                                })()}
                              </td>
                              <td className="p-3 font-mono text-gray-500 text-xs">{j.correo || "N/A"}</td>
                              <td className="p-3 text-gray-700">{j.carrera}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* Vista Lista General */
            <div className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs sm:text-sm text-left border-collapse">
                  <thead className="bg-blue-950 text-white uppercase text-[10px] tracking-wider">
                    <tr>
                      <th className="p-3">#</th>
                      <th className="p-3">Equipo</th>
                      <th className="p-3">Jugador</th>
                      <th className="p-3">Cuenta</th>
                      <th className="p-3">DNI</th>
                      <th className="p-3">Verificación de Carnet</th>
                      <th className="p-3">Correo</th>
                      <th className="p-3">Carrera</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {jugadoresFiltrados.map((j, i) => (
                      <tr key={j.id || i} className="hover:bg-blue-50/40">
                        <td className="p-3 text-gray-400 font-mono text-xs">{i + 1}</td>
                        <td className="p-3 font-bold text-blue-950">{j.nombreEquipo}</td>
                        <td className="p-3 text-gray-900">{j.nombre}</td>
                        <td className="p-3 font-mono text-gray-600">{j.cuenta}</td>
                        <td className="p-3 font-mono text-gray-800 text-xs font-semibold">{j.dni || "N/A"}</td>
                        <td className="p-3">
                          {(() => {
                            const tieneFoto = Boolean(j.fotoDocumento || j.foto_documento);
                            const esDocente = esDocenteAutorizado(j.correo);

                            if (tieneFoto) {
                              return (
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setVisorModal({
                                        titulo: `Carnet de ${j.nombre} — ${j.nombreEquipo || ""}`,
                                        url: j.fotoDocumento || j.foto_documento
                                      })
                                    }
                                    className="bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold px-2.5 py-1 rounded-lg transition inline-flex items-center gap-1 shadow-sm"
                                  >
                                    <span>🪪</span>
                                    <span>Ver</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => abrirModalCarnet(j)}
                                    className="border border-blue-800 text-blue-900 hover:bg-blue-50 text-[10px] font-bold px-2 py-1 rounded-lg transition inline-flex items-center gap-1"
                                  >
                                    <span>✏️</span>
                                    <span>Cambiar</span>
                                  </button>
                                </div>
                              );
                            }

                            if (esDocente) {
                              return (
                                <span className="text-[10px] text-blue-900 bg-blue-100 border border-blue-200 px-2.5 py-0.5 rounded-lg font-bold inline-flex items-center gap-1">
                                  <span>👨‍🏫</span>
                                  <span>Docente Exento</span>
                                </span>
                              );
                            }

                            return (
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded font-semibold">
                                  ⚠️ Pendiente
                                </span>
                                <button
                                  type="button"
                                  onClick={() => abrirModalCarnet(j)}
                                  className="bg-blue-950 hover:bg-blue-900 text-white text-[10px] font-bold px-2.5 py-1 rounded-lg transition inline-flex items-center gap-1 shadow-sm"
                                >
                                  <span>+</span>
                                  <span>Subir Carnet</span>
                                </button>
                              </div>
                            );
                          })()}
                        </td>
                        <td className="p-3 font-mono text-gray-500 text-xs">{j.correo || "N/A"}</td>
                        <td className="p-3 text-gray-700">{j.carrera}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ======================================================== */}
      {/* PESTAÑA 3: LLAVES Y SORTEO DEL TORNEO (Requisito 2)       */}
      {/* ======================================================== */}
      {pestanaActiva === "llaves" && (
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-3xl border border-gray-200 shadow-sm flex flex-wrap justify-between items-center gap-4">
            <div>
              <h3 className="text-lg font-black text-blue-950">Generador de Cruces y Llaves</h3>
              <p className="text-xs text-gray-500">
                Define los enfrentamientos aleatoriamente o ajusta cruces por categoría con equipos elegibles (mínimo 8 carnets verificados y pago confirmado).
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                className="border border-gray-300 p-2.5 rounded-xl text-xs font-bold bg-white"
                value={categoriaSorteo}
                onChange={(e) => setCategoriaSorteo(e.target.value)}
              >
                <option value="Masculino">Categoría Masculina</option>
                <option value="Femenino">Categoría Femenina</option>
              </select>

              <button
                type="button"
                onClick={() => abrirModalArmadoManual()}
                className="bg-blue-950 hover:bg-blue-900 text-white font-bold text-xs px-4 py-2.5 rounded-xl transition shadow flex items-center gap-1.5"
              >
                <span>🎯</span> Armado Manual de Llaves
              </button>

              <button
                type="button"
                onClick={() => generarCrucesTorneo(true)}
                className="bg-purple-900 hover:bg-purple-800 text-white font-bold text-xs px-4 py-2.5 rounded-xl transition shadow flex items-center gap-1.5"
              >
                <span>🎲</span> Sorteo Aleatorio
              </button>

              <button
                type="button"
                onClick={() => generarCrucesTorneo(false)}
                className="border border-gray-300 hover:bg-gray-100 text-gray-800 font-bold text-xs px-4 py-2.5 rounded-xl transition"
              >
                Organizar por Orden
              </button>
            </div>
          </div>

          {/* F11: Estado y Filtro de Elegibilidad de Equipos */}
          {(() => {
            const equiposCategoria = equipos.filter(
              (e) => (e.categoria || "Masculino") === categoriaSorteo
            );
            const equiposAptos = equiposCategoria.filter((e) => esEquipoAptoParaLlaves(e, jugadores));
            const equiposIncompletos = equiposCategoria.filter((e) => !esEquipoAptoParaLlaves(e, jugadores));

            return (
              <div className="bg-white p-5 rounded-3xl border border-gray-200 shadow-sm space-y-3">
                <div className="flex flex-wrap justify-between items-center gap-2 border-b pb-2">
                  <h4 className="text-xs font-black text-blue-950 flex items-center gap-1.5">
                    <span>🛡️</span> Estado de Elegibilidad para Llaves ({categoriaSorteo})
                  </h4>
                  <div className="flex items-center gap-2 text-[11px] font-bold">
                    <span className="text-emerald-800 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-lg">
                      {equiposAptos.length} Elegibles
                    </span>
                    <span className="text-amber-800 bg-amber-50 border border-amber-200 px-2.5 py-0.5 rounded-lg">
                      {equiposIncompletos.length} Incompletos / Sin Pago
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {equiposCategoria.length === 0 ? (
                    <p className="text-xs text-gray-400 italic">No hay equipos registrados en esta categoría.</p>
                  ) : (
                    equiposCategoria.map((eq) => {
                      const apto = esEquipoAptoParaLlaves(eq, jugadores);
                      const integrantes = jugadores.filter((j) => j.equipoId === eq.id);
                      const cantHabilitados = integrantes.filter(esJugadorHabilitado).length;
                      const estadoPago = (eq.estado || "Pendiente").toLowerCase();
                      const pagoOk =
                        eq.pagoConfirmado === true ||
                        estadoPago === "confirmado" ||
                        estadoPago === "pagado" ||
                        estadoPago === "aprobado";

                      return (
                        <div
                          key={eq.id}
                          className={`text-xs px-3 py-1.5 rounded-2xl border flex items-center gap-1.5 font-medium ${
                            apto
                              ? "bg-emerald-50 border-emerald-200 text-emerald-900"
                              : "bg-amber-50 border-amber-200 text-amber-900"
                          }`}
                        >
                          <span>{apto ? "✅" : "⚠️"}</span>
                          <strong className="font-bold">{eq.nombre}</strong>
                          <span className="text-[10px] opacity-80">
                            {apto
                              ? `(${cantHabilitados}/${CONFIG_TORNEO.plantilla.min} carnets • Pago OK)`
                              : !pagoOk
                              ? `(Pago Pendiente • ${cantHabilitados}/${CONFIG_TORNEO.plantilla.min} carnets)`
                              : `(Incompleto: ${cantHabilitados}/${CONFIG_TORNEO.plantilla.min} carnets)`}
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })()}

          {/* Diagrama Interactivo de Llaves */}
          <div className="bg-white p-6 rounded-3xl border border-gray-200 shadow-sm">
            <BracketTorneo
              bracketData={bracketCategoriaActual}
              editableAdmin={true}
              onRegistrarGol={abrirModalAnotarGol}
              onCambiarGanador={abrirModalEstadoPartido}
            />
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* PESTAÑA 4: RESULTADOS EN VIVO Y PREMIOS (Requisito 3)     */}
      {/* ======================================================== */}
      {pestanaActiva === "resultados" && (
        <div className="space-y-6">
          {/* Configuración de Visibilidad y Fecha del Evento */}
          <div className="bg-white p-6 rounded-3xl border border-gray-200 shadow-sm space-y-4">
            <div className="flex flex-wrap justify-between items-center gap-3 border-b pb-3">
              <div>
                <h3 className="text-base font-black text-blue-950 flex items-center gap-2">
                  <span>📅</span> Control de Visibilidad del Torneo para Usuarios
                </h3>
                <p className="text-xs text-gray-500">
                  Controla cuándo se activa la pestaña pública &quot;Torneo en Vivo&quot; para los estudiantes.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="date"
                  value={torneo?.fechaEvento || CONFIG_TORNEO.fechas.diaEventoDefault}
                  onChange={(e) => actualizarConfigVisibilidadTorneo({ fechaEvento: e.target.value })}
                  className="border p-2 rounded-xl text-xs font-mono font-bold"
                />

                <select
                  value={torneo?.visibilidadPublica || "auto"}
                  onChange={(e) => actualizarConfigVisibilidadTorneo({ visibilidadPublica: e.target.value })}
                  className="border p-2 rounded-xl text-xs font-bold bg-white"
                >
                  <option value="auto">Automático (Visible a partir de la fecha)</option>
                  <option value="visible">🟢 Publicar En Vivo Ahora</option>
                  <option value="oculto">🔒 Ocultar al Público</option>
                </select>
              </div>
            </div>

            {/* Gestor Dinámico de Criterios de Premiación (Requisito 3) */}
            <div>
              <div className="flex flex-wrap justify-between items-center gap-2 mb-3">
                <h4 className="text-sm font-black text-blue-950 flex items-center gap-1.5">
                  <span>🎖️</span> Criterios Dinámicos de Premiación (Conteo en Vivo)
                </h4>
              </div>

              {/* Formulario para Crear Criterio */}
              <form onSubmit={handleCrearCriterio} className="flex flex-wrap gap-2 mb-4">
                <input
                  placeholder="Ícono (ej. 🧤, ⭐, 👟)"
                  value={nuevoCriterioIcono}
                  onChange={(e) => setNuevoCriterioIcono(e.target.value)}
                  className="w-16 border p-2 rounded-xl text-center text-sm"
                />
                <input
                  required
                  placeholder="Nombre del nuevo premio (ej. Portero con más atajadas, MVP, etc.)"
                  value={nuevoCriterioNombre}
                  onChange={(e) => setNuevoCriterioNombre(e.target.value)}
                  className="flex-1 min-w-[200px] border p-2 rounded-xl text-xs"
                />
                <button
                  type="submit"
                  className="bg-blue-950 hover:bg-blue-900 text-white font-bold text-xs px-4 py-2 rounded-xl transition"
                >
                  + Agregar Criterio
                </button>
              </form>

              {/* Lista de Criterios Dinámicos con botones +1 / -1 */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {(torneo?.criteriosPremios || []).map((crit) => {
                  const registros = Object.values(crit.registros || {});
                  return (
                    <div key={crit.id} className="p-4 bg-gray-50 rounded-2xl border border-gray-200 space-y-3">
                      <div className="flex justify-between items-center border-b pb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xl">{crit.icono || "🏆"}</span>
                          <strong className="text-xs font-black text-blue-950">{crit.nombre}</strong>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleEliminarCriterio(crit.id)}
                          className="text-red-500 hover:text-red-700 text-xs"
                          title="Eliminar criterio"
                        >
                          ✕
                        </button>
                      </div>

                      {/* Selector para añadir jugador al criterio */}
                      <div className="flex gap-2">
                        <select
                          className="w-full border p-1.5 rounded-lg text-xs bg-white"
                          onChange={(e) => {
                            const jId = e.target.value;
                            if (jId) {
                              const jObj = jugadores.find((item) => item.id === jId);
                              if (jObj) handleAjustarPuntosCriterio(crit.id, jObj, 1);
                              e.target.value = "";
                            }
                          }}
                        >
                          <option value="">+ Sumar jugador a este premio...</option>
                          {jugadores.map((j) => (
                            <option key={j.id} value={j.id}>
                              {j.nombre} ({j.nombreEquipo})
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Lista de Registros con Botones +1 / -1 */}
                      <div className="space-y-1.5">
                        {registros.length === 0 ? (
                          <p className="text-[11px] text-gray-400 italic">Sin jugadores con puntos.</p>
                        ) : (
                          registros
                            .sort((a, b) => b.valor - a.valor)
                            .map((r) => (
                              <div key={r.jugadorId} className="flex justify-between items-center bg-white p-2 rounded-xl border border-gray-100 text-xs">
                                <div>
                                  <strong className="block text-gray-800">{r.nombre}</strong>
                                  <span className="text-[10px] text-gray-400">{r.nombreEquipo}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="font-mono font-black text-blue-950 text-sm">{r.valor}</span>
                                  <div className="flex gap-1">
                                    <button
                                      type="button"
                                      onClick={() => handleAjustarPuntosCriterio(crit.id, { id: r.jugadorId, ...r }, -1)}
                                      className="w-6 h-6 bg-gray-100 hover:bg-gray-200 rounded font-bold text-gray-700 text-xs flex items-center justify-center"
                                    >
                                      -1
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleAjustarPuntosCriterio(crit.id, { id: r.jugadorId, ...r }, 1)}
                                      className="w-6 h-6 bg-blue-900 hover:bg-blue-800 text-white rounded font-bold text-xs flex items-center justify-center"
                                    >
                                      +1
                                    </button>
                                  </div>
                                </div>
                              </div>
                            ))
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

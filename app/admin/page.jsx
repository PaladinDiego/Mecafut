"use client";
import { useState, useEffect } from "react";
import {
  obtenerDatosAdmin,
  actualizarEstadoEquipo,
  eliminarEquipoAdmin,
  cambiarEstadoInscripciones,
  guardarBracketCategoria,
  guardarTorneoCompleto,
  actualizarConfigVisibilidadTorneo,
  crearCriterioPremio,
  eliminarCriterioPremio,
  ajustarConteoCriterio,
  actualizarDocumentoJugador,
  revisarCarnetJugadorAdmin,
  comprimirDocumento,
  actualizarEnlaceWhatsapp,
  guardarConfiguracionGeneral,
  esJugadorHabilitado,
  obtenerEstadoCarnet,
  isSupabaseConfigured
} from "../../lib/dbService";
import { exportarExcelOficial, exportarPDFPlanillas } from "../../lib/exportUtils";
import { notifyUser } from "../../lib/uiFeedback";
import { CONFIG_TORNEO, esDocenteAutorizado } from "../../lib/torneoConfig";
import { ClipboardList, GitBranch, Radio, Settings, Shield, Users } from "lucide-react";
import {
  obtenerSesionActual,
  verificarOtp,
  verificarSesionServidor,
  generarPasswordTemporalAdmin
} from "../../lib/authService";
import {
  generarBracketEliminacion,
  generarTriangularFemenino,
  generarSerieDosEquiposFemenino,
  propagarGanadorEliminacion,
  actualizarPartidoTriangular,
  actualizarPartidoSerieDos,
  validarBracketCompleto
} from "../../lib/bracketUtils";
import BracketTorneo from "../../components/BracketTorneo";

const ADMIN_SECTIONS = [
  { key: "equipos", label: "Equipos y pagos", icon: Users },
  { key: "jugadores", label: "Padrón de jugadores", icon: ClipboardList },
  { key: "llaves", label: "Llaves y sorteo", icon: GitBranch },
  { key: "resultados", label: "Resultados en vivo", icon: Radio },
  { key: "usuarios", label: "Usuarios y seguridad", icon: Shield },
  { key: "configuracion", label: "Configuración", icon: Settings },
];

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
  const [filtroEstadoCarnet, setFiltroEstadoCarnet] = useState("todos");
  const [pestanaActiva, setPestanaActiva] = useState("equipos"); // "equipos" | "jugadores" | "llaves" | "resultados" | "usuarios" | "configuracion"
  const [vistaPadron, setVistaPadron] = useState("agrupado"); // "agrupado" | "lista"
  const [modo, setModo] = useState("simulado");
  const [visorModal, setVisorModal] = useState(null);
  const [revisandoId, setRevisandoId] = useState(null);

  // Estados para Usuarios y Seguridad
  const [usuarios, setUsuarios] = useState([]);
  const [historial, setHistorial] = useState([]);
  const [modalTempPassword, setModalTempPassword] = useState(null);
  const [generandoTempPassword, setGenerandoTempPassword] = useState(false);
  const [modalHistorialUsuario, setModalHistorialUsuario] = useState(null);

  // Estados para Configuración Operativa (Ocultos por defecto hasta que el comité decida publicarlos)
  const [cfgMaxJugadores, setCfgMaxJugadores] = useState(15);
  const [cfgFechaCierre, setCfgFechaCierre] = useState("");
  const [cfgPublicarGoleadores, setCfgPublicarGoleadores] = useState(false);
  const [cfgPublicarClasificacion, setCfgPublicarClasificacion] = useState(false);
  const [cfgPublicarPremios, setCfgPublicarPremios] = useState(false);
  const [guardandoConfig, setGuardandoConfig] = useState(false);
  const [mensajeConfig, setMensajeConfig] = useState(null);

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
    eq3: "",
    eq4: ""
  });

  const [sesionActual, setSesionActual] = useState(null);

  useEffect(() => {
    let cancelado = false;
    const validarAccesoAdmin = async () => {
      const sLocal = obtenerSesionActual();
      setSesionActual(sLocal);
      if (!sLocal || sLocal.rol !== "admin") {
        setIsLogged(false);
        return;
      }
      const sValida = await verificarSesionServidor();
      if (cancelado) return;
      if (sValida && sValida.rol === "admin") {
        setSesionActual(sValida);
        setIsLogged(true);
        fetchData();
      } else {
        setSesionActual(obtenerSesionActual());
        setIsLogged(false);
      }
    };
    validarAccesoAdmin();
    return () => {
      cancelado = true;
    };
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
      setUsuarios(data.usuarios || []);
      setHistorial(data.historial || []);
      const cfg = data.configuracion || { inscripcionesAbiertas: true };
      setConfiguracion(cfg);
      setCfgMaxJugadores(cfg.maxJugadoresPorEquipo || 15);
      setCfgFechaCierre(cfg.fechaCierreInscripciones ? cfg.fechaCierreInscripciones.slice(0, 10) : "");
      setCfgPublicarGoleadores(Boolean(cfg.publicarGoleadores));
      setCfgPublicarClasificacion(Boolean(cfg.publicarClasificacion));
      setCfgPublicarPremios(Boolean(cfg.publicarPremios));
      if (cfg.whatsappCapitanesUrl) {
        setUrlWhatsappInput(cfg.whatsappCapitanesUrl);
      }
      setTorneo(data.torneo || null);
      setModo(data.modo);
    } catch (err) {
      notifyUser("Error al cargar datos del panel: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCambiarEstado = async (equipoId, nuevoEstado) => {
    try {
      await actualizarEstadoEquipo(equipoId, nuevoEstado);
      fetchData();
    } catch (err) {
      notifyUser("Error al cambiar estado: " + err.message);
    }
  };

  const handleEliminarEquipo = async (equipoId, nombreEquipo) => {
    if (confirm(`¿Eliminar definitivamente el equipo "${nombreEquipo}" y todos sus jugadores? Esta acción no se puede deshacer.`)) {
      try {
        await eliminarEquipoAdmin(equipoId);
        fetchData();
      } catch (err) {
        notifyUser("Error al eliminar equipo: " + err.message);
      }
    }
  };

  const handleToggleInscripciones = async () => {
    const nuevoEstado = !configuracion.inscripcionesAbiertas;
    try {
      await cambiarEstadoInscripciones(nuevoEstado);
      setConfiguracion({ ...configuracion, inscripcionesAbiertas: nuevoEstado });
    } catch (err) {
      notifyUser("Error actualizando estado de inscripciones: " + err.message);
    }
  };

  // ========================================================
  // F13: GESTIÓN DEL ENLACE DE WHATSAPP DE CAPITANES
  // ========================================================
  const handleGuardarWhatsapp = async (e) => {
    if (e) e.preventDefault();
    const urlLimpia = (urlWhatsappInput || "").trim();
    if (!urlLimpia.startsWith("https://")) {
      notifyUser("El enlace debe ser seguro y comenzar con https:// (ej. https://chat.whatsapp.com/...)");
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
      notifyUser("Error al guardar enlace de WhatsApp: " + err.message);
    } finally {
      setGuardandoWhatsapp(false);
    }
  };

  const handleProbarWhatsapp = () => {
    const url = (urlWhatsappInput || "").trim();
    if (!url.startsWith("https://")) {
      notifyUser("Ingresa un enlace válido que comience con https:// para probarlo.");
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
      notifyUser("Por favor selecciona una foto de carnet o matrícula.");
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
      notifyUser(`¡Carnet de ${modalCarnetJugador.nombre} actualizado y verificado con éxito!`);
      setModalCarnetJugador(null);
      setCarnetDataUrl(null);
    } catch (err) {
      notifyUser("Error guardando carnet: " + err.message);
    } finally {
      setSubiendoCarnet(false);
    }
  };

  // ========================================================
  // REVISIÓN INDIVIDUAL DE CARNETS (APROBAR / RECHAZAR CON MOTIVO)
  // ========================================================
  const handleRevisarCarnet = async (jugador, decision) => {
    let motivo = "";
    if (decision === "rechazado") {
      motivo = prompt(
        "Ingresa el motivo del rechazo del carnet (visible para el jugador y capitán):",
        "La foto es ilegible o no coincide con los datos."
      );
      if (motivo === null) return;
    }

    setRevisandoId(jugador.id);
    try {
      await revisarCarnetJugadorAdmin({ jugadorId: jugador.id, decision, motivo });
      setJugadores((prev) =>
        prev.map((j) =>
          j.id === jugador.id
            ? {
                ...j,
                estadoCarnet: decision,
                estado_carnet: decision,
                estado: decision === "verificado" ? "Aprobado" : "Rechazado",
                motivoRechazo: decision === "rechazado" ? motivo : null
              }
            : j
        )
      );
      if (visorModal?.jugador?.id === jugador.id) {
        setVisorModal(null);
      }
    } catch (err) {
      notifyUser("Error al revisar carnet: " + err.message);
    } finally {
      setRevisandoId(null);
    }
  };

  // ========================================================
  // GESTIÓN DE USUARIOS Y CONTRASEÑAS TEMPORALES
  // ========================================================
  const handleGenerarPasswordTemporal = async (u) => {
    if (
      !confirm(
        `¿Generar una contraseña temporal para "${u.nombre || u.correo}" (${u.correo})?\n\nLa sesión actual del usuario será revocada y se le exigirá cambiar la contraseña en su próximo inicio de sesión.`
      )
    ) {
      return;
    }
    setGenerandoTempPassword(true);
    try {
      const res = await generarPasswordTemporalAdmin(u.id);
      setModalTempPassword({
        usuarioId: u.id,
        nombre: u.nombre,
        correo: u.correo,
        tempPassword: res.tempPassword
      });
      fetchData();
    } catch (err) {
      notifyUser("Error al generar contraseña temporal: " + err.message);
    } finally {
      setGenerandoTempPassword(false);
    }
  };

  // ========================================================
  // CONFIGURACIÓN GENERAL Y VISIBILIDAD OPERATIVA
  // ========================================================
  const handleGuardarConfiguracionGeneral = async (e) => {
    if (e) e.preventDefault();
    setGuardandoConfig(true);
    setMensajeConfig(null);
    try {
      const actualizadas = {
        maxJugadoresPorEquipo: parseInt(cfgMaxJugadores, 10) || 15,
        fechaCierreInscripciones: cfgFechaCierre || null,
        publicarGoleadores: Boolean(cfgPublicarGoleadores),
        publicarClasificacion: Boolean(cfgPublicarClasificacion),
        publicarPremios: Boolean(cfgPublicarPremios),
        whatsappCapitanesUrl: (urlWhatsappInput || "").trim()
      };
      await guardarConfiguracionGeneral(actualizadas);
      setConfiguracion((prev) => ({ ...prev, ...actualizadas }));
      setMensajeConfig({ tipo: "exito", texto: "¡Configuración general guardada correctamente!" });
      setTimeout(() => setMensajeConfig(null), 4000);
      fetchData();
    } catch (err) {
      notifyUser("Error al guardar configuración: " + err.message);
    } finally {
      setGuardandoConfig(false);
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
      notifyUser(
        `Se requieren al menos 2 equipos elegibles (pago confirmado y mínimo ${CONFIG_TORNEO.plantilla.min} carnets verificados) en la categoría ${categoria} para armar el torneo.`
      );
      return;
    }

    let nuevoBracket;
    if (categoria === "Femenino") {
      if (equiposAptos.length === 2) {
        const opcion = prompt(
          "Se detectaron 2 equipos femeninos elegibles.\nElige el formato oficial para la serie final:\n\n1 = Gran Final a Partido Único\n2 = Serie a 2 Partidos (Ida y Vuelta con desempate por penales)\n3 = Serie al Mejor de 3 Partidos (gana quien logre 2 victorias)\n\nIngresa 1, 2 o 3 [por defecto 1]:",
          "1"
        );
        let formato2 = "final_unica";
        if (opcion === "2") formato2 = "ida_vuelta";
        if (opcion === "3") formato2 = "mejor_de_tres";
        nuevoBracket = generarSerieDosEquiposFemenino(equiposAptos, { formato: formato2, aleatorio });
      } else if (equiposAptos.length === 3) {
        nuevoBracket = generarTriangularFemenino(equiposAptos, aleatorio);
      } else if (equiposAptos.length === 4) {
        nuevoBracket = generarBracketEliminacion(equiposAptos, aleatorio);
      } else {
        notifyUser(
          "Decisión Reglamentaria Requerida del Comité: Hay 5 o más equipos femeninos registrados (el cupo reglamentario base es 4).\n\nLa generación automática ha sido detenida. Utiliza el Armado Manual de Llaves según la resolución oficial del Comité Organizador."
        );
        return;
      }
    } else {
      nuevoBracket = generarBracketEliminacion(equiposAptos, aleatorio);
    }

    const val = validarBracketCompleto(nuevoBracket);
    if (!val.valido) {
      notifyUser("Error en la validación reglamentaria de llaves:\n" + val.errores.join("\n"));
      return;
    }

    try {
      const actualizado = await guardarBracketCategoria(categoria, nuevoBracket);
      setTorneo(actualizado);
      notifyUser(`¡Cruces generados con éxito para la categoría ${categoria}!`);
    } catch (err) {
      notifyUser("Error guardando cruces: " + err.message);
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
        notifyUser("No hay equipos masculinos elegibles registrados.");
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
        notifyUser("No hay equipos femeninos elegibles registrados.");
        return;
      }
      setManualFem({
        eq1: aptos[0]?.id || "",
        eq2: aptos[1]?.id || "",
        eq3: aptos[2]?.id || "",
        eq4: aptos[3]?.id || ""
      });
    }
  };

  const handleGuardarManualMasculino = async (e) => {
    e.preventDefault();
    const keys = ["bye1", "bye2", "bye3", "bye4", "p1a", "p1b", "p2a", "p2b", "p3a", "p3b", "p4a", "p4b"];
    const ids = keys.map((k) => manualMasc[k]);

    if (ids.some((id) => !id)) {
      notifyUser("Debes seleccionar los 12 equipos para los pases directos y los 4 partidos preliminares.");
      return;
    }

    const setIds = new Set(ids);
    if (setIds.size !== 12) {
      notifyUser("Error de validación: Hay equipos repetidos en la selección. Cada uno de los 12 equipos debe ser único.");
      return;
    }

    const orderedTeams = ids.map((id) => equipos.find((eq) => eq.id === id)).filter(Boolean);
    if (orderedTeams.length !== 12) {
      notifyUser("Error al cargar los datos de los equipos seleccionados.");
      return;
    }

    try {
      const bracket = generarBracketEliminacion(orderedTeams, false);
      const actualizado = await guardarBracketCategoria("Masculino", bracket);
      setTorneo(actualizado);
      setModalArmadoManual(false);
      notifyUser("¡Llave Masculina armada y publicada con éxito!");
    } catch (err) {
      notifyUser("Error guardando llave masculina: " + err.message);
    }
  };

  const handleGuardarManualFemenino = async (e) => {
    e.preventDefault();
    const aptosFem = equipos.filter(
      (e) => e.categoria === "Femenino" && esEquipoAptoParaLlaves(e, jugadores)
    );
    const requeridos = aptosFem.length >= 4 ? 4 : (aptosFem.length === 2 ? 2 : 3);
    const ids = requeridos === 4
      ? [manualFem.eq1, manualFem.eq2, manualFem.eq3, manualFem.eq4]
      : (requeridos === 2 ? [manualFem.eq1, manualFem.eq2] : [manualFem.eq1, manualFem.eq2, manualFem.eq3]);

    if (ids.some((id) => !id)) {
      notifyUser(`Debes seleccionar los ${requeridos} equipos para el torneo femenino.`);
      return;
    }

    const setIds = new Set(ids);
    if (setIds.size !== requeridos) {
      notifyUser(`Error de validación: Hay equipos repetidos en la selección. Los ${requeridos} equipos deben ser únicos.`);
      return;
    }

    const orderedTeams = ids.map((id) => equipos.find((eq) => eq.id === id)).filter(Boolean);
    if (orderedTeams.length !== requeridos) {
      notifyUser("Error al cargar los datos de los equipos femeninos seleccionados.");
      return;
    }

    try {
      let bracket;
      if (requeridos === 2) {
        bracket = generarSerieDosEquiposFemenino(orderedTeams, "final_unica", false);
      } else if (requeridos === 4) {
        bracket = generarBracketEliminacion(orderedTeams, false);
      } else {
        bracket = generarTriangularFemenino(orderedTeams, false);
      }
      const actualizado = await guardarBracketCategoria("Femenino", bracket);
      setTorneo(actualizado);
      setModalArmadoManual(false);
      notifyUser("¡Llave Femenina armada y publicada con éxito!");
    } catch (err) {
      notifyUser("Error guardando llave femenina: " + err.message);
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
      bracketNuevo = actualizarPartidoTriangular(bracket, partidoActualizado);
    } else if (bracket.tipo === "serie_dos_equipos") {
      bracketNuevo = actualizarPartidoSerieDos(bracket, partidoActualizado);
    } else {
      bracketNuevo = propagarGanadorEliminacion(bracket, partidoActualizado);
    }

    try {
      const torActualizado = await guardarBracketCategoria(categoria, bracketNuevo);
      setTorneo(torActualizado);
      setModalGolPartido(null);
    } catch (err) {
      notifyUser("Error registrando gol: " + err.message);
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
      bracketNuevo = actualizarPartidoTriangular(bracket, partidoActualizado);
    } else if (bracket.tipo === "serie_dos_equipos") {
      bracketNuevo = actualizarPartidoSerieDos(bracket, partidoActualizado);
    } else {
      bracketNuevo = propagarGanadorEliminacion(bracket, partidoActualizado);
    }

    try {
      const torActualizado = await guardarBracketCategoria(categoria, bracketNuevo);
      setTorneo(torActualizado);
      setModalEstadoPartido(null);
    } catch (err) {
      notifyUser("Error actualizando partido: " + err.message);
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
      notifyUser("Error creando criterio: " + err.message);
    }
  };

  const handleEliminarCriterio = async (critId) => {
    if (confirm("¿Eliminar este criterio de premiación?")) {
      try {
        const act = await eliminarCriterioPremio(critId);
        setTorneo(act);
      } catch (err) {
        notifyUser("Error eliminando criterio: " + err.message);
      }
    }
  };

  const handleAjustarPuntosCriterio = async (critId, jugador, delta) => {
    try {
      const act = await ajustarConteoCriterio({ criterioId: critId, jugador, delta });
      setTorneo(act);
    } catch (err) {
      notifyUser("Error ajustando puntaje: " + err.message);
    }
  };

  const handleActualizarVisibilidadTorneo = async (cambios) => {
    try {
      const act = await actualizarConfigVisibilidadTorneo(cambios);
      setTorneo(act);
    } catch (err) {
      notifyUser("Error actualizando visibilidad del torneo: " + err.message);
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
    <div className="admin-page pb-20 space-y-6">
      {/* Modal universal para ver comprobantes / carnet */}
      {visorModal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto text-center shadow-2xl" role="dialog" aria-modal="true" aria-label="Vista previa del documento">
            <div className="flex justify-between items-center mb-4 border-b pb-2">
              <h3 className="font-bold text-blue-950 text-sm truncate text-left">{visorModal.titulo}</h3>
              <button type="button" onClick={() => setVisorModal(null)} aria-label="Cerrar vista previa" className="text-gray-400 hover:text-gray-700 font-bold">✕</button>
            </div>

            {visorModal.jugador && (
              <div className="mb-3 p-2.5 bg-gray-50 border rounded-xl text-left text-xs grid grid-cols-2 gap-2">
                <div>
                  <span className="text-gray-400 block text-[10px]">Cuenta Estudiantil</span>
                  <strong className="font-mono text-gray-900">{visorModal.jugador.cuenta}</strong>
                </div>
                <div>
                  <span className="text-gray-400 block text-[10px]">DNI Declarado</span>
                  <strong className="font-mono text-gray-900">{visorModal.jugador.dni || "N/A"}</strong>
                </div>
              </div>
            )}

            {visorModal.url ? (
              <img src={visorModal.url} alt="Doc" className="max-h-[55vh] mx-auto rounded-xl border shadow" />
            ) : (
              <p className="text-xs text-gray-400 py-8">Sin imagen adjunta.</p>
            )}

            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {visorModal.jugador && (
                <>
                  <button
                    type="button"
                    disabled={revisandoId === visorModal.jugador.id}
                    onClick={() => handleRevisarCarnet(visorModal.jugador, "verificado")}
                    className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold px-4 py-2 rounded-xl transition shadow flex items-center gap-1"
                  >
                    <span>✅</span>
                    <span>Aprobar Carnet</span>
                  </button>
                  <button
                    type="button"
                    disabled={revisandoId === visorModal.jugador.id}
                    onClick={() => handleRevisarCarnet(visorModal.jugador, "rechazado")}
                    className="bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-xs font-bold px-4 py-2 rounded-xl transition shadow flex items-center gap-1"
                  >
                    <span>❌</span>
                    <span>Rechazar Documento</span>
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => setVisorModal(null)}
                className="bg-gray-100 hover:bg-gray-200 text-gray-800 text-xs font-bold px-4 py-2 rounded-xl"
              >
                Cerrar Visor
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal para Contraseña Temporal Generada */}
      {modalTempPassword && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 sm:p-8 shadow-2xl border border-gray-100 text-center animate-fade-in space-y-4" role="dialog" aria-modal="true" aria-label="Contraseña temporal generada">
            <div className="w-12 h-12 bg-amber-100 text-amber-800 rounded-full flex items-center justify-center text-2xl mx-auto">
              🔑
            </div>
            <h3 className="text-xl font-black text-blue-950">Contraseña Temporal Generada</h3>
            <p className="text-xs text-gray-500">
              Entrega esta contraseña al usuario <strong>{modalTempPassword.nombre || modalTempPassword.correo}</strong> ({modalTempPassword.correo}). Se le obligará a crear una nueva contraseña personal en cuanto inicie sesión.
            </p>

            <div className="bg-gray-100 p-4 rounded-2xl border font-mono text-xl sm:text-2xl font-black text-blue-950 tracking-wider select-all">
              {modalTempPassword.tempPassword}
            </div>

            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-left text-xs text-amber-900">
              ⚠️ <strong>Atención:</strong> Por motivos de seguridad, esta clave no se volverá a mostrar en pantalla. Cópiala y entrégala al destinatario ahora.
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(modalTempPassword.tempPassword);
                  notifyUser("¡Contraseña copiada al portapapeles!");
                }}
                className="flex-1 bg-blue-950 hover:bg-blue-900 text-white font-bold py-2.5 rounded-xl text-xs transition flex items-center justify-center gap-1.5 shadow"
              >
                <span>📋</span>
                <span>Copiar Contraseña</span>
              </button>
              <button
                type="button"
                onClick={() => setModalTempPassword(null)}
                aria-label="Cerrar contraseña temporal"
                className="px-5 border border-gray-300 hover:bg-gray-50 font-bold text-gray-700 py-2.5 rounded-xl text-xs"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal para Historial de Cambios de Identidad de Usuario */}
      {modalHistorialUsuario && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-gray-100 animate-fade-in space-y-4" role="dialog" aria-modal="true" aria-label="Historial de identidad de usuario">
            <div className="flex justify-between items-center border-b pb-3">
              <h3 className="text-base font-black text-blue-950 flex items-center gap-2">
                <span>⚠️</span>
                <span>Historial de Identidad ({modalHistorialUsuario.correo})</span>
              </h3>
              <button
                type="button"
                onClick={() => setModalHistorialUsuario(null)}
                aria-label="Cerrar historial de identidad"
                className="text-gray-400 hover:text-gray-600 font-bold text-lg"
              >
                ✕
              </button>
            </div>
            <div className="max-h-80 overflow-y-auto space-y-2">
              {modalHistorialUsuario.cambios.length === 0 ? (
                <p className="text-xs text-gray-400 italic">No se registran cambios de identidad.</p>
              ) : (
                modalHistorialUsuario.cambios.map((c, idx) => (
                  <div key={idx} className="p-3 bg-gray-50 rounded-xl border text-xs space-y-1">
                    <div className="flex justify-between text-gray-500 text-[10px]">
                      <span>Campo: <strong className="text-blue-900">{c.campo || c.columna}</strong></span>
                      <span>{c.fecha ? new Date(c.fecha).toLocaleString("es-HN") : (c.creado_en ? new Date(c.creado_en).toLocaleString("es-HN") : "")}</span>
                    </div>
                    <div className="text-gray-700">
                      <span className="line-through text-red-600 mr-2">{c.valorAnterior || c.valor_anterior || "(vacío)"}</span>
                      <span>➔</span>
                      <span className="text-emerald-700 font-bold ml-2">{c.valorNuevo || c.valor_nuevo}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
            <button
              type="button"
              onClick={() => setModalHistorialUsuario(null)}
              className="w-full bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold py-2 rounded-xl text-xs"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}

      {/* F10: Modal para Subir o Cambiar Carnet en el Padrón */}
      {modalCarnetJugador && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border-2 border-blue-950 text-left animate-fade-in" role="dialog" aria-modal="true" aria-label="Subir o cambiar carnet">
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
                aria-label="Cerrar carga de carnet"
                className="text-gray-400 hover:text-gray-700 font-bold text-lg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleGuardarCarnet} className="space-y-4">
              <div>
                <label htmlFor="admin-carnet-file" className="block text-xs font-bold text-gray-700 mb-1">
                  Foto del Carnet Estudiantil o Comprobante de Matrícula:
                </label>
                <input
                  id="admin-carnet-file"
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
          <div className="bg-white rounded-3xl p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border-2 border-blue-950 text-left animate-fade-in" role="dialog" aria-modal="true" aria-label="Armado manual de llaves del torneo">
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
                aria-label="Cerrar armado manual de llaves"
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
                              <label htmlFor={`manual-slot-${slot.key}`} className="block text-[11px] font-bold text-gray-700 mb-1">
                                {slot.label}:
                              </label>
                              <select
                                id={`manual-slot-${slot.key}`}
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
                                  aria-label={`Equipo local, partido ${partido.num}`}
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
                                  aria-label={`Equipo visitante, partido ${partido.num}`}
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

                      {aptosFem.length < 2 && (
                        <div className="bg-amber-50 border border-amber-200 text-amber-900 p-3 rounded-2xl text-xs">
                          ⚠️ Hay <strong>{aptosFem.length}</strong> equipos femeninos elegibles (se requieren al menos 2 para armar llaves).
                          Puedes habilitar más equipos subiendo carnets o confirmando pagos.
                        </div>
                      )}

                      {(() => {
                        const requeridos = aptosFem.length >= 4 ? 4 : (aptosFem.length === 2 ? 2 : 3);
                        const slots = requeridos === 4 ? [
                          { key: "eq1", label: "Semifinal 1 - Equipo A" },
                          { key: "eq2", label: "Semifinal 1 - Equipo B" },
                          { key: "eq3", label: "Semifinal 2 - Equipo A" },
                          { key: "eq4", label: "Semifinal 2 - Equipo B" }
                        ] : (requeridos === 2 ? [
                          { key: "eq1", label: "Equipo 1 (Finalista A)" },
                          { key: "eq2", label: "Equipo 2 (Finalista B)" }
                        ] : [
                          { key: "eq1", label: "Equipo 1 (Jornada 1 vs Eq 2 / Jornada 3 vs Eq 3)" },
                          { key: "eq2", label: "Equipo 2 (Jornada 1 vs Eq 1 / Jornada 2 vs Eq 3)" },
                          { key: "eq3", label: "Equipo 3 (Jornada 2 vs Eq 2 / Jornada 3 vs Eq 1)" }
                        ]);

                        return (
                          <div className="bg-pink-50/70 p-4 rounded-2xl border border-pink-200 space-y-3">
                            <h4 className="text-xs font-black text-pink-950 flex items-center gap-1.5">
                              <span>🌸</span> Equipos de Categoría Femenina ({requeridos} Equipos)
                            </h4>
                            {slots.map((slot) => (
                              <div key={slot.key}>
                                <label htmlFor={`manual-slot-${slot.key}`} className="block text-[11px] font-bold text-gray-700 mb-1">
                                  {slot.label}:
                                </label>
                                <select
                                  id={`manual-slot-${slot.key}`}
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
                        );
                      })()}

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
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border-2 border-blue-900 text-left" role="dialog" aria-modal="true" aria-label="Registrar gol en vivo">
            <h3 className="text-base font-black text-blue-950 mb-1">⚽ Registrar Gol en Vivo</h3>
            <p className="text-xs text-gray-500 mb-4">{modalGolPartido.nombre}</p>

            <form onSubmit={confirmarGolPartido} className="space-y-4">
              <div>
                <div className="grid grid-cols-2 gap-2 text-xs" role="group" aria-label="¿Qué equipo anotó el gol?">
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
                <label htmlFor="goal-scorer" className="block text-xs font-bold text-gray-700 mb-1">
                  Seleccionar Jugador Goleador (Plantilla Oficial):
                </label>
              <select
                  id="goal-scorer"
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
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border-2 border-gray-300 text-left" role="dialog" aria-modal="true" aria-label="Gestionar encuentro">
            <h3 className="text-base font-black text-blue-950 mb-1">⚙️ Gestionar Encuentro</h3>
            <p className="text-xs text-gray-500 mb-4">{modalEstadoPartido.nombre}</p>

            <form onSubmit={confirmarEstadoPartido} className="space-y-4">
              <div>
                <label htmlFor="match-status" className="block text-xs font-bold text-gray-700 mb-1">Estado del Partido</label>
                <select
                  id="match-status"
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
                  <label htmlFor="match-penalties-one" className="block text-[11px] font-bold text-gray-600 mb-1">
                    Penales {modalGolPartido?.equipo1?.nombre || "Eq 1"}
                  </label>
                  <input
                    id="match-penalties-one"
                    type="number"
                    placeholder="0"
                    value={penales1Input}
                    onChange={(e) => setPenales1Input(e.target.value)}
                    className="w-full border p-2 rounded-lg text-xs font-mono"
                  />
                </div>
                <div>
                  <label htmlFor="match-penalties-two" className="block text-[11px] font-bold text-gray-600 mb-1">
                    Penales {modalGolPartido?.equipo2?.nombre || "Eq 2"}
                  </label>
                  <input
                    id="match-penalties-two"
                    type="number"
                    placeholder="0"
                    value={penales2Input}
                    onChange={(e) => setPenales2Input(e.target.value)}
                    className="w-full border p-2 rounded-lg text-xs font-mono"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="match-winner" className="block text-xs font-bold text-gray-700 mb-1">
                  Declarar Ganador (Avanza a la siguiente ronda):
                </label>
                <select
                  id="match-winner"
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

      <div className="admin-workspace">
        <aside className="admin-sidebar">
          <div className="admin-sidebar__title">Áreas de trabajo</div>
          <nav aria-label="Áreas administrativas">
            {ADMIN_SECTIONS.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                aria-pressed={pestanaActiva === key}
                aria-controls="admin-panel-content"
                onClick={() => setPestanaActiva(key)}
                className="admin-sidebar__link"
              >
                <Icon size={17} aria-hidden="true" />
                <span>{label}</span>
                {key === "equipos" && <span className="admin-nav-count">{equipos.length}</span>}
                {key === "jugadores" && <span className="admin-nav-count">{jugadores.length}</span>}
                {key === "usuarios" && <span className="admin-nav-count">{usuarios.length}</span>}
              </button>
            ))}
          </nav>
        </aside>

        <div className="admin-mobile-nav">
          <label htmlFor="admin-mobile-area">Área de administración</label>
          <select
            id="admin-mobile-area"
            value={pestanaActiva}
            onChange={(event) => setPestanaActiva(event.target.value)}
          >
            {ADMIN_SECTIONS.map(({ key, label }) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </div>

        <div
          id="admin-panel-content"
          className="admin-panel-content"
          role="region"
          aria-label={`Área administrativa: ${ADMIN_SECTIONS.find((section) => section.key === pestanaActiva)?.label || "Panel"}`}
        >

      {/* ======================================================== */}
      {/* PESTAÑA 1: EQUIPOS Y COMPROBANTES                        */}
      {/* ======================================================== */}
      {pestanaActiva === "equipos" && (
        <div className="space-y-4">
          <div className="admin-section-heading">
            <h2>Equipos y pagos</h2>
            <p>Revisa inscripciones, comprobantes y estado de pago.</p>
          </div>
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
                      aria-label={`Estado de inscripción de ${eq.nombre}`}
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
                      aria-label={`Eliminar equipo ${eq.nombre}`}
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
          <div className="admin-section-heading">
            <h2>Padrón de jugadores</h2>
            <p>Busca personas, valida carnets y comprueba el padrón por equipo.</p>
          </div>
          <div className="bg-white p-4 rounded-3xl border border-gray-200 shadow-sm flex flex-col sm:flex-row justify-between items-center gap-3">
            <input
              type="search"
              aria-label="Buscar jugador, cuenta, DNI, equipo o carrera"
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
                                  const estadoCarnet = obtenerEstadoCarnet(j);
                                  const esDocente = estadoCarnet === "exento_docente" || esDocenteAutorizado(j.correo);

                                  if (esDocente) {
                                    return (
                                      <span className="text-[10px] text-blue-900 bg-blue-100 border border-blue-200 px-2.5 py-0.5 rounded-lg font-bold inline-flex items-center gap-1">
                                        <span>👨‍🏫</span>
                                        <span>Docente Exento</span>
                                      </span>
                                    );
                                  }

                                  return (
                                    <div className="flex flex-col gap-1">
                                      <div className="flex items-center gap-1.5 flex-wrap">
                                        {estadoCarnet === "verificado" ? (
                                          <span className="text-[10px] bg-emerald-100 text-emerald-900 font-bold px-2 py-0.5 rounded border border-emerald-300">
                                            ✅ Verificado
                                          </span>
                                        ) : estadoCarnet === "rechazado" ? (
                                          <span className="text-[10px] bg-red-100 text-red-900 font-bold px-2 py-0.5 rounded border border-red-300">
                                            ❌ Rechazado
                                          </span>
                                        ) : tieneFoto ? (
                                          <span className="text-[10px] bg-blue-100 text-blue-900 font-semibold px-2 py-0.5 rounded border border-blue-200">
                                            ⏳ En revisión
                                          </span>
                                        ) : (
                                          <span className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded font-semibold">
                                            ⚠️ Pendiente
                                          </span>
                                        )}

                                        {tieneFoto && (
                                          <button
                                            type="button"
                                            onClick={() =>
                                              setVisorModal({
                                                titulo: `Carnet de ${j.nombre} — ${eq.nombre}`,
                                                url: j.fotoDocumento || j.foto_documento,
                                                jugador: j
                                              })
                                            }
                                            className="bg-blue-950 hover:bg-blue-900 text-white text-[10px] font-bold px-2 py-0.5 rounded transition inline-flex items-center gap-1 shadow-sm"
                                          >
                                            <span>🪪</span>
                                            <span>Inspeccionar</span>
                                          </button>
                                        )}

                                        {tieneFoto && estadoCarnet !== "verificado" && (
                                          <button
                                            type="button"
                                            disabled={revisandoId === j.id}
                                            onClick={() => handleRevisarCarnet(j, "verificado")}
                                            className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-[10px] font-bold px-2 py-0.5 rounded transition shadow-sm"
                                            title="Aprobar carnet"
                                          >
                                            ✓ Aprobar
                                          </button>
                                        )}

                                        {tieneFoto && estadoCarnet !== "rechazado" && (
                                          <button
                                            type="button"
                                            disabled={revisandoId === j.id}
                                            onClick={() => handleRevisarCarnet(j, "rechazado")}
                                            className="bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 text-[10px] font-bold px-1.5 py-0.5 rounded transition"
                                            title="Rechazar carnet con motivo"
                                          >
                                            ✕ Rechazar
                                          </button>
                                        )}

                                        <button
                                          type="button"
                                          onClick={() => abrirModalCarnet(j)}
                                          className="text-[10px] text-blue-800 hover:underline font-bold px-1 py-0.5"
                                        >
                                          {tieneFoto ? "Cambiar" : "+ Subir"}
                                        </button>
                                      </div>
                                      {estadoCarnet === "rechazado" && j.motivoRechazo && (
                                        <p className="text-[10px] text-red-700 italic">
                                          Motivo: {j.motivoRechazo}
                                        </p>
                                      )}
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
                            const estadoCarnet = obtenerEstadoCarnet(j);
                            const esDocente = estadoCarnet === "exento_docente" || esDocenteAutorizado(j.correo);

                            if (esDocente) {
                              return (
                                <span className="text-[10px] text-blue-900 bg-blue-100 border border-blue-200 px-2.5 py-0.5 rounded-lg font-bold inline-flex items-center gap-1">
                                  <span>👨‍🏫</span>
                                  <span>Docente Exento</span>
                                </span>
                              );
                            }

                            return (
                              <div className="flex flex-col gap-1">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  {estadoCarnet === "verificado" ? (
                                    <span className="text-[10px] bg-emerald-100 text-emerald-900 font-bold px-2 py-0.5 rounded border border-emerald-300">
                                      ✅ Verificado
                                    </span>
                                  ) : estadoCarnet === "rechazado" ? (
                                    <span className="text-[10px] bg-red-100 text-red-900 font-bold px-2 py-0.5 rounded border border-red-300">
                                      ❌ Rechazado
                                    </span>
                                  ) : tieneFoto ? (
                                    <span className="text-[10px] bg-blue-100 text-blue-900 font-semibold px-2 py-0.5 rounded border border-blue-200">
                                      ⏳ En revisión
                                    </span>
                                  ) : (
                                    <span className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded font-semibold">
                                      ⚠️ Pendiente
                                    </span>
                                  )}

                                  {tieneFoto && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setVisorModal({
                                          titulo: `Carnet de ${j.nombre} — ${j.nombreEquipo || ""}`,
                                          url: j.fotoDocumento || j.foto_documento,
                                          jugador: j
                                        })
                                      }
                                      className="bg-blue-950 hover:bg-blue-900 text-white text-[10px] font-bold px-2 py-0.5 rounded transition inline-flex items-center gap-1 shadow-sm"
                                    >
                                      <span>🪪</span>
                                      <span>Inspeccionar</span>
                                    </button>
                                  )}

                                  {tieneFoto && estadoCarnet !== "verificado" && (
                                    <button
                                      type="button"
                                      disabled={revisandoId === j.id}
                                      onClick={() => handleRevisarCarnet(j, "verificado")}
                                      className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-[10px] font-bold px-2 py-0.5 rounded transition shadow-sm"
                                      title="Aprobar carnet"
                                    >
                                      ✓ Aprobar
                                    </button>
                                  )}

                                  {tieneFoto && estadoCarnet !== "rechazado" && (
                                    <button
                                      type="button"
                                      disabled={revisandoId === j.id}
                                      onClick={() => handleRevisarCarnet(j, "rechazado")}
                                      className="bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 text-[10px] font-bold px-1.5 py-0.5 rounded transition"
                                      title="Rechazar carnet con motivo"
                                    >
                                      ✕ Rechazar
                                    </button>
                                  )}

                                  <button
                                    type="button"
                                    onClick={() => abrirModalCarnet(j)}
                                    className="text-[10px] text-blue-800 hover:underline font-bold px-1 py-0.5"
                                  >
                                    {tieneFoto ? "Cambiar" : "+ Subir"}
                                  </button>
                                </div>
                                {estadoCarnet === "rechazado" && j.motivoRechazo && (
                                  <p className="text-[10px] text-red-700 italic">
                                    Motivo: {j.motivoRechazo}
                                  </p>
                                )}
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
              <h2 className="text-lg font-black text-blue-950">Generador de cruces y llaves</h2>
              <p className="text-xs text-gray-500">
                Define los enfrentamientos aleatoriamente o ajusta cruces por categoría con equipos elegibles (mínimo 8 carnets verificados y pago confirmado).
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                aria-label="Categoría para generar cruces"
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
          <div className="admin-section-heading">
            <h2>Resultados en vivo</h2>
            <p>Publica el estado del torneo, goles y reconocimientos.</p>
          </div>
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
                <label htmlFor="event-date" className="sr-only">Fecha del evento</label>
                <input
                  id="event-date"
                  type="date"
                  value={torneo?.fechaEvento || CONFIG_TORNEO.fechas.diaEventoDefault}
                  onChange={(e) => handleActualizarVisibilidadTorneo({ fechaEvento: e.target.value })}
                  className="border p-2 rounded-xl text-xs font-mono font-bold"
                />

                <label htmlFor="tournament-visibility" className="sr-only">Visibilidad pública del torneo</label>
                <select
                  id="tournament-visibility"
                  value={torneo?.visibilidadPublica || "auto"}
                  onChange={(e) => handleActualizarVisibilidadTorneo({ visibilidadPublica: e.target.value })}
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
                  aria-label="Ícono del nuevo premio"
                  placeholder="Ícono (ej. 🧤, ⭐, 👟)"
                  value={nuevoCriterioIcono}
                  onChange={(e) => setNuevoCriterioIcono(e.target.value)}
                  className="w-16 border p-2 rounded-xl text-center text-sm"
                />
                <input
                  required
                  aria-label="Nombre del nuevo premio"
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
                          aria-label={`Añadir jugador a ${crit.nombre}`}
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

      {/* ======================================================== */}
      {/* PESTAÑA 5: USUARIOS Y SEGURIDAD                          */}
      {/* ======================================================== */}
      {pestanaActiva === "usuarios" && (
        <div className="space-y-6">
          <div className="admin-section-heading">
            <h2>Usuarios y seguridad</h2>
            <p>Administra accesos y consulta alertas de cambios de identidad.</p>
          </div>
          <div className="bg-white p-6 sm:p-8 rounded-3xl border border-gray-200 shadow-sm space-y-4">
            <div className="flex flex-wrap justify-between items-center gap-3 border-b pb-4">
              <div>
                <h3 className="text-lg font-black text-blue-950 flex items-center gap-2">
                  <span>👥</span> Gestión de Cuentas y Accesos
                </h3>
                <p className="text-xs text-gray-500">
                  Total de usuarios registrados: {usuarios.length}. Genera contraseñas temporales y audita cambios de identidad.
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="border-b bg-gray-50 text-gray-500 uppercase tracking-wider text-[10px]">
                    <th className="p-3">#</th>
                    <th className="p-3">Usuario / Nombre</th>
                    <th className="p-3">Correo Institucional</th>
                    <th className="p-3">Rol</th>
                    <th className="p-3">Clase</th>
                    <th className="p-3">Seguridad</th>
                    <th className="p-3">Historial</th>
                    <th className="p-3 text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {usuarios.map((u, idx) => {
                    const cambiosUsuario = historial.filter(
                      (h) =>
                        (h.correo && u.correo && h.correo.toLowerCase() === u.correo.toLowerCase()) ||
                        (h.usuario_id && h.usuario_id === u.id)
                    );
                    const tieneAlertaIdentidad = cambiosUsuario.length > 0;

                    return (
                      <tr key={u.id || idx} className="hover:bg-gray-50">
                        <td className="p-3 text-gray-400 font-mono">{idx + 1}</td>
                        <td className="p-3">
                          <strong className="text-gray-900 block">{u.nombre || "Sin nombre registrado"}</strong>
                          <span className="text-[10px] text-gray-400 font-mono">ID: {u.id?.slice(0, 8)}...</span>
                        </td>
                        <td className="p-3 font-mono text-gray-700">{u.correo}</td>
                        <td className="p-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              u.rol === "admin"
                                ? "bg-purple-100 text-purple-900 border border-purple-200"
                                : u.rol === "docente"
                                ? "bg-emerald-100 text-emerald-900 border border-emerald-200"
                                : "bg-blue-50 text-blue-900 border border-blue-200"
                            }`}
                          >
                            {u.rol || "jugador"}
                          </span>
                        </td>
                        <td className="p-3 font-mono text-gray-600 text-[11px]">
                          {u.codigo_clase ? `${u.codigo_clase} — ${u.nombre_clase || ""}` : "-"}
                        </td>
                        <td className="p-3">
                          {u.debe_cambiar_password ? (
                            <span className="bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded border border-amber-200">
                              🔑 Debe cambiar clave
                            </span>
                          ) : (
                            <span className="bg-emerald-50 text-emerald-700 text-[10px] font-semibold px-2 py-0.5 rounded border border-emerald-200">
                              ✅ Activa
                            </span>
                          )}
                        </td>
                        <td className="p-3">
                          {tieneAlertaIdentidad ? (
                            <button
                              type="button"
                              onClick={() => setModalHistorialUsuario({ correo: u.correo, cambios: cambiosUsuario })}
                              className="bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 text-[10px] font-bold px-2 py-0.5 rounded flex items-center gap-1"
                            >
                              <span>⚠️</span>
                              <span>{cambiosUsuario.length} cambios</span>
                            </button>
                          ) : (
                            <span className="text-[10px] text-gray-400">Sin cambios</span>
                          )}
                        </td>
                        <td className="p-3 text-center">
                          <button
                            type="button"
                            disabled={generandoTempPassword}
                            onClick={() => handleGenerarPasswordTemporal(u)}
                            className="bg-blue-50 hover:bg-blue-100 text-blue-900 border border-blue-200 px-2.5 py-1 rounded-xl text-xs font-bold transition inline-flex items-center gap-1 shadow-sm disabled:opacity-50"
                            title="Generar contraseña temporal"
                          >
                            <span>🔑</span>
                            <span>Temp Password</span>
                          </button>
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

      {/* ======================================================== */}
      {/* PESTAÑA 6: CONFIGURACIÓN OPERATIVA                       */}
      {/* ======================================================== */}
      {pestanaActiva === "configuracion" && (
        <div className="space-y-6">
          <div className="admin-section-heading">
            <h2>Configuración</h2>
            <p>Gestiona límites, fechas y publicaciones del torneo.</p>
          </div>
          <section className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm space-y-3">
            <div className="flex flex-wrap justify-between items-center gap-2">
              <div className="flex items-center gap-2">
                <span className="text-xl" aria-hidden="true">💬</span>
                <div>
                  <h3 className="text-sm font-black text-blue-950">
                    Enlace del grupo de WhatsApp para capitanes
                  </h3>
                  <p className="text-[11px] text-gray-500">
                    Se muestra a los capitanes al completar la inscripción y en el portal del equipo.
                  </p>
                </div>
              </div>
              {mensajeWhatsapp && (
                <span className="state-message text-xs font-bold" role="status">
                  {mensajeWhatsapp.texto}
                </span>
              )}
            </div>

            <label htmlFor="admin-whatsapp-url" className="sr-only">Enlace del grupo de WhatsApp</label>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                id="admin-whatsapp-url"
                type="url"
                placeholder="https://chat.whatsapp.com/..."
                value={urlWhatsappInput}
                onChange={(e) => setUrlWhatsappInput(e.target.value)}
                className="flex-1 border border-gray-300 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-mono bg-white focus:outline-none focus:ring-2 focus:ring-blue-950"
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={guardandoWhatsapp}
                  onClick={handleGuardarWhatsapp}
                  className="bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white font-bold text-xs px-4 py-2 rounded-xl transition shadow flex items-center gap-1.5"
                >
                  <span aria-hidden="true">💾</span>
                  <span>{guardandoWhatsapp ? "Guardando..." : "Guardar enlace"}</span>
                </button>
                <button
                  type="button"
                  onClick={handleProbarWhatsapp}
                  className="border border-blue-900 text-blue-900 hover:bg-blue-50 font-bold text-xs px-3.5 py-2 rounded-xl transition flex items-center gap-1.5"
                >
                  <span aria-hidden="true">🔗</span>
                  <span>Probar enlace</span>
                </button>
              </div>
            </div>
          </section>

          <div className="bg-white p-6 sm:p-8 rounded-3xl border border-gray-200 shadow-sm space-y-6">
            <div className="border-b pb-4">
              <h3 className="text-xl font-black text-blue-950 flex items-center gap-2">
                <span>⚙️</span> Parámetros Operativos del Torneo
              </h3>
              <p className="text-xs text-gray-500">
                Ajusta los límites reglamentarios, fechas límites de inscripción y la visibilidad de datos al público.
              </p>
            </div>

            {mensajeConfig && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl font-bold">
                ✅ {mensajeConfig.texto}
              </div>
            )}

            <form onSubmit={handleGuardarConfiguracionGeneral} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Estado de inscripciones */}
                <div className="p-4 bg-gray-50 rounded-2xl border space-y-2">
                  <label className="block text-xs font-bold text-gray-800">
                    Estado de Inscripciones Públicas
                  </label>
                  <p className="text-[11px] text-gray-500">
                    Habilita o cierra el registro de nuevos equipos y auto-incorporación de jugadores.
                  </p>
                  <button
                    type="button"
                    onClick={handleToggleInscripciones}
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
                      configuracion.inscripcionesAbiertas
                        ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                        : "bg-red-600 hover:bg-red-700 text-white"
                    }`}
                  >
                    <span>
                      {configuracion.inscripcionesAbiertas ? "🟢 Inscripciones Abiertas" : "🔴 Inscripciones Cerradas"}
                    </span>
                  </button>
                </div>

                {/* Máximo de jugadores por equipo */}
                <div className="p-4 bg-gray-50 rounded-2xl border space-y-2">
                  <label htmlFor="config-max-players" className="block text-xs font-bold text-gray-800">
                    Máximo de Jugadores por Plantilla
                  </label>
                  <p className="text-[11px] text-gray-500">
                    Límite máximo permitido de integrantes por equipo (mínimo 8 reglamentario).
                  </p>
                  <input
                    id="config-max-players"
                    type="number"
                    min="8"
                    max="25"
                    value={cfgMaxJugadores}
                    onChange={(e) => setCfgMaxJugadores(e.target.value)}
                    className="w-32 border border-gray-300 p-2.5 rounded-xl text-sm font-bold bg-white"
                  />
                </div>

                {/* Fecha de cierre de inscripciones */}
                <div className="p-4 bg-gray-50 rounded-2xl border space-y-2">
                  <label htmlFor="config-registration-deadline" className="block text-xs font-bold text-gray-800">
                    Fecha Límite de Inscripciones
                  </label>
                  <p className="text-[11px] text-gray-500">
                    A partir de esta fecha, el sistema cerrará automáticamente las inscripciones.
                  </p>
                  <input
                    id="config-registration-deadline"
                    type="date"
                    value={cfgFechaCierre}
                    onChange={(e) => setCfgFechaCierre(e.target.value)}
                    className="border border-gray-300 p-2.5 rounded-xl text-xs font-bold bg-white"
                  />
                </div>

              </div>

              {/* Visibilidad de Torneo y Publicaciones */}
              <div className="p-5 bg-blue-50/50 rounded-2xl border border-blue-100 space-y-4">
                <h4 className="text-sm font-bold text-blue-950 flex items-center gap-1.5">
                  <span>📢</span> Publicación Selectiva en &quot;Torneo en Vivo&quot;
                </h4>
                <p className="text-xs text-gray-500">
                  Controla qué secciones ven los estudiantes y docentes en la pestaña pública del torneo.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <label className="flex items-center gap-2.5 bg-white p-3 rounded-xl border border-gray-200 cursor-pointer hover:bg-gray-50">
                    <input
                      type="checkbox"
                      checked={cfgPublicarGoleadores}
                      onChange={(e) => setCfgPublicarGoleadores(e.target.checked)}
                      className="w-4 h-4 rounded text-blue-950 focus:ring-blue-900"
                    />
                    <div>
                      <strong className="block text-xs text-gray-800">Tabla de Goleadores</strong>
                      <span className="text-[10px] text-gray-400">Mostrar goles acumulados</span>
                    </div>
                  </label>

                  <label className="flex items-center gap-2.5 bg-white p-3 rounded-xl border border-gray-200 cursor-pointer hover:bg-gray-50">
                    <input
                      type="checkbox"
                      checked={cfgPublicarClasificacion}
                      onChange={(e) => setCfgPublicarClasificacion(e.target.checked)}
                      className="w-4 h-4 rounded text-blue-950 focus:ring-blue-900"
                    />
                    <div>
                      <strong className="block text-xs text-gray-800">Tabla de Clasificación</strong>
                      <span className="text-[10px] text-gray-400">Puntos y diferencia de goles</span>
                    </div>
                  </label>

                  <label className="flex items-center gap-2.5 bg-white p-3 rounded-xl border border-gray-200 cursor-pointer hover:bg-gray-50">
                    <input
                      type="checkbox"
                      checked={cfgPublicarPremios}
                      onChange={(e) => setCfgPublicarPremios(e.target.checked)}
                      className="w-4 h-4 rounded text-blue-950 focus:ring-blue-900"
                    />
                    <div>
                      <strong className="block text-xs text-gray-800">Premios y Reconocimientos</strong>
                      <span className="text-[10px] text-gray-400">Criterios dinámicos asignados</span>
                    </div>
                  </label>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="submit"
                  disabled={guardandoConfig}
                  className="bg-blue-950 hover:bg-blue-900 text-white font-bold text-xs sm:text-sm px-6 py-3 rounded-xl transition shadow flex items-center gap-2 disabled:opacity-50"
                >
                  <span>💾</span>
                  <span>{guardandoConfig ? "Guardando..." : "Guardar Toda la Configuración"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
        </div>
      </div>
    </div>
  );
}

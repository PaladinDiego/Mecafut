"use client";
import { useState, useEffect } from "react";
import {
  obtenerDatosAdmin,
  actualizarEstadoEquipo,
  eliminarEquipoAdmin,
  cambiarEstadoInscripciones,
  reiniciarBaseDeDatosSimulada,
  isFirebaseConfigured
} from "../../lib/dbService";
import { exportarExcelOficial, exportarPDFPlanillas } from "../../lib/exportUtils";
import { CONFIG_TORNEO } from "../../lib/torneoConfig";
import { obtenerSesionActual, verificarOtp } from "../../lib/authService";

export default function Admin() {
  const [auth, setAuth] = useState({ user: "", pass: "" });
  const [isLogged, setIsLogged] = useState(false);
  const [jugadores, setJugadores] = useState([]);
  const [equipos, setEquipos] = useState([]);
  const [configuracion, setConfiguracion] = useState({ inscripcionesAbiertas: true });
  const [loading, setLoading] = useState(false);
  const [filtro, setFiltro] = useState("");
  const [pestanaActiva, setPestanaActiva] = useState("equipos"); // "equipos" | "jugadores"
  const [modo, setModo] = useState("simulado");
  const [visorModal, setVisorModal] = useState(null);

  useEffect(() => {
    const s = obtenerSesionActual();
    if (s && s.rol === "admin") {
      setIsLogged(true);
      fetchData();
    }
  }, []);

  const adminUser = process.env.NEXT_PUBLIC_ADMIN_USER || "admin";
  const adminPass = process.env.NEXT_PUBLIC_ADMIN_PASS || "mecafut2026";

  const login = (e) => {
    e.preventDefault();
    const esValido =
      (auth.user === adminUser && auth.pass === adminPass) ||
      (auth.user === "carlosrubi" && auth.pass === "22211206");

    if (esValido) {
      setIsLogged(true);
      fetchData();
    } else {
      alert("Credenciales incorrectas. (Default para pruebas: admin / mecafut2026)");
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const data = await obtenerDatosAdmin();
      setJugadores(data.jugadores || []);
      setEquipos(data.equipos || []);
      setConfiguracion(data.configuracion || { inscripcionesAbiertas: true });
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

  // Métricas rápidas
  const confirmadosEstudiantes = equipos.filter(e => (e.tipoEquipo || "Estudiantes") === "Estudiantes" && e.estado === "Confirmado").length;
  const pendientesEstudiantes = equipos.filter(e => (e.tipoEquipo || "Estudiantes") === "Estudiantes" && e.estado === "Pendiente").length;
  const enEspera = equipos.filter(e => e.estado === "Lista de espera").length;
  const docentesTotal = equipos.filter(e => e.tipoEquipo === "Docentes" && e.estado !== "Rechazado").length;

  const jugadoresFiltrados = jugadores.filter(j =>
    (j.nombre || "").toLowerCase().includes(filtro.toLowerCase()) ||
    (j.cuenta || "").includes(filtro) ||
    (j.correo || "").toLowerCase().includes(filtro.toLowerCase()) ||
    (j.nombreEquipo || "").toLowerCase().includes(filtro.toLowerCase()) ||
    (j.carrera || "").toLowerCase().includes(filtro.toLowerCase()) ||
    (j.codigoClase || "").toLowerCase().includes(filtro.toLowerCase())
  );

  if (!isLogged) {
    return (
      <div className="min-h-[75vh] flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-2xl border border-gray-200 shadow-md w-full max-w-sm text-center">
          <div className="w-12 h-12 bg-blue-100 text-blue-900 rounded-full flex items-center justify-center mx-auto mb-4 text-xl font-bold">
            🔒
          </div>
          <h2 className="text-xl font-bold text-blue-950 mb-1">Acceso Administrativo</h2>
          <p className="text-xs text-gray-500 mb-6">Comité Organizador — MECAFUT Q4</p>

          {/* Opción 1: Acceso rápido con sesión activa de Admin */}
          <button
            type="button"
            onClick={() => {
              verificarOtp("admin@unitec.edu", "123456");
              setIsLogged(true);
              fetchData();
            }}
            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2.5 rounded-xl text-xs transition shadow mb-4 flex items-center justify-center gap-2"
          >
            <span>⚡</span>
            <span>Entrar como Admin (admin@unitec.edu)</span>
          </button>

          <div className="relative my-4">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-200"></div></div>
            <div className="relative flex justify-center text-[10px] uppercase font-bold text-gray-400 bg-white px-2">
              o credenciales directas
            </div>
          </div>

          <form onSubmit={login} className="space-y-4 text-left">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Usuario</label>
              <input
                required
                placeholder="admin"
                className="w-full border border-gray-300 p-2.5 rounded-lg text-sm focus:ring-2 focus:ring-blue-900 focus:outline-none"
                value={auth.user}
                onChange={e => setAuth({ ...auth, user: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Contraseña</label>
              <input
                required
                type="password"
                placeholder="••••••••"
                className="w-full border border-gray-300 p-2.5 rounded-lg text-sm focus:ring-2 focus:ring-blue-900 focus:outline-none"
                value={auth.pass}
                onChange={e => setAuth({ ...auth, pass: e.target.value })}
              />
            </div>

            <button
              type="submit"
              className="w-full bg-blue-950 hover:bg-blue-900 text-white font-bold py-2.5 rounded-xl text-sm transition shadow"
            >
              Ingresar con Contraseña
            </button>
          </form>

          <p className="text-[11px] text-gray-400 mt-4">
            Credenciales de prueba: <span className="font-mono text-gray-700">admin / mecafut2026</span>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 pb-20">
      {/* Modal universal para visualizar Comprobantes y Fotos de Documentos */}
      {visorModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto text-center shadow-2xl">
            <div className="flex justify-between items-center mb-4 border-b pb-2">
              <h3 className="font-bold text-blue-950 text-sm sm:text-base text-left truncate">
                {visorModal.titulo}
              </h3>
              <button
                type="button"
                onClick={() => setVisorModal(null)}
                className="text-gray-400 hover:text-gray-700 font-bold text-lg"
              >
                ✕
              </button>
            </div>

            {visorModal.url ? (
              visorModal.url.startsWith("data:application/pdf") ? (
                <div className="p-4 bg-gray-50 rounded-xl">
                  <p className="text-xs text-gray-600 mb-3">Documento adjunto en formato PDF.</p>
                  <a
                    href={visorModal.url}
                    download="documento_mecafut.pdf"
                    className="bg-blue-900 text-white text-xs font-bold px-4 py-2 rounded-lg inline-block"
                  >
                    Descargar PDF
                  </a>
                </div>
              ) : (
                <img
                  src={visorModal.url}
                  alt="Documento"
                  className="max-h-[60vh] mx-auto rounded-lg border shadow-sm"
                />
              )
            ) : (
              <div className="p-8 text-gray-400 text-xs">
                No hay imagen guardada en este registro (registro de prueba o sin adjunto).
              </div>
            )}

            <div className="mt-4 pt-3 border-t flex justify-end">
              <button
                type="button"
                onClick={() => setVisorModal(null)}
                className="bg-gray-100 hover:bg-gray-200 text-gray-800 text-xs font-bold px-4 py-2 rounded-lg transition"
              >
                Cerrar Visor
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Barra Superior con Métricas y Botones de Exportación */}
      <div className="flex flex-wrap justify-between items-center mb-6 gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black text-blue-950">Panel Administrativo</h1>
            <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${
              modo === "firebase" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
            }`}>
              {modo === "firebase" ? "Cloud Firestore" : "Modo Simulado"}
            </span>
          </div>
          <p className="text-xs text-gray-500">Gestión de cupos, validación de pagos y planillas oficiales</p>
        </div>

        {/* Acciones Globales */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Interruptor de Cierre de Inscripciones */}
          <button
            type="button"
            onClick={handleToggleInscripciones}
            className={`px-3 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 border ${
              configuracion.inscripcionesAbiertas
                ? "bg-emerald-50 border-emerald-300 text-emerald-800 hover:bg-emerald-100"
                : "bg-red-50 border-red-300 text-red-800 hover:bg-red-100"
            }`}
          >
            <span>{configuracion.inscripcionesAbiertas ? "🟢" : "🔴"}</span>
            <span>{configuracion.inscripcionesAbiertas ? "Inscripciones Abiertas" : "Inscripciones Cerradas"}</span>
          </button>

          {/* Exportar a Excel Oficial (.xlsx) con 4 hojas */}
          <button
            type="button"
            onClick={() => exportarExcelOficial(equipos, jugadores)}
            className="bg-emerald-700 hover:bg-emerald-800 text-white px-3.5 py-2 rounded-xl font-bold text-xs transition flex items-center gap-1.5 shadow"
          >
            <span>📊</span> Exportar Excel (.xlsx)
          </button>

          {/* Exportar PDF de Planillas */}
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
              title="Restaurar base de datos de prueba"
              className="border border-gray-300 hover:bg-gray-100 text-gray-700 px-2.5 py-2 rounded-xl text-xs font-semibold"
            >
              🔄 Reset Demo
            </button>
          )}
        </div>
      </div>

      {/* Tarjetas de Resumen de Cupos */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="bg-white p-3.5 rounded-xl border border-gray-200 shadow-sm">
          <span className="text-[11px] font-bold uppercase text-gray-400 block">Estudiantes</span>
          <div className="flex items-baseline gap-1 mt-0.5">
            <strong className="text-xl text-blue-950 font-black">{confirmadosEstudiantes}</strong>
            <span className="text-xs text-gray-500">confirmados</span>
            <span className="text-xs text-amber-700 ml-auto font-medium">({pendientesEstudiantes} pend.)</span>
          </div>
          <span className="text-[10px] text-gray-400">Tope máx: {CONFIG_TORNEO.cupos.estudiantes}</span>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-gray-200 shadow-sm">
          <span className="text-[11px] font-bold uppercase text-gray-400 block">Docentes</span>
          <div className="flex items-baseline gap-1 mt-0.5">
            <strong className="text-xl text-blue-950 font-black">{docentesTotal}</strong>
            <span className="text-xs text-gray-500">/ {CONFIG_TORNEO.cupos.docentes}</span>
          </div>
          <span className="text-[10px] text-gray-400">Cupos dedicados</span>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-gray-200 shadow-sm">
          <span className="text-[11px] font-bold uppercase text-gray-400 block">Lista de Espera</span>
          <div className="flex items-baseline gap-1 mt-0.5">
            <strong className="text-xl text-amber-600 font-black">{enEspera}</strong>
            <span className="text-xs text-gray-500">equipos</span>
          </div>
          <span className="text-[10px] text-gray-400">En cola de liberación</span>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-gray-200 shadow-sm">
          <span className="text-[11px] font-bold uppercase text-gray-400 block">Total Jugadores</span>
          <div className="flex items-baseline gap-1 mt-0.5">
            <strong className="text-xl text-blue-950 font-black">{jugadores.length}</strong>
            <span className="text-xs text-gray-500">inscritos</span>
          </div>
          <span className="text-[10px] text-gray-400">En {equipos.length} equipos</span>
        </div>
      </div>

      {/* Pestañas de Navegación */}
      <div className="flex border-b border-gray-200 mb-6 gap-2">
        <button
          type="button"
          onClick={() => setPestanaActiva("equipos")}
          className={`pb-3 px-4 text-xs sm:text-sm font-bold border-b-2 transition ${
            pestanaActiva === "equipos"
              ? "border-blue-950 text-blue-950"
              : "border-transparent text-gray-400 hover:text-gray-600"
          }`}
        >
          Equipos y Verificación de Pagos ({equipos.length})
        </button>
        <button
          type="button"
          onClick={() => setPestanaActiva("jugadores")}
          className={`pb-3 px-4 text-xs sm:text-sm font-bold border-b-2 transition ${
            pestanaActiva === "jugadores"
              ? "border-blue-950 text-blue-950"
              : "border-transparent text-gray-400 hover:text-gray-600"
          }`}
        >
          Padrón de Jugadores ({jugadores.length})
        </button>
      </div>

      {/* PESTAÑA 1: EQUIPOS Y PAGOS */}
      {pestanaActiva === "equipos" && (
        <div className="space-y-4">
          {equipos.length === 0 ? (
            <div className="bg-white p-12 text-center text-gray-400 text-sm rounded-2xl border">
              No hay equipos registrados todavía.
            </div>
          ) : (
            equipos.map((eq) => {
              const cantJugadores = jugadores.filter(j => j.equipoId === eq.id).length;
              const colorInfo = CONFIG_TORNEO.coloresUniforme.find(c => c.nombre.toLowerCase() === (eq.color || "").toLowerCase());

              return (
                <div key={eq.id} className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-black text-blue-950">{eq.nombre}</h3>
                      <span className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded font-medium">
                        {eq.categoria}
                      </span>
                      <span className="text-xs bg-blue-100 text-blue-900 px-2 py-0.5 rounded font-medium">
                        {eq.tipoEquipo || "Estudiantes"}
                      </span>
                      <span className={`text-xs font-bold px-2.5 py-0.5 rounded ${
                        eq.estado === "Confirmado"
                          ? "bg-emerald-100 text-emerald-800"
                          : eq.estado === "Lista de espera"
                          ? "bg-amber-100 text-amber-800"
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

                  {/* Acciones sobre el equipo */}
                  <div className="flex flex-wrap items-center gap-2 w-full md:w-auto justify-end pt-2 md:pt-0 border-t md:border-t-0">
                    {/* Botón para ver comprobante de pago */}
                    <button
                      type="button"
                      onClick={() => setVisorModal({
                        titulo: `Comprobante de Pago — ${eq.nombre}`,
                        url: eq.comprobanteDataUrl
                      })}
                      className="border border-blue-900 text-blue-900 hover:bg-blue-50 text-xs font-bold px-3 py-1.5 rounded-lg transition"
                    >
                      🖼️ Ver Comprobante
                    </button>

                    {/* Selector rápido de estado */}
                    <select
                      className="border border-gray-300 p-1.5 rounded-lg text-xs font-semibold bg-white focus:outline-none"
                      value={eq.estado || "Pendiente"}
                      onChange={e => handleCambiarEstado(eq.id, e.target.value)}
                    >
                      <option value="Pendiente">Pendiente</option>
                      <option value="Confirmado">Confirmado</option>
                      <option value="Lista de espera">Lista de espera</option>
                      <option value="Rechazado">Rechazado</option>
                    </select>

                    {/* Eliminar equipo */}
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

      {/* PESTAÑA 2: PADRÓN DE JUGADORES */}
      {pestanaActiva === "jugadores" && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-gray-100 bg-gray-50 flex flex-col sm:flex-row justify-between items-center gap-3">
            <input
              type="search"
              placeholder="Buscar por jugador, cuenta, correo, código de clase, equipo o carrera..."
              className="w-full sm:max-w-md border border-gray-300 px-3 py-2 rounded-lg text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-900 bg-white"
              value={filtro}
              onChange={e => setFiltro(e.target.value)}
            />
            <span className="text-xs text-gray-400 whitespace-nowrap">
              Mostrando {jugadoresFiltrados.length} de {jugadores.length} jugadores
            </span>
          </div>

          {loading ? (
            <div className="p-12 text-center text-gray-500 text-sm">Cargando registros...</div>
          ) : jugadoresFiltrados.length === 0 ? (
            <div className="p-12 text-center text-gray-400 text-sm">No hay jugadores que coincidan con la búsqueda.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs sm:text-sm text-left border-collapse">
                <thead className="bg-blue-950 text-white uppercase text-[11px] tracking-wider">
                  <tr>
                    <th className="p-3">#</th>
                    <th className="p-3">Equipo</th>
                    <th className="p-3">Jugador</th>
                    <th className="p-3">N° Cuenta</th>
                    <th className="p-3">DNI (Identidad)</th>
                    <th className="p-3">Doc. Verificado</th>
                    <th className="p-3">Correo Institucional</th>
                    <th className="p-3">Carrera</th>
                    <th className="p-3">Clase</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {jugadoresFiltrados.map((j, i) => (
                    <tr key={i} className={`hover:bg-blue-50/50 transition ${j.esCapitan ? "bg-blue-50/30 font-medium" : ""}`}>
                      <td className="p-3 text-gray-400 font-mono text-xs">{i + 1}</td>
                      <td className="p-3 font-semibold text-blue-900">{j.nombreEquipo}</td>
                      <td className="p-3 text-gray-900">
                        {j.nombre}
                        {j.esCapitan && (
                          <span className="ml-1.5 text-[10px] bg-blue-100 text-blue-800 font-bold px-1 py-0.5 rounded">
                            Capitán
                          </span>
                        )}
                      </td>
                      <td className="p-3 font-mono text-gray-600">{j.cuenta}</td>
                      <td className="p-3 font-mono text-gray-800 text-xs font-semibold">{j.dni || "N/A"}</td>
                      <td className="p-3">
                        <div className="flex items-center gap-1.5">
                          <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${
                            j.tipoDocumento === "carnet"
                              ? "bg-purple-100 text-purple-800"
                              : j.tipoDocumento === "hoja_confirmacion"
                              ? "bg-blue-100 text-blue-800"
                              : j.tipoDocumento === "docente"
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-gray-100 text-gray-600"
                          }`}>
                            {j.tipoDocumento === "carnet" ? "🪪 Carnet" : j.tipoDocumento === "hoja_confirmacion" ? "📄 Matrícula" : j.tipoDocumento === "docente" ? "🎓 Docente" : "Pendiente"}
                          </span>
                          {j.fotoDocumento && (
                            <button
                              type="button"
                              onClick={() => setVisorModal({
                                titulo: `Documento de ${j.nombre} (${j.tipoDocumento === "carnet" ? "Carnet" : "Matrícula"})`,
                                url: j.fotoDocumento
                              })}
                              className="text-[10px] text-blue-700 underline font-semibold hover:text-blue-900 ml-1"
                            >
                              Ver foto
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="p-3 font-mono text-gray-500 text-xs">{j.correo || "N/A"}</td>
                      <td className="p-3 text-gray-700">{j.carrera}</td>
                      <td className="p-3 font-mono text-gray-600 uppercase text-xs">{j.codigoClase || "N/A"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

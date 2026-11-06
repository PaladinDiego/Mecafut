"use client";
import { useState, useEffect } from "react";
import { obtenerSesionActual, solicitarOtp, verificarOtp } from "../lib/authService";
import { obtenerPerfilPendienteJugador, actualizarDocumentoJugador, comprimirDocumento } from "../lib/dbService";

export default function AuthGate({ children }) {
  const [sesion, setSesion] = useState(null);
  const [cargandoSesion, setCargandoSesion] = useState(true);

  // Estados del Formulario de Inicio de Sesión Obligatorio
  const [paso, setPaso] = useState(1);
  const [correo, setCorreo] = useState("");
  const [codigo, setCodigo] = useState("");
  const [otpInfo, setOtpInfo] = useState(null);
  const [loadingLogin, setLoadingLogin] = useState(false);
  const [errorLogin, setErrorLogin] = useState("");
  const [copiado, setCopiado] = useState(false);

  // Estados para Registro Incompleto (Estudiante pre-inscrito por Capitán sin foto)
  const [perfilIncompleto, setPerfilIncompleto] = useState(null);
  const [completandoDni, setCompletandoDni] = useState("");
  const [completandoTipoDoc, setCompletandoTipoDoc] = useState("carnet");
  const [completandoFoto, setCompletandoFoto] = useState(null);
  const [completandoPreview, setCompletandoPreview] = useState(null);
  const [guardandoPerfil, setGuardandoPerfil] = useState(false);
  const [errorPerfil, setErrorPerfil] = useState("");

  useEffect(() => {
    verificarEstadoAuth();
    const handleAuthChange = () => verificarEstadoAuth();
    window.addEventListener("mecafut_auth_change", handleAuthChange);
    return () => window.removeEventListener("mecafut_auth_change", handleAuthChange);
  }, []);

  const verificarEstadoAuth = async () => {
    setCargandoSesion(true);
    const s = obtenerSesionActual();
    setSesion(s);

    if (s && s.correo) {
      try {
        const pendiente = await obtenerPerfilPendienteJugador(s.correo);
        if (pendiente) {
          setPerfilIncompleto(pendiente);
          setCompletandoDni(pendiente.dni === "Exento (Docente)" ? "" : (pendiente.dni || ""));
        } else {
          setPerfilIncompleto(null);
        }
      } catch (err) {
        console.error("Error revisando perfil pendiente:", err);
      }
    } else {
      setPerfilIncompleto(null);
    }
    setCargandoSesion(false);
  };

  const handleSolicitarCodigo = async (e) => {
    e.preventDefault();
    setErrorLogin("");
    setLoadingLogin(true);

    try {
      const res = await solicitarOtp(correo);
      setOtpInfo(res);
      setPaso(2);
    } catch (err) {
      setErrorLogin(err.message || "Error al solicitar código OTP");
    } finally {
      setLoadingLogin(false);
    }
  };

  const handleVerificarCodigo = (e) => {
    e.preventDefault();
    setErrorLogin("");
    setLoadingLogin(true);

    try {
      const nuevaSesion = verificarOtp(correo, codigo);
      setSesion(nuevaSesion);
      setPaso(1);
      setCorreo("");
      setCodigo("");
      setOtpInfo(null);
    } catch (err) {
      setErrorLogin(err.message || "Código incorrecto o expirado");
    } finally {
      setLoadingLogin(false);
    }
  };

  const handleCompletarPerfil = async (e) => {
    e.preventDefault();
    setErrorPerfil("");

    if (!completandoDni.trim()) {
      setErrorPerfil("Tu Número de Identidad (DNI) es obligatorio.");
      return;
    }
    if (!completandoFoto) {
      setErrorPerfil("Debes adjuntar la foto de tu carnet universitario o confirmación de matrícula.");
      return;
    }

    setGuardandoPerfil(true);
    try {
      await actualizarDocumentoJugador({
        jugadorId: perfilIncompleto.id,
        dni: completandoDni.trim(),
        tipoDocumento: completandoTipoDoc,
        fotoDocumento: completandoFoto
      });
      setPerfilIncompleto(null);
    } catch (err) {
      setErrorPerfil(err.message || "Error guardando documento");
    } finally {
      setGuardandoPerfil(false);
    }
  };

  if (cargandoSesion) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-4">
        <div className="text-center space-y-2">
          <div className="w-8 h-8 border-4 border-blue-900 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-xs text-gray-500 font-semibold">Cargando plataforma MECAFUT...</p>
        </div>
      </div>
    );
  }

  // 1. PANTALLA BLOQUEANTE SI NO HA INICIADO SESIÓN (Requisito 5)
  if (!sesion) {
    return (
      <div className="min-h-[78vh] flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl max-w-md w-full p-6 sm:p-8 shadow-xl border-2 border-blue-900 text-center animate-fade-in">
          <div className="w-14 h-14 bg-blue-100 text-blue-950 rounded-2xl flex items-center justify-center mx-auto mb-4 text-2xl font-black shadow-inner">
            🔐
          </div>
          <h2 className="text-2xl font-black text-blue-950 tracking-tight">Acceso Institucional</h2>
          <p className="text-xs text-gray-600 mt-1 mb-6">
            Es obligatorio iniciar sesión con tu correo oficial <strong>@unitec.edu</strong> para utilizar la plataforma oficial de MECAFUT 2026.
          </p>

          {errorLogin && (
            <div className="p-3 mb-4 bg-red-50 border border-red-300 text-red-800 text-xs rounded-xl font-medium text-center">
              {errorLogin}
            </div>
          )}

          {paso === 1 ? (
            <form onSubmit={handleSolicitarCodigo} className="space-y-4 text-left">
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                  Correo Institucional (@unitec.edu) *
                </label>
                <input
                  type="email"
                  required
                  placeholder="ej. diego.ramos@unitec.edu"
                  value={correo}
                  onChange={(e) => setCorreo(e.target.value)}
                  className="w-full border border-gray-300 p-3 rounded-xl text-sm focus:ring-2 focus:ring-blue-900 focus:outline-none font-mono"
                />
                <p className="text-[11px] text-gray-400 mt-1">
                  Admite buzones @unitec.edu y @unitec.edu.hn
                </p>
              </div>

              {/* Accesos rápidos de prueba solo para desarrollo local */}
              {process.env.NODE_ENV !== "production" && (
                <div className="bg-blue-50/70 p-3 rounded-xl border border-blue-100 text-left">
                  <span className="block text-[11px] font-bold text-blue-900 mb-1.5">
                    💡 Accesos rápidos de prueba (Dev):
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => setCorreo("carlos.rubi@unitec.edu")}
                      className="text-[10px] bg-white border border-blue-300 hover:bg-blue-100 text-blue-950 px-2 py-0.5 rounded font-semibold transition"
                    >
                      👑 Admin
                    </button>
                    <button
                      type="button"
                      onClick={() => setCorreo("juan.mejia@unitec.edu.hn")}
                      className="text-[10px] bg-white border border-blue-300 hover:bg-blue-100 text-blue-950 px-2 py-0.5 rounded font-semibold transition"
                    >
                      👑🎓 Admin Docente
                    </button>
                    <button
                      type="button"
                      onClick={() => setCorreo("jared.sauceda@unitec.edu")}
                      className="text-[10px] bg-white border border-blue-300 hover:bg-blue-100 text-blue-950 px-2 py-0.5 rounded font-semibold transition"
                    >
                      🎓 Docente
                    </button>
                    <button
                      type="button"
                      onClick={() => setCorreo("estudiante.demo@unitec.edu")}
                      className="text-[10px] bg-white border border-blue-300 hover:bg-blue-100 text-blue-950 px-2 py-0.5 rounded font-semibold transition"
                    >
                      ⚽ Estudiante Demo
                    </button>
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={loadingLogin}
                className="w-full bg-blue-950 hover:bg-blue-900 text-white font-bold py-3.5 rounded-xl text-sm transition shadow-md disabled:opacity-50"
              >
                {loadingLogin ? "Generando código..." : "Enviar Código de Verificación OTP →"}
              </button>
            </form>
          ) : (
            <form onSubmit={handleVerificarCodigo} className="space-y-4 text-left">
              <div className="bg-emerald-50 border border-emerald-200 p-3 rounded-xl text-center">
                <span className="text-xs text-emerald-900 font-semibold block">
                  {otpInfo?.modoEnvio === "email"
                    ? `¡Código enviado a tu buzón institucional ${correo}!`
                    : `Código OTP generado para ${correo}`}
                </span>

                {process.env.NODE_ENV !== "production" && otpInfo?.codigoOtp && (
                  <div className="mt-2 p-2 bg-white border border-emerald-300 rounded-lg inline-flex items-center gap-2">
                    <span className="text-xs text-gray-500">Código de prueba (Dev):</span>
                    <strong className="text-base font-mono tracking-widest text-emerald-950">
                      {otpInfo.codigoOtp}
                    </strong>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(otpInfo.codigoOtp);
                        setCodigo(otpInfo.codigoOtp);
                        setCopiado(true);
                        setTimeout(() => setCopiado(false), 2000);
                      }}
                      className="text-[10px] bg-emerald-600 text-white font-bold px-2 py-1 rounded hover:bg-emerald-700 transition"
                    >
                      {copiado ? "✓ Copiado" : "Copiar"}
                    </button>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                  Código de 6 Dígitos *
                </label>
                <input
                  type="text"
                  required
                  maxLength={6}
                  placeholder="123456"
                  value={codigo}
                  onChange={(e) => setCodigo(e.target.value)}
                  className="w-full border border-gray-300 p-3 rounded-xl text-center text-2xl font-mono tracking-widest font-black focus:ring-2 focus:ring-blue-900 focus:outline-none"
                />
                <p className="text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded-xl p-2.5 mt-2 flex items-start gap-1.5 leading-snug">
                  <span className="text-sm">📬</span>
                  <span>
                    Si no lo ves en tu bandeja principal de Outlook, revisa en tu pestaña <strong>"Otros"</strong> o en la carpeta de <strong>"Correo no deseado / Spam"</strong>.
                  </span>
                </p>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPaso(1)}
                  className="w-1/3 border border-gray-300 hover:bg-gray-100 text-gray-700 text-xs font-bold py-3 rounded-xl transition"
                >
                  ← Volver
                </button>
                <button
                  type="submit"
                  disabled={loadingLogin}
                  className="w-2/3 bg-blue-950 hover:bg-blue-900 text-white font-bold py-3 rounded-xl text-sm transition shadow-md disabled:opacity-50"
                >
                  {loadingLogin ? "Validando..." : "Confirmar e Ingresar"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    );
  }

  // 2. MODAL OBLIGATORIO SI EL ESTUDIANTE FUE ANOTADO POR SU CAPITÁN PERO FALTA SU CARNET
  if (perfilIncompleto) {
    return (
      <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl border-2 border-amber-500 animate-fade-in text-left">
          <div className="flex items-center gap-2 mb-2 text-amber-600 font-extrabold text-sm uppercase tracking-wider">
            <span>⚠️</span> Registro Oficial Incompleto
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-blue-950 tracking-tight">
            Completa tu Carnet Estudiantil
          </h2>
          <p className="text-xs text-gray-600 mt-1 mb-4">
            Tu capitán te inscribió en el equipo <strong>{perfilIncompleto.nombreEquipo}</strong>, pero el reglamento oficial de MECAFUT 2026 exige que cada participante cargue su carnet estudiantil para validar su participación.
          </p>

          {errorPerfil && (
            <div className="p-3 mb-4 bg-red-50 border border-red-300 text-red-800 text-xs rounded-xl font-medium">
              {errorPerfil}
            </div>
          )}

          <form onSubmit={handleCompletarPerfil} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                Número de Identidad (DNI) *
              </label>
              <input
                required
                placeholder="Ej. 0801-2003-12345"
                value={completandoDni}
                onChange={(e) => setCompletandoDni(e.target.value)}
                className="w-full border border-gray-300 p-2.5 rounded-xl text-sm font-mono focus:ring-2 focus:ring-blue-900 focus:outline-none"
              />
              <p className="text-[10px] text-gray-400 mt-0.5">Se cotejará con tu carnet físico en la mesa técnica.</p>
            </div>

            <div className="bg-blue-50/50 p-3.5 rounded-xl border border-blue-100">
              <label className="block text-xs font-bold text-blue-950 uppercase mb-1">
                Tipo de Documento a Cargar *
              </label>
              <div className="flex flex-wrap gap-3 text-xs mb-3">
                <label className="flex items-center gap-1.5 cursor-pointer font-semibold text-blue-950">
                  <input
                    type="radio"
                    name="tipoDocCompleto"
                    value="carnet"
                    checked={completandoTipoDoc === "carnet"}
                    onChange={() => setCompletandoTipoDoc("carnet")}
                  />
                  <span>🪪 Carnet Universitario</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer font-semibold text-blue-950">
                  <input
                    type="radio"
                    name="tipoDocCompleto"
                    value="hoja_confirmacion"
                    checked={completandoTipoDoc === "hoja_confirmacion"}
                    onChange={() => setCompletandoTipoDoc("hoja_confirmacion")}
                  />
                  <span>📄 Hoja de Matrícula (Portal)</span>
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
                    setCompletandoFoto(dataUrl);
                    setCompletandoPreview(dataUrl);
                  }
                }}
                className="w-full text-xs text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-blue-950 file:text-white hover:file:bg-blue-900 cursor-pointer"
              />

              {completandoPreview && (
                <div className="mt-2.5 p-1 bg-white rounded border inline-block">
                  <img src={completandoPreview} alt="Doc" className="max-h-24 rounded border shadow-sm" />
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={guardandoPerfil}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-xl text-sm transition shadow-md disabled:opacity-50"
            >
              {guardandoPerfil ? "Guardando documento..." : "Guardar y Continuar a la Plataforma →"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Usuario autenticado y con datos en orden: renderizar contenido
  return <>{children}</>;
}

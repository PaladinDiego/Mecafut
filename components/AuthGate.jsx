"use client";
import { useState, useEffect } from "react";
import {
  obtenerSesionActual,
  solicitarOtp,
  crearCuentaConOtp,
  recuperarPasswordConOtp,
  cambiarPasswordObligatorio,
  iniciarSesionConPassword
} from "../lib/authService";
import {
  obtenerPerfilPendienteJugador,
  actualizarDocumentoJugador,
  comprimirDocumento,
  isSupabaseConfigured
} from "../lib/dbService";
import { isProductionConfigMissing } from "../lib/supabase";
import BrandMark from "./BrandMark";

export default function AuthGate({ children }) {
  const [sesion, setSesion] = useState(null);
  const [cargandoSesion, setCargandoSesion] = useState(true);

  // Estados del Formulario de Inicio de Sesión Obligatorio
  const [paso, setPaso] = useState(1);
  const [modoAcceso, setModoAcceso] = useState("login"); // "login" | "crear" | "recuperar"
  const [password, setPassword] = useState("");
  const [correo, setCorreo] = useState("");
  const [codigo, setCodigo] = useState("");
  const [otpInfo, setOtpInfo] = useState(null);
  const [loadingLogin, setLoadingLogin] = useState(false);
  const [errorLogin, setErrorLogin] = useState("");
  const [copiado, setCopiado] = useState(false);

  // Estado para cambio de contraseña obligatorio (temporal de admin)
  const [nuevaPasswordObligatoria, setNuevaPasswordObligatoria] = useState("");
  const [confirmarPasswordObligatoria, setConfirmarPasswordObligatoria] = useState("");
  const [loadingCambioObligatorio, setLoadingCambioObligatorio] = useState(false);
  const [errorCambioObligatorio, setErrorCambioObligatorio] = useState("");

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

  const handleLogin = async (e) => {
    e.preventDefault();
    setErrorLogin("");
    setLoadingLogin(true);
    try {
      const { sesion: nuevaSesion } = await iniciarSesionConPassword(correo, password);
      setSesion(nuevaSesion);
      setCorreo("");
      setPassword("");
    } catch (err) {
      setErrorLogin(err.message || "No se pudo iniciar sesión");
    } finally {
      setLoadingLogin(false);
    }
  };

  const cambiarModoAcceso = (modo) => {
    setModoAcceso(modo);
    setPaso(1);
    setCodigo("");
    setPassword("");
    setErrorLogin("");
    setOtpInfo(null);
  };

  const handleVerificarCodigo = async (e) => {
    e.preventDefault();
    setErrorLogin("");
    setLoadingLogin(true);

    try {
      let nuevaSesion;
      if (modoAcceso === "recuperar") {
        nuevaSesion = await recuperarPasswordConOtp(correo, codigo, password);
      } else {
        nuevaSesion = await crearCuentaConOtp(correo, codigo, password);
      }
      setSesion(nuevaSesion);
      setPaso(1);
      setCorreo("");
      setCodigo("");
      setPassword("");
      setOtpInfo(null);
    } catch (err) {
      setErrorLogin(err.message || "Código incorrecto o expirado");
    } finally {
      setLoadingLogin(false);
    }
  };

  const handleCambioObligatorio = async (e) => {
    e.preventDefault();
    setErrorCambioObligatorio("");
    if (!nuevaPasswordObligatoria || nuevaPasswordObligatoria.length < 8) {
      setErrorCambioObligatorio("La nueva contraseña debe tener al menos 8 caracteres.");
      return;
    }
    if (nuevaPasswordObligatoria !== confirmarPasswordObligatoria) {
      setErrorCambioObligatorio("Las contraseñas ingresadas no coinciden.");
      return;
    }
    setLoadingCambioObligatorio(true);
    try {
      const sesionActualizada = await cambiarPasswordObligatorio(nuevaPasswordObligatoria);
      setSesion(sesionActualizada);
      setNuevaPasswordObligatoria("");
      setConfirmarPasswordObligatoria("");
    } catch (err) {
      setErrorCambioObligatorio(err.message || "No se pudo actualizar la contraseña.");
    } finally {
      setLoadingCambioObligatorio(false);
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

  if (isProductionConfigMissing) {
    return (
      <div className="auth-gate-shell min-h-[78vh] flex items-center justify-center p-4">
        <div className="auth-gate-card bg-white rounded-3xl max-w-md w-full p-6 sm:p-8 shadow-xl border-2 border-red-700 text-center animate-fade-in">
          <div className="w-14 h-14 bg-red-100 text-red-900 rounded-2xl flex items-center justify-center mx-auto mb-4 text-2xl font-black shadow-inner">
            🛡️
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-gray-900 tracking-tight">
            Configuración Requerida
          </h2>
          <p className="text-xs text-gray-600 mt-2 mb-4 leading-relaxed">
            Por directiva de seguridad y protección de datos institucionales, la plataforma oficial en producción requiere conexión segura con Supabase. Contacta al Comité Organizador para verificar las credenciales de entorno.
          </p>
          <div className="p-3 bg-red-50 border border-red-200 text-red-800 text-[11px] font-mono rounded-xl">
            Modo seguro activo: fail-closed
          </div>
        </div>
      </div>
    );
  }

  if (cargandoSesion) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-4" role="status" aria-live="polite">
        <div className="text-center space-y-2">
          <div className="w-8 h-8 border-4 border-blue-900 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-xs text-gray-500 font-semibold">Cargando plataforma MECAFUT...</p>
        </div>
      </div>
    );
  }

  // 1. PANTALLA BLOQUEANTE SI NO HA INICIADO SESIÓN
  if (!sesion) {
    return (
      <div className="auth-gate-shell min-h-[78vh] flex items-center justify-center p-4">
        <div className="auth-gate-card bg-white rounded-3xl max-w-md w-full p-6 sm:p-8 shadow-xl border-2 border-blue-900 text-center animate-fade-in">
          <BrandMark className="mx-auto mb-4" />
          <p className="page-kicker">MECAFUT · UNITEC</p>
          <h1 className="text-2xl font-black text-blue-950 tracking-tight">Acceso institucional</h1>
          <p className="text-xs text-gray-600 mt-1 mb-4">
            Ingresa con tu correo oficial <strong>@unitec.edu</strong> y tu contraseña institucional.
          </p>

          <div className="grid grid-cols-3 gap-1 bg-gray-100 p-1 rounded-xl mb-5 text-xs font-bold">
            <button
              type="button"
              aria-pressed={modoAcceso === "login"}
              onClick={() => cambiarModoAcceso("login")}
              className={`py-2 rounded-lg transition ${modoAcceso === "login" ? "bg-blue-950 text-white shadow" : "text-gray-600 hover:bg-gray-200"}`}
            >
              Iniciar sesión
            </button>
            <button
              type="button"
              aria-pressed={modoAcceso === "crear"}
              onClick={() => cambiarModoAcceso("crear")}
              className={`py-2 rounded-lg transition ${modoAcceso === "crear" ? "bg-blue-950 text-white shadow" : "text-gray-600 hover:bg-gray-200"}`}
            >
              Crear cuenta
            </button>
            <button
              type="button"
              aria-pressed={modoAcceso === "recuperar"}
              onClick={() => cambiarModoAcceso("recuperar")}
              className={`py-2 rounded-lg transition ${modoAcceso === "recuperar" ? "bg-blue-950 text-white shadow" : "text-gray-600 hover:bg-gray-200"}`}
            >
              Recuperar clave
            </button>
          </div>

          {errorLogin && (
            <div className="p-3 mb-4 state-message state-message--error text-xs font-medium text-center" role="alert">
              {errorLogin}
            </div>
          )}

          {modoAcceso === "login" ? (
            <form onSubmit={handleLogin} className="space-y-4 text-left">
              <div>
                <label htmlFor="login-email" className="block text-xs font-bold text-gray-700 uppercase mb-1">
                  Correo Institucional (@unitec.edu) *
                </label>
                <input
                  id="login-email"
                  type="email"
                  required
                  autoComplete="username"
                  placeholder="ej. diego.ramos@unitec.edu"
                  value={correo}
                  onChange={(e) => setCorreo(e.target.value)}
                  className="w-full border border-gray-300 p-3 rounded-xl text-sm focus:ring-2 focus:ring-blue-900 focus:outline-none font-mono"
                />
              </div>
              <div>
                <label htmlFor="login-password" className="block text-xs font-bold text-gray-700 uppercase mb-1">
                  Contraseña *
                </label>
                <input
                  id="login-password"
                  type="password"
                  required
                  autoComplete="current-password"
                  placeholder="Tu contraseña"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full border border-gray-300 p-3 rounded-xl text-sm focus:ring-2 focus:ring-blue-900 focus:outline-none"
                />
              </div>
              <button
                type="submit"
                disabled={loadingLogin}
                className="w-full bg-blue-950 hover:bg-blue-900 text-white font-bold py-3.5 rounded-xl text-sm transition shadow-md disabled:opacity-50"
              >
                {loadingLogin ? "Ingresando..." : "Ingresar →"}
              </button>
              <p className="text-[11px] text-gray-500 text-center">
                ¿Primera vez? Usa la pestaña <strong>«Crear cuenta»</strong>. ¿Olvidaste tu contraseña? Usa <strong>«Recuperar clave»</strong>.
              </p>
            </form>
          ) : paso === 1 ? (
            <form onSubmit={handleSolicitarCodigo} className="space-y-4 text-left">
              <div>
                <label htmlFor="registration-email" className="block text-xs font-bold text-gray-700 uppercase mb-1">
                  Correo Institucional (@unitec.edu) *
                </label>
                <input
                  id="registration-email"
                  type="email"
                  required
                  placeholder="ej. diego.ramos@unitec.edu"
                  value={correo}
                  onChange={(e) => setCorreo(e.target.value)}
                  className="w-full border border-gray-300 p-3 rounded-xl text-sm focus:ring-2 focus:ring-blue-900 focus:outline-none font-mono"
                />
                <p className="text-[11px] text-gray-400 mt-1">
                  {modoAcceso === "recuperar"
                    ? "Te enviaremos un código para restablecer tu contraseña."
                    : "Te enviaremos un código para confirmar tu cuenta y crear tu contraseña."}
                </p>
              </div>

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
              <div className="bg-emerald-50 border border-emerald-200 p-3 rounded-xl text-center" role="status">
                <span className="text-xs text-emerald-900 font-semibold block">
                  {otpInfo?.modoEnvio === "servidor" || otpInfo?.modoEnvio === "email"
                    ? `¡Código enviado a tu buzón institucional ${correo}!`
                    : `Código OTP enviado a ${correo}`}
                </span>
              </div>

              <div>
                <label htmlFor="verification-code" className="block text-xs font-bold text-gray-700 uppercase mb-1">
                  Código de 6 Dígitos *
                </label>
                <input
                  id="verification-code"
                  type="text"
                  required
                  maxLength={6}
                  placeholder="000000"
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

              <div>
                <label htmlFor="new-account-password" className="block text-xs font-bold text-gray-700 uppercase mb-1">
                  {modoAcceso === "recuperar" ? "Nueva contraseña (mín. 8 caracteres) *" : "Define tu contraseña (mín. 8 caracteres) *"}
                </label>
                <input
                  id="new-account-password"
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  placeholder="Mínimo 8 caracteres"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full border border-gray-300 p-3 rounded-xl text-sm focus:ring-2 focus:ring-blue-900 focus:outline-none"
                />
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
                  {loadingLogin
                    ? "Validando..."
                    : modoAcceso === "recuperar"
                    ? "Restablecer e Ingresar"
                    : "Crear Cuenta e Ingresar"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    );
  }

  // PANTALLA BLOQUEANTE: Cambio obligatorio de contraseña si fue emitida por un admin
  if (sesion?.debeCambiarPassword) {
    return (
      <div className="min-h-[78vh] flex items-center justify-center p-4">
        <div className="auth-gate-card bg-white rounded-3xl max-w-md w-full p-6 sm:p-8 shadow-xl border-2 border-amber-500 text-center animate-fade-in">
          <div className="w-14 h-14 bg-amber-100 text-amber-900 rounded-2xl flex items-center justify-center mx-auto mb-4 text-2xl font-black shadow-inner">
            🔑
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-blue-950 tracking-tight">
            Cambio Obligatorio de Contraseña
          </h2>
          <p className="text-xs text-gray-600 mt-2 mb-4 leading-relaxed">
            Iniciaste sesión con una contraseña temporal generada por el Comité Organizador. Por seguridad institucional, debes definir tu propia contraseña permanente para continuar.
          </p>

          {errorCambioObligatorio && (
            <div className="p-3 mb-4 state-message state-message--error text-xs font-medium text-center" role="alert">
              {errorCambioObligatorio}
            </div>
          )}

          <form onSubmit={handleCambioObligatorio} className="space-y-4 text-left">
            <div>
              <label htmlFor="required-password" className="block text-xs font-bold text-gray-700 uppercase mb-1">
                Nueva Contraseña (mín. 8 caracteres) *
              </label>
              <input
                id="required-password"
                type="password"
                required
                minLength={8}
                value={nuevaPasswordObligatoria}
                onChange={(e) => setNuevaPasswordObligatoria(e.target.value)}
                placeholder="Nueva contraseña segura"
                className="w-full border border-gray-300 p-3 rounded-xl text-sm focus:ring-2 focus:ring-blue-900 focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="confirm-required-password" className="block text-xs font-bold text-gray-700 uppercase mb-1">
                Confirmar Nueva Contraseña *
              </label>
              <input
                id="confirm-required-password"
                type="password"
                required
                minLength={8}
                value={confirmarPasswordObligatoria}
                onChange={(e) => setConfirmarPasswordObligatoria(e.target.value)}
                placeholder="Repite la contraseña"
                className="w-full border border-gray-300 p-3 rounded-xl text-sm focus:ring-2 focus:ring-blue-900 focus:outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={loadingCambioObligatorio}
              className="w-full bg-amber-600 hover:bg-amber-700 text-white font-bold py-3.5 rounded-xl text-sm transition shadow-md disabled:opacity-50"
            >
              {loadingCambioObligatorio ? "Actualizando..." : "Guardar Contraseña y Continuar →"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // 2. MODAL OBLIGATORIO SI EL ESTUDIANTE FUE ANOTADO POR SU CAPITÁN PERO FALTA SU CARNET
  if (perfilIncompleto) {
    return (
      <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl border-2 border-amber-500 animate-fade-in text-left" role="dialog" aria-modal="true" aria-labelledby="incomplete-profile-title">
          <div className="flex items-center gap-2 mb-2 text-amber-600 font-extrabold text-sm uppercase tracking-wider">
            <span>{perfilIncompleto.estadoCarnet === "rechazado" ? "❌" : "⚠️"}</span>
            <span>{perfilIncompleto.estadoCarnet === "rechazado" ? "Corrección de Documento Requerida" : "Registro Oficial Incompleto"}</span>
          </div>
          <h2 id="incomplete-profile-title" className="text-xl sm:text-2xl font-black text-blue-950 tracking-tight">
            {perfilIncompleto.estadoCarnet === "rechazado" ? "Vuelve a Subir tu Carnet Estudiantil" : "Completa tu Carnet Estudiantil"}
          </h2>
          <p className="text-xs text-gray-600 mt-1 mb-4">
            {perfilIncompleto.estadoCarnet === "rechazado" ? (
              <>
                El comité organizador revisó tu documento en el equipo <strong>{perfilIncompleto.nombreEquipo}</strong> y solicitó que subas una imagen legible para habilitar tu participación.
              </>
            ) : (
              <>
                Tu capitán te inscribió en el equipo <strong>{perfilIncompleto.nombreEquipo}</strong>, pero el reglamento oficial de MECAFUT 2026 exige que cada participante cargue su carnet estudiantil para validar su participación.
              </>
            )}
          </p>

          {perfilIncompleto.motivoRechazo && (
            <div className="p-3 mb-4 state-message state-message--error text-xs font-semibold" role="alert">
              Motivo indicado por el Comité: <span className="font-normal">{perfilIncompleto.motivoRechazo}</span>
            </div>
          )}

          {errorPerfil && (
            <div className="p-3 mb-4 state-message state-message--error text-xs font-medium" role="alert">
              {errorPerfil}
            </div>
          )}

          <form onSubmit={handleCompletarPerfil} className="space-y-4">
            <div>
              <label htmlFor="incomplete-profile-dni" className="block text-xs font-bold text-gray-700 mb-1">
                Número de Identidad (DNI) *
              </label>
              <input
                id="incomplete-profile-dni"
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

              <label htmlFor="incomplete-profile-document" className="sr-only">Foto del carnet o matrícula</label>
              <input
                id="incomplete-profile-document"
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

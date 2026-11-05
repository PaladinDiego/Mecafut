"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  obtenerSesionActual,
  cerrarSesion,
  solicitarOtp,
  verificarOtp
} from "../lib/authService";
import { CONFIG_TORNEO } from "../lib/torneoConfig";

export default function Navbar() {
  const pathname = usePathname();
  const [sesion, setSesion] = useState(null);
  const [mostrarModalLogin, setMostrarModalLogin] = useState(false);

  // Estados del modal OTP
  const [paso, setPaso] = useState(1); // 1: correo, 2: codigo
  const [correo, setCorreo] = useState("");
  const [codigo, setCodigo] = useState("");
  const [otpInfo, setOtpInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [errorModal, setErrorModal] = useState("");
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    actualizarSesion();
    const handleAuthChange = () => actualizarSesion();
    window.addEventListener("mecafut_auth_change", handleAuthChange);
    return () => window.removeEventListener("mecafut_auth_change", handleAuthChange);
  }, []);

  const actualizarSesion = () => {
    const s = obtenerSesionActual();
    setSesion(s);
  };

  const handleCerrarSesion = () => {
    cerrarSesion();
    setSesion(null);
  };

  const handleSolicitarCodigo = (e) => {
    e.preventDefault();
    setErrorModal("");
    setLoading(true);

    try {
      const res = solicitarOtp(correo);
      setOtpInfo(res);
      setPaso(2);
    } catch (err) {
      setErrorModal(err.message || "Error al solicitar código OTP");
    } finally {
      setLoading(false);
    }
  };

  const handleVerificarCodigo = (e) => {
    e.preventDefault();
    setErrorModal("");
    setLoading(true);

    try {
      const nuevaSesion = verificarOtp(correo, codigo);
      setSesion(nuevaSesion);
      setMostrarModalLogin(false);
      setPaso(1);
      setCorreo("");
      setCodigo("");
      setOtpInfo(null);
    } catch (err) {
      setErrorModal(err.message || "Código incorrecto o expirado");
    } finally {
      setLoading(false);
    }
  };

  const copiarCodigoPrueba = () => {
    if (otpInfo?.codigoOtp) {
      navigator.clipboard.writeText(otpInfo.codigoOtp);
      setCodigo(otpInfo.codigoOtp);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    }
  };

  return (
    <>
      <header>
        <nav className="bg-blue-950 text-white p-4 shadow-md sticky top-0 z-50">
          <div className="max-w-6xl mx-auto flex flex-wrap justify-between items-center gap-3">
            <Link href="/" className="flex items-center gap-2 hover:opacity-90 transition">
              <span className="text-2xl">⚽</span>
              <div>
                <h1 className="text-lg font-bold tracking-tight">MECAFUT Q4 2026</h1>
                <p className="text-xs text-blue-200">Torneo de Ingeniería Mecatrónica</p>
              </div>
            </Link>

            <div className="flex flex-wrap items-center gap-3 text-sm font-medium">
              <Link
                href="/"
                className={`transition-colors px-2 py-1 rounded ${
                  pathname === "/" ? "text-white font-bold bg-blue-900/60" : "text-blue-100 hover:text-white"
                }`}
              >
                Inscribir Equipo
              </Link>

              <Link
                href="/equipo"
                className={`transition-colors px-2 py-1 rounded ${
                  pathname === "/equipo" ? "text-white font-bold bg-blue-900/60" : "text-blue-100 hover:text-white"
                }`}
              >
                Consultar Código
              </Link>

              {/* Botón Administrador: Solo visible para usuarios con rol 'admin' */}
              {sesion?.rol === "admin" && (
                <Link
                  href="/admin"
                  className={`bg-blue-800 hover:bg-blue-700 px-3 py-1.5 rounded-lg transition-colors text-white font-bold flex items-center gap-1.5 shadow ${
                    pathname === "/admin" ? "ring-2 ring-white" : ""
                  }`}
                >
                  <span>🛡️</span>
                  <span>Administrador</span>
                </Link>
              )}

              {/* Perfil de Usuario o Botón Iniciar Sesión */}
              {sesion ? (
                <div className="flex items-center gap-2 bg-blue-900/80 px-3 py-1 rounded-full border border-blue-700 text-xs">
                  <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                  <div className="text-left">
                    <strong className="block text-white leading-tight">
                      {sesion.nombre || sesion.correo.split("@")[0]}
                    </strong>
                    <span className="text-[10px] text-blue-200 uppercase font-semibold">
                      {sesion.rol === "admin" ? "👑 Admin" : sesion.rol === "docente" ? "🎓 Docente" : "⚽ Estudiante"}
                    </span>
                  </div>
                  <button
                    onClick={handleCerrarSesion}
                    title="Cerrar Sesión"
                    className="ml-2 text-blue-300 hover:text-white hover:bg-blue-800 px-1.5 py-0.5 rounded transition"
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setMostrarModalLogin(true);
                    setErrorModal("");
                    setPaso(1);
                  }}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition shadow flex items-center gap-1.5"
                >
                  <span>🔑</span>
                  <span>Iniciar Sesión</span>
                </button>
              )}
            </div>
          </div>
        </nav>
      </header>

      {/* MODAL DE AUTENTICACIÓN OTP CON CORREO INSTITUCIONAL */}
      {mostrarModalLogin && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-gray-200 relative">
            <button
              onClick={() => setMostrarModalLogin(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 text-lg w-8 h-8 rounded-full flex items-center justify-center hover:bg-gray-100 transition"
            >
              ✕
            </button>

            <div className="text-center mb-5">
              <span className="text-3xl">🔐</span>
              <h2 className="text-xl font-extrabold text-blue-950 mt-1">Acceso Institucional</h2>
              <p className="text-xs text-gray-500 mt-1">
                Ingresa con tu correo <strong>@unitec.edu</strong>. Te enviaremos un código OTP de 6 dígitos para autenticarte.
              </p>
            </div>

            {errorModal && (
              <div className="p-3 mb-4 bg-red-50 border border-red-300 text-red-800 text-xs rounded-xl font-medium text-center">
                {errorModal}
              </div>
            )}

            {paso === 1 ? (
              <form onSubmit={handleSolicitarCodigo} className="space-y-4">
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
                    className="w-full border border-gray-300 p-2.5 rounded-xl text-sm focus:ring-2 focus:ring-blue-900 focus:outline-none font-mono"
                  />
                  <p className="text-[11px] text-gray-400 mt-1">
                    Docentes y Administradores deben ingresar con su correo oficial autorizado.
                  </p>
                </div>

                {/* Accesos rápidos de prueba para agilizar testeo */}
                <div className="bg-blue-50/70 p-3 rounded-xl border border-blue-100">
                  <span className="block text-[11px] font-bold text-blue-900 mb-1.5">
                    💡 Accesos rápidos de prueba:
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => setCorreo("admin@unitec.edu")}
                      className="text-[10px] bg-white border border-blue-300 hover:bg-blue-100 text-blue-950 px-2 py-0.5 rounded font-semibold transition"
                    >
                      👑 Admin (admin@unitec.edu)
                    </button>
                    <button
                      type="button"
                      onClick={() => setCorreo("jared.sauceda@unitec.edu")}
                      className="text-[10px] bg-white border border-blue-300 hover:bg-blue-100 text-blue-950 px-2 py-0.5 rounded font-semibold transition"
                    >
                      🎓 Docente (jared.sauceda@unitec.edu)
                    </button>
                    <button
                      type="button"
                      onClick={() => setCorreo("estudiante.demo@unitec.edu")}
                      className="text-[10px] bg-white border border-blue-300 hover:bg-blue-100 text-blue-950 px-2 py-0.5 rounded font-semibold transition"
                    >
                      ⚽ Estudiante (demo@unitec.edu)
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-blue-950 hover:bg-blue-900 text-white font-bold py-2.5 rounded-xl text-sm transition shadow disabled:opacity-50"
                >
                  {loading ? "Generando código..." : "Enviar Código de Verificación OTP →"}
                </button>
              </form>
            ) : (
              <form onSubmit={handleVerificarCodigo} className="space-y-4">
                <div className="bg-emerald-50 border border-emerald-200 p-3 rounded-xl text-center">
                  <span className="text-xs text-emerald-900 font-semibold block">
                    ¡Código enviado a <strong>{correo}</strong>!
                  </span>
                  {otpInfo?.codigoOtp && (
                    <div className="mt-2 p-2 bg-white border border-emerald-300 rounded-lg inline-flex items-center gap-2">
                      <span className="text-xs text-gray-500">Código de prueba:</span>
                      <strong className="text-base font-mono tracking-widest text-emerald-950">
                        {otpInfo.codigoOtp}
                      </strong>
                      <button
                        type="button"
                        onClick={copiarCodigoPrueba}
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
                    className="w-full border border-gray-300 p-2.5 rounded-xl text-center text-xl font-mono tracking-widest font-black focus:ring-2 focus:ring-blue-900 focus:outline-none"
                  />
                  <p className="text-[11px] text-gray-400 text-center mt-1">
                    Válido por 10 minutos. (También puedes usar 123456 en pruebas locales)
                  </p>
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setPaso(1)}
                    className="w-1/3 border border-gray-300 hover:bg-gray-100 text-gray-700 text-xs font-bold py-2.5 rounded-xl transition"
                  >
                    ← Cambiar Correo
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-2/3 bg-blue-950 hover:bg-blue-900 text-white font-bold py-2.5 rounded-xl text-sm transition shadow disabled:opacity-50"
                  >
                    {loading ? "Validando..." : "Confirmar e Iniciar Sesión"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}

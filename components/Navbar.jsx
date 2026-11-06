"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  obtenerSesionActual,
  cerrarSesion
} from "../lib/authService";
import { obtenerEstadoTorneo, suscribirTorneoEnVivo } from "../lib/dbService";

export default function Navbar() {
  const pathname = usePathname();
  const [sesion, setSesion] = useState(null);
  const [torneoVisible, setTorneoVisible] = useState(false);

  useEffect(() => {
    actualizarSesion();
    const handleAuthChange = () => actualizarSesion();
    window.addEventListener("mecafut_auth_change", handleAuthChange);

    const unsub = suscribirTorneoEnVivo((torneoData) => {
      evaluarVisibilidadTorneo(torneoData);
    });

    return () => {
      window.removeEventListener("mecafut_auth_change", handleAuthChange);
      if (typeof unsub === "function") unsub();
    };
  }, []);

  const actualizarSesion = () => {
    const s = obtenerSesionActual();
    setSesion(s);
  };

  const evaluarVisibilidadTorneo = (torneoData) => {
    if (!torneoData) return;
    const { visibilidadPublica, fechaEvento } = torneoData;

    if (visibilidadPublica === "visible") {
      setTorneoVisible(true);
      return;
    }
    if (visibilidadPublica === "oculto") {
      setTorneoVisible(false);
      return;
    }

    // Modo "auto": Se habilita si hoy >= fechaEvento
    if (fechaEvento) {
      const hoyStr = new Date().toISOString().split("T")[0];
      setTorneoVisible(hoyStr >= fechaEvento);
    } else {
      setTorneoVisible(false);
    }
  };

  const handleCerrarSesion = () => {
    cerrarSesion();
    setSesion(null);
  };

  const reabrirReglamento = () => {
    window.dispatchEvent(new CustomEvent("mecafut_abrir_reglamento"));
  };

  const esAdmin = sesion?.rol === "admin";
  const mostrarEnlaceTorneo = torneoVisible || esAdmin;

  return (
    <header>
      <nav className="bg-blue-950 text-white p-4 shadow-md sticky top-0 z-40">
        <div className="max-w-6xl mx-auto flex flex-wrap justify-between items-center gap-3">
          <Link href="/" className="flex items-center gap-2 hover:opacity-90 transition">
            <span className="text-2xl">⚽</span>
            <div>
              <h1 className="text-lg font-bold tracking-tight">MECAFUT Q4 2026</h1>
              <p className="text-xs text-blue-200">Torneo de Ingeniería Mecatrónica</p>
            </div>
          </Link>

          <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-sm font-medium">
            <Link
              href="/"
              className={`transition-colors px-2.5 py-1 rounded-lg ${
                pathname === "/" ? "text-white font-bold bg-blue-900/70" : "text-blue-100 hover:text-white"
              }`}
            >
              Inscribir Equipo
            </Link>

            <Link
              href="/equipo"
              className={`transition-colors px-2.5 py-1 rounded-lg ${
                pathname === "/equipo" ? "text-white font-bold bg-blue-900/70" : "text-blue-100 hover:text-white"
              }`}
            >
              Consultar Código
            </Link>

            {/* Enlace al Torneo y Resultados en Vivo (Visible el día del evento o para Admin) */}
            {mostrarEnlaceTorneo && (
              <Link
                href="/torneo"
                className={`transition-colors px-2.5 py-1 rounded-lg flex items-center gap-1.5 ${
                  pathname === "/torneo"
                    ? "text-white font-black bg-emerald-700 shadow"
                    : "bg-emerald-900/60 hover:bg-emerald-800 text-emerald-100"
                }`}
              >
                <span>🏆</span>
                <span>Torneo en Vivo</span>
                {esAdmin && !torneoVisible && (
                  <span className="text-[9px] bg-amber-400 text-black px-1 rounded font-bold uppercase">
                    Admin
                  </span>
                )}
              </Link>
            )}

            {/* Botón para Releer el Reglamento */}
            <button
              type="button"
              onClick={reabrirReglamento}
              className="text-blue-200 hover:text-white hover:bg-blue-900/50 px-2 py-1 rounded text-xs transition flex items-center gap-1"
              title="Consultar Reglamento Oficial"
            >
              <span>📋</span>
              <span className="hidden sm:inline">Reglamento</span>
            </button>

            {/* Botón Administrador: Solo para rol 'admin' */}
            {esAdmin && (
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

            {/* Perfil de Usuario con Sesión Activa */}
            {sesion && (
              <div className="flex items-center gap-2 bg-blue-900/80 px-3 py-1 rounded-full border border-blue-700 text-xs">
                <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                <div className="text-left max-w-[120px] sm:max-w-[180px] truncate">
                  <strong className="block text-white leading-tight truncate">
                    {sesion.nombre || sesion.correo.split("@")[0]}
                  </strong>
                  <span className="text-[10px] text-blue-200 uppercase font-semibold block truncate">
                    {sesion.rol === "admin" ? "👑 Admin" : sesion.rol === "docente" ? "🎓 Docente" : "⚽ Estudiante"}
                  </span>
                </div>
                <button
                  onClick={handleCerrarSesion}
                  title="Cerrar Sesión"
                  className="ml-1 text-blue-300 hover:text-white hover:bg-blue-800 px-1.5 py-0.5 rounded transition"
                >
                  ✕
                </button>
              </div>
            )}
          </div>
        </div>
      </nav>
    </header>
  );
}

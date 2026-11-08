"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AlertTriangle,
  ClipboardList,
  LogOut,
  Menu,
  ShieldCheck,
  Trophy,
  UsersRound,
  X,
} from "lucide-react";
import { obtenerSesionActual, cerrarSesion } from "../lib/authService";
import { suscribirTorneoEnVivo } from "../lib/dbService";
import { obtenerFechaLocalHonduras } from "../lib/torneoConfig";
import ModalBetaAlert from "./ModalBetaAlert";
import BrandMark from "./BrandMark";

export default function Navbar() {
  const pathname = usePathname();
  const [sesion, setSesion] = useState(null);
  const [torneoVisible, setTorneoVisible] = useState(false);
  const [menuMovilAbierto, setMenuMovilAbierto] = useState(false);

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

  useEffect(() => {
    setMenuMovilAbierto(false);
  }, [pathname]);

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

    if (fechaEvento) {
      setTorneoVisible(obtenerFechaLocalHonduras() >= fechaEvento);
    } else {
      setTorneoVisible(false);
    }
  };

  const handleCerrarSesion = () => {
    cerrarSesion();
    setSesion(null);
    setMenuMovilAbierto(false);
  };

  const reabrirReglamento = () => {
    window.dispatchEvent(new CustomEvent("mecafut_abrir_reglamento"));
  };

  const abrirReporteProblema = () => {
    window.dispatchEvent(new CustomEvent("mecafut_abrir_reporte"));
  };

  const esAdmin = sesion?.rol === "admin";
  const mostrarEnlaceTorneo = torneoVisible || esAdmin;
  const etiquetaRol = sesion?.rol === "admin" && sesion.esDocente
    ? "Administrador y docente"
    : sesion?.rol === "admin"
      ? "Administrador"
      : sesion?.rol === "docente"
        ? "Docente"
        : "Estudiante";

  return (
    <header className="site-header">
      <ModalBetaAlert />
      <div className="site-header__inner">
        <Link href="/" className="brand-link" aria-label="MECAFUT, ir a inscripción">
          <BrandMark />
          <span>
            <span className="brand-link__name">MECAFUT Q4 2026</span>
            <span className="brand-link__sub">Torneo de Ingeniería Mecatrónica</span>
          </span>
        </Link>

        <button
          className="mobile-menu-toggle"
          type="button"
          aria-expanded={menuMovilAbierto}
          aria-controls="primary-navigation"
          onClick={() => setMenuMovilAbierto((open) => !open)}
        >
          {menuMovilAbierto ? <X size={18} aria-hidden="true" /> : <Menu size={18} aria-hidden="true" />}
          <span>{menuMovilAbierto ? "Cerrar" : "Menú"}</span>
        </button>

        <nav
          id="primary-navigation"
          className="site-navigation"
          data-open={menuMovilAbierto}
          aria-label="Navegación principal"
        >
          <Link href="/" aria-current={pathname === "/" ? "page" : undefined} className="site-navigation__link">
            Inscripción
          </Link>
          <Link href="/equipo" aria-current={pathname === "/equipo" ? "page" : undefined} className="site-navigation__link">
            <UsersRound size={16} aria-hidden="true" /> Equipo
          </Link>

          {mostrarEnlaceTorneo && (
            <Link
              href="/torneo"
              aria-current={pathname === "/torneo" ? "page" : undefined}
              className="site-navigation__link site-navigation__link--live"
            >
              <Trophy size={16} aria-hidden="true" /> Torneo en vivo
              {esAdmin && !torneoVisible && <span aria-label="Vista previa administrativa">· Admin</span>}
            </Link>
          )}

          <button type="button" onClick={reabrirReglamento} className="site-navigation__action">
            <ClipboardList size={16} aria-hidden="true" /> Reglamento
          </button>

          <button
            type="button"
            onClick={abrirReporteProblema}
            className="site-navigation__action site-navigation__action--report"
          >
            <AlertTriangle size={16} aria-hidden="true" /> Reportar Problema
          </button>

          {esAdmin && (
            <Link
              href="/admin"
              aria-current={pathname === "/admin" ? "page" : undefined}
              className="site-navigation__link site-navigation__link--admin"
            >
              <ShieldCheck size={16} aria-hidden="true" /> Administración
            </Link>
          )}

          {sesion && (
            <>
              <span className="site-navigation__role" title={`${sesion.nombre || "Cuenta"}: ${etiquetaRol}`}>
                {sesion.nombre || sesion.correo.split("@")[0]} · {etiquetaRol}
              </span>
              <button
                type="button"
                onClick={handleCerrarSesion}
                className="site-navigation__action"
                aria-label="Cerrar sesión"
              >
                <LogOut size={16} aria-hidden="true" /> Cerrar sesión
              </button>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}

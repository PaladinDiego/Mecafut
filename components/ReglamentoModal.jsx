"use client";
import { useState, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { REGLAMENTO_OFICIAL_SECCIONES } from "../lib/torneoConfig";

const KEY_REG_CONFIRMADO = "mecafut_reglamento_leido_sesion";
const KEY_PESTANA_INICIADA = "mecafut_pestana_iniciada";

export default function ReglamentoModal() {
  const pathname = usePathname();
  const [abierto, setAbierto] = useState(false);
  const [scrollCompletado, setScrollCompletado] = useState(false);
  const [segundosRestantes, setSegundosRestantes] = useState(5);
  const [progresoScroll, setProgresoScroll] = useState(0);

  const containerRef = useRef(null);
  const bottomSentinelRef = useRef(null);

  const [leidoEnSesion, setLeidoEnSesion] = useState(false);

  // Escuchar evento personalizado para reabrir el reglamento voluntariamente desde el Navbar
  useEffect(() => {
    const handleReabrir = () => {
      setAbierto(true);
      setScrollCompletado(false);
      setSegundosRestantes(5);
    };
    window.addEventListener("mecafut_abrir_reglamento", handleReabrir);
    return () => window.removeEventListener("mecafut_abrir_reglamento", handleReabrir);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const yaLeido = sessionStorage.getItem(KEY_REG_CONFIRMADO) === "1";
    const pestanaIniciada = sessionStorage.getItem(KEY_PESTANA_INICIADA);

    if (!pestanaIniciada) {
      sessionStorage.setItem(KEY_PESTANA_INICIADA, "1");
      setAbierto(true);
      setScrollCompletado(false);
      setSegundosRestantes(5);
    } else if (!yaLeido) {
      setAbierto(true);
      setScrollCompletado(false);
      setSegundosRestantes(5);
    }
  }, [pathname]);

  // Observer para detectar cuando se hace scroll al final del reglamento
  useEffect(() => {
    if (!abierto || scrollCompletado) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setScrollCompletado(true);
        }
      },
      { threshold: 0.1 }
    );

    if (bottomSentinelRef.current) {
      observer.observe(bottomSentinelRef.current);
    }

    return () => observer.disconnect();
  }, [abierto, scrollCompletado]);

  // Cuenta regresiva de 5 segundos después de llegar al final
  useEffect(() => {
    if (!scrollCompletado) return;
    if (segundosRestantes <= 0) return;

    const timer = setInterval(() => {
      setSegundosRestantes((prev) => Math.max(0, prev - 1));
    }, 1000);

    return () => clearInterval(timer);
  }, [scrollCompletado, segundosRestantes]);

  const handleScroll = (e) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    const scrollMax = scrollHeight - clientHeight;
    if (scrollMax > 0) {
      const porcentaje = Math.min(100, Math.round((scrollTop / scrollMax) * 100));
      setProgresoScroll(porcentaje);
      if (porcentaje >= 96) {
        setScrollCompletado(true);
      }
    }
  };

  const confirmarLectura = () => {
    sessionStorage.setItem(KEY_REG_CONFIRMADO, "1");
    setAbierto(false);
  };

  if (!abierto) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-black/75 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 overflow-hidden animate-fade-in">
      <div
        style={{ height: "88vh", maxHeight: "850px" }}
        className="bg-white rounded-3xl max-w-3xl w-full flex flex-col shadow-2xl border-2 border-blue-900 overflow-hidden"
      >
        {/* Encabezado */}
        <div className="bg-blue-950 text-white p-5 sm:p-6 text-center relative flex-shrink-0">
          <div className="inline-flex items-center gap-2 bg-blue-900/80 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider text-blue-200 mb-2">
            <span>⚽</span> Torneo Oficial de Fútbol
          </div>
          <h2 className="text-xl sm:text-2xl font-black tracking-tight">
            REGLAMENTO OFICIAL – MECAFUT 2026
          </h2>
          <p className="text-xs sm:text-sm text-blue-200 mt-1 max-w-lg mx-auto">
            Facultad de Ingeniería Mecatrónica — Es obligatorio leer hasta el final para acceder.
          </p>

          {/* Barra de Progreso de Lectura */}
          <div className="w-full bg-blue-900/50 h-1.5 rounded-full overflow-hidden mt-4">
            <div
              className="bg-emerald-400 h-full transition-all duration-150"
              style={{ width: `${progresoScroll}%` }}
            />
          </div>
        </div>

        {/* Cuerpo del Reglamento con Scroll */}
        <div
          ref={containerRef}
          onScroll={handleScroll}
          className="p-5 sm:p-8 overflow-y-auto flex-1 min-h-0 space-y-6 text-gray-800 text-xs sm:text-sm leading-relaxed"
        >
          {REGLAMENTO_OFICIAL_SECCIONES.map((sec) => (
            <section key={sec.numero} className="border-b border-gray-100 pb-5 last:border-b-0">
              <h3 className="text-sm sm:text-base font-extrabold text-blue-950 mb-2.5 flex items-center gap-2">
                <span className="w-6 h-6 rounded-lg bg-blue-100 text-blue-900 flex items-center justify-center text-xs font-black">
                  {sec.numero}
                </span>
                <span>{sec.titulo}</span>
              </h3>
              <ul className="list-disc pl-6 space-y-1.5 text-gray-700">
                {sec.puntos.map((p, idx) => {
                  const esDestacado = sec.destacados?.includes(idx);
                  return (
                    <li key={idx} className={esDestacado ? "font-bold text-blue-950 bg-blue-50/70 p-1 rounded" : ""}>
                      {p}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}

          {/* Centinela de llegada al final */}
          <div ref={bottomSentinelRef} className="pt-4 text-center">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest">
              — Fin del Reglamento Oficial MECAFUT 2026 —
            </span>
          </div>
        </div>

        {/* Barra Inferior con Botón de Confirmación y Cuenta Regresiva */}
        <div className="p-4 sm:p-5 bg-gray-50 border-t border-gray-200 flex flex-col sm:flex-row items-center justify-between gap-3 flex-shrink-0">
          <div className="text-xs text-gray-600 text-center sm:text-left">
            {!scrollCompletado ? (
              <span className="text-amber-800 font-semibold flex items-center gap-1.5">
                <span>↓</span> Desliza hasta el final del documento para habilitar la confirmación.
              </span>
            ) : segundosRestantes > 0 ? (
              <span className="text-blue-900 font-bold flex items-center gap-1.5">
                <span>⏳</span> Has llegado al final. Espera {segundosRestantes} segundos para confirmar lectura...
              </span>
            ) : (
              <span className="text-emerald-800 font-bold flex items-center gap-1.5">
                <span>✅</span> Reglamento leído por completo. Puedes confirmar para continuar.
              </span>
            )}
          </div>

          <button
            type="button"
            disabled={!scrollCompletado || segundosRestantes > 0}
            onClick={confirmarLectura}
            className={`w-full sm:w-auto px-6 py-3 rounded-xl font-black text-sm transition shadow-lg ${
              !scrollCompletado || segundosRestantes > 0
                ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                : "bg-emerald-600 hover:bg-emerald-700 text-white transform hover:scale-[1.02]"
            }`}
          >
            {!scrollCompletado
              ? "↓ Haz scroll hasta el final"
              : segundosRestantes > 0
              ? `Por favor espera (${segundosRestantes}s)...`
              : "Sí, leí todo"}
          </button>
        </div>
      </div>
    </div>
  );
}

"use client";
import { useState, useEffect } from "react";

const KEY_REG_CONFIRMADO = "mecafut_reglamento_leido_sesion";
const KEY_BETA_DISMISSED = "mecafut_beta_alert_dismissed";
const WHATSAPP_REPORTE_URL = "https://wa.me/50494744365?text=Hola,%20quiero%20reportar%20un%20problema%20en%20la%20plataforma%20de%20MECAFUT%202026:";

export default function ModalBetaAlert() {
  const [abierto, setAbierto] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Listener para abrir voluntariamente desde cualquier botón de la app
    const handleAbrirVoluntario = () => {
      setAbierto(true);
    };
    window.addEventListener("mecafut_abrir_reporte", handleAbrirVoluntario);

    // Si ya fue descartado en esta sesión, no abrir automáticamente
    const yaDescartado = sessionStorage.getItem(KEY_BETA_DISMISSED) === "1";
    if (yaDescartado) {
      return () => window.removeEventListener("mecafut_abrir_reporte", handleAbrirVoluntario);
    }

    let timer = null;
    let interval = null;

    const iniciarTimerApertura = () => {
      if (timer) return;
      timer = setTimeout(() => {
        // Verificar nuevamente si fue descartado mientras corría el timer
        if (sessionStorage.getItem(KEY_BETA_DISMISSED) !== "1") {
          setAbierto(true);
        }
      }, 3000);
    };

    // Verificar si el reglamento ya está cerrado/leído
    const yaLeidoReglamento = sessionStorage.getItem(KEY_REG_CONFIRMADO) === "1";

    if (yaLeidoReglamento) {
      iniciarTimerApertura();
    } else {
      // Polling cada 500ms hasta que el usuario cierre el reglamento
      interval = setInterval(() => {
        if (sessionStorage.getItem(KEY_REG_CONFIRMADO) === "1") {
          clearInterval(interval);
          iniciarTimerApertura();
        }
      }, 500);
    }

    return () => {
      window.removeEventListener("mecafut_abrir_reporte", handleAbrirVoluntario);
      if (timer) clearTimeout(timer);
      if (interval) clearInterval(interval);
    };
  }, []);

  const cerrarModal = () => {
    try {
      sessionStorage.setItem(KEY_BETA_DISMISSED, "1");
    } catch (e) {}
    setAbierto(false);
  };

  if (!abierto) return null;

  return (
    <div className="fixed inset-0 z-[110] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-white rounded-2xl max-w-lg w-full border-2 border-red-500 shadow-2xl overflow-hidden relative transform transition-all" role="dialog" aria-modal="true" aria-labelledby="beta-dialog-title" aria-describedby="beta-dialog-description">
        {/* Barra superior de alerta */}
        <div className="bg-red-600 text-white px-5 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl animate-bounce">⚠️</span>
            <span className="font-extrabold tracking-wide text-sm uppercase flex items-center gap-1.5">
              <span>Plataforma en Desarrollo</span>
              <span className="bg-white text-red-700 text-[10px] font-black px-1.5 py-0.5 rounded shadow-sm">
                BETA
              </span>
            </span>
          </div>
          <button
            type="button"
            onClick={cerrarModal}
            className="text-white/80 hover:text-white hover:bg-red-700 w-8 h-8 rounded-full flex items-center justify-center transition font-bold text-lg"
            aria-label="Cerrar aviso"
          >
            ✕
          </button>
        </div>

        {/* Contenido del modal */}
        <div className="p-6 bg-red-50/60">
          <div className="flex items-start gap-3">
            <span className="text-3xl flex-shrink-0">❗</span>
            <div className="space-y-2 text-xs sm:text-sm text-gray-800 leading-relaxed">
              <h2 id="beta-dialog-title" className="font-extrabold text-red-950 text-base">
                Aviso Importante al Usuario
              </h2>
              <p id="beta-dialog-description">
                La plataforma web de <strong>MECAFUT 2026</strong> se encuentra actualmente en <strong>fase de desarrollo activo (BETA)</strong>.
              </p>
              <p className="text-gray-700">
                Es posible que experimentes detalles visuales o pequeños inconvenientes en algunas funciones. Si detectas cualquier fallo, error en datos o problema técnico, <strong>te solicitamos reportarlo inmediatamente</strong> al comité organizador.
              </p>
            </div>
          </div>

          {/* Tarjeta de soporte */}
          <div className="mt-5 p-3.5 bg-white border border-red-200 rounded-xl flex items-center gap-3 shadow-sm">
            <span className="text-2xl">📱</span>
            <div className="text-xs">
              <span className="text-gray-500 block text-[11px]">Canal Directo de Soporte:</span>
              <strong className="text-gray-900 font-mono">+504 9474-4365</strong>
              <span className="text-gray-400 block text-[10px]">Comité Organizador MECAFUT</span>
            </div>
          </div>

          {/* Botones de acción */}
          <div className="mt-6 flex flex-col sm:flex-row gap-2.5">
            <a
              href={WHATSAPP_REPORTE_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={cerrarModal}
              className="flex-1 bg-red-600 hover:bg-red-700 text-white font-extrabold text-xs sm:text-sm py-3 px-4 rounded-xl text-center shadow-lg hover:shadow-red-500/25 transition flex items-center justify-center gap-2 transform active:scale-95"
            >
              <span>💬</span>
              <span>Reportar Problema por WhatsApp</span>
            </a>
            <button
              type="button"
              onClick={cerrarModal}
              className="px-4 py-3 bg-white hover:bg-gray-100 text-gray-700 font-bold text-xs sm:text-sm rounded-xl border border-gray-300 transition"
            >
              Entendido
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

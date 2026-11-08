"use client";

import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";

let nextToastId = 0;

export default function ToastMessages() {
  const [messages, setMessages] = useState([]);

  useEffect(() => {
    const handleMessage = (event) => {
      const message = event.detail?.message;
      if (!message) return;
      const id = ++nextToastId;
      const type = event.detail?.type === "success" ? "success" : event.detail?.type === "info" ? "info" : "error";
      setMessages((current) => [...current.slice(-3), { id, type, message: String(message) }]);
      window.setTimeout(() => {
        setMessages((current) => current.filter((item) => item.id !== id));
      }, 6500);
    };

    window.addEventListener("mecafut_ui_message", handleMessage);
    return () => window.removeEventListener("mecafut_ui_message", handleMessage);
  }, []);

  if (!messages.length) return null;

  const IconByType = { error: AlertCircle, success: CheckCircle2, info: Info };

  return (
    <div className="toast-stack" aria-label="Mensajes de la plataforma">
      {messages.map(({ id, type, message }) => {
        const Icon = IconByType[type];
        return (
          <div key={id} className={`toast-message toast-message--${type}`} role={type === "error" ? "alert" : "status"}>
            <Icon size={18} aria-hidden="true" />
            <p>{message}</p>
            <button
              type="button"
              aria-label="Cerrar mensaje"
              onClick={() => setMessages((current) => current.filter((item) => item.id !== id))}
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

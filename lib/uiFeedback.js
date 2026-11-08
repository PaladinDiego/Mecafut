export function notifyUser(message, type) {
  if (typeof window === "undefined") return;
  const text = String(message || "Ocurrió un problema.");
  const inferredType = type || (/error|fall[oó]|no se|no hay|debes|debe|ingresa|selecciona|válid|obligatorio|incorrecto|repetid/i.test(text)
    ? "error"
    : /éxito|correctamente|guardad|actualizad|generad|copiad|registrad/i.test(text)
      ? "success"
      : "info");
  window.dispatchEvent(new CustomEvent("mecafut_ui_message", {
    detail: { message: text, type: inferredType },
  }));
}

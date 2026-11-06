/**
 * Script de prueba para validar la integración de EmailJS
 * 
 * Uso:
 *   node scripts/probar-emailjs.js tu_correo@unitec.edu
 */

const fs = require("fs");
const path = require("path");

// Cargar variables de .env.local si existe
const envLocalPath = path.resolve(__dirname, "../.env.local");
if (fs.existsSync(envLocalPath)) {
  const content = fs.readFileSync(envLocalPath, "utf8");
  content.split("\n").forEach((line) => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#")) {
      const [key, ...values] = trimmed.split("=");
      if (key && values.length > 0) {
        process.env[key.trim()] = values.join("=").trim();
      }
    }
  });
}

const serviceId = process.env.NEXT_PUBLIC_EMAILJS_SERVICE_ID;
const templateId = process.env.NEXT_PUBLIC_EMAILJS_TEMPLATE_ID;
const publicKey = process.env.NEXT_PUBLIC_EMAILJS_PUBLIC_KEY;

const correoDestino = process.argv[2] || "andresvalle@unitec.edu";

console.log("=========================================");
console.log("🧪 MECAFUT 2026 — Verificador de EmailJS");
console.log("=========================================");
console.log(`Service ID:   ${serviceId || "❌ No configurado"}`);
console.log(`Template ID:  ${templateId || "❌ No configurado"}`);
console.log(`Public Key:   ${publicKey ? publicKey.substring(0, 6) + "..." : "❌ No configurada"}`);
console.log(`Destinatario: ${correoDestino}`);
console.log("-----------------------------------------");

if (!serviceId || !templateId || !publicKey) {
  console.error("❌ Faltan credenciales en el archivo .env.local o variables de entorno.");
  console.error("Por favor completa:");
  console.error("  - NEXT_PUBLIC_EMAILJS_SERVICE_ID");
  console.error("  - NEXT_PUBLIC_EMAILJS_TEMPLATE_ID");
  console.error("  - NEXT_PUBLIC_EMAILJS_PUBLIC_KEY");
  process.exit(1);
}

const payload = {
  service_id: serviceId,
  template_id: templateId,
  user_id: publicKey,
  template_params: {
    to_email: correoDestino,
    otp_code: "849201",
    nombre_usuario: "Prueba Sistema",
    torneo_titulo: "MECAFUT Q4 2026"
  }
};

console.log("🚀 Enviando solicitud a EmailJS API...");

fetch("https://api.emailjs.com/api/v1.0/email/send", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(payload)
})
  .then(async (res) => {
    const text = await res.text();
    if (res.ok) {
      console.log("✅ ¡Éxito! Correo despachado correctamente (Status 200 OK).");
      console.log(`Revisa la bandeja de entrada de ${correoDestino} (incluyendo correo no deseado/Spam).`);
    } else {
      console.error(`❌ Error de EmailJS (Status ${res.status}):`, text);
    }
  })
  .catch((err) => {
    console.error("❌ Error de conexión de red:", err.message);
  });

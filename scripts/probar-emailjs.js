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

const cuenta = process.argv[3] === "2" ? "2" : "1";

const serviceId = cuenta === "2"
  ? (process.env.NEXT_PUBLIC_EMAILJS_SERVICE_ID_2 || "service_1cf52oc")
  : (process.env.NEXT_PUBLIC_EMAILJS_SERVICE_ID || "service_ar5incb");

const templateId = cuenta === "2"
  ? (process.env.NEXT_PUBLIC_EMAILJS_TEMPLATE_ID_2 || "template_2fkhyps")
  : (process.env.NEXT_PUBLIC_EMAILJS_TEMPLATE_ID || "template_xfm3uu3");

const publicKey = cuenta === "2"
  ? (process.env.NEXT_PUBLIC_EMAILJS_PUBLIC_KEY_2 || "7CpkO7AM8FtYzeoIm")
  : (process.env.NEXT_PUBLIC_EMAILJS_PUBLIC_KEY || "dMui9NIr2noTnsQ-d");

const correoDestino = process.argv[2] || "andresvalle@unitec.edu";

console.log("=========================================");
console.log(`🧪 MECAFUT 2026 — Verificador EmailJS (Cuenta ${cuenta})`);
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
  headers: {
    "Content-Type": "application/json",
    "Origin": "http://localhost:3000",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
  },
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

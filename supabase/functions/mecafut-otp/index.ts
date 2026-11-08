import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function generarOtpSeguro(): string {
  const arr = new Uint32Array(1);
  let code = "123456";
  while (code === "123456") {
    crypto.getRandomValues(arr);
    code = String(100000 + (arr[0] % 900000));
  }
  return code;
}

function esCorreoInstitucional(correo: string): boolean {
  return correo.endsWith("@unitec.edu") || correo.endsWith("@unitec.edu.hn");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "Método no permitido." }), {
      status: 405,
      headers: CORS_HEADERS,
    });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const correo = String(body?.correo || "").trim().toLowerCase();
    const nombreUsuario = String(body?.nombreUsuario || "Estudiante").trim();
    const torneoTitulo = String(body?.torneoTitulo || "MECAFUT Q4 2026").trim();

    if (!esCorreoInstitucional(correo)) {
      return new Response(
        JSON.stringify({
          ok: false,
          reason: "invalid_domain",
          error: "Acceso restringido: Solo se admiten correos institucionales oficiales (@unitec.edu o @unitec.edu.hn).",
        }),
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const codigo = generarOtpSeguro();

    // 1. Pre-registrar el OTP de forma 100% atómica en PostgreSQL (advisory lock + cooldown de 45s en transacción)
    const { data: regData, error: rpcErr } = await supabase.rpc("rpc_registrar_otp_servidor", {
      p_correo: correo,
      p_codigo: codigo,
    });

    if (rpcErr || !regData?.ok) {
      const isCooldown = regData?.reason === "cooldown";
      const isInvalidDomain = regData?.reason === "invalid_domain";
      const status = isCooldown ? 429 : (isInvalidDomain ? 400 : 500);

      return new Response(
        JSON.stringify({
          ok: false,
          reason: regData?.reason || "db_error",
          error: regData?.error || rpcErr?.message || "Error procesando el código de verificación en el servidor.",
        }),
        { status, headers: CORS_HEADERS }
      );
    }

    const { data: metricas } = await supabase.rpc("rpc_obtener_metricas_email");
    const envios1 = Number(metricas?.cuenta1_envios ?? 25);
    const limite = Number(metricas?.limite_rotacion ?? 180);

    const proveedores = [
      {
        key: "cuenta1",
        serviceId: Deno.env.get("EMAILJS_SERVICE_ID_1") || "service_ar5incb",
        templateId: Deno.env.get("EMAILJS_TEMPLATE_ID_1") || "template_xfm3uu3",
        publicKey: Deno.env.get("EMAILJS_PUBLIC_KEY_1") || "dMui9NIr2noTnsQ-d",
        privateKey: Deno.env.get("EMAILJS_PRIVATE_KEY_1") || "",
      },
      {
        key: "cuenta2",
        serviceId: Deno.env.get("EMAILJS_SERVICE_ID_2") || "service_1cf52oc",
        templateId: Deno.env.get("EMAILJS_TEMPLATE_ID_2") || "template_2fkhyps",
        publicKey: Deno.env.get("EMAILJS_PUBLIC_KEY_2") || "7CpkO7AM8FtYzeoIm",
        privateKey: Deno.env.get("EMAILJS_PRIVATE_KEY_2") || "",
      },
    ];

    const orden = envios1 >= limite ? [proveedores[1], proveedores[0]] : [proveedores[0], proveedores[1]];

    // 2. Intentar despacho server-side a través de EmailJS REST API
    let enviadoPor: string | null = null;
    let ultimoDetalleError = "";

    for (const p of orden) {
      const payload: Record<string, unknown> = {
        service_id: p.serviceId,
        template_id: p.templateId,
        user_id: p.publicKey,
        template_params: {
          to_email: correo,
          email: correo,
          otp_code: codigo,
          passcode: codigo,
          codigo_otp: codigo,
          nombre_usuario: nombreUsuario,
          torneo_titulo: torneoTitulo,
          time: "10 minutos",
        },
      };
      if (p.privateKey) {
        payload.accessToken = p.privateKey;
      }

      const resp = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (resp.ok) {
        enviadoPor = p.key;
        break;
      }

      const errTxt = await resp.text().catch(() => "");
      ultimoDetalleError = `${resp.status}: ${errTxt}`;
    }

    // 3. Si falla el despacho por EmailJS, invalidar inmediatamente el OTP en la BD (fail-closed)
    if (!enviadoPor) {
      await supabase
        .from("auth_otps")
        .update({ otp_hash: "", usado: true })
        .eq("correo", correo);

      return new Response(
        JSON.stringify({
          ok: false,
          reason: "provider_error",
          error: "No se pudo despachar el correo de verificación institucional en este momento. Por favor repórtalo al comité organizador.",
          detail: ultimoDetalleError,
        }),
        { status: 502, headers: CORS_HEADERS }
      );
    }

    // 4. Si tuvo éxito, registrar la métrica de rotación de correo
    await supabase.rpc("rpc_registrar_envio_email", { p_proveedor_key: enviadoPor });

    return new Response(
      JSON.stringify({
        ok: true,
        modoEnvio: "servidor",
        expiraEnMinutos: 10,
      }),
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({
        ok: false,
        reason: "unexpected_error",
        error: err instanceof Error ? err.message : "Error interno en servicio OTP.",
      }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
});

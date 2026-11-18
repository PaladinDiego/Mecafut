-- Prevent failed OTP delivery attempts from triggering a false 45s cooldown on immediate fallback,
-- and preserve valid active OTPs when cooldown is enforced.

UPDATE public.auth_otps
SET ultimo_envio_en = now() - interval '5 minutes'
WHERE (coalesce(otp_hash, '') = '' OR coalesce(usado, false) = true)
  AND ultimo_envio_en > now() - interval '5 minutes';

CREATE OR REPLACE FUNCTION public.rpc_registrar_otp_cliente(p_correo text, p_codigo text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_correo text := lower(trim(coalesce(p_correo, '')));
  v_codigo text := trim(coalesce(p_codigo, ''));
  v_prev public.auth_otps;
  v_habilitado boolean := true;
  v_admin_ya_registrado boolean;
  v_elapsed_seconds numeric;
BEGIN
  IF NOT public.es_correo_institucional(v_correo)
     OR v_correo !~ '^[^@[:space:]]+@unitec\.edu(\.hn)?$' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_domain', 'error', 'Solo se admiten correos institucionales UNITEC.');
  END IF;
  IF v_codigo = '' OR v_codigo !~ '^[0-9]{6}$' OR v_codigo = '123456' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_format', 'error', 'Código de verificación generado inválido.');
  END IF;
  SELECT coalesce(data->'otpAutomaticoHabilitado', 'true'::jsonb) = 'true'::jsonb
  INTO v_habilitado FROM public.configuracion WHERE id = 'general';
  v_habilitado := coalesce(v_habilitado, true);
  IF NOT v_habilitado THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'manual_only', 'error', 'La emisión automática de códigos está deshabilitada. Contacta al comité para recibir un código manual.');
  END IF;

  IF public.es_admin_oficial(v_correo) THEN
    SELECT EXISTS (SELECT 1 FROM public.usuarios WHERE lower(correo) = v_correo AND coalesce(password_hash, '') <> '')
    INTO v_admin_ya_registrado;
    IF v_admin_ya_registrado THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'admin_protected', 'error', 'Esta cuenta administrativa ya tiene contraseña activa.');
    END IF;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('otp:' || v_correo));
  SELECT * INTO v_prev FROM public.auth_otps WHERE correo = v_correo FOR UPDATE;
  IF FOUND
     AND coalesce(v_prev.otp_hash, '') <> ''
     AND NOT coalesce(v_prev.usado, false)
     AND v_prev.ultimo_envio_en IS NOT NULL THEN
    v_elapsed_seconds := extract(epoch FROM (now() - v_prev.ultimo_envio_en));
    IF v_elapsed_seconds < 45 THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'cooldown', 'error', 'Ya se envió un código recientemente. Espera ' || ceil(45 - v_elapsed_seconds)::int || ' segundos.');
    END IF;
  END IF;

  INSERT INTO public.auth_otps (correo, otp_hash, expira_en, intentos, origen_servidor, ultimo_envio_en, usado)
  VALUES (v_correo, crypt(v_codigo, gen_salt('bf', 8)), now() + interval '10 minutes', 0, true, now(), false)
  ON CONFLICT (correo) DO UPDATE SET otp_hash = EXCLUDED.otp_hash,
    expira_en = EXCLUDED.expira_en, intentos = 0, origen_servidor = true,
    ultimo_envio_en = now(), usado = false;
  RETURN jsonb_build_object('ok', true, 'expiraEnMinutos', 10);
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_registrar_otp_cliente(text, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.rpc_registrar_otp_servidor(p_correo text, p_codigo text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_correo text := lower(trim(coalesce(p_correo, '')));
  v_codigo text := trim(coalesce(p_codigo, ''));
  v_otp public.auth_otps;
  v_habilitado boolean := true;
  v_elapsed_seconds numeric;
BEGIN
  IF NOT public.es_correo_institucional(v_correo)
     OR v_correo !~ '^[^@[:space:]]+@unitec\.edu(\.hn)?$' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_domain', 'error', 'Solo se admiten correos institucionales UNITEC.');
  END IF;
  IF length(v_codigo) <> 6 OR v_codigo !~ '^[0-9]{6}$' OR v_codigo = '123456' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_format', 'error', 'Formato de código inválido.');
  END IF;
  SELECT coalesce(data->'otpAutomaticoHabilitado', 'true'::jsonb) = 'true'::jsonb
  INTO v_habilitado FROM public.configuracion WHERE id = 'general';
  v_habilitado := coalesce(v_habilitado, true);
  IF NOT v_habilitado THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'manual_only', 'error', 'La emisión automática de códigos está deshabilitada. Contacta al comité para recibir un código manual.');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('otp:' || v_correo));
  SELECT * INTO v_otp FROM public.auth_otps WHERE correo = v_correo FOR UPDATE;
  IF FOUND
     AND coalesce(v_otp.otp_hash, '') <> ''
     AND NOT coalesce(v_otp.usado, false)
     AND v_otp.ultimo_envio_en IS NOT NULL THEN
    v_elapsed_seconds := extract(epoch FROM (now() - v_otp.ultimo_envio_en));
    IF v_elapsed_seconds < 45 THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'cooldown', 'error', 'Ya se envió un código recientemente. Espera ' || ceil(45 - v_elapsed_seconds)::int || ' segundos.');
    END IF;
  END IF;

  INSERT INTO public.auth_otps (correo, otp_hash, expira_en, intentos, origen_servidor, ultimo_envio_en, usado)
  VALUES (v_correo, crypt(v_codigo, gen_salt('bf', 8)), now() + interval '10 minutes', 0, true, now(), false)
  ON CONFLICT (correo) DO UPDATE SET otp_hash = EXCLUDED.otp_hash,
    expira_en = EXCLUDED.expira_en, intentos = 0, origen_servidor = true,
    ultimo_envio_en = now(), usado = false;
  RETURN jsonb_build_object('ok', true, 'expiraEnMinutos', 10);
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_registrar_otp_servidor(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_registrar_otp_servidor(text, text) TO service_role;

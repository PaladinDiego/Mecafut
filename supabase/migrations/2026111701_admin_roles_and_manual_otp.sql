-- Admin principals, delegated administrator roles, and a server controlled OTP fallback.

CREATE OR REPLACE FUNCTION public.es_admin_principal(p_correo text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public, extensions
AS $$
  SELECT lower(trim(coalesce(p_correo, ''))) IN (
    'andresvalle@unitec.edu', 'andresvalle@unitec.edu.hn',
    'carlos.rubi@unitec.edu', 'carlos.rubi@unitec.edu.hn',
    'cesar_lopez@unitec.edu', 'cesar_lopez@unitec.edu.hn',
    'juan.mejia@unitec.edu', 'juan.mejia@unitec.edu.hn',
    'cristhyan.rivera@unitec.edu', 'cristhyan.rivera@unitec.edu.hn'
  );
$$;

GRANT EXECUTE ON FUNCTION public.es_admin_principal(text) TO anon, authenticated, service_role;

-- Preserve the existing committee administrators as delegated roles in the database.
DO $$
DECLARE
  v_existing jsonb;
  v_admins jsonb;
  v_legacy text[] := ARRAY[
    'juan.mejia@unitec.edu', 'juan.mejia@unitec.edu.hn',
    'cristhyan.rivera@unitec.edu', 'cristhyan.rivera@unitec.edu.hn',
    'joserodasgodoy@unitec.edu', 'joserodasgodoy@unitec.edu.hn',
    'c.marcelo.al@unitec.edu', 'c.marcelo.al@unitec.edu.hn',
    'adioyuela@unitec.edu', 'adioyuela@unitec.edu.hn',
    'maria_giron@unitec.edu', 'maria_giron@unitec.edu.hn',
    'dereck.beltrand@unitec.edu', 'dereck.beltrand@unitec.edu.hn',
    'jalfaro@unitec.edu', 'jalfaro@unitec.edu.hn'
  ];
BEGIN
  INSERT INTO public.configuracion (id, data, actualizado_en)
  VALUES ('general', '{}'::jsonb, now())
  ON CONFLICT (id) DO NOTHING;

  SELECT data->'adminsExtra' INTO v_existing
  FROM public.configuracion WHERE id = 'general' FOR UPDATE;
  IF jsonb_typeof(v_existing) IS DISTINCT FROM 'array' THEN
    v_existing := '[]'::jsonb;
  END IF;

  SELECT coalesce(jsonb_agg(to_jsonb(email)), '[]'::jsonb) INTO v_admins
  FROM (
    SELECT lower(trim(value)) AS email FROM jsonb_array_elements_text(v_existing)
    UNION
    SELECT unnest(v_legacy)
  ) AS existing_admins;

  UPDATE public.configuracion
  SET data = jsonb_set(coalesce(data, '{}'::jsonb), '{adminsExtra}', v_admins, true),
      actualizado_en = now()
  WHERE id = 'general';
END;
$$;

CREATE OR REPLACE FUNCTION public.es_admin_oficial(p_correo text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_correo text := lower(trim(coalesce(p_correo, '')));
  v_usuario text := split_part(lower(trim(coalesce(p_correo, ''))), '@', 1);
  v_extra jsonb;
BEGIN
  IF NOT public.es_correo_institucional(v_correo)
     OR v_correo !~ '^[^@[:space:]]+@unitec\.edu(\.hn)?$' THEN
    RETURN false;
  END IF;
  IF public.es_admin_principal(v_correo) THEN
    RETURN true;
  END IF;

  SELECT data->'adminsExtra' INTO v_extra
  FROM public.configuracion WHERE id = 'general';
  IF jsonb_typeof(v_extra) IS DISTINCT FROM 'array' THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM jsonb_array_elements_text(v_extra) AS admin_email(value)
    WHERE (
      lower(trim(value)) = v_correo
      AND public.es_correo_institucional(value)
    ) OR (
      split_part(lower(trim(value)), '@', 1) = split_part(v_correo, '@', 1)
      AND lower(trim(value)) ~ '^[^@[:space:]]+@unitec\.edu(\.hn)?$'
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.es_admin_oficial(text) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.obtener_docente_oficial(p_correo text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, extensions
AS $$
  SELECT CASE lower(trim(coalesce(p_correo, '')))
    WHEN 'juan.mejia@unitec.edu.hn' THEN 'Ing. Juan Miguel Mejía'
    WHEN 'cristhyan.rivera@unitec.edu.hn' THEN 'Ing. Cristhyan Rivera'
    ELSE NULL
  END;
$$;

CREATE OR REPLACE FUNCTION public.es_docente_oficial(p_correo text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public, extensions
AS $$
  SELECT public.obtener_docente_oficial(p_correo) IS NOT NULL;
$$;

GRANT EXECUTE ON FUNCTION public.obtener_docente_oficial(text), public.es_docente_oficial(text)
TO anon, authenticated, service_role;

-- Return principal status explicitly to the UI while keeping the session role as `admin`.
CREATE OR REPLACE FUNCTION public.rpc_validar_sesion(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_ses public.auth_sesiones;
  v_debe_cambiar boolean := false;
BEGIN
  v_ses := public.resolver_sesion_valida(p_token, NULL, true);
  IF v_ses.usuario_id IS NOT NULL THEN
    SELECT coalesce(debe_cambiar_password, false) INTO v_debe_cambiar
    FROM public.usuarios WHERE usuario_id = v_ses.usuario_id;
  END IF;
  RETURN jsonb_build_object(
    'ok', true,
    'sesion', jsonb_build_object(
      'token', trim(p_token), 'usuarioId', v_ses.usuario_id, 'correo', v_ses.correo,
      'rol', v_ses.rol, 'tituloRol', v_ses.titulo_rol, 'nombre', v_ses.nombre,
      'esAdmin', v_ses.es_admin, 'esAdminPrincipal', public.es_admin_principal(v_ses.correo),
      'esDocente', v_ses.es_docente, 'expiraEn', v_ses.expira_en,
      'debeCambiarPassword', v_debe_cambiar
    )
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_validar_sesion(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.rpc_obtener_usuarios_admin(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_admin public.auth_sesiones;
  v_usuarios jsonb;
BEGIN
  v_admin := public.resolver_sesion_valida(p_token, 'admin');
  SELECT jsonb_agg(jsonb_build_object(
    'id', u.usuario_id, 'usuarioId', u.usuario_id, 'correo', u.correo,
    'nombre', u.nombre, 'cuenta', u.cuenta, 'dni', u.dni, 'telefono', u.telefono,
    'carrera', u.carrera, 'nombreClase', u.nombre_clase, 'nombre_clase', u.nombre_clase,
    'codigoClase', u.codigo_clase, 'codigo_clase', u.codigo_clase,
    'rol', CASE
      WHEN public.es_admin_principal(u.correo) THEN 'admin_principal'
      WHEN public.es_admin_oficial(u.correo) THEN 'admin'
      WHEN public.es_docente_oficial(u.correo) THEN 'docente'
      ELSE 'jugador'
    END,
    'debeCambiarPassword', u.debe_cambiar_password,
    'debe_cambiar_password', u.debe_cambiar_password,
    'tempPasswordUsada', u.temp_password_usada,
    'tempPasswordPor', u.temp_password_por, 'tempPasswordEn', u.temp_password_en,
    'creadoEn', u.creado_en,
    'esAdmin', public.es_admin_oficial(u.correo),
    'esAdminPrincipal', public.es_admin_principal(u.correo),
    'esDocente', public.es_docente_oficial(u.correo)
  ) ORDER BY u.creado_en DESC) INTO v_usuarios
  FROM public.usuarios u;
  RETURN coalesce(v_usuarios, '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_obtener_usuarios_admin(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_obtener_usuarios_admin(text) TO anon, authenticated;

-- The generic settings RPC cannot mutate role membership; OTP setting remains a validated boolean.
CREATE OR REPLACE FUNCTION public.rpc_guardar_configuracion_general(
  p_token text,
  p_actualizaciones jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_admin public.auth_sesiones;
  v_data jsonb;
  v_payload jsonb;
  v_max int;
  v_wa text;
  v_torneo_raw jsonb;
BEGIN
  v_admin := public.resolver_sesion_valida(p_token, 'admin');
  v_payload := p_actualizaciones;
  IF v_payload IS NULL OR jsonb_typeof(v_payload) <> 'object' THEN
    RAISE EXCEPTION 'Payload de configuración vacío o no válido.';
  END IF;
  IF v_payload ? 'adminsExtra' OR v_payload ? 'admins' THEN
    RAISE EXCEPTION 'Los roles administrativos solo se pueden cambiar desde la administración principal.';
  END IF;
  IF v_payload ? 'otpAutomaticoHabilitado'
     AND jsonb_typeof(v_payload->'otpAutomaticoHabilitado') <> 'boolean' THEN
    RAISE EXCEPTION 'otpAutomaticoHabilitado debe ser booleano.';
  END IF;

  SELECT data INTO v_data FROM public.configuracion WHERE id = 'general' FOR UPDATE;
  v_data := coalesce(v_data, '{}'::jsonb) || v_payload;
  IF v_payload ? 'maxJugadoresPorEquipo' THEN
    v_max := (v_payload->>'maxJugadoresPorEquipo')::int;
    IF v_max < 8 THEN
      RAISE EXCEPTION 'El máximo de integrantes por equipo no puede ser menor a 8.';
    END IF;
  END IF;
  IF v_payload ? 'whatsappCapitanesUrl' THEN
    v_wa := trim(coalesce(v_payload->>'whatsappCapitanesUrl', ''));
    IF v_wa <> '' AND v_wa !~ '^https://chat\.whatsapp\.com/(invite/)?[A-Za-z0-9_-]{10,64}/?$' THEN
      RAISE EXCEPTION 'El enlace de WhatsApp no tiene un formato válido.';
    END IF;
  END IF;

  INSERT INTO public.configuracion (id, data, actualizado_en)
  VALUES ('general', v_data, now())
  ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, actualizado_en = now();
  SELECT data INTO v_torneo_raw FROM public.configuracion WHERE id = 'torneo_interno';
  IF v_torneo_raw IS NOT NULL THEN
    INSERT INTO public.configuracion (id, data, actualizado_en)
    VALUES ('torneo', public.proyectar_torneo_publico(v_torneo_raw), now())
    ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, actualizado_en = now();
  END IF;
  RETURN v_data;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_guardar_configuracion_general(text, jsonb)
TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.rpc_configurar_admin(
  p_token text,
  p_correo text,
  p_habilitar boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_admin public.auth_sesiones;
  v_correo text := lower(trim(coalesce(p_correo, '')));
  v_usuario text;
  v_extra jsonb;
  v_next jsonb;
  v_existe boolean;
  v_usuario_id uuid;
BEGIN
  v_admin := public.resolver_sesion_valida(p_token, 'admin');
  IF NOT public.es_admin_principal(v_admin.correo) THEN
    RAISE EXCEPTION 'Solo un admin principal puede gestionar roles administrativos.';
  END IF;
  IF NOT public.es_correo_institucional(v_correo) OR v_correo !~ '^[^@[:space:]]+@unitec\.edu(\.hn)?$' THEN
    RAISE EXCEPTION 'Ingresa un correo institucional @unitec.edu o @unitec.edu.hn.';
  END IF;
  v_usuario := split_part(v_correo, '@', 1);
  IF public.es_admin_principal(v_correo) THEN
    RAISE EXCEPTION 'Las cuentas principales no se pueden modificar desde esta acción.';
  END IF;

  SELECT coalesce(data->'adminsExtra', '[]'::jsonb) INTO v_extra
  FROM public.configuracion WHERE id = 'general' FOR UPDATE;
  IF jsonb_typeof(v_extra) IS DISTINCT FROM 'array' THEN v_extra := '[]'::jsonb; END IF;
  SELECT EXISTS (
    SELECT 1 FROM jsonb_array_elements_text(v_extra) AS e(value)
    WHERE split_part(lower(trim(value)), '@', 1) = v_usuario
      AND lower(trim(value)) ~ '^[^@[:space:]]+@unitec\.edu(\.hn)?$'
  ) INTO v_existe;

  IF p_habilitar THEN
    SELECT coalesce(jsonb_agg(to_jsonb(value)), '[]'::jsonb) INTO v_next
    FROM jsonb_array_elements_text(v_extra) AS e(value)
    WHERE NOT (
      split_part(lower(trim(value)), '@', 1) = v_usuario
      AND lower(trim(value)) ~ '^[^@[:space:]]+@unitec\.edu(\.hn)?$'
    );
    v_next := v_next || jsonb_build_array(v_usuario || '@unitec.edu', v_usuario || '@unitec.edu.hn');
  ELSIF v_existe THEN
    SELECT coalesce(jsonb_agg(to_jsonb(value)), '[]'::jsonb) INTO v_next
    FROM jsonb_array_elements_text(v_extra) AS e(value)
    WHERE NOT (
      split_part(lower(trim(value)), '@', 1) = v_usuario
      AND lower(trim(value)) ~ '^[^@[:space:]]+@unitec\.edu(\.hn)?$'
    );
  ELSE
    v_next := v_extra;
  END IF;

  UPDATE public.configuracion
  SET data = jsonb_set(coalesce(data, '{}'::jsonb), '{adminsExtra}', v_next, true), actualizado_en = now()
  WHERE id = 'general';
  SELECT usuario_id INTO v_usuario_id FROM public.usuarios WHERE lower(correo) = v_correo LIMIT 1;
  IF v_existe IS DISTINCT FROM p_habilitar THEN
    INSERT INTO public.usuarios_historial (
      usuario_id, correo, campo, valor_anterior, valor_nuevo, origen, creado_en,
      actor_usuario_id, actor_correo
    ) VALUES (
      v_usuario_id, v_correo, 'rol_admin',
      CASE WHEN v_existe THEN 'admin' ELSE 'sin admin' END,
      CASE WHEN p_habilitar THEN 'admin' ELSE 'sin admin' END,
      'admin_roles', now(), v_admin.usuario_id, v_admin.correo
    );
  END IF;
  RETURN jsonb_build_object('ok', true, 'correo', v_correo, 'esAdmin', p_habilitar);
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_configurar_admin(text, text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_configurar_admin(text, text, boolean) TO anon, authenticated;

-- Admin-issued codes are hashed, server generated, short lived, and delivered to the admin once.
CREATE OR REPLACE FUNCTION public.rpc_emitir_otp_manual_admin(p_token text, p_correo text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_admin public.auth_sesiones;
  v_correo text := lower(trim(coalesce(p_correo, '')));
  v_codigo text;
  v_bytes bytea;
  v_num bigint;
  v_usuario_id uuid;
BEGIN
  v_admin := public.resolver_sesion_valida(p_token, 'admin');
  IF NOT public.es_correo_institucional(v_correo) OR v_correo !~ '^[^@[:space:]]+@unitec\.edu(\.hn)?$' THEN
    RAISE EXCEPTION 'Ingresa un correo institucional @unitec.edu o @unitec.edu.hn.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('otp:' || v_correo));
  LOOP
    v_bytes := gen_random_bytes(4);
    v_num := get_byte(v_bytes, 0)::bigint * 16777216
      + get_byte(v_bytes, 1)::bigint * 65536
      + get_byte(v_bytes, 2)::bigint * 256
      + get_byte(v_bytes, 3)::bigint;
    v_codigo := (100000 + mod(v_num, 900000))::text;
    EXIT WHEN v_codigo <> '123456';
  END LOOP;

  INSERT INTO public.auth_otps (correo, otp_hash, expira_en, intentos, origen_servidor, ultimo_envio_en, usado)
  VALUES (v_correo, crypt(v_codigo, gen_salt('bf', 8)), now() + interval '10 minutes', 0, true, now(), false)
  ON CONFLICT (correo) DO UPDATE SET
    otp_hash = EXCLUDED.otp_hash, expira_en = EXCLUDED.expira_en, intentos = 0,
    origen_servidor = true, ultimo_envio_en = now(), usado = false;

  SELECT usuario_id INTO v_usuario_id FROM public.usuarios WHERE lower(correo) = v_correo LIMIT 1;
  INSERT INTO public.usuarios_historial (
    usuario_id, correo, campo, valor_anterior, valor_nuevo, origen, creado_en,
    actor_usuario_id, actor_correo
  ) VALUES (
    v_usuario_id, v_correo, 'otp_manual', NULL, 'código emitido; secreto no registrado',
    'admin_otp_manual', now(), v_admin.usuario_id, v_admin.correo
  );

  RETURN jsonb_build_object('ok', true, 'correo', v_correo, 'codigoOtp', v_codigo, 'expiraEnMinutos', 10);
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_emitir_otp_manual_admin(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_emitir_otp_manual_admin(text, text) TO anon, authenticated;

-- Both automatic issuance paths stop at the database boundary when email OTP is disabled.
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
  IF FOUND AND v_prev.ultimo_envio_en IS NOT NULL THEN
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
  IF FOUND AND v_otp.ultimo_envio_en IS NOT NULL THEN
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

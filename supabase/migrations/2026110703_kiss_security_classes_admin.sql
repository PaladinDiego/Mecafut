-- ============================================================================
-- MECAFUT Q4 2026 — FASE 1: ESQUEMA, COMPATIBILIDAD, SEGURIDAD, CLASES Y ADMINISTRACIÓN
-- Migración 2026110703: 100% aditiva, segura y compatible hacia atrás
-- ============================================================================

-- 1. EXTENSIONES REQUERIDAS
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. LIMPIEZA PREVENTIVA DE SOBRECARGAS HUÉRFANAS
-- Elimina firmas antiguas para que no coexistan en pg_proc ni queden expuestas
DROP FUNCTION IF EXISTS public.resolver_sesion_valida(text, text);
DROP FUNCTION IF EXISTS public.rpc_crear_cuenta_con_otp(text, text, text, text);

-- 3. ESQUEMA ADITIVO EN TABLAS EXISTENTES
-- auth_otps: control de un solo uso
ALTER TABLE public.auth_otps
  ADD COLUMN IF NOT EXISTS usado boolean NOT NULL DEFAULT false;

-- usuarios: clases académicas y credenciales temporales de un solo uso
ALTER TABLE public.usuarios
  ADD COLUMN IF NOT EXISTS nombre_clase text,
  ADD COLUMN IF NOT EXISTS codigo_clase text,
  ADD COLUMN IF NOT EXISTS debe_cambiar_password boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS temp_password_usada boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS temp_password_por text,
  ADD COLUMN IF NOT EXISTS temp_password_por_id uuid,
  ADD COLUMN IF NOT EXISTS temp_password_en timestamptz;

-- usuarios_historial: auditoría de quién realizó cambios de identidad o clave temporal
ALTER TABLE public.usuarios_historial
  ADD COLUMN IF NOT EXISTS actor_usuario_id uuid,
  ADD COLUMN IF NOT EXISTS actor_correo text;

-- equipos: clases representadas por el equipo (1 o 2 clases)
ALTER TABLE public.equipos
  ADD COLUMN IF NOT EXISTS clases_representadas jsonb NOT NULL DEFAULT '[]'::jsonb;

-- jugadores: nombre de la clase
ALTER TABLE public.jugadores
  ADD COLUMN IF NOT EXISTS nombre_clase text;

-- 4. AUTENTICACIÓN Y SESIONES HASHEADAS (SHA-256 en PK auth_sesiones.token)
-- Migrar tokens existentes si hubiera alguno (en texto plano) a hash SHA-256
UPDATE public.auth_sesiones
SET token = encode(digest(token, 'sha256'), 'hex')
WHERE length(token) < 64 OR token !~ '^[0-9a-f]{64}$';

-- Helper para normalizar código de clase (letras y números sin guiones ni espacios)
CREATE OR REPLACE FUNCTION public.normalizar_codigo_clase(p_codigo text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT upper(regexp_replace(coalesce(trim(p_codigo), ''), '[\s-]+', '', 'g'));
$$;

REVOKE ALL ON FUNCTION public.normalizar_codigo_clase(text) FROM PUBLIC, anon, authenticated;

-- Helper interno para validar sesión activa usando hash SHA-256
CREATE OR REPLACE FUNCTION public.resolver_sesion_valida(
  p_token text,
  p_rol_requerido text DEFAULT NULL,
  p_permitir_cambio_clave boolean DEFAULT false
)
RETURNS public.auth_sesiones
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_ses public.auth_sesiones;
  v_hash text;
  v_debe_cambiar boolean := false;
BEGIN
  IF p_token IS NULL OR length(trim(p_token)) < 32 THEN
    RAISE EXCEPTION 'Sesión no autenticada o expirada. Por favor vuelve a iniciar sesión.';
  END IF;

  v_hash := encode(digest(trim(p_token), 'sha256'), 'hex');

  SELECT * INTO v_ses
  FROM public.auth_sesiones
  WHERE token = v_hash
    AND NOT revocada
    AND expira_en > now();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tu sesión ha expirado o no es válida. Por favor vuelve a iniciar sesión.';
  END IF;

  -- Recalcular rol en vivo frente a la lista oficial del servidor
  v_ses.es_admin := public.es_admin_oficial(v_ses.correo);
  v_ses.es_docente := public.es_docente_oficial(v_ses.correo);
  v_ses.rol := CASE
    WHEN v_ses.es_admin THEN 'admin'
    WHEN v_ses.es_docente THEN 'docente'
    ELSE 'estudiante'
  END;

  IF p_rol_requerido = 'admin' AND v_ses.rol <> 'admin' THEN
    RAISE EXCEPTION 'Acceso denegado: esta operación exige autorización de Administrador en el servidor.';
  END IF;

  -- Verificar si el usuario debe cambiar su contraseña temporal obligatoriamente
  IF v_ses.usuario_id IS NOT NULL THEN
    SELECT coalesce(debe_cambiar_password, false) INTO v_debe_cambiar
    FROM public.usuarios
    WHERE usuario_id = v_ses.usuario_id;

    IF v_debe_cambiar AND NOT p_permitir_cambio_clave THEN
      RAISE EXCEPTION 'Debes actualizar tu contraseña temporal antes de continuar utilizando la plataforma.';
    END IF;
  END IF;

  RETURN v_ses;
END;
$$;

REVOKE ALL ON FUNCTION public.resolver_sesion_valida(text, text, boolean) FROM PUBLIC, anon, authenticated;

-- Emisión de sesión interna guardando el hash SHA-256 en disco y retornando el token crudo
CREATE OR REPLACE FUNCTION public.emitir_sesion_interna(
  p_usuario_id uuid,
  p_correo text,
  p_nombre_base text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_correo text := lower(trim(p_correo));
  v_es_admin boolean := public.es_admin_oficial(v_correo);
  v_es_docente boolean := public.es_docente_oficial(v_correo);
  v_doc_nombre text := public.obtener_docente_oficial(v_correo);
  v_rol text := 'estudiante';
  v_titulo text := 'Estudiante';
  v_token_raw text;
  v_token_hash text;
  v_expira timestamptz := now() + interval '7 days';
  v_nombre_final text;
  v_debe_cambiar boolean := false;
BEGIN
  IF v_es_admin AND v_es_docente THEN
    v_rol := 'admin';
    v_titulo := 'Administrador / Docente';
  ELSIF v_es_admin THEN
    v_rol := 'admin';
    v_titulo := 'Comité Organizador (Admin)';
  ELSIF v_es_docente THEN
    v_rol := 'docente';
    v_titulo := 'Docente / Asesor';
  END IF;

  v_nombre_final := COALESCE(
    NULLIF(trim(p_nombre_base), ''),
    v_doc_nombre,
    split_part(v_correo, '@', 1)
  );

  IF p_usuario_id IS NOT NULL THEN
    SELECT coalesce(debe_cambiar_password, false) INTO v_debe_cambiar
    FROM public.usuarios
    WHERE usuario_id = p_usuario_id;
  END IF;

  -- Generar token aleatorio CSPRNG (64 hex characters)
  v_token_raw := encode(gen_random_bytes(32), 'hex');
  v_token_hash := encode(digest(v_token_raw, 'sha256'), 'hex');

  -- Insertar únicamente el hash en la columna token
  INSERT INTO public.auth_sesiones (
    token, usuario_id, correo, rol, nombre, titulo_rol,
    es_admin, es_docente, expira_en, revocada, creado_en
  )
  VALUES (
    v_token_hash, p_usuario_id, v_correo, v_rol, v_nombre_final, v_titulo,
    v_es_admin, v_es_docente, v_expira, false, now()
  );

  RETURN jsonb_build_object(
    'token', v_token_raw,
    'usuarioId', p_usuario_id,
    'correo', v_correo,
    'rol', v_rol,
    'tituloRol', v_titulo,
    'nombre', v_nombre_final,
    'esAdmin', v_es_admin,
    'esDocente', v_es_docente,
    'expiraEn', v_expira,
    'debeCambiarPassword', v_debe_cambiar
  );
END;
$$;

REVOKE ALL ON FUNCTION public.emitir_sesion_interna(uuid, text, text) FROM PUBLIC, anon, authenticated;

-- Validación de sesión sin exponer token ni hash
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
  -- Permite resolver sesión aunque deba cambiar clave para que el cliente consulte su estado
  v_ses := public.resolver_sesion_valida(p_token, NULL, true);

  IF v_ses.usuario_id IS NOT NULL THEN
    SELECT coalesce(debe_cambiar_password, false) INTO v_debe_cambiar
    FROM public.usuarios
    WHERE usuario_id = v_ses.usuario_id;
  END IF;

  RETURN jsonb_build_object(
    'valida', true,
    'usuarioId', v_ses.usuario_id,
    'correo', v_ses.correo,
    'rol', v_ses.rol,
    'tituloRol', v_ses.titulo_rol,
    'nombre', v_ses.nombre,
    'esAdmin', v_ses.es_admin,
    'esDocente', v_ses.es_docente,
    'expiraEn', v_ses.expira_en,
    'debeCambiarPassword', v_debe_cambiar
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('valida', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_validar_sesion(text) TO anon, authenticated;

-- Cierre de sesión usando hash SHA-256
CREATE OR REPLACE FUNCTION public.rpc_cerrar_sesion(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_hash text;
BEGIN
  IF p_token IS NOT NULL AND length(trim(p_token)) >= 32 THEN
    v_hash := encode(digest(trim(p_token), 'sha256'), 'hex');
    UPDATE public.auth_sesiones
    SET revocada = true
    WHERE token = v_hash;
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_cerrar_sesion(text) TO anon, authenticated;

-- 5. OTP SEGURO DE SERVIDOR: DESHABILITAR CLIENT-OTP Y REGISTRAR SERVER-OTP
CREATE OR REPLACE FUNCTION public.rpc_registrar_otp_cliente(p_correo text, p_codigo text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  RAISE EXCEPTION 'Operación deshabilitada por motivos de seguridad. Los códigos OTP solo pueden ser emitidos por el servidor.';
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_registrar_otp_cliente(text, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.rpc_registrar_otp_servidor(
  p_correo text,
  p_codigo text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_correo text := lower(trim(coalesce(p_correo, '')));
  v_codigo text := trim(coalesce(p_codigo, ''));
  v_hash text;
  v_otp public.auth_otps;
  v_elapsed_seconds numeric;
BEGIN
  IF NOT public.es_correo_institucional(v_correo) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'invalid_domain',
      'error', 'Acceso restringido: Solo se admiten correos institucionales oficiales (@unitec.edu o @unitec.edu.hn).'
    );
  END IF;

  IF length(v_codigo) <> 6 OR v_codigo !~ '^[0-9]{6}$' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'invalid_format',
      'error', 'Formato de código inválido.'
    );
  END IF;

  -- 1. Bloqueo transaccional exclusivo por correo para serializar solicitudes concurrentes
  PERFORM pg_advisory_xact_lock(hashtext('otp:' || v_correo));

  -- 2. Consultar estado actual con bloqueo de fila
  SELECT * INTO v_otp FROM public.auth_otps WHERE correo = v_correo FOR UPDATE;

  -- 3. Validación atómica de Cooldown (45 segundos)
  IF FOUND AND v_otp.ultimo_envio_en IS NOT NULL THEN
    v_elapsed_seconds := extract(epoch FROM (now() - v_otp.ultimo_envio_en));
    IF v_elapsed_seconds < 45 THEN
      RETURN jsonb_build_object(
        'ok', false,
        'reason', 'cooldown',
        'error', 'Ya se envió un código recientemente. Espera ' || ceil(45 - v_elapsed_seconds)::int || ' segundos antes de solicitar otro.'
      );
    END IF;
  END IF;

  -- 4. Registrar o actualizar el OTP de forma atómica
  v_hash := crypt(v_codigo, gen_salt('bf', 8));

  INSERT INTO public.auth_otps (
    correo, otp_hash, expira_en, intentos, origen_servidor, ultimo_envio_en, usado
  )
  VALUES (
    v_correo, v_hash, now() + interval '10 minutes', 0, true, now(), false
  )
  ON CONFLICT (correo) DO UPDATE
  SET otp_hash = EXCLUDED.otp_hash,
      expira_en = EXCLUDED.expira_en,
      intentos = 0,
      origen_servidor = true,
      ultimo_envio_en = now(),
      usado = false;

  RETURN jsonb_build_object('ok', true, 'expiraEnMinutos', 10);
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_registrar_otp_servidor(text, text) FROM PUBLIC, anon, authenticated;

-- 6. REGISTRO DE CUENTAS NUEVAS CON OTP (3 PARÁMETROS - CERO SOBRECARGAS)
CREATE OR REPLACE FUNCTION public.rpc_crear_cuenta_con_otp(
  p_correo text,
  p_codigo text,
  p_password text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_correo text := lower(trim(coalesce(p_correo, '')));
  v_codigo text := trim(coalesce(p_codigo, ''));
  v_otp public.auth_otps;
  v_user public.usuarios;
  v_sesion jsonb;
  v_usuario_id uuid;
  v_pwd_hash text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('otp:' || v_correo));

  IF NOT public.es_correo_institucional(v_correo) THEN
    RAISE EXCEPTION 'Solo se admiten correos institucionales (@unitec.edu o @unitec.edu.hn).';
  END IF;

  IF length(trim(coalesce(p_password, ''))) < 8 THEN
    RAISE EXCEPTION 'La contraseña debe tener al menos 8 caracteres.';
  END IF;

  -- Comprobar si el usuario ya existe: RECHAZAR en rpc_crear_cuenta_con_otp
  SELECT * INTO v_user FROM public.usuarios WHERE correo = v_correo;
  IF v_user.usuario_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Esta cuenta ya se encuentra registrada. Inicia sesión con tu contraseña o usa la opción de recuperar acceso.');
  END IF;

  SELECT * INTO v_otp FROM public.auth_otps WHERE correo = v_correo FOR UPDATE;

  IF NOT FOUND OR v_otp.usado OR v_otp.otp_hash = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No hay un código OTP vigente emitido para este correo. Solicita uno nuevo.');
  END IF;

  IF NOT v_otp.origen_servidor THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Código no emitido por el servidor. Solicita un código oficial.');
  END IF;

  IF v_otp.expira_en < now() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'El código de verificación ha expirado. Solicita uno nuevo.');
  END IF;

  IF v_otp.intentos >= 5 THEN
    UPDATE public.auth_otps SET otp_hash = '', usado = true WHERE correo = v_correo;
    RETURN jsonb_build_object('ok', false, 'error', 'Has superado el límite máximo de 5 intentos para este código. Solicita uno nuevo.');
  END IF;

  IF crypt(v_codigo, v_otp.otp_hash) <> v_otp.otp_hash THEN
    UPDATE public.auth_otps
    SET intentos = intentos + 1,
        usado = CASE WHEN intentos + 1 >= 5 THEN true ELSE usado END,
        otp_hash = CASE WHEN intentos + 1 >= 5 THEN '' ELSE otp_hash END
    WHERE correo = v_correo;

    IF (v_otp.intentos + 1) >= 5 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Has superado el límite máximo de 5 intentos para este código. Solicita uno nuevo.');
    ELSE
      RETURN jsonb_build_object('ok', false, 'error', 'Código de verificación incorrecto. Intento ' || (v_otp.intentos + 1) || ' de 5.');
    END IF;
  END IF;

  -- Consumir OTP atómicamente
  UPDATE public.auth_otps
  SET usado = true, otp_hash = '', expira_en = now() - interval '1 second'
  WHERE correo = v_correo;

  v_usuario_id := gen_random_uuid();
  v_pwd_hash := crypt(p_password, gen_salt('bf', 10));

  INSERT INTO public.usuarios (
    usuario_id, correo, password_hash, nombre, creado_en, actualizado_en,
    intentos_login, debe_cambiar_password, temp_password_usada
  )
  VALUES (
    v_usuario_id, v_correo, v_pwd_hash, split_part(v_correo, '@', 1), now(), now(),
    0, false, false
  );

  v_sesion := public.emitir_sesion_interna(v_usuario_id, v_correo, split_part(v_correo, '@', 1));

  RETURN jsonb_build_object(
    'ok', true,
    'mensaje', 'Cuenta institucional creada con éxito.',
    'sesion', v_sesion
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_crear_cuenta_con_otp(text, text, text) TO anon, authenticated;

-- 7. RECUPERACIÓN DE CONTRASEÑA CON OTP (FUNCIÓN SEMÁNTICA INDEPENDIENTE)
CREATE OR REPLACE FUNCTION public.rpc_restablecer_password_con_otp(
  p_correo text,
  p_otp text,
  p_password_nuevo text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_correo text := lower(trim(coalesce(p_correo, '')));
  v_codigo text := trim(coalesce(p_otp, ''));
  v_otp public.auth_otps;
  v_user public.usuarios;
  v_pwd_hash text;
  v_sesion jsonb;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('otp:' || v_correo));

  IF NOT public.es_correo_institucional(v_correo) THEN
    RAISE EXCEPTION 'Solo se admiten correos institucionales (@unitec.edu o @unitec.edu.hn).';
  END IF;

  IF length(trim(coalesce(p_password_nuevo, ''))) < 8 THEN
    RAISE EXCEPTION 'La nueva contraseña debe tener al menos 8 caracteres.';
  END IF;

  -- Para cuentas de administración oficial, bloquear reset por OTP público
  IF public.es_admin_oficial(v_correo) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Por políticas de seguridad, las cuentas administrativas no admiten restablecimiento público por OTP. Contacta a la coordinación técnica.');
  END IF;

  SELECT * INTO v_user FROM public.usuarios WHERE correo = v_correo FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No existe ninguna cuenta registrada con este correo.');
  END IF;

  SELECT * INTO v_otp FROM public.auth_otps WHERE correo = v_correo FOR UPDATE;

  IF NOT FOUND OR v_otp.usado OR v_otp.otp_hash = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No hay un código OTP vigente emitido para este correo. Solicita uno nuevo.');
  END IF;

  IF NOT v_otp.origen_servidor THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Código no emitido por el servidor. Solicita un código oficial.');
  END IF;

  IF v_otp.expira_en < now() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'El código de verificación ha expirado. Solicita uno nuevo.');
  END IF;

  IF v_otp.intentos >= 5 THEN
    UPDATE public.auth_otps SET otp_hash = '', usado = true WHERE correo = v_correo;
    RETURN jsonb_build_object('ok', false, 'error', 'Has superado el límite máximo de intentos para este código. Solicita uno nuevo.');
  END IF;

  IF crypt(v_codigo, v_otp.otp_hash) <> v_otp.otp_hash THEN
    UPDATE public.auth_otps
    SET intentos = intentos + 1,
        usado = CASE WHEN intentos + 1 >= 5 THEN true ELSE usado END,
        otp_hash = CASE WHEN intentos + 1 >= 5 THEN '' ELSE otp_hash END
    WHERE correo = v_correo;

    IF (v_otp.intentos + 1) >= 5 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Has superado el límite máximo de 5 intentos para este código. Solicita uno nuevo.');
    ELSE
      RETURN jsonb_build_object('ok', false, 'error', 'Código de verificación incorrecto. Intento ' || (v_otp.intentos + 1) || ' de 5.');
    END IF;
  END IF;

  -- Consumir OTP atómicamente
  UPDATE public.auth_otps
  SET usado = true, otp_hash = '', expira_en = now() - interval '1 second'
  WHERE correo = v_correo;

  v_pwd_hash := crypt(p_password_nuevo, gen_salt('bf', 10));

  -- Actualizar contraseña, limpiar intentos y flags de clave temporal
  UPDATE public.usuarios
  SET password_hash = v_pwd_hash,
      intentos_login = 0,
      bloqueado_hasta = NULL,
      debe_cambiar_password = false,
      temp_password_usada = false,
      actualizado_en = now()
  WHERE usuario_id = v_user.usuario_id;

  -- Revocar todas las sesiones anteriores
  UPDATE public.auth_sesiones
  SET revocada = true
  WHERE usuario_id = v_user.usuario_id;

  -- Registrar en auditoría
  INSERT INTO public.usuarios_historial (
    usuario_id, correo, campo, valor_anterior, valor_nuevo, periodo, origen, creado_en, actor_usuario_id, actor_correo
  )
  VALUES (
    v_user.usuario_id, v_correo, 'password', '[restablecida_por_otp]', '[nueva_password]',
    '2026-Q4', 'recuperacion_otp', now(), v_user.usuario_id, v_correo
  );

  v_sesion := public.emitir_sesion_interna(v_user.usuario_id, v_correo, coalesce(v_user.nombre, ''));

  RETURN jsonb_build_object(
    'ok', true,
    'mensaje', 'Contraseña restablecida con éxito. Sesión iniciada.',
    'sesion', v_sesion
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_restablecer_password_con_otp(text, text, text) TO anon, authenticated;

-- 8. LOGIN DE USUARIOS CON MANEJO DE CONTRASEÑA TEMPORAL
CREATE OR REPLACE FUNCTION public.rpc_iniciar_sesion(
  p_correo text,
  p_password text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_correo text := lower(trim(coalesce(p_correo, '')));
  v_user public.usuarios;
  v_sesion jsonb;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('login:' || v_correo));

  SELECT * INTO v_user FROM public.usuarios WHERE correo = v_correo FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Correo o contraseña incorrectos.');
  END IF;

  IF v_user.bloqueado_hasta IS NOT NULL AND v_user.bloqueado_hasta > now() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Cuenta bloqueada temporalmente por intentos fallidos. Intenta nuevamente en unos minutos.');
  END IF;

  -- Si era una clave temporal que ya fue consumida para un login anterior sin haberla cambiado: RECHAZAR
  IF coalesce(v_user.temp_password_usada, false) AND coalesce(v_user.debe_cambiar_password, false) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'Esta contraseña temporal ya fue utilizada en un inicio de sesión previo y ha expirado. Por seguridad de tu cuenta, solicita una nueva al Administrador.'
    );
  END IF;

  IF crypt(p_password, v_user.password_hash) <> v_user.password_hash THEN
    UPDATE public.usuarios
    SET intentos_login = intentos_login + 1,
        bloqueado_hasta = CASE WHEN intentos_login + 1 >= 5 THEN now() + interval '15 minutes' ELSE NULL END,
        actualizado_en = now()
    WHERE usuario_id = v_user.usuario_id;

    RETURN jsonb_build_object('ok', false, 'error', 'Correo o contraseña incorrectos.');
  END IF;

  -- Si es la primera vez que inicia sesión con clave temporal, marcarla como usada (un solo uso)
  IF coalesce(v_user.debe_cambiar_password, false) THEN
    UPDATE public.usuarios
    SET temp_password_usada = true,
        intentos_login = 0,
        bloqueado_hasta = NULL,
        actualizado_en = now()
    WHERE usuario_id = v_user.usuario_id;
  ELSE
    UPDATE public.usuarios
    SET intentos_login = 0,
        bloqueado_hasta = NULL,
        actualizado_en = now()
    WHERE usuario_id = v_user.usuario_id;
  END IF;

  v_sesion := public.emitir_sesion_interna(v_user.usuario_id, v_correo, coalesce(v_user.nombre, ''));

  RETURN jsonb_build_object(
    'ok', true,
    'sesion', v_sesion
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_iniciar_sesion(text, text) TO anon, authenticated;

-- 9. CAMBIO OBLIGATORIO DE CONTRASEÑA TEMPORAL
CREATE OR REPLACE FUNCTION public.rpc_cambiar_password_obligatorio(
  p_token text,
  p_password_nuevo text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_ses public.auth_sesiones;
  v_pwd_hash text;
BEGIN
  -- Permite resolver sesión con bandera p_permitir_cambio_clave = true
  v_ses := public.resolver_sesion_valida(p_token, NULL, true);

  IF length(trim(coalesce(p_password_nuevo, ''))) < 8 THEN
    RAISE EXCEPTION 'La nueva contraseña debe tener al menos 8 caracteres.';
  END IF;

  v_pwd_hash := crypt(p_password_nuevo, gen_salt('bf', 10));

  UPDATE public.usuarios
  SET password_hash = v_pwd_hash,
      debe_cambiar_password = false,
      temp_password_usada = false,
      intentos_login = 0,
      bloqueado_hasta = NULL,
      actualizado_en = now()
  WHERE usuario_id = v_ses.usuario_id;

  INSERT INTO public.usuarios_historial (
    usuario_id, correo, campo, valor_anterior, valor_nuevo, periodo, origen, creado_en, actor_usuario_id, actor_correo
  )
  VALUES (
    v_ses.usuario_id, v_ses.correo, 'password', '[temporal]', '[nueva_personal]',
    '2026-Q4', 'cambio_obligatorio', now(), v_ses.usuario_id, v_ses.correo
  );

  RETURN jsonb_build_object(
    'ok', true,
    'mensaje', 'Tu contraseña ha sido actualizada con éxito. Ya puedes navegar normalmente.'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_cambiar_password_obligatorio(text, text) TO anon, authenticated;

-- 10. GENERAR CONTRASEÑA TEMPORAL DE UN SOLO USO (SOLO ADMINISTRADOR)
CREATE OR REPLACE FUNCTION public.rpc_generar_password_temporal_admin(
  p_token text,
  p_usuario_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_admin public.auth_sesiones;
  v_target public.usuarios;
  v_temp_pwd text;
  v_temp_hash text;
BEGIN
  v_admin := public.resolver_sesion_valida(p_token, 'admin');

  SELECT * INTO v_target
  FROM public.usuarios
  WHERE usuario_id = p_usuario_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Usuario no encontrado.';
  END IF;

  -- Generar contraseña legible y segura con CSPRNG (10 caracteres)
  v_temp_pwd := 'Meca' || substr(encode(gen_random_bytes(6), 'hex'), 1, 6) || '!';
  v_temp_hash := crypt(v_temp_pwd, gen_salt('bf', 10));

  -- Guardar hash, marcar obligación de cambio y reiniciar estado de un solo uso
  UPDATE public.usuarios
  SET password_hash = v_temp_hash,
      debe_cambiar_password = true,
      temp_password_usada = false,
      temp_password_por = v_admin.correo,
      temp_password_por_id = v_admin.usuario_id,
      temp_password_en = now(),
      intentos_login = 0,
      bloqueado_hasta = NULL,
      actualizado_en = now()
  WHERE usuario_id = p_usuario_id;

  -- Revocar todas las sesiones previas del usuario
  UPDATE public.auth_sesiones
  SET revocada = true
  WHERE usuario_id = p_usuario_id;

  -- Registrar en auditoría
  INSERT INTO public.usuarios_historial (
    usuario_id, correo, campo, valor_anterior, valor_nuevo, periodo, origen, creado_en, actor_usuario_id, actor_correo
  )
  VALUES (
    p_usuario_id, v_target.correo, 'password', '[anterior]', '[generada_temporal]',
    '2026-Q4', 'admin_temp_password', now(), v_admin.usuario_id, v_admin.correo
  );

  RETURN jsonb_build_object(
    'ok', true,
    'usuarioId', p_usuario_id,
    'correo', v_target.correo,
    'passwordTemporal', v_temp_pwd,
    'mensaje', 'Contraseña temporal generada con éxito. Cópiala ahora; no volverá a mostrarse.'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_generar_password_temporal_admin(text, uuid) TO anon, authenticated;

-- 11. GESTIÓN DE PERFIL ASOCIADA A usuario_id (CORREO INMUTABLE)
CREATE OR REPLACE FUNCTION public.rpc_obtener_perfil(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_ses public.auth_sesiones;
  v_user public.usuarios;
BEGIN
  v_ses := public.resolver_sesion_valida(p_token);

  SELECT * INTO v_user
  FROM public.usuarios
  WHERE usuario_id = v_ses.usuario_id;

  IF NOT FOUND THEN
    SELECT * INTO v_user
    FROM public.usuarios
    WHERE correo = v_ses.correo;
  END IF;

  RETURN jsonb_build_object(
    'usuarioId', v_user.usuario_id,
    'correo', v_ses.correo,
    'nombre', v_user.nombre,
    'cuenta', v_user.cuenta,
    'dni', v_user.dni,
    'telefono', v_user.telefono,
    'carrera', v_user.carrera,
    'nombreClase', v_user.nombre_clase,
    'codigoClase', v_user.codigo_clase,
    'fotoDocumento', v_user.foto_documento,
    'tipoDocumento', v_user.tipo_documento
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_obtener_perfil(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.rpc_guardar_perfil(
  p_token text,
  p_perfil jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_ses public.auth_sesiones;
  v_user public.usuarios;
  v_nombre text;
  v_cuenta text;
  v_dni text;
  v_tel text;
  v_carrera text;
  v_nom_clase text;
  v_cod_clase text;
  v_foto text;
  v_tipo_doc text;
BEGIN
  v_ses := public.resolver_sesion_valida(p_token);

  v_nombre := coalesce(trim(p_perfil->>'nombre'), '');
  v_cuenta := coalesce(trim(p_perfil->>'cuenta'), '');
  v_dni := coalesce(trim(p_perfil->>'dni'), '');
  v_tel := coalesce(trim(p_perfil->>'telefono'), '');
  v_carrera := coalesce(trim(p_perfil->>'carrera'), '');
  v_nom_clase := coalesce(trim(p_perfil->>'nombreClase'), trim(p_perfil->>'nombre_clase'), '');
  v_cod_clase := public.normalizar_codigo_clase(coalesce(p_perfil->>'codigoClase', p_perfil->>'codigo_clase', ''));
  v_foto := p_perfil->>'fotoDocumento';
  v_tipo_doc := coalesce(p_perfil->>'tipoDocumento', 'carnet');

  SELECT * INTO v_user FROM public.usuarios WHERE usuario_id = v_ses.usuario_id FOR UPDATE;

  IF FOUND THEN
    -- Auditar cambios relevantes de identidad
    IF v_nombre <> '' AND v_nombre <> coalesce(v_user.nombre, '') THEN
      INSERT INTO public.usuarios_historial (usuario_id, correo, campo, valor_anterior, valor_nuevo, periodo, origen, creado_en, actor_usuario_id, actor_correo)
      VALUES (v_ses.usuario_id, v_ses.correo, 'nombre', v_user.nombre, v_nombre, '2026-Q4', 'perfil', now(), v_ses.usuario_id, v_ses.correo);
    END IF;

    IF v_cuenta <> '' AND v_cuenta <> coalesce(v_user.cuenta, '') THEN
      INSERT INTO public.usuarios_historial (usuario_id, correo, campo, valor_anterior, valor_nuevo, periodo, origen, creado_en, actor_usuario_id, actor_correo)
      VALUES (v_ses.usuario_id, v_ses.correo, 'cuenta', v_user.cuenta, v_cuenta, '2026-Q4', 'perfil', now(), v_ses.usuario_id, v_ses.correo);
    END IF;

    IF v_dni <> '' AND v_dni <> coalesce(v_user.dni, '') THEN
      INSERT INTO public.usuarios_historial (usuario_id, correo, campo, valor_anterior, valor_nuevo, periodo, origen, creado_en, actor_usuario_id, actor_correo)
      VALUES (v_ses.usuario_id, v_ses.correo, 'dni', v_user.dni, v_dni, '2026-Q4', 'perfil', now(), v_ses.usuario_id, v_ses.correo);
    END IF;

    UPDATE public.usuarios
    SET nombre = CASE WHEN v_nombre <> '' THEN v_nombre ELSE nombre END,
        cuenta = CASE WHEN v_cuenta <> '' THEN v_cuenta ELSE cuenta END,
        dni = CASE WHEN v_dni <> '' THEN v_dni ELSE dni END,
        telefono = CASE WHEN v_tel <> '' THEN v_tel ELSE telefono END,
        carrera = CASE WHEN v_carrera <> '' THEN v_carrera ELSE carrera END,
        nombre_clase = CASE WHEN v_nom_clase <> '' THEN v_nom_clase ELSE nombre_clase END,
        codigo_clase = CASE WHEN v_cod_clase <> '' THEN v_cod_clase ELSE codigo_clase END,
        foto_documento = COALESCE(v_foto, foto_documento),
        tipo_documento = CASE WHEN v_foto IS NOT NULL THEN v_tipo_doc ELSE tipo_documento END,
        actualizado_en = now()
    WHERE usuario_id = v_ses.usuario_id;
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_guardar_perfil(text, jsonb) TO anon, authenticated;

-- 12. RESUMEN PÚBLICO: SIN CÓDIGOS DE ACCESO NI WHATSAPP
CREATE OR REPLACE FUNCTION public.rpc_obtener_resumen_publico(p_token text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_cfg jsonb;
  v_abiertas boolean := true;
  v_fecha_cierre text := NULL;
  v_max_jugadores int := 15;
  v_masc_count int := 0;
  v_fem_count int := 0;
  v_colores jsonb := '{}'::jsonb;
  v_equipos jsonb := '[]'::jsonb;
  v_nombres jsonb := '[]'::jsonb;
BEGIN
  SELECT data INTO v_cfg FROM public.configuracion WHERE id = 'general';

  IF v_cfg IS NOT NULL THEN
    v_abiertas := coalesce((v_cfg->>'inscripcionesAbiertas')::boolean, true);
    v_fecha_cierre := v_cfg->>'fechaCierreInscripciones';
    v_max_jugadores := coalesce((v_cfg->>'maxJugadoresPorEquipo')::int, 15);
  END IF;

  -- Comprobar si cerró por fecha en hora de Honduras (UTC-6)
  IF v_fecha_cierre IS NOT NULL AND (now() AT TIME ZONE 'America/Tegucigalpa') > (v_fecha_cierre::timestamptz AT TIME ZONE 'America/Tegucigalpa') THEN
    v_abiertas := false;
  END IF;

  SELECT count(*) INTO v_masc_count
  FROM public.equipos
  WHERE NOT eliminado AND estado <> 'Rechazado' AND coalesce(categoria, 'Masculino') = 'Masculino';

  SELECT count(*) INTO v_fem_count
  FROM public.equipos
  WHERE NOT eliminado AND estado <> 'Rechazado' AND categoria = 'Femenino';

  SELECT jsonb_object_agg(color_lower, cant) INTO v_colores
  FROM (
    SELECT lower(color) as color_lower, count(*) as cant
    FROM public.equipos
    WHERE NOT eliminado AND estado <> 'Rechazado' AND color IS NOT NULL AND trim(color) <> ''
    GROUP BY lower(color)
  ) sub;

  -- Lista de equipos públicos: NUNCA incluye codigoAcceso ni whatsappCapitanesUrl
  SELECT jsonb_agg(jsonb_build_object(
    'id', e.id,
    'nombre', e.nombre,
    'categoria', e.categoria,
    'capitan', coalesce(e.capitan->>'nombre', 'Capitán'),
    'color', e.color,
    'clasesRepresentadas', e.clases_representadas
  )) INTO v_equipos
  FROM public.equipos e
  WHERE NOT e.eliminado AND e.estado <> 'Rechazado';

  SELECT jsonb_agg(lower(trim(nombre))) INTO v_nombres
  FROM public.equipos
  WHERE NOT eliminado AND estado <> 'Rechazado';

  RETURN jsonb_build_object(
    'inscripcionesAbiertas', v_abiertas,
    'masculinoOcupados', v_masc_count,
    'femeninoOcupados', v_fem_count,
    'maxMasculino', 12,
    'maxFemenino', 4,
    'maxJugadoresPorEquipo', v_max_jugadores,
    'conteoColores', coalesce(v_colores, '{}'::jsonb),
    'equiposActivos', coalesce(v_equipos, '[]'::jsonb),
    'nombresTomados', coalesce(v_nombres, '[]'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_obtener_resumen_publico(text) TO anon, authenticated;

-- 13. INSCRIPCIÓN DE EQUIPO (CON CLASES REPRESENTADAS 1 O 2 Y CAPITÁN VERIFICADO)
CREATE OR REPLACE FUNCTION public.rpc_inscribir_equipo(
  p_token text,
  p_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_ses public.auth_sesiones;
  v_cfg jsonb;
  v_abiertas boolean := true;
  v_fecha_cierre text;
  v_max_jugadores int := 15;
  v_whatsapp text;
  v_eq jsonb := p_payload->'equipo';
  v_cap jsonb := p_payload->'capitan';
  v_jugs jsonb := coalesce(p_payload->'jugadores', '[]'::jsonb);
  v_clases jsonb := coalesce(v_eq->'clasesRepresentadas', '[]'::jsonb);
  v_nombre text;
  v_categoria text;
  v_color text;
  v_docente text;
  v_codigo_acceso text;
  v_equipo_id text;
  v_dni_cap text;
  v_cuenta_cap text;
  v_tel_cap text;
  v_nom_clase_cap text;
  v_cod_clase_cap text;
  v_foto_cap text;
  v_tipo_doc_cap text;
  v_carrera_cap text;
  v_es_docente boolean;
  v_cant_masc int;
  v_cant_fem int;
  v_col_count int;
  v_j jsonb;
  v_idx int;
  v_jug_id text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('mecafut_inscripcion_lock'));

  v_ses := public.resolver_sesion_valida(p_token);

  SELECT data INTO v_cfg FROM public.configuracion WHERE id = 'general';
  IF v_cfg IS NOT NULL THEN
    v_abiertas := coalesce((v_cfg->>'inscripcionesAbiertas')::boolean, true);
    v_fecha_cierre := v_cfg->>'fechaCierreInscripciones';
    v_max_jugadores := coalesce((v_cfg->>'maxJugadoresPorEquipo')::int, 15);
    v_whatsapp := v_cfg->>'whatsappCapitanesUrl';
  END IF;

  IF v_fecha_cierre IS NOT NULL AND (now() AT TIME ZONE 'America/Tegucigalpa') > (v_fecha_cierre::timestamptz AT TIME ZONE 'America/Tegucigalpa') THEN
    v_abiertas := false;
  END IF;

  IF NOT v_abiertas THEN
    RAISE EXCEPTION 'El periodo oficial de inscripciones está cerrado.';
  END IF;

  v_nombre := trim(coalesce(v_eq->>'nombre', ''));
  v_categoria := coalesce(v_eq->>'categoria', 'Masculino');
  v_color := trim(coalesce(v_eq->>'color', ''));
  v_docente := trim(coalesce(v_eq->>'docente', ''));

  IF v_nombre = '' THEN
    RAISE EXCEPTION 'El nombre del equipo es obligatorio.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.equipos WHERE NOT eliminado AND estado <> 'Rechazado' AND lower(trim(nombre)) = lower(v_nombre)) THEN
    RAISE EXCEPTION 'Ya existe un equipo registrado con el nombre "%". Elige otro nombre.', v_nombre;
  END IF;

  IF v_categoria = 'Masculino' THEN
    SELECT count(*) INTO v_cant_masc FROM public.equipos WHERE NOT eliminado AND estado <> 'Rechazado' AND coalesce(categoria, 'Masculino') = 'Masculino';
    IF v_cant_masc >= 12 THEN
      RAISE EXCEPTION 'Se ha agotado el cupo oficial de 12 equipos para la categoría Masculina.';
    END IF;
  ELSE
    SELECT count(*) INTO v_cant_fem FROM public.equipos WHERE NOT eliminado AND estado <> 'Rechazado' AND categoria = 'Femenino';
    IF v_cant_fem >= 4 THEN
      RAISE EXCEPTION 'Se ha alcanzado el límite de 4 equipos para la categoría Femenina.';
    END IF;
  END IF;

  IF v_color <> '' THEN
    SELECT count(*) INTO v_col_count FROM public.equipos WHERE NOT eliminado AND estado <> 'Rechazado' AND lower(color) = lower(v_color);
    IF v_col_count >= 2 THEN
      RAISE EXCEPTION 'El color de uniforme "%" ya alcanzó el límite reglamentario de 2 equipos.', v_color;
    END IF;
  END IF;

  -- Validar clases representadas (1 o 2 clases)
  IF jsonb_array_length(v_clases) < 1 OR jsonb_array_length(v_clases) > 2 THEN
    RAISE EXCEPTION 'El equipo debe declarar 1 o 2 clases representadas.';
  END IF;

  FOR v_idx IN 0 .. (jsonb_array_length(v_clases) - 1) LOOP
    v_j := v_clases->v_idx;
    IF trim(coalesce(v_j->>'nombreClase', v_j->>'nombre_clase', '')) = '' OR public.normalizar_codigo_clase(v_j->>'codigoClase') = '' THEN
      RAISE EXCEPTION 'Cada clase representada debe tener Nombre de la clase y Código de clase.';
    END IF;
  END LOOP;

  -- Datos del Capitán
  v_cuenta_cap := trim(coalesce(v_cap->>'cuenta', ''));
  v_dni_cap := trim(coalesce(v_cap->>'dni', ''));
  v_tel_cap := trim(coalesce(v_cap->>'telefono', ''));
  v_carrera_cap := coalesce(v_cap->>'carrera', 'Ingeniería en Mecatrónica');
  v_nom_clase_cap := trim(coalesce(v_cap->>'nombreClase', v_cap->>'nombre_clase', ''));
  v_cod_clase_cap := public.normalizar_codigo_clase(coalesce(v_cap->>'codigoClase', v_cap->>'codigo_clase', ''));
  v_foto_cap := v_cap->>'fotoDocumento';
  v_tipo_doc_cap := coalesce(v_cap->>'tipoDocumento', 'carnet');
  v_es_docente := v_ses.es_docente;

  IF v_cuenta_cap = '' OR v_tel_cap = '' THEN
    RAISE EXCEPTION 'Por favor completa los datos obligatorios del Capitán.';
  END IF;

  IF NOT v_es_docente THEN
    IF v_nom_clase_cap = '' OR v_cod_clase_cap = '' THEN
      RAISE EXCEPTION 'El Capitán debe ingresar el Nombre y Código de la clase que cursa.';
    END IF;
    IF public.normalizar_dni(v_dni_cap) = '' THEN
      RAISE EXCEPTION 'El DNI del Capitán es obligatorio.';
    END IF;
    IF v_foto_cap IS NULL OR v_foto_cap = '' THEN
      RAISE EXCEPTION 'El Capitán debe adjuntar foto de carnet o matrícula.';
    END IF;
  END IF;

  -- Validar que el Capitán no esté ya inscrito en otro equipo del torneo activo
  IF EXISTS (
    SELECT 1 FROM public.jugadores j
    JOIN public.equipos e ON e.id = j.equipo_id
    WHERE NOT j.eliminado AND NOT e.eliminado AND e.estado <> 'Rechazado'
      AND e.periodo = '2026-Q4'
      AND (j.usuario_id = v_ses.usuario_id OR lower(trim(j.correo)) = v_ses.correo)
  ) THEN
    RAISE EXCEPTION 'Tu usuario ya se encuentra inscrito en otro equipo de este torneo.';
  END IF;

  IF NOT v_es_docente AND EXISTS (
    SELECT 1 FROM public.jugadores j
    JOIN public.equipos e ON e.id = j.equipo_id
    WHERE NOT j.eliminado AND NOT e.eliminado AND e.estado <> 'Rechazado'
      AND e.periodo = '2026-Q4'
      AND (trim(j.cuenta) = v_cuenta_cap OR public.normalizar_dni(j.dni) = public.normalizar_dni(v_dni_cap))
  ) THEN
    RAISE EXCEPTION 'Tu número de cuenta o DNI ya figura inscrito en otro equipo de este torneo.';
  END IF;

  IF 1 + jsonb_array_length(v_jugs) > v_max_jugadores THEN
    RAISE EXCEPTION 'La plantilla excede el límite permitido de % jugadores.', v_max_jugadores;
  END IF;

  -- Generar código de acceso único de 8 dígitos (excluyendo '12345678')
  LOOP
    v_codigo_acceso := (floor(random() * (99999999 - 10000000 + 1)) + 10000000)::text;
    EXIT WHEN v_codigo_acceso <> '12345678' AND NOT EXISTS (SELECT 1 FROM public.equipos WHERE codigo = v_codigo_acceso OR "codigoAcceso" = v_codigo_acceso);
  END LOOP;

  v_equipo_id := 'eq-' || extract(epoch from now())::bigint || '-' || substr(md5(random()::text), 1, 4);

  INSERT INTO public.equipos (
    id, codigo, "codigoAcceso", nombre, categoria, carrera, docente,
    capitan, integrantes, pago, estado, "tipoEquipo", color,
    "comprobanteAdjunto", "comprobanteDataUrl", "fechaRegistro", periodo,
    capitan_usuario_id, eliminado, creado_en, actualizado_en, clases_representadas
  )
  VALUES (
    v_equipo_id, v_codigo_acceso, v_codigo_acceso, v_nombre, v_categoria,
    coalesce(v_eq->>'carrera', v_carrera_cap), v_docente,
    jsonb_build_object(
      'nombre', coalesce(v_cap->>'nombre', v_ses.nombre),
      'correo', v_ses.correo,
      'cuenta', v_cuenta_cap,
      'telefono', v_tel_cap,
      'dni', v_dni_cap
    ),
    '[]'::jsonb,
    jsonb_build_object('estado', 'Pendiente'),
    'Pendiente',
    coalesce(v_eq->>'tipoEquipo', 'Estudiantes'),
    v_color,
    coalesce((p_payload->>'comprobanteAdjunto')::boolean, true),
    p_payload->>'comprobanteDataUrl',
    now()::text,
    '2026-Q4',
    v_ses.usuario_id,
    false,
    now(),
    now(),
    v_clases
  );

  -- Insertar Capitán en jugadores (correo_verificado = true porque es el usuario autenticado)
  INSERT INTO public.jugadores (
    id, equipo_id, "equipoId", "nombreEquipo", nombre, cuenta, dni,
    correo, "correo_verificado", carrera, "codigo_clase", "codigoClase",
    nombre_clase, "tipo_documento", "tipoDocumento", "foto_documento", "fotoDocumento",
    "es_capitan", "esCapitan", estado, "estado_carnet", usuario_id, periodo, eliminado, creado_en
  )
  VALUES (
    'jug-' || v_equipo_id || '-cap', v_equipo_id, v_equipo_id, v_nombre,
    coalesce(v_cap->>'nombre', v_ses.nombre), v_cuenta_cap, v_dni_cap,
    v_ses.correo, true, v_carrera_cap, v_cod_clase_cap, v_cod_clase_cap,
    v_nom_clase_cap, v_tipo_doc_cap, v_tipo_doc_cap, v_foto_cap, v_foto_cap,
    true, true,
    CASE WHEN v_es_docente THEN 'Aprobado' ELSE 'En revisión' END,
    CASE WHEN v_es_docente THEN 'exento_docente' ELSE 'en_revision' END,
    v_ses.usuario_id, '2026-Q4', false, now()
  );

  -- Si el Capitán incluyó integrantes manualmente en el formulario (correo_verificado = false)
  IF jsonb_array_length(v_jugs) > 0 THEN
    FOR v_idx IN 0 .. (jsonb_array_length(v_jugs) - 1) LOOP
      v_j := v_jugs->v_idx;
      v_jug_id := 'jug-' || v_equipo_id || '-' || (v_idx + 2);

      INSERT INTO public.jugadores (
        id, equipo_id, "equipoId", "nombreEquipo", nombre, cuenta, dni,
        correo, "correo_verificado", carrera, "codigo_clase", "codigoClase",
        nombre_clase, "tipo_documento", "tipoDocumento", "foto_documento", "fotoDocumento",
        "es_capitan", "esCapitan", estado, "estado_carnet", usuario_id, periodo, eliminado, creado_en
      )
      VALUES (
        v_jug_id, v_equipo_id, v_equipo_id, v_nombre,
        trim(coalesce(v_j->>'nombre', 'Jugador')),
        trim(coalesce(v_j->>'cuenta', '')),
        trim(coalesce(v_j->>'dni', '')),
        lower(trim(coalesce(v_j->>'correo', ''))),
        false, -- Jamás marcado como verificado por el registro del capitán
        coalesce(v_j->>'carrera', v_carrera_cap),
        public.normalizar_codigo_clase(v_j->>'codigoClase'),
        public.normalizar_codigo_clase(v_j->>'codigoClase'),
        trim(coalesce(v_j->>'nombreClase', v_j->>'nombre_clase', '')),
        coalesce(v_j->>'tipoDocumento', 'carnet'),
        coalesce(v_j->>'tipoDocumento', 'carnet'),
        v_j->>'fotoDocumento',
        v_j->>'fotoDocumento',
        false, false,
        'Pendiente', 'pendiente',
        NULL, '2026-Q4', false, now()
      );
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'codigoAcceso', v_codigo_acceso,
    'equipoId', v_equipo_id,
    'whatsappCapitanesUrl', v_whatsapp
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_inscribir_equipo(text, jsonb) TO anon, authenticated;

-- 14. AUTO-REGISTRO Y ADICIÓN CON CÓDIGO (VALIDACIÓN DE CÓDIGO DE CLASE)
CREATE OR REPLACE FUNCTION public.rpc_agregar_jugador_con_codigo(
  p_token text,
  p_codigo text,
  p_jugador jsonb,
  p_es_auto_registro boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_ses public.auth_sesiones;
  v_eq public.equipos;
  v_cuenta text;
  v_dni text;
  v_nombre text;
  v_correo text;
  v_nom_clase text;
  v_cod_clase text;
  v_carrera text;
  v_foto text;
  v_tipo_doc text;
  v_es_capitan boolean;
  v_es_docente boolean;
  v_total_actual int;
  v_max int := 15;
  v_cfg jsonb;
  v_clase_coincide boolean := false;
  v_c jsonb;
  v_idx int;
  v_jug_id text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('mecafut_inscripcion_lock'));

  v_ses := public.resolver_sesion_valida(p_token);

  SELECT * INTO v_eq
  FROM public.equipos
  WHERE NOT eliminado AND (codigo = trim(p_codigo) OR "codigoAcceso" = trim(p_codigo))
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No se encontró ningún equipo con ese código de acceso.';
  END IF;

  IF v_eq.estado = 'Rechazado' THEN
    RAISE EXCEPTION 'Este equipo se encuentra en estado Rechazado y no admite nuevos integrantes.';
  END IF;

  SELECT data INTO v_cfg FROM public.configuracion WHERE id = 'general';
  IF v_cfg IS NOT NULL THEN
    v_max := coalesce((v_cfg->>'maxJugadoresPorEquipo')::int, 15);
  END IF;

  SELECT count(*) INTO v_total_actual
  FROM public.jugadores
  WHERE NOT eliminado AND equipo_id = v_eq.id;

  IF v_total_actual >= v_max THEN
    RAISE EXCEPTION 'El equipo ya alcanzó el límite reglamentario de % jugadores.', v_max;
  END IF;

  v_es_capitan := (v_eq.capitan_usuario_id = v_ses.usuario_id OR lower(trim(coalesce(v_eq.capitan->>'correo', ''))) = v_ses.correo);

  IF NOT p_es_auto_registro AND NOT v_es_capitan AND NOT v_ses.es_admin THEN
    RAISE EXCEPTION 'Solo el Capitán verificado del equipo o un Administrador puede agregar integrantes manualmente.';
  END IF;

  v_nombre := trim(coalesce(p_jugador->>'nombre', ''));
  v_cuenta := trim(coalesce(p_jugador->>'cuenta', ''));
  v_dni := trim(coalesce(p_jugador->>'dni', ''));
  v_carrera := coalesce(p_jugador->>'carrera', 'Ingeniería en Mecatrónica');
  v_nom_clase := trim(coalesce(p_jugador->>'nombreClase', p_jugador->>'nombre_clase', ''));
  v_cod_clase := public.normalizar_codigo_clase(coalesce(p_jugador->>'codigoClase', p_jugador->>'codigo_clase', ''));
  v_foto := p_jugador->>'fotoDocumento';
  v_tipo_doc := coalesce(p_jugador->>'tipoDocumento', 'carnet');

  IF p_es_auto_registro THEN
    v_correo := v_ses.correo;
    v_es_docente := v_ses.es_docente;
  ELSE
    v_correo := lower(trim(coalesce(p_jugador->>'correo', '')));
    v_es_docente := false; -- Si el capitán agrega un compañero, no se le otorga exención docente automática
  END IF;

  IF v_nombre = '' OR v_cuenta = '' THEN
    RAISE EXCEPTION 'Nombre y número de cuenta son obligatorios.';
  END IF;

  IF NOT v_es_docente THEN
    IF v_nom_clase = '' OR v_cod_clase = '' THEN
      RAISE EXCEPTION 'Debes ingresar el Nombre de la clase y el Código de clase que cursas.';
    END IF;

    -- Validar que el equipo tenga clases representadas registradas
    IF v_eq.clases_representadas IS NULL OR jsonb_array_length(v_eq.clases_representadas) = 0 THEN
      RAISE EXCEPTION 'Este equipo no tiene clases representadas registradas. El Capitán debe actualizar el equipo con las clases representadas antes de que los integrantes puedan unirse.';
    END IF;

    -- Validar que el código de clase coincida con al menos una clase representada por el equipo
    FOR v_idx IN 0 .. (jsonb_array_length(v_eq.clases_representadas) - 1) LOOP
      v_c := v_eq.clases_representadas->v_idx;
      IF public.normalizar_codigo_clase(coalesce(v_c->>'codigoClase', v_c->>'codigo', '')) = v_cod_clase THEN
        v_clase_coincide := true;
        EXIT;
      END IF;
    END LOOP;

    IF NOT v_clase_coincide THEN
      RAISE EXCEPTION 'El código de clase "%" no coincide con ninguna de las clases representadas por este equipo.', v_cod_clase;
    END IF;

    IF public.normalizar_dni(v_dni) = '' THEN
      RAISE EXCEPTION 'El DNI es obligatorio para la verificación estudiantil.';
    END IF;

    IF p_es_auto_registro AND (v_foto IS NULL OR v_foto = '') THEN
      RAISE EXCEPTION 'Debes adjuntar foto válida de tu carnet o matrícula.';
    END IF;
  END IF;

  -- Comprobar duplicados en el equipo
  IF EXISTS (SELECT 1 FROM public.jugadores WHERE NOT eliminado AND equipo_id = v_eq.id AND trim(cuenta) = v_cuenta) THEN
    RAISE EXCEPTION 'Este número de cuenta ya se encuentra en la plantilla de este equipo.';
  END IF;

  IF v_correo <> '' AND EXISTS (SELECT 1 FROM public.jugadores WHERE NOT eliminado AND equipo_id = v_eq.id AND lower(trim(correo)) = v_correo) THEN
    RAISE EXCEPTION 'Este correo ya se encuentra en la plantilla de este equipo.';
  END IF;

  -- Comprobar duplicados globales en el periodo activo
  IF NOT v_es_docente THEN
    IF EXISTS (
      SELECT 1 FROM public.jugadores j
      JOIN public.equipos e ON e.id = j.equipo_id
      WHERE NOT j.eliminado AND NOT e.eliminado AND e.estado <> 'Rechazado'
        AND e.periodo = '2026-Q4'
        AND (trim(j.cuenta) = v_cuenta OR (public.normalizar_dni(v_dni) <> '' AND public.normalizar_dni(j.dni) = public.normalizar_dni(v_dni)))
    ) THEN
      RAISE EXCEPTION 'Tu número de cuenta o DNI ya figura inscrito en otro equipo de este torneo.';
    END IF;
  END IF;

  v_jug_id := 'jug-' || v_eq.id || '-' || extract(epoch from now())::bigint;

  INSERT INTO public.jugadores (
    id, equipo_id, "equipoId", "nombreEquipo", nombre, cuenta, dni,
    correo, "correo_verificado", carrera, "codigo_clase", "codigoClase",
    nombre_clase, "tipo_documento", "tipoDocumento", "foto_documento", "fotoDocumento",
    "es_capitan", "esCapitan", estado, "estado_carnet", usuario_id, periodo, eliminado, creado_en
  )
  VALUES (
    v_jug_id, v_eq.id, v_eq.id, v_eq.nombre, v_nombre, v_cuenta, v_dni,
    v_correo, p_es_auto_registro, v_carrera, v_cod_clase, v_cod_clase,
    v_nom_clase, v_tipo_doc, v_tipo_doc, v_foto, v_foto,
    false, false,
    CASE WHEN v_es_docente THEN 'Aprobado' WHEN v_foto IS NOT NULL THEN 'En revisión' ELSE 'Pendiente' END,
    CASE WHEN v_es_docente THEN 'exento_docente' WHEN v_foto IS NOT NULL THEN 'en_revision' ELSE 'pendiente' END,
    CASE WHEN p_es_auto_registro THEN v_ses.usuario_id ELSE NULL END,
    '2026-Q4', false, now()
  );

  RETURN jsonb_build_object(
    'ok', true,
    'equipoId', v_eq.id,
    'nombreEquipo', v_eq.nombre
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_agregar_jugador_con_codigo(text, text, jsonb, boolean) TO anon, authenticated;

-- 15. EDICIÓN DE INTEGRANTES DE EQUIPO (SOLO CAPITÁN O ADMIN)
CREATE OR REPLACE FUNCTION public.rpc_editar_jugador_equipo(
  p_token text,
  p_codigo text,
  p_jugador_id text,
  p_datos jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_ses public.auth_sesiones;
  v_eq public.equipos;
  v_jug public.jugadores;
  v_es_capitan boolean;
  v_nombre text;
  v_cuenta text;
  v_dni text;
  v_carrera text;
  v_nom_clase text;
  v_cod_clase text;
BEGIN
  v_ses := public.resolver_sesion_valida(p_token);

  SELECT * INTO v_eq
  FROM public.equipos
  WHERE NOT eliminado AND (codigo = trim(p_codigo) OR "codigoAcceso" = trim(p_codigo))
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Equipo no encontrado.';
  END IF;

  v_es_capitan := (v_eq.capitan_usuario_id = v_ses.usuario_id OR lower(trim(coalesce(v_eq.capitan->>'correo', ''))) = v_ses.correo);

  IF NOT v_es_capitan AND NOT v_ses.es_admin THEN
    RAISE EXCEPTION 'Acceso denegado: solo el Capitán del equipo o un Administrador pueden editar integrantes.';
  END IF;

  SELECT * INTO v_jug
  FROM public.jugadores
  WHERE id = p_jugador_id AND equipo_id = v_eq.id AND NOT eliminado
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El jugador no pertenece a este equipo o no fue encontrado.';
  END IF;

  v_nombre := coalesce(trim(p_datos->>'nombre'), v_jug.nombre);
  v_cuenta := coalesce(trim(p_datos->>'cuenta'), v_jug.cuenta);
  v_dni := coalesce(trim(p_datos->>'dni'), v_jug.dni);
  v_carrera := coalesce(trim(p_datos->>'carrera'), v_jug.carrera);
  v_nom_clase := coalesce(trim(p_datos->>'nombreClase'), trim(p_datos->>'nombre_clase'), v_jug.nombre_clase);
  v_cod_clase := public.normalizar_codigo_clase(coalesce(p_datos->>'codigoClase', p_datos->>'codigo_clase', v_jug.codigo_clase));

  -- Validar duplicados de cuenta o dni con otros jugadores
  IF v_cuenta <> v_jug.cuenta AND EXISTS (
    SELECT 1 FROM public.jugadores
    WHERE NOT eliminado AND equipo_id = v_eq.id AND trim(cuenta) = v_cuenta AND id <> v_jug.id
  ) THEN
    RAISE EXCEPTION 'Ya existe un integrante con la cuenta % en este equipo.', v_cuenta;
  END IF;

  -- Registrar en auditoría si cambiaron datos de identidad
  IF v_nombre <> v_jug.nombre THEN
    INSERT INTO public.usuarios_historial (usuario_id, correo, campo, valor_anterior, valor_nuevo, periodo, origen, creado_en, actor_usuario_id, actor_correo)
    VALUES (v_jug.usuario_id, coalesce(v_jug.correo, v_ses.correo), 'nombre', v_jug.nombre, v_nombre, '2026-Q4', 'edicion_equipo', now(), v_ses.usuario_id, v_ses.correo);
  END IF;

  IF v_cuenta <> v_jug.cuenta THEN
    INSERT INTO public.usuarios_historial (usuario_id, correo, campo, valor_anterior, valor_nuevo, periodo, origen, creado_en, actor_usuario_id, actor_correo)
    VALUES (v_jug.usuario_id, coalesce(v_jug.correo, v_ses.correo), 'cuenta', v_jug.cuenta, v_cuenta, '2026-Q4', 'edicion_equipo', now(), v_ses.usuario_id, v_ses.correo);
  END IF;

  IF v_dni <> coalesce(v_jug.dni, '') THEN
    INSERT INTO public.usuarios_historial (usuario_id, correo, campo, valor_anterior, valor_nuevo, periodo, origen, creado_en, actor_usuario_id, actor_correo)
    VALUES (v_jug.usuario_id, coalesce(v_jug.correo, v_ses.correo), 'dni', v_jug.dni, v_dni, '2026-Q4', 'edicion_equipo', now(), v_ses.usuario_id, v_ses.correo);
  END IF;

  UPDATE public.jugadores
  SET nombre = v_nombre,
      cuenta = v_cuenta,
      dni = v_dni,
      carrera = v_carrera,
      nombre_clase = v_nom_clase,
      codigo_clase = v_cod_clase,
      "codigoClase" = v_cod_clase,
      alerta_cambio_identidad = true
  WHERE id = v_jug.id;

  RETURN jsonb_build_object('ok', true, 'mensaje', 'Datos del integrante actualizados con éxito.');
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_editar_jugador_equipo(text, text, text, jsonb) TO anon, authenticated;

-- 16. EXPULSAR JUGADOR (SOLO CAPITÁN O ADMIN)
CREATE OR REPLACE FUNCTION public.rpc_expulsar_jugador(
  p_token text,
  p_codigo text,
  p_jugador_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_ses public.auth_sesiones;
  v_eq public.equipos;
  v_jug public.jugadores;
  v_es_capitan boolean;
BEGIN
  v_ses := public.resolver_sesion_valida(p_token);

  SELECT * INTO v_eq
  FROM public.equipos
  WHERE NOT eliminado AND (codigo = trim(p_codigo) OR "codigoAcceso" = trim(p_codigo));

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Equipo no encontrado.';
  END IF;

  v_es_capitan := (v_eq.capitan_usuario_id = v_ses.usuario_id OR lower(trim(coalesce(v_eq.capitan->>'correo', ''))) = v_ses.correo);

  IF NOT v_es_capitan AND NOT v_ses.es_admin THEN
    RAISE EXCEPTION 'Solo el Capitán verificado del equipo o un Administrador puede expulsar integrantes.';
  END IF;

  SELECT * INTO v_jug
  FROM public.jugadores
  WHERE id = p_jugador_id AND equipo_id = v_eq.id AND NOT eliminado;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El jugador no pertenece a este equipo o ya fue eliminado.';
  END IF;

  IF coalesce(v_jug.es_capitan, false) OR coalesce(v_jug."esCapitan", false) THEN
    RAISE EXCEPTION 'El Capitán fundador no puede ser expulsado de la plantilla.';
  END IF;

  UPDATE public.jugadores
  SET eliminado = true
  WHERE id = p_jugador_id;

  RETURN jsonb_build_object('ok', true, 'mensaje', 'Integrante expulsado de la plantilla.');
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_expulsar_jugador(text, text, text) TO anon, authenticated;

-- 17. CONSULTA DE EQUIPO POR CÓDIGO (PRIVACIDAD PARA NO CAPITANES)
CREATE OR REPLACE FUNCTION public.rpc_buscar_equipo_por_codigo(
  p_token text,
  p_codigo text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_ses public.auth_sesiones;
  v_eq public.equipos;
  v_cfg jsonb;
  v_es_capitan boolean;
  v_es_admin boolean;
  v_puede_ver_sensible boolean;
  v_whatsapp text := NULL;
  v_jugadores jsonb;
BEGIN
  v_ses := public.resolver_sesion_valida(p_token);

  SELECT * INTO v_eq
  FROM public.equipos
  WHERE NOT eliminado AND (codigo = trim(p_codigo) OR "codigoAcceso" = trim(p_codigo));

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No se encontró ningún equipo con ese código de acceso.';
  END IF;

  v_es_capitan := (v_eq.capitan_usuario_id = v_ses.usuario_id OR lower(trim(coalesce(v_eq.capitan->>'correo', ''))) = v_ses.correo);
  v_es_admin := v_ses.es_admin;
  v_puede_ver_sensible := v_es_capitan OR v_es_admin;

  -- Enlace de WhatsApp solo visible si es el Capitán del equipo
  IF v_es_capitan THEN
    SELECT data INTO v_cfg FROM public.configuracion WHERE id = 'general';
    v_whatsapp := v_cfg->>'whatsappCapitanesUrl';
  END IF;

  SELECT jsonb_agg(jsonb_build_object(
    'id', j.id,
    'nombre', j.nombre,
    'carrera', j.carrera,
    'esCapitan', coalesce(j.es_capitan, j."esCapitan", false),
    'estado', j.estado,
    'estadoCarnet', coalesce(j.estado_carnet, 'pendiente'),
    'nombreClase', j.nombre_clase,
    'codigoClase', coalesce(j.codigo_clase, j."codigoClase"),
    'tieneDni', (public.normalizar_dni(j.dni) <> '' OR (j.correo_verificado AND public.es_docente_oficial(j.correo))),
    'tieneFoto', (j.foto_documento IS NOT NULL OR j."fotoDocumento" IS NOT NULL),
    'datosCompletos', (
      j.nombre <> '' AND j.cuenta <> '' AND
      (public.normalizar_dni(j.dni) <> '' OR (j.correo_verificado AND public.es_docente_oficial(j.correo))) AND
      (j.foto_documento IS NOT NULL OR (j.correo_verificado AND public.es_docente_oficial(j.correo)))
    ),
    -- Datos sensibles devueltos estrictamente si es Capitán o Admin:
    'cuenta', CASE WHEN v_puede_ver_sensible OR (j.usuario_id = v_ses.usuario_id) THEN j.cuenta ELSE NULL END,
    'dni', CASE WHEN v_puede_ver_sensible OR (j.usuario_id = v_ses.usuario_id) THEN j.dni ELSE NULL END,
    'correo', CASE WHEN v_puede_ver_sensible OR (j.usuario_id = v_ses.usuario_id) THEN j.correo ELSE NULL END,
    'fotoDocumento', CASE WHEN v_puede_ver_sensible OR (j.usuario_id = v_ses.usuario_id) THEN coalesce(j.foto_documento, j."fotoDocumento") ELSE NULL END
  ) ORDER BY j.es_capitan DESC, j.creado_en ASC) INTO v_jugadores
  FROM public.jugadores j
  WHERE NOT j.eliminado AND j.equipo_id = v_eq.id;

  RETURN jsonb_build_object(
    'equipo', jsonb_build_object(
      'id', v_eq.id,
      'nombre', v_eq.nombre,
      'categoria', v_eq.categoria,
      'color', v_eq.color,
      'docente', v_eq.docente,
      'tipoEquipo', v_eq."tipoEquipo",
      'estado', v_eq.estado,
      'clasesRepresentadas', v_eq.clases_representadas,
      'comprobanteDataUrl', CASE WHEN v_puede_ver_sensible THEN v_eq."comprobanteDataUrl" ELSE NULL END
    ),
    'jugadores', coalesce(v_jugadores, '[]'::jsonb),
    'permisos', jsonb_build_object(
      'esCapitan', v_es_capitan,
      'esAdmin', v_es_admin,
      'esCapitanOAdmin', v_puede_ver_sensible
    ),
    'whatsappCapitanesUrl', v_whatsapp
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_buscar_equipo_por_codigo(text, text) TO anon, authenticated;

-- 18. REVISIÓN INDIVIDUAL DE CARNETS (ADMIN) Y STUB SEGURO DE LOTE
CREATE OR REPLACE FUNCTION public.rpc_revisar_carnet_admin(
  p_token text,
  p_jugador_id text,
  p_decision text,
  p_motivo text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_admin public.auth_sesiones;
  v_jug public.jugadores;
BEGIN
  v_admin := public.resolver_sesion_valida(p_token, 'admin');

  IF p_decision NOT IN ('verificado', 'rechazado') THEN
    RAISE EXCEPTION 'Decisión inválida. Debe ser verificado o rechazado.';
  END IF;

  SELECT * INTO v_jug
  FROM public.jugadores
  WHERE id = p_jugador_id AND NOT eliminado
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Jugador no encontrado.';
  END IF;

  UPDATE public.jugadores
  SET estado_carnet = p_decision,
      estado = CASE WHEN p_decision = 'verificado' THEN 'Aprobado' ELSE 'Rechazado' END,
      verificado_por = v_admin.correo,
      verificado_en = now(),
      motivo_rechazo = CASE WHEN p_decision = 'rechazado' THEN coalesce(nullif(trim(p_motivo), ''), 'Documento rechazado por el Comité.') ELSE NULL END
  WHERE id = p_jugador_id;

  RETURN jsonb_build_object(
    'ok', true,
    'decision', p_decision,
    'verificadoPor', v_admin.correo
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_revisar_carnet_admin(text, text, text, text) TO anon, authenticated;

-- Stub compatible y seguro para clientes viejos en caché
CREATE OR REPLACE FUNCTION public.rpc_verificar_carnets_equipo_admin(
  p_token text,
  p_equipo_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_admin public.auth_sesiones;
BEGIN
  v_admin := public.resolver_sesion_valida(p_token, 'admin');
  RAISE EXCEPTION 'La verificación masiva ha sido deshabilitada. Por favor actualiza la página y revisa cada carnet individualmente.';
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_verificar_carnets_equipo_admin(text, text) FROM PUBLIC, anon, authenticated;

-- 19. CONFIGURACIÓN GENERAL Y LÍMITES POR EL ADMINISTRADOR
CREATE OR REPLACE FUNCTION public.rpc_guardar_configuracion_general(
  p_token text,
  p_patch jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_admin public.auth_sesiones;
  v_data jsonb;
  v_max int;
  v_wa text;
  v_torneo_raw jsonb;
BEGIN
  v_admin := public.resolver_sesion_valida(p_token, 'admin');

  SELECT data INTO v_data FROM public.configuracion WHERE id = 'general' FOR UPDATE;
  v_data := COALESCE(v_data, '{}'::jsonb) || p_patch;

  IF p_patch ? 'maxJugadoresPorEquipo' THEN
    v_max := (p_patch->>'maxJugadoresPorEquipo')::int;
    IF v_max < 8 THEN
      RAISE EXCEPTION 'El máximo de integrantes por equipo no puede ser menor a 8 (mínimo reglamentario).';
    END IF;
  END IF;

  IF p_patch ? 'whatsappCapitanesUrl' THEN
    v_wa := trim(coalesce(p_patch->>'whatsappCapitanesUrl', ''));
    IF v_wa <> '' AND v_wa !~ '^https:\/\/chat\.whatsapp\.com\/(invite\/)?[A-Za-z0-9_-]{10,64}\/?$' THEN
      RAISE EXCEPTION 'El enlace de WhatsApp no tiene un formato válido de invitación oficial (ej. https://chat.whatsapp.com/...).';
    END IF;
  END IF;

  INSERT INTO public.configuracion (id, data, actualizado_en)
  VALUES ('general', v_data, now())
  ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, actualizado_en = now();

  -- Si se actualizaron banderas de publicación, sincronizar la proyección pública de torneo inmediatamente
  SELECT data INTO v_torneo_raw FROM public.configuracion WHERE id = 'torneo_interno';
  IF v_torneo_raw IS NOT NULL THEN
    INSERT INTO public.configuracion (id, data, actualizado_en)
    VALUES ('torneo', public.proyectar_torneo_publico(v_torneo_raw), now())
    ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, actualizado_en = now();
  END IF;

  RETURN v_data;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_guardar_configuracion_general(text, jsonb) TO anon, authenticated;

-- Helper para limpiar goleadores en un arreglo de partidos
CREATE OR REPLACE FUNCTION public.limpiar_goleadores_partidos(p_partidos jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_res jsonb := '[]'::jsonb;
  v_p jsonb;
  v_i int;
BEGIN
  IF p_partidos IS NULL OR jsonb_typeof(p_partidos) <> 'array' THEN
    RETURN '[]'::jsonb;
  END IF;
  FOR v_i IN 0 .. (jsonb_array_length(p_partidos) - 1) LOOP
    v_p := p_partidos->v_i;
    IF v_p ? 'goleadores' THEN
      v_p := jsonb_set(v_p, '{goleadores}', '[]'::jsonb);
    END IF;
    v_res := v_res || jsonb_build_array(v_p);
  END LOOP;
  RETURN v_res;
END;
$$;

REVOKE ALL ON FUNCTION public.limpiar_goleadores_partidos(jsonb) FROM PUBLIC, anon, authenticated;

-- 20. PROYECCIÓN PÚBLICA SANITIZADA Y GUARDADO DE TORNEO
CREATE OR REPLACE FUNCTION public.proyectar_torneo_publico(p_torneo jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_publico jsonb := p_torneo;
  v_premios jsonb := coalesce(p_torneo->'criteriosPremios', '[]'::jsonb);
  v_premios_pub jsonb := '[]'::jsonb;
  v_item jsonb;
  v_idx int;
  v_cfg jsonb;
  v_pub_goles boolean := false;
  v_pub_tabla boolean := false;
  v_pub_premios boolean := false;
  v_rondas jsonb;
  v_ronda jsonb;
  v_rondas_clean jsonb := '[]'::jsonb;
  v_fem jsonb;
BEGIN
  -- Consultar banderas en 'general' (Ocultas por defecto hasta que el comité las publique explícitamente)
  SELECT data INTO v_cfg FROM public.configuracion WHERE id = 'general';
  IF v_cfg IS NOT NULL THEN
    v_pub_goles := coalesce((v_cfg->>'publicarGoleadores')::boolean, (p_torneo->>'publicarGoleadores')::boolean, (p_torneo->'publicaciones'->>'goleadores')::boolean, false);
    v_pub_tabla := coalesce((v_cfg->>'publicarClasificacion')::boolean, (p_torneo->>'publicarClasificacion')::boolean, (p_torneo->'publicaciones'->>'clasificacion')::boolean, false);
    v_pub_premios := coalesce((v_cfg->>'publicarPremios')::boolean, (p_torneo->>'publicarPremios')::boolean, (p_torneo->'publicaciones'->>'premios')::boolean, false);
  ELSE
    v_pub_goles := coalesce((p_torneo->>'publicarGoleadores')::boolean, (p_torneo->'publicaciones'->>'goleadores')::boolean, false);
    v_pub_tabla := coalesce((p_torneo->>'publicarClasificacion')::boolean, (p_torneo->'publicaciones'->>'clasificacion')::boolean, false);
    v_pub_premios := coalesce((p_torneo->>'publicarPremios')::boolean, (p_torneo->'publicaciones'->>'premios')::boolean, false);
  END IF;

  -- 1. Premios
  IF NOT v_pub_premios THEN
    v_publico := jsonb_set(v_publico, '{criteriosPremios}', '[]'::jsonb);
  ELSE
    IF jsonb_array_length(v_premios) > 0 THEN
      FOR v_idx IN 0 .. (jsonb_array_length(v_premios) - 1) LOOP
        v_item := v_premios->v_idx;
        IF coalesce((v_item->>'publicado')::boolean, false) = true THEN
          v_premios_pub := v_premios_pub || jsonb_build_array(v_item);
        END IF;
      END LOOP;
    END IF;
    v_publico := jsonb_set(v_publico, '{criteriosPremios}', v_premios_pub);
  END IF;

  -- 2. Goleadores
  IF NOT v_pub_goles THEN
    -- Masculino
    v_rondas := v_publico->'brackets'->'Masculino'->'rondas';
    IF v_rondas IS NOT NULL AND jsonb_typeof(v_rondas) = 'array' THEN
      v_rondas_clean := '[]'::jsonb;
      FOR v_idx IN 0 .. (jsonb_array_length(v_rondas) - 1) LOOP
        v_ronda := v_rondas->v_idx;
        IF v_ronda ? 'partidos' THEN
          v_ronda := jsonb_set(v_ronda, '{partidos}', public.limpiar_goleadores_partidos(v_ronda->'partidos'));
        END IF;
        v_rondas_clean := v_rondas_clean || jsonb_build_array(v_ronda);
      END LOOP;
      v_publico := jsonb_set(v_publico, '{brackets,Masculino,rondas}', v_rondas_clean);
    END IF;

    -- Femenino
    v_fem := v_publico->'brackets'->'Femenino';
    IF v_fem IS NOT NULL THEN
      IF v_fem ? 'partidos' THEN
        v_fem := jsonb_set(v_fem, '{partidos}', public.limpiar_goleadores_partidos(v_fem->'partidos'));
      END IF;
      IF v_fem ? 'jornadas' THEN
        v_fem := jsonb_set(v_fem, '{jornadas}', public.limpiar_goleadores_partidos(v_fem->'jornadas'));
      END IF;
      -- Limpieza en eliminación directa femenina (rondas)
      IF v_fem ? 'rondas' AND jsonb_typeof(v_fem->'rondas') = 'array' THEN
        v_rondas_clean := '[]'::jsonb;
        FOR v_idx IN 0 .. (jsonb_array_length(v_fem->'rondas') - 1) LOOP
          v_ronda := (v_fem->'rondas')->v_idx;
          IF v_ronda ? 'partidos' THEN
            v_ronda := jsonb_set(v_ronda, '{partidos}', public.limpiar_goleadores_partidos(v_ronda->'partidos'));
          END IF;
          v_rondas_clean := v_rondas_clean || jsonb_build_array(v_ronda);
        END LOOP;
        v_fem := jsonb_set(v_fem, '{rondas}', v_rondas_clean);
      END IF;
      IF v_fem ? 'granFinal' AND jsonb_typeof(v_fem->'granFinal') = 'object' THEN
        IF (v_fem->'granFinal') ? 'goleadores' THEN
          v_fem := jsonb_set(v_fem, '{granFinal,goleadores}', '[]'::jsonb);
        END IF;
      END IF;
      v_publico := jsonb_set(v_publico, '{brackets,Femenino}', v_fem);
    END IF;
  END IF;

  -- 3. Clasificación / Tablas
  IF NOT v_pub_tabla THEN
    v_publico := v_publico #- '{brackets,Femenino,tabla}' #- '{brackets,Femenino,posiciones}';
  END IF;

  -- Añadir banderas normalizadas
  v_publico := jsonb_set(v_publico, '{publicarGoleadores}', to_jsonb(v_pub_goles));
  v_publico := jsonb_set(v_publico, '{publicarClasificacion}', to_jsonb(v_pub_tabla));
  v_publico := jsonb_set(v_publico, '{publicarPremios}', to_jsonb(v_pub_premios));

  RETURN v_publico;
END;
$$;

REVOKE ALL ON FUNCTION public.proyectar_torneo_publico(jsonb) FROM PUBLIC, anon, authenticated;

-- Reproyectar y resguardar datos de torneo preexistentes
DO $$
DECLARE
  v_raw jsonb;
BEGIN
  -- Si ya existía 'torneo' pero no 'torneo_interno', resguardar el maestro en 'torneo_interno'
  SELECT data INTO v_raw FROM public.configuracion WHERE id = 'torneo_interno';
  IF v_raw IS NULL THEN
    SELECT data INTO v_raw FROM public.configuracion WHERE id = 'torneo';
    IF v_raw IS NOT NULL THEN
      INSERT INTO public.configuracion (id, data, actualizado_en)
      VALUES ('torneo_interno', v_raw, now())
      ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, actualizado_en = now();
    END IF;
  END IF;

  -- Asegurar que la fila 'torneo' pública quede inmediatamente reproyectada y sanitizada
  IF v_raw IS NOT NULL THEN
    INSERT INTO public.configuracion (id, data, actualizado_en)
    VALUES ('torneo', public.proyectar_torneo_publico(v_raw), now())
    ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, actualizado_en = now();
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_guardar_torneo(
  p_token text,
  p_torneo jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_admin public.auth_sesiones;
  v_publico jsonb;
BEGIN
  v_admin := public.resolver_sesion_valida(p_token, 'admin');

  -- 1. Guardar estado completo en 'torneo_interno' (solo accesible para el comité)
  INSERT INTO public.configuracion (id, data, actualizado_en)
  VALUES ('torneo_interno', p_torneo, now())
  ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, actualizado_en = now();

  -- 2. Proyectar versión sanitizada en 'torneo' (leída por /torneo y Realtime)
  v_publico := public.proyectar_torneo_publico(p_torneo);

  INSERT INTO public.configuracion (id, data, actualizado_en)
  VALUES ('torneo', v_publico, now())
  ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, actualizado_en = now();

  RETURN p_torneo;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_guardar_torneo(text, jsonb) TO anon, authenticated;

-- RPC para lectura pública segura de estado de torneo
CREATE OR REPLACE FUNCTION public.rpc_obtener_estado_torneo_publico()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_data jsonb;
BEGIN
  -- Leer desde 'torneo_interno' prioritariamente, o desde 'torneo' como respaldo
  SELECT data INTO v_data FROM public.configuracion WHERE id = 'torneo_interno';
  IF v_data IS NULL THEN
    SELECT data INTO v_data FROM public.configuracion WHERE id = 'torneo';
  END IF;

  -- Proyectar SIEMPRE en lectura para garantizar que goleadores, clasificación y premios
  -- respeten estrictamente las banderas vigentes de la configuración general
  IF v_data IS NOT NULL THEN
    RETURN public.proyectar_torneo_publico(v_data);
  END IF;

  RETURN NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_obtener_estado_torneo_publico() TO anon, authenticated;

-- 21. DATOS ADMINISTRATIVOS COMPLETOS (INCLUYE PESTAÑA USUARIOS)
CREATE OR REPLACE FUNCTION public.rpc_obtener_datos_admin(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_admin public.auth_sesiones;
  v_equipos jsonb;
  v_jugadores jsonb;
  v_usuarios jsonb;
  v_cfg jsonb;
  v_torneo jsonb;
BEGIN
  v_admin := public.resolver_sesion_valida(p_token, 'admin');

  SELECT jsonb_agg(jsonb_build_object(
    'id', e.id,
    'nombre', e.nombre,
    'categoria', e.categoria,
    'color', e.color,
    'docente', e.docente,
    'tipoEquipo', e."tipoEquipo",
    'estado', e.estado,
    'codigoAcceso', e."codigoAcceso",
    'fechaRegistro', e."fechaRegistro",
    'comprobanteDataUrl', e."comprobanteDataUrl",
    'clasesRepresentadas', e.clases_representadas,
    'capitan', jsonb_build_object(
      'nombre', e.capitan->>'nombre',
      'correo', e.capitan->>'correo',
      'telefono', e.capitan->>'telefono',
      'cuenta', e.capitan->>'cuenta'
    )
  ) ORDER BY e.creado_en DESC) INTO v_equipos
  FROM public.equipos e
  WHERE NOT e.eliminado;

  SELECT jsonb_agg(jsonb_build_object(
    'id', j.id,
    'equipoId', j.equipo_id,
    'nombreEquipo', j."nombreEquipo",
    'nombre', j.nombre,
    'cuenta', j.cuenta,
    'dni', j.dni,
    'correo', j.correo,
    'carrera', j.carrera,
    'nombreClase', j.nombre_clase,
    'codigoClase', coalesce(j.codigo_clase, j."codigoClase"),
    'tipoDocumento', coalesce(j.tipo_documento, j."tipoDocumento"),
    'fotoDocumento', coalesce(j.foto_documento, j."fotoDocumento"),
    'esCapitan', coalesce(j.es_capitan, j."esCapitan", false),
    'estado', j.estado,
    'estadoCarnet', coalesce(j.estado_carnet, 'pendiente'),
    'motivoRechazo', j.motivo_rechazo,
    'alertaCambioIdentidad', coalesce(j.alerta_cambio_identidad, false),
    'correoVerificado', coalesce(j.correo_verificado, false)
  ) ORDER BY j.creado_en ASC) INTO v_jugadores
  FROM public.jugadores j
  WHERE NOT j.eliminado;

  -- Lista de usuarios registrados (sin password_hash) para pestaña Usuarios de /admin
  SELECT jsonb_agg(jsonb_build_object(
    'usuarioId', u.usuario_id,
    'correo', u.correo,
    'nombre', u.nombre,
    'cuenta', u.cuenta,
    'dni', u.dni,
    'telefono', u.telefono,
    'carrera', u.carrera,
    'nombreClase', u.nombre_clase,
    'codigoClase', u.codigo_clase,
    'debeCambiarPassword', u.debe_cambiar_password,
    'tempPasswordUsada', u.temp_password_usada,
    'tempPasswordPor', u.temp_password_por,
    'tempPasswordEn', u.temp_password_en,
    'creadoEn', u.creado_en,
    'esAdmin', public.es_admin_oficial(u.correo),
    'esDocente', public.es_docente_oficial(u.correo)
  ) ORDER BY u.creado_en DESC) INTO v_usuarios
  FROM public.usuarios u;

  SELECT data INTO v_cfg FROM public.configuracion WHERE id = 'general';

  -- En /admin se carga 'torneo_interno' para editar todos los marcadores y criterios
  SELECT data INTO v_torneo FROM public.configuracion WHERE id = 'torneo_interno';
  IF v_torneo IS NULL THEN
    SELECT data INTO v_torneo FROM public.configuracion WHERE id = 'torneo';
  END IF;

  RETURN jsonb_build_object(
    'equipos', coalesce(v_equipos, '[]'::jsonb),
    'jugadores', coalesce(v_jugadores, '[]'::jsonb),
    'usuarios', coalesce(v_usuarios, '[]'::jsonb),
    'configuracion', coalesce(v_cfg, '{}'::jsonb),
    'torneo', v_torneo,
    'modo', 'supabase'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_obtener_datos_admin(text) TO anon, authenticated;

-- 22. BACKFILL DEFENSIVO DE CLASES REPRESENTADAS PARA EQUIPOS HISTÓRICOS
UPDATE public.equipos
SET clases_representadas = jsonb_build_array(
  jsonb_build_object('nombre', 'Facultad de Ingeniería', 'codigo', 'ING-GEN', 'codigoClase', 'ING-GEN')
)
WHERE NOT eliminado AND (clases_representadas IS NULL OR jsonb_array_length(clases_representadas) = 0);


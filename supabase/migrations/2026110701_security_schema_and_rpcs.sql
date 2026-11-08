-- ============================================================================
-- MECAFUT Q4 2026 — PARCHE INTEGRAL DE SEGURIDAD, CONSISTENCIA Y AUDITORÍA
-- Cubre hallazgos F-01, F-02, F-03, F-04, F-05, F-06, F-10, F-11, F-12, F-13
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ----------------------------------------------------------------------------
-- 1. EVOLUCIÓN NO DESTRUCTIVA DE TABLAS EXISTENTES
-- ----------------------------------------------------------------------------

ALTER TABLE public.usuarios
  ADD COLUMN IF NOT EXISTS usuario_id uuid DEFAULT gen_random_uuid() NOT NULL,
  ADD COLUMN IF NOT EXISTS intentos_login integer DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS bloqueado_hasta timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS idx_usuarios_usuario_id ON public.usuarios(usuario_id);

ALTER TABLE public.equipos
  ADD COLUMN IF NOT EXISTS periodo text DEFAULT 'Q4 2026' NOT NULL,
  ADD COLUMN IF NOT EXISTS capitan_usuario_id uuid REFERENCES public.usuarios(usuario_id),
  ADD COLUMN IF NOT EXISTS eliminado boolean DEFAULT false NOT NULL;

CREATE INDEX IF NOT EXISTS idx_equipos_periodo_estado ON public.equipos(periodo, estado);
CREATE INDEX IF NOT EXISTS idx_equipos_nombre_lower ON public.equipos(lower(trim(nombre)));

ALTER TABLE public.jugadores
  ADD COLUMN IF NOT EXISTS usuario_id uuid REFERENCES public.usuarios(usuario_id),
  ADD COLUMN IF NOT EXISTS periodo text DEFAULT 'Q4 2026' NOT NULL,
  ADD COLUMN IF NOT EXISTS correo_verificado boolean DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS registrado_por_correo text,
  ADD COLUMN IF NOT EXISTS estado_carnet text DEFAULT 'pendiente' NOT NULL,
  ADD COLUMN IF NOT EXISTS verificado_por text,
  ADD COLUMN IF NOT EXISTS verificado_en timestamptz,
  ADD COLUMN IF NOT EXISTS motivo_rechazo text,
  ADD COLUMN IF NOT EXISTS alerta_cambio_identidad boolean DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS eliminado boolean DEFAULT false NOT NULL;

CREATE INDEX IF NOT EXISTS idx_jugadores_periodo_cuenta ON public.jugadores(periodo, cuenta);
CREATE INDEX IF NOT EXISTS idx_jugadores_correo_lower ON public.jugadores(lower(trim(correo)));
CREATE INDEX IF NOT EXISTS idx_jugadores_usuario_id ON public.jugadores(usuario_id);

-- ----------------------------------------------------------------------------
-- 2. TABLAS PRIVADAS DE AUTENTICACIÓN E HISTORIAL (RLS CERRADO AL PÚBLICO)
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.auth_otps (
  correo text PRIMARY KEY,
  otp_hash text NOT NULL,
  expira_en timestamptz NOT NULL,
  intentos integer NOT NULL DEFAULT 0,
  origen_servidor boolean NOT NULL DEFAULT false,
  ultimo_envio_en timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.auth_otps ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.auth_sesiones (
  token text PRIMARY KEY,
  usuario_id uuid REFERENCES public.usuarios(usuario_id),
  correo text NOT NULL,
  rol text NOT NULL,
  nombre text,
  titulo_rol text,
  es_admin boolean NOT NULL DEFAULT false,
  es_docente boolean NOT NULL DEFAULT false,
  expira_en timestamptz NOT NULL,
  revocada boolean NOT NULL DEFAULT false,
  creado_en timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auth_sesiones_correo ON public.auth_sesiones(correo);
ALTER TABLE public.auth_sesiones ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.usuarios_historial (
  id bigserial PRIMARY KEY,
  usuario_id uuid REFERENCES public.usuarios(usuario_id),
  correo text NOT NULL,
  campo text NOT NULL,
  valor_anterior text,
  valor_nuevo text,
  periodo text NOT NULL DEFAULT 'Q4 2026',
  origen text NOT NULL,
  creado_en timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_usuarios_historial_correo ON public.usuarios_historial(lower(correo));
ALTER TABLE public.usuarios_historial ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- 3. FUNCIONES AUXILIARES DE IDENTIDAD, ROLES Y NORMALIZACIÓN
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.es_correo_institucional(p_correo text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public, extensions
AS $$
  SELECT lower(trim(coalesce(p_correo, ''))) LIKE '%@unitec.edu'
      OR lower(trim(coalesce(p_correo, ''))) LIKE '%@unitec.edu.hn';
$$;

CREATE OR REPLACE FUNCTION public.es_admin_oficial(p_correo text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_c text := lower(trim(coalesce(p_correo, '')));
  v_extra jsonb;
BEGIN
  IF v_c = '' THEN
    RETURN false;
  END IF;

  IF v_c IN (
    'andresvalle@unitec.edu',
    'carlos.rubi@unitec.edu',
    'juan.mejia@unitec.edu.hn',
    'cristhyan.rivera@unitec.edu.hn',
    'joserodasgodoy@unitec.edu',
    'c.marcelo.al@unitec.edu',
    'cesar_lopez@unitec.edu',
    'adioyuela@unitec.edu',
    'maria_giron@unitec.edu',
    'dereck.beltrand@unitec.edu',
    'jalfaro@unitec.edu'
  ) THEN
    RETURN true;
  END IF;

  SELECT data->'adminsExtra' INTO v_extra
  FROM public.configuracion
  WHERE id = 'general';

  IF jsonb_typeof(v_extra) = 'array' THEN
    RETURN EXISTS (
      SELECT 1
      FROM jsonb_array_elements_text(v_extra) AS elem
      WHERE lower(trim(elem)) = v_c
    );
  END IF;

  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.obtener_docente_oficial(p_correo text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, extensions
AS $$
  SELECT CASE lower(trim(coalesce(p_correo, '')))
    WHEN 'jared.sauceda@unitec.edu' THEN 'Ing. Jared Sauceda'
    WHEN 'orlando.aguiluz@unitec.edu' THEN 'Ing. Orlando Aguiluz'
    WHEN 'ricardo.maldonado@unitec.edu' THEN 'Ing. Ricardo Maldonado'
    WHEN 'jose.ordonez@unitec.edu' THEN 'Ing. José Luis Ordoñez'
    WHEN 'pedro.vasquez@unitec.edu' THEN 'Ing. Pedro Vásquez'
    WHEN 'hegel.lopez@unitec.edu' THEN 'Ing. Hegel López'
    WHEN 'david.gonzales@unitec.edu' THEN 'Ing. David Gonzales'
    WHEN 'juan.mejia@unitec.edu.hn' THEN 'Ing. Juan Miguel Mejía'
    WHEN 'juan.mejia@unitec.edu' THEN 'Ing. Juan Miguel Mejía'
    WHEN 'roque.lopez@unitec.edu' THEN 'Ing. Roque López'
    WHEN 'josue.perez@unitec.edu' THEN 'Ing. Josué Pérez'
    WHEN 'winder.matamoros@unitec.edu' THEN 'Ing. Winder Matamoros'
    WHEN 'elvin.ledezma@unitec.edu' THEN 'Ing. Elvin Ledezma'
    WHEN 'andre.colindres@unitec.edu' THEN 'Ing. André Colindres'
    WHEN 'cristhyan.rivera@unitec.edu.hn' THEN 'Ing. Cristhyan Rivera'
    WHEN 'cristhyan.rivera@unitec.edu' THEN 'Ing. Cristhyan Rivera'
    WHEN 'vielka.barahona@unitec.edu' THEN 'Ing. Vielka Barahona'
    WHEN 'docentes.mecafut@unitec.edu' THEN 'Equipo de Docentes (General)'
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

CREATE OR REPLACE FUNCTION public.normalizar_dni(p_dni text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, extensions
AS $$
  SELECT CASE
    WHEN p_dni IS NULL OR trim(p_dni) = '' OR lower(trim(p_dni)) LIKE '%exento%' THEN ''
    ELSE upper(regexp_replace(trim(p_dni), '[^0-9A-Za-z]', '', 'g'))
  END;
$$;

CREATE OR REPLACE FUNCTION public.enmascarar_dni(p_dni text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, extensions
AS $$
  SELECT CASE
    WHEN p_dni IS NULL OR trim(p_dni) = '' THEN 'Pendiente'
    WHEN lower(trim(p_dni)) LIKE '%exento%' THEN 'Exento (Docente)'
    WHEN length(trim(p_dni)) <= 4 THEN '****'
    ELSE '****-****-' || right(trim(p_dni), 4)
  END;
$$;

-- Backfill seguro de filas previas en jugadores y detección inicial de discrepancias
UPDATE public.jugadores j
SET
  usuario_id = COALESCE(j.usuario_id, u.usuario_id),
  correo_verificado = CASE WHEN u.usuario_id IS NOT NULL THEN true ELSE j.correo_verificado END
FROM public.usuarios u
WHERE lower(trim(coalesce(j.correo, ''))) = lower(trim(u.correo));

UPDATE public.equipos e
SET capitan_usuario_id = u.usuario_id
FROM public.usuarios u
WHERE e.capitan_usuario_id IS NULL
  AND lower(trim(coalesce(e.capitan->>'correo', ''))) = lower(trim(u.correo));

UPDATE public.jugadores
SET estado_carnet = CASE
  WHEN correo_verificado AND public.es_docente_oficial(correo) THEN 'exento_docente'
  WHEN coalesce(foto_documento, "fotoDocumento", '') <> '' AND estado_carnet = 'pendiente' THEN 'en_revision'
  ELSE estado_carnet
END,
estado = CASE
  WHEN correo_verificado AND public.es_docente_oficial(correo) THEN 'Aprobado'
  WHEN coalesce(foto_documento, "fotoDocumento", '') <> '' AND estado_carnet = 'pendiente' THEN 'En revisión'
  ELSE coalesce(estado, 'Pendiente')
END
WHERE estado_carnet = 'pendiente';

-- Marcar discrepancias preexistentes si el mismo correo/DNI aparece con cuentas distintas
UPDATE public.jugadores j1
SET alerta_cambio_identidad = true
WHERE EXISTS (
  SELECT 1
  FROM public.jugadores j2
  WHERE j2.id <> j1.id
    AND j2.cuenta <> j1.cuenta
    AND (
      (coalesce(j1.correo, '') <> '' AND lower(j1.correo) = lower(j2.correo))
      OR (public.normalizar_dni(j1.dni) <> '' AND public.normalizar_dni(j1.dni) = public.normalizar_dni(j2.dni))
    )
);

-- ----------------------------------------------------------------------------
-- 4. GESTIÓN INTERNA Y VALIDACIÓN DE SESIONES DE SERVIDOR (F-02)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.resolver_sesion_valida(
  p_token text,
  p_rol_requerido text DEFAULT NULL
)
RETURNS public.auth_sesiones
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_ses public.auth_sesiones;
BEGIN
  IF p_token IS NULL OR length(trim(p_token)) < 32 THEN
    RAISE EXCEPTION 'Sesión no autenticada o expirada. Por favor vuelve a iniciar sesión.';
  END IF;

  SELECT * INTO v_ses
  FROM public.auth_sesiones
  WHERE token = trim(p_token)
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

  RETURN v_ses;
END;
$$;

REVOKE ALL ON FUNCTION public.resolver_sesion_valida(text, text) FROM PUBLIC, anon, authenticated;

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
  v_titulo text := 'Estudiante Universitario';
  v_nombre text := coalesce(nullif(trim(p_nombre_base), ''), '');
  v_token text := encode(gen_random_bytes(32), 'hex');
  v_expira timestamptz := now() + interval '14 days';
BEGIN
  IF v_es_admin AND v_es_docente THEN
    v_rol := 'admin';
    v_titulo := 'Docente / Administrador del Torneo';
    v_nombre := coalesce(v_doc_nombre, nullif(v_nombre, ''), 'Docente Administrador');
  ELSIF v_es_admin THEN
    v_rol := 'admin';
    v_titulo := 'Administrador del Torneo';
    v_nombre := coalesce(nullif(v_nombre, ''), 'Comité Administrador');
  ELSIF v_es_docente THEN
    v_rol := 'docente';
    v_titulo := 'Docente / Facultad';
    v_nombre := coalesce(v_doc_nombre, nullif(v_nombre, ''), 'Docente');
  END IF;

  INSERT INTO public.auth_sesiones (
    token, usuario_id, correo, rol, nombre, titulo_rol, es_admin, es_docente, expira_en, revocada
  ) VALUES (
    v_token, p_usuario_id, v_correo, v_rol, v_nombre, v_titulo, v_es_admin, v_es_docente, v_expira, false
  );

  -- Reclamar automáticamente cualquier pre-registro hecho por un capitán con este correo verificado
  UPDATE public.jugadores
  SET
    usuario_id = COALESCE(usuario_id, p_usuario_id),
    correo_verificado = true,
    dni = CASE WHEN v_es_docente AND (dni IS NULL OR trim(dni) = '') THEN 'Exento (Docente)' ELSE dni END,
    tipo_documento = CASE WHEN v_es_docente THEN 'docente' ELSE tipo_documento END,
    "tipoDocumento" = CASE WHEN v_es_docente THEN 'docente' ELSE "tipoDocumento" END,
    estado_carnet = CASE WHEN v_es_docente THEN 'exento_docente' ELSE estado_carnet END,
    estado = CASE WHEN v_es_docente THEN 'Aprobado' ELSE estado END
  WHERE lower(trim(coalesce(correo, ''))) = v_correo
    AND (usuario_id IS NULL OR NOT correo_verificado);

  RETURN jsonb_build_object(
    'token', v_token,
    'usuarioId', p_usuario_id,
    'correo', v_correo,
    'rol', v_rol,
    'esAdmin', v_es_admin,
    'esDocente', v_es_docente,
    'tituloRol', v_titulo,
    'nombre', v_nombre,
    'autenticadoEn', now(),
    'expiraEn', v_expira
  );
END;
$$;

REVOKE ALL ON FUNCTION public.emitir_sesion_interna(uuid, text, text) FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 5. RPCS DE OTP, LOGIN BCRYPT Y PERFIL CON HISTORIAL (F-01, F-11, F-13)
-- ----------------------------------------------------------------------------

-- Uso exclusivo de Edge Function con service_role
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
  v_prev public.auth_otps;
BEGIN
  IF NOT public.es_correo_institucional(v_correo) THEN
    RAISE EXCEPTION 'Acceso restringido: Solo se admiten correos institucionales oficiales (@unitec.edu o @unitec.edu.hn).';
  END IF;

  SELECT * INTO v_prev FROM public.auth_otps WHERE correo = v_correo;
  IF FOUND AND v_prev.ultimo_envio_en > now() - interval '45 seconds' THEN
    RAISE EXCEPTION 'Ya se envió un código recientemente. Espera 45 segundos antes de solicitar otro.';
  END IF;

  INSERT INTO public.auth_otps (correo, otp_hash, expira_en, intentos, origen_servidor, ultimo_envio_en)
  VALUES (v_correo, crypt(trim(p_codigo), gen_salt('bf', 8)), now() + interval '10 minutes', 0, true, now())
  ON CONFLICT (correo) DO UPDATE
  SET otp_hash = EXCLUDED.otp_hash,
      expira_en = EXCLUDED.expira_en,
      intentos = 0,
      origen_servidor = true,
      ultimo_envio_en = now();

  RETURN jsonb_build_object('ok', true, 'expiraEnMinutos', 10);
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_registrar_otp_servidor(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_registrar_otp_servidor(text, text) TO service_role;

-- Respaldo controlado cuando EmailJS requiere envío desde navegador pero registra hash y límites en servidor
CREATE OR REPLACE FUNCTION public.rpc_registrar_otp_cliente(
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
  v_prev public.auth_otps;
  v_admin_ya_registrado boolean;
BEGIN
  IF NOT public.es_correo_institucional(v_correo) THEN
    RAISE EXCEPTION 'Acceso restringido: Solo se admiten correos institucionales oficiales (@unitec.edu o @unitec.edu.hn).';
  END IF;

  IF p_codigo IS NULL OR trim(p_codigo) !~ '^[0-9]{6}$' OR trim(p_codigo) = '123456' THEN
    RAISE EXCEPTION 'Código de verificación generado inválido.';
  END IF;

  -- Proteger cuentas de Administrador que ya tienen contraseña establecida frente a restablecimiento desde cliente
  IF public.es_admin_oficial(v_correo) THEN
    SELECT EXISTS (
      SELECT 1 FROM public.usuarios WHERE lower(correo) = v_correo AND coalesce(password_hash, '') <> ''
    ) INTO v_admin_ya_registrado;

    IF v_admin_ya_registrado THEN
      RAISE EXCEPTION 'Esta cuenta administrativa ya tiene contraseña activa. Ingresa en la pestaña «Iniciar sesión» o habilita Private Key en EmailJS para recuperación desde servidor.';
    END IF;
  END IF;

  SELECT * INTO v_prev FROM public.auth_otps WHERE correo = v_correo;
  IF FOUND AND v_prev.ultimo_envio_en > now() - interval '45 seconds' THEN
    RAISE EXCEPTION 'Ya se solicitó un código recientemente. Espera 45 segundos antes de pedir uno nuevo.';
  END IF;

  INSERT INTO public.auth_otps (correo, otp_hash, expira_en, intentos, origen_servidor, ultimo_envio_en)
  VALUES (v_correo, crypt(trim(p_codigo), gen_salt('bf', 8)), now() + interval '10 minutes', 0, false, now())
  ON CONFLICT (correo) DO UPDATE
  SET otp_hash = EXCLUDED.otp_hash,
      expira_en = EXCLUDED.expira_en,
      intentos = 0,
      origen_servidor = false,
      ultimo_envio_en = now();

  RETURN jsonb_build_object('ok', true, 'expiraEnMinutos', 10);
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_obtener_metricas_email()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_data jsonb;
BEGIN
  SELECT data INTO v_data FROM public.configuracion WHERE id = 'email_metricas';
  RETURN COALESCE(v_data, jsonb_build_object('cuenta1_envios', 25, 'cuenta2_envios', 1, 'limite_rotacion', 180));
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_registrar_envio_email(p_proveedor_key text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_data jsonb;
BEGIN
  IF p_proveedor_key NOT IN ('cuenta1', 'cuenta2') THEN
    RAISE EXCEPTION 'Proveedor de correo inválido.';
  END IF;

  -- Solo contabilizar si existe un OTP recién emitido en los últimos 60 segundos
  IF NOT EXISTS (
    SELECT 1 FROM public.auth_otps WHERE ultimo_envio_en > now() - interval '60 seconds'
  ) THEN
    SELECT data INTO v_data FROM public.configuracion WHERE id = 'email_metricas';
    RETURN COALESCE(v_data, jsonb_build_object('cuenta1_envios', 25, 'cuenta2_envios', 1, 'limite_rotacion', 180));
  END IF;

  SELECT data INTO v_data FROM public.configuracion WHERE id = 'email_metricas' FOR UPDATE;
  v_data := COALESCE(v_data, jsonb_build_object('cuenta1_envios', 25, 'cuenta2_envios', 1, 'limite_rotacion', 180));

  IF p_proveedor_key = 'cuenta1' THEN
    v_data := jsonb_set(v_data, '{cuenta1_envios}', to_jsonb(coalesce((v_data->>'cuenta1_envios')::int, 0) + 1));
  ELSE
    v_data := jsonb_set(v_data, '{cuenta2_envios}', to_jsonb(coalesce((v_data->>'cuenta2_envios')::int, 0) + 1));
  END IF;

  v_data := v_data || jsonb_build_object('ultimo_proveedor', p_proveedor_key, 'ultimo_envio', now());

  INSERT INTO public.configuracion (id, data, actualizado_en)
  VALUES ('email_metricas', v_data, now())
  ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, actualizado_en = now();

  RETURN v_data;
END;
$$;

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
BEGIN
  IF NOT public.es_correo_institucional(v_correo) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Solo se admiten correos institucionales (@unitec.edu o @unitec.edu.hn).');
  END IF;

  IF p_password IS NULL OR length(p_password) < 8 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'La contraseña debe tener al menos 8 caracteres.');
  END IF;

  IF v_codigo = '' OR v_codigo = '123456' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'El código ingresado es inválido. Revisa el código enviado a tu correo institucional.');
  END IF;

  SELECT * INTO v_otp FROM public.auth_otps WHERE correo = v_correo FOR UPDATE;
  IF NOT FOUND OR v_otp.otp_hash = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No hay ningún código de verificación activo para este correo. Solicita uno nuevo.');
  END IF;

  IF v_otp.expira_en <= now() THEN
    UPDATE public.auth_otps SET otp_hash = '', expira_en = to_timestamp(0) WHERE correo = v_correo;
    RETURN jsonb_build_object('ok', false, 'error', 'El código de verificación ha expirado (10 min). Solicita uno nuevo.');
  END IF;

  IF v_otp.intentos >= 5 THEN
    UPDATE public.auth_otps SET otp_hash = '', expira_en = to_timestamp(0) WHERE correo = v_correo;
    RETURN jsonb_build_object('ok', false, 'error', 'Se superó el máximo de 5 intentos para este código. Solicita uno nuevo.');
  END IF;

  IF v_otp.otp_hash <> crypt(v_codigo, v_otp.otp_hash) THEN
    UPDATE public.auth_otps SET intentos = intentos + 1 WHERE correo = v_correo;
    RETURN jsonb_build_object(
      'ok', false,
      'error', format('Código incorrecto. Intentos restantes: %s.', GREATEST(0, 4 - v_otp.intentos))
    );
  END IF;

  -- Consumir el OTP de un solo uso antes de guardar la cuenta
  UPDATE public.auth_otps SET otp_hash = '', expira_en = to_timestamp(0) WHERE correo = v_correo;

  INSERT INTO public.usuarios (correo, password_hash, intentos_login, bloqueado_hasta, actualizado_en)
  VALUES (v_correo, crypt(p_password, gen_salt('bf', 10)), 0, NULL, now())
  ON CONFLICT (correo) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      intentos_login = 0,
      bloqueado_hasta = NULL,
      actualizado_en = now()
  RETURNING * INTO v_user;

  v_sesion := public.emitir_sesion_interna(v_user.usuario_id, v_user.correo, coalesce(v_user.nombre, ''));

  RETURN jsonb_build_object('ok', true, 'sesion', v_sesion);
END;
$$;

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
  v_ok boolean := false;
  v_sesion jsonb;
BEGIN
  IF v_correo = '' OR coalesce(p_password, '') = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Ingresa tu correo institucional y tu contraseña.');
  END IF;

  SELECT * INTO v_user FROM public.usuarios WHERE lower(correo) = v_correo FOR UPDATE;
  IF NOT FOUND OR coalesce(v_user.password_hash, '') = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No encontramos una cuenta con contraseña para este correo. Usa «Crear cuenta / Olvidé mi contraseña».');
  END IF;

  IF v_user.bloqueado_hasta IS NOT NULL AND v_user.bloqueado_hasta > now() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Cuenta temporalmente protegida tras varios intentos fallidos. Intenta de nuevo en unos minutos.');
  END IF;

  IF left(v_user.password_hash, 2) = '$2' THEN
    v_ok := (v_user.password_hash = crypt(p_password, v_user.password_hash));
  ELSE
    -- Compatibilidad y migración transparente en caliente desde SHA-256 legado a bcrypt factor 10
    v_ok := (
      v_user.password_hash = encode(
        digest(convert_to('mecafut2026|' || v_correo || '|' || p_password, 'UTF8'), 'sha256'),
        'hex'
      )
    );
    IF v_ok THEN
      UPDATE public.usuarios
      SET password_hash = crypt(p_password, gen_salt('bf', 10)),
          actualizado_en = now()
      WHERE usuario_id = v_user.usuario_id;
    END IF;
  END IF;

  IF NOT v_ok THEN
    UPDATE public.usuarios
    SET intentos_login = intentos_login + 1,
        bloqueado_hasta = CASE WHEN intentos_login + 1 >= 5 THEN now() + interval '10 minutes' ELSE NULL END
    WHERE usuario_id = v_user.usuario_id;
    RETURN jsonb_build_object('ok', false, 'error', 'Correo o contraseña incorrectos.');
  END IF;

  UPDATE public.usuarios
  SET intentos_login = 0,
      bloqueado_hasta = NULL
  WHERE usuario_id = v_user.usuario_id;

  v_sesion := public.emitir_sesion_interna(v_user.usuario_id, v_user.correo, coalesce(v_user.nombre, ''));

  RETURN jsonb_build_object(
    'ok', true,
    'sesion', v_sesion,
    'perfil', jsonb_build_object(
      'usuario_id', v_user.usuario_id,
      'correo', v_user.correo,
      'nombre', v_user.nombre,
      'cuenta', v_user.cuenta,
      'dni', v_user.dni,
      'telefono', v_user.telefono,
      'carrera', v_user.carrera,
      'foto_documento', v_user.foto_documento,
      'tipo_documento', v_user.tipo_documento
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_validar_sesion(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_ses public.auth_sesiones;
BEGIN
  v_ses := public.resolver_sesion_valida(p_token, NULL);
  RETURN jsonb_build_object(
    'ok', true,
    'sesion', jsonb_build_object(
      'token', v_ses.token,
      'usuarioId', v_ses.usuario_id,
      'correo', v_ses.correo,
      'rol', v_ses.rol,
      'esAdmin', v_ses.es_admin,
      'esDocente', v_ses.es_docente,
      'tituloRol', v_ses.titulo_rol,
      'nombre', v_ses.nombre,
      'expiraEn', v_ses.expira_en
    )
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_cerrar_sesion(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF p_token IS NOT NULL AND length(trim(p_token)) >= 32 THEN
    UPDATE public.auth_sesiones SET revocada = true WHERE token = trim(p_token);
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_obtener_perfil(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_ses public.auth_sesiones;
  v_u public.usuarios;
BEGIN
  v_ses := public.resolver_sesion_valida(p_token, NULL);
  SELECT * INTO v_u FROM public.usuarios WHERE usuario_id = v_ses.usuario_id OR lower(correo) = lower(v_ses.correo) LIMIT 1;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'usuario_id', v_u.usuario_id,
    'correo', v_u.correo,
    'nombre', v_u.nombre,
    'cuenta', v_u.cuenta,
    'dni', v_u.dni,
    'telefono', v_u.telefono,
    'carrera', v_u.carrera,
    'foto_documento', v_u.foto_documento,
    'tipo_documento', v_u.tipo_documento
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.registrar_cambio_perfil_interno(
  p_usuario_id uuid,
  p_correo text,
  p_nombre text,
  p_cuenta text,
  p_dni text,
  p_periodo text,
  p_origen text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_u public.usuarios;
  v_hubo_cambio boolean := false;
BEGIN
  SELECT * INTO v_u FROM public.usuarios WHERE usuario_id = p_usuario_id;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF v_u.nombre IS NOT NULL AND trim(v_u.nombre) <> '' AND p_nombre IS NOT NULL AND trim(p_nombre) <> ''
     AND lower(trim(v_u.nombre)) <> lower(trim(p_nombre)) THEN
    INSERT INTO public.usuarios_historial (usuario_id, correo, campo, valor_anterior, valor_nuevo, periodo, origen)
    VALUES (p_usuario_id, p_correo, 'nombre', trim(v_u.nombre), trim(p_nombre), p_periodo, p_origen);
    v_hubo_cambio := true;
  END IF;

  IF v_u.cuenta IS NOT NULL AND trim(v_u.cuenta) <> '' AND p_cuenta IS NOT NULL AND trim(p_cuenta) <> ''
     AND trim(v_u.cuenta) <> trim(p_cuenta) THEN
    INSERT INTO public.usuarios_historial (usuario_id, correo, campo, valor_anterior, valor_nuevo, periodo, origen)
    VALUES (p_usuario_id, p_correo, 'cuenta', trim(v_u.cuenta), trim(p_cuenta), p_periodo, p_origen);
    v_hubo_cambio := true;
  END IF;

  IF public.normalizar_dni(v_u.dni) <> '' AND public.normalizar_dni(p_dni) <> ''
     AND public.normalizar_dni(v_u.dni) <> public.normalizar_dni(p_dni) THEN
    INSERT INTO public.usuarios_historial (usuario_id, correo, campo, valor_anterior, valor_nuevo, periodo, origen)
    VALUES (p_usuario_id, p_correo, 'dni', trim(v_u.dni), trim(p_dni), p_periodo, p_origen);
    v_hubo_cambio := true;
  END IF;

  RETURN v_hubo_cambio;
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_cambio_perfil_interno(uuid, text, text, text, text, text, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.rpc_guardar_perfil(
  p_token text,
  p_datos jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_ses public.auth_sesiones;
  v_nombre text := nullif(trim(coalesce(p_datos->>'nombre', '')), '');
  v_cuenta text := nullif(trim(coalesce(p_datos->>'cuenta', '')), '');
  v_dni text := nullif(trim(coalesce(p_datos->>'dni', '')), '');
  v_tel text := nullif(trim(coalesce(p_datos->>'telefono', '')), '');
  v_carrera text := nullif(trim(coalesce(p_datos->>'carrera', '')), '');
  v_foto text := nullif(coalesce(p_datos->>'fotoDocumento', p_datos->>'foto_documento', ''), '');
  v_tipo_doc text := nullif(trim(coalesce(p_datos->>'tipoDocumento', p_datos->>'tipo_documento', '')), '');
  v_cambio boolean;
BEGIN
  v_ses := public.resolver_sesion_valida(p_token, NULL);

  IF v_dni = 'Exento (Docente)' THEN
    v_dni := NULL;
  END IF;

  v_cambio := public.registrar_cambio_perfil_interno(
    v_ses.usuario_id, v_ses.correo, v_nombre, v_cuenta, v_dni, 'Q4 2026', 'perfil'
  );

  UPDATE public.usuarios
  SET
    nombre = COALESCE(v_nombre, nombre),
    cuenta = COALESCE(v_cuenta, cuenta),
    dni = COALESCE(v_dni, dni),
    telefono = COALESCE(v_tel, telefono),
    carrera = COALESCE(v_carrera, carrera),
    foto_documento = COALESCE(v_foto, foto_documento),
    tipo_documento = COALESCE(v_tipo_doc, tipo_documento),
    actualizado_en = now()
  WHERE usuario_id = v_ses.usuario_id;

  IF v_cambio THEN
    UPDATE public.jugadores
    SET alerta_cambio_identidad = true
    WHERE usuario_id = v_ses.usuario_id OR lower(trim(coalesce(correo, ''))) = lower(v_ses.correo);
  END IF;

  RETURN jsonb_build_object('ok', true, 'cambioRegistrado', v_cambio);
END;
$$;

-- ----------------------------------------------------------------------------
-- 6. RPCS TRANSACCIONALES DE INSCRIPCIÓN, CONSULTA Y CARNETS (F-03, F-04, F-05, F-10, F-13)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rpc_obtener_resumen_publico(p_token text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_cfg jsonb;
  v_equipos jsonb;
  v_autenticado boolean := false;
BEGIN
  IF p_token IS NOT NULL AND length(trim(p_token)) >= 32 THEN
    PERFORM 1
    FROM public.auth_sesiones
    WHERE token = trim(p_token)
      AND NOT revocada
      AND expira_en > now();
    v_autenticado := FOUND;
  END IF;

  SELECT data INTO v_cfg FROM public.configuracion WHERE id = 'general';
  v_cfg := COALESCE(v_cfg, jsonb_build_object('inscripcionesAbiertas', true));

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', e.id,
        'nombre', e.nombre,
        'categoria', coalesce(e.categoria, 'Masculino'),
        'estado', coalesce(e.estado, 'Pendiente'),
        'color', e.color,
        'capitanNombre', e.capitan->>'nombre',
        'codigoAcceso', CASE WHEN v_autenticado THEN coalesce(e."codigoAcceso", e.codigo) ELSE NULL END
      )
      ORDER BY e.creado_en ASC
    ),
    '[]'::jsonb
  )
  INTO v_equipos
  FROM public.equipos e
  WHERE NOT e.eliminado
    AND coalesce(e.estado, 'Pendiente') <> 'Rechazado';

  RETURN jsonb_build_object(
    'config', v_cfg,
    'equiposActivos', v_equipos
  );
END;
$$;

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
  v_periodo text := 'Q4 2026';
  v_equipo jsonb := coalesce(p_payload->'equipo', '{}'::jsonb);
  v_cap jsonb := coalesce(p_payload->'capitan', '{}'::jsonb);
  v_jugs jsonb := coalesce(p_payload->'jugadores', '[]'::jsonb);
  v_comp_url text := nullif(coalesce(p_payload->>'comprobanteDataUrl', ''), '');
  v_comp_adjunto boolean := coalesce((p_payload->>'comprobanteAdjunto')::boolean, v_comp_url IS NOT NULL);
  v_nombre_eq text := trim(coalesce(v_equipo->>'nombre', ''));
  v_categoria text := coalesce(nullif(trim(v_equipo->>'categoria'), ''), 'Masculino');
  v_color text := nullif(trim(coalesce(v_equipo->>'color', '')), '');
  v_tipo_eq text := coalesce(nullif(trim(v_equipo->>'tipoEquipo'), ''), 'Estudiantes');
  v_docente_asesor text := nullif(trim(coalesce(v_equipo->>'docente', '')), '');
  v_ocupados int;
  v_uso_color int;
  v_es_docente_cap boolean;
  v_cap_nombre text := trim(coalesce(v_cap->>'nombre', ''));
  v_cap_cuenta text := trim(coalesce(v_cap->>'cuenta', ''));
  v_cap_tel text := trim(coalesce(v_cap->>'telefono', ''));
  v_cap_dni text;
  v_cap_foto text := nullif(coalesce(v_cap->>'fotoDocumento', ''), '');
  v_cap_tipo_doc text;
  v_cap_estado_carnet text;
  v_cap_estado text;
  v_alerta_cap boolean := false;
  v_total_plantilla int;
  v_nuevo_eq_id text;
  v_codigo_acceso text;
  v_cap_obj jsonb;
  v_item jsonb;
  v_idx int := 1;
  v_j_nombre text;
  v_j_cuenta text;
  v_j_correo text;
  v_j_dni text;
  v_j_foto text;
  v_j_tipo_doc text;
  v_j_estado_carnet text;
  v_j_estado text;
  v_conflicto text;
  v_cuentas_vistas text[] := ARRAY[]::text[];
  v_correos_vistos text[] := ARRAY[]::text[];
  v_dnis_vistos text[] := ARRAY[]::text[];
BEGIN
  -- Candado transaccional para impedir condiciones de carrera en cupos, colores y duplicados (F-10)
  PERFORM pg_advisory_xact_lock(hashtext('mecafut_registro_lock'));

  v_ses := public.resolver_sesion_valida(p_token, NULL);

  -- 1. Validar que las inscripciones sigan abiertas en servidor
  SELECT data INTO v_cfg FROM public.configuracion WHERE id = 'general';
  IF coalesce((v_cfg->>'inscripcionesAbiertas')::boolean, true) = false
     OR now() > '2026-11-08T23:59:59-06:00'::timestamptz THEN
    RAISE EXCEPTION 'El periodo oficial de inscripciones para MECAFUT ha finalizado o está cerrado.';
  END IF;

  IF v_nombre_eq = '' THEN
    RAISE EXCEPTION 'El nombre del equipo es obligatorio.';
  END IF;

  IF v_categoria NOT IN ('Masculino', 'Femenino') THEN
    RAISE EXCEPTION 'Categoría de torneo no válida.';
  END IF;

  -- 2. Validar cupos estrictos de categoría en servidor
  SELECT count(*) INTO v_ocupados
  FROM public.equipos
  WHERE NOT eliminado
    AND coalesce(categoria, 'Masculino') = v_categoria
    AND coalesce(estado, 'Pendiente') <> 'Rechazado';

  IF v_categoria = 'Masculino' AND v_ocupados >= 12 THEN
    RAISE EXCEPTION 'Se han agotado los 12 cupos oficiales para la categoría Masculina.';
  END IF;

  IF v_categoria = 'Femenino' AND v_ocupados >= 4 THEN
    RAISE EXCEPTION 'Se han agotado los 4 cupos oficiales para la categoría Femenina.';
  END IF;

  -- 3. Validar nombre único de equipo y límite de 2 equipos por color
  IF EXISTS (
    SELECT 1 FROM public.equipos
    WHERE NOT eliminado
      AND lower(trim(nombre)) = lower(v_nombre_eq)
      AND coalesce(estado, 'Pendiente') <> 'Rechazado'
  ) THEN
    RAISE EXCEPTION 'El nombre de equipo "%" ya fue registrado por otro grupo. Elige otro nombre.', v_nombre_eq;
  END IF;

  IF v_color IS NOT NULL THEN
    SELECT count(*) INTO v_uso_color
    FROM public.equipos
    WHERE NOT eliminado
      AND lower(trim(coalesce(color, ''))) = lower(v_color)
      AND coalesce(estado, 'Pendiente') <> 'Rechazado';
    IF v_uso_color >= 2 THEN
      RAISE EXCEPTION 'El color de uniforme "%" ya alcanzó el límite máximo de 2 equipos.', v_color;
    END IF;
  END IF;

  -- 4. Validar Capitán vinculando obligatoriamente su correo e identidad a la sesión activa (F-13)
  v_es_docente_cap := public.es_docente_oficial(v_ses.correo);
  IF NOT v_es_docente_cap AND NOT v_ses.es_admin THEN
    v_tipo_eq := 'Estudiantes';
  END IF;

  IF v_cap_nombre = '' OR v_cap_cuenta = '' THEN
    RAISE EXCEPTION 'Por favor completa el nombre y número de cuenta del Capitán.';
  END IF;

  IF length(regexp_replace(v_cap_tel, '[^0-9]', '', 'g')) < 8 THEN
    RAISE EXCEPTION 'Por favor ingresa un número de teléfono válido para el Capitán (mínimo 8 dígitos).';
  END IF;

  IF NOT v_es_docente_cap THEN
    IF public.normalizar_dni(v_cap->>'dni') = '' THEN
      RAISE EXCEPTION 'El Número de Identidad (DNI) del Capitán es obligatorio.';
    END IF;
    IF v_cap_foto IS NULL OR length(v_cap_foto) < 25 OR left(v_cap_foto, 5) <> 'data:' THEN
      RAISE EXCEPTION 'El Capitán debe adjuntar obligatoriamente la foto válida de su carnet o matrícula.';
    END IF;
    v_cap_dni := trim(v_cap->>'dni');
    v_cap_tipo_doc := coalesce(nullif(trim(v_cap->>'tipoDocumento'), ''), 'carnet');
    v_cap_estado_carnet := 'en_revision';
    v_cap_estado := 'En revisión';
  ELSE
    v_cap_dni := 'Exento (Docente)';
    v_cap_tipo_doc := 'docente';
    v_cap_estado_carnet := 'exento_docente';
    v_cap_estado := 'Aprobado';
  END IF;

  -- Unicidad cruzada para el Capitán (si no es docente autorizado)
  IF NOT v_es_docente_cap THEN
    SELECT format('%s (equipo %s)', j.nombre, coalesce(j."nombreEquipo", 'activo'))
    INTO v_conflicto
    FROM public.jugadores j
    JOIN public.equipos e ON e.id = coalesce(j.equipo_id, j."equipoId")
    WHERE NOT j.eliminado
      AND NOT e.eliminado
      AND coalesce(e.estado, 'Pendiente') <> 'Rechazado'
      AND j.periodo = v_periodo
      AND NOT (j.correo_verificado AND public.es_docente_oficial(j.correo))
      AND (
        j.usuario_id = v_ses.usuario_id
        OR j.cuenta = v_cap_cuenta
        OR lower(trim(coalesce(j.correo, ''))) = lower(v_ses.correo)
        OR (public.normalizar_dni(v_cap_dni) <> '' AND public.normalizar_dni(j.dni) = public.normalizar_dni(v_cap_dni))
      )
    LIMIT 1;

    IF v_conflicto IS NOT NULL THEN
      RAISE EXCEPTION 'El Capitán o sus credenciales (cuenta, correo o DNI) ya figuran inscritos en otro equipo activo: %.', v_conflicto;
    END IF;
  END IF;

  v_cuentas_vistas := array_append(v_cuentas_vistas, v_cap_cuenta);
  v_correos_vistos := array_append(v_correos_vistos, lower(v_ses.correo));
  IF public.normalizar_dni(v_cap_dni) <> '' THEN
    v_dnis_vistos := array_append(v_dnis_vistos, public.normalizar_dni(v_cap_dni));
  END IF;

  -- Auditar si el capitán declaró datos distintos a su perfil previo (F-13)
  v_alerta_cap := public.registrar_cambio_perfil_interno(
    v_ses.usuario_id, v_ses.correo, v_cap_nombre, v_cap_cuenta, v_cap_dni, v_periodo, 'inscripcion_capitan'
  );

  -- Contar integrantes válidos adicionales
  SELECT 1 + count(*) INTO v_total_plantilla
  FROM jsonb_array_elements(v_jugs) AS elem
  WHERE trim(coalesce(elem->>'nombre', '')) <> ''
    AND trim(coalesce(elem->>'cuenta', '')) <> '';

  IF v_total_plantilla > 15 THEN
    RAISE EXCEPTION 'El número máximo permitido es de 15 jugadores por equipo.';
  END IF;

  -- Generar identificadores únicos
  v_nuevo_eq_id := 'eq-' || (extract(epoch FROM clock_timestamp()) * 1000)::bigint::text || '-' || substr(encode(gen_random_bytes(2), 'hex'), 1, 4);
  LOOP
    v_codigo_acceso := lpad((floor(random() * 90000000) + 10000000)::bigint::text, 8, '0');
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.equipos WHERE codigo = v_codigo_acceso OR "codigoAcceso" = v_codigo_acceso);
  END LOOP;

  v_cap_obj := jsonb_build_object(
    'nombre', v_cap_nombre,
    'cuenta', v_cap_cuenta,
    'correo', v_ses.correo,
    'telefono', v_cap_tel,
    'dni', v_cap_dni,
    'tipoDocumento', v_cap_tipo_doc,
    'fotoDocumento', v_cap_foto,
    'carrera', coalesce(nullif(trim(v_cap->>'carrera'), ''), 'Ingeniería Mecatrónica'),
    'codigoClase', coalesce(nullif(trim(v_cap->>'codigoClase'), ''), 'N/A'),
    'esCapitan', true,
    'estadoCarnet', v_cap_estado_carnet,
    'estado', v_cap_estado
  );

  -- 5. Insertar equipo (forzando estado = 'Pendiente' en servidor: F-03 / F-05)
  INSERT INTO public.equipos (
    id, codigo, "codigoAcceso", nombre, "tipoEquipo", docente, categoria, color,
    capitan, capitan_usuario_id, "comprobanteAdjunto", "comprobanteDataUrl",
    estado, pago, "fechaRegistro", periodo
  ) VALUES (
    v_nuevo_eq_id, v_codigo_acceso, v_codigo_acceso, v_nombre_eq, v_tipo_eq, v_docente_asesor, v_categoria, v_color,
    v_cap_obj, v_ses.usuario_id, v_comp_adjunto, v_comp_url,
    'Pendiente', jsonb_build_object('estado', 'pendiente'), now()::text, v_periodo
  );

  -- 6. Insertar Jugador #1 (Capitán autenticado)
  INSERT INTO public.jugadores (
    id, equipo_id, "equipoId", "nombreEquipo", nombre, cuenta, correo, dni,
    tipo_documento, "tipoDocumento", foto_documento, "fotoDocumento",
    carrera, codigo_clase, "codigoClase", es_capitan, "esCapitan",
    estado, estado_carnet, usuario_id, correo_verificado, registrado_por_correo,
    periodo, alerta_cambio_identidad
  ) VALUES (
    'jug-' || v_nuevo_eq_id || '-1', v_nuevo_eq_id, v_nuevo_eq_id, v_nombre_eq,
    v_cap_nombre, v_cap_cuenta, v_ses.correo, v_cap_dni,
    v_cap_tipo_doc, v_cap_tipo_doc, v_cap_foto, v_cap_foto,
    coalesce(nullif(trim(v_cap->>'carrera'), ''), 'Ingeniería Mecatrónica'),
    coalesce(nullif(trim(v_cap->>'codigoClase'), ''), 'N/A'),
    coalesce(nullif(trim(v_cap->>'codigoClase'), ''), 'N/A'),
    true, true, v_cap_estado, v_cap_estado_carnet, v_ses.usuario_id, true, v_ses.correo,
    v_periodo, v_alerta_cap
  );

  -- 7. Validar e insertar compañeros pre-inscritos en la misma transacción (F-05 + F-13.4)
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_jugs)
  LOOP
    v_j_nombre := trim(coalesce(v_item->>'nombre', ''));
    v_j_cuenta := trim(coalesce(v_item->>'cuenta', ''));
    IF v_j_nombre = '' OR v_j_cuenta = '' THEN
      CONTINUE;
    END IF;

    v_idx := v_idx + 1;
    v_j_correo := lower(trim(coalesce(v_item->>'correo', '')));
    IF v_j_correo <> '' AND NOT public.es_correo_institucional(v_j_correo) THEN
      RAISE EXCEPTION 'El correo "%" debe pertenecer al dominio institucional (@unitec.edu o @unitec.edu.hn).', v_j_correo;
    END IF;

    IF v_j_cuenta = ANY(v_cuentas_vistas) THEN
      RAISE EXCEPTION 'Hay números de cuenta repetidos dentro de tu propia lista de jugadores (%).', v_j_cuenta;
    END IF;
    v_cuentas_vistas := array_append(v_cuentas_vistas, v_j_cuenta);

    IF v_j_correo <> '' THEN
      IF v_j_correo = ANY(v_correos_vistos) THEN
        RAISE EXCEPTION 'Hay correos institucionales repetidos dentro de tu propio equipo (%).', v_j_correo;
      END IF;
      v_correos_vistos := array_append(v_correos_vistos, v_j_correo);
    END IF;

    -- IMPORTANTE (F-13.4): Un compañero anotado por el capitán NO tiene su correo verificado aún;
    -- nunca recibe exención docente automática hasta reclamar su registro iniciando sesión él mismo.
    v_j_dni := trim(coalesce(v_item->>'dni', ''));
    IF v_j_dni = 'Exento (Docente)' THEN
      v_j_dni := '';
    END IF;

    IF public.normalizar_dni(v_j_dni) <> '' THEN
      IF public.normalizar_dni(v_j_dni) = ANY(v_dnis_vistos) THEN
        RAISE EXCEPTION 'Hay Números de Identidad (DNI) repetidos dentro de tu propia plantilla (%).', v_j_dni;
      END IF;
      v_dnis_vistos := array_append(v_dnis_vistos, public.normalizar_dni(v_j_dni));
    END IF;

    -- Unicidad cruzada frente a todos los equipos activos del periodo
    SELECT format('%s (equipo %s)', j.nombre, coalesce(j."nombreEquipo", 'activo'))
    INTO v_conflicto
    FROM public.jugadores j
    JOIN public.equipos e ON e.id = coalesce(j.equipo_id, j."equipoId")
    WHERE NOT j.eliminado
      AND NOT e.eliminado
      AND coalesce(e.estado, 'Pendiente') <> 'Rechazado'
      AND j.periodo = v_periodo
      AND NOT (j.correo_verificado AND public.es_docente_oficial(j.correo))
      AND (
        j.cuenta = v_j_cuenta
        OR (v_j_correo <> '' AND lower(trim(coalesce(j.correo, ''))) = v_j_correo AND NOT public.es_docente_oficial(v_j_correo))
        OR (public.normalizar_dni(v_j_dni) <> '' AND public.normalizar_dni(j.dni) = public.normalizar_dni(v_j_dni))
      )
    LIMIT 1;

    IF v_conflicto IS NOT NULL THEN
      RAISE EXCEPTION 'El jugador "%" (cuenta/correo/DNI) ya está registrado en otro equipo activo: %.', v_j_nombre, v_conflicto;
    END IF;

    v_j_foto := nullif(coalesce(v_item->>'fotoDocumento', ''), '');
    v_j_tipo_doc := coalesce(nullif(trim(v_item->>'tipoDocumento'), ''), 'carnet');
    IF v_j_foto IS NOT NULL AND length(v_j_foto) >= 25 AND left(v_j_foto, 5) = 'data:' THEN
      v_j_estado_carnet := 'en_revision';
      v_j_estado := 'En revisión';
    ELSE
      v_j_foto := NULL;
      v_j_estado_carnet := 'pendiente';
      v_j_estado := 'Pendiente';
    END IF;

    INSERT INTO public.jugadores (
      id, equipo_id, "equipoId", "nombreEquipo", nombre, cuenta, correo, dni,
      tipo_documento, "tipoDocumento", foto_documento, "fotoDocumento",
      carrera, codigo_clase, "codigoClase", es_capitan, "esCapitan",
      estado, estado_carnet, usuario_id, correo_verificado, registrado_por_correo, periodo
    ) VALUES (
      'jug-' || v_nuevo_eq_id || '-' || v_idx::text,
      v_nuevo_eq_id, v_nuevo_eq_id, v_nombre_eq,
      v_j_nombre, v_j_cuenta, v_j_correo, v_j_dni,
      v_j_tipo_doc, v_j_tipo_doc, v_j_foto, v_j_foto,
      coalesce(nullif(trim(v_item->>'carrera'), ''), 'Ingeniería Mecatrónica'),
      coalesce(nullif(trim(v_item->>'codigoClase'), ''), 'N/A'),
      coalesce(nullif(trim(v_item->>'codigoClase'), ''), 'N/A'),
      false, false, v_j_estado, v_j_estado_carnet, NULL, false, v_ses.correo, v_periodo
    );
  END LOOP;

  RETURN jsonb_build_object(
    'codigoAcceso', v_codigo_acceso,
    'equipoId', v_nuevo_eq_id,
    'estado', 'Pendiente',
    'modo', 'supabase'
  );
END;
$$;

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
  v_codigo text := trim(coalesce(p_codigo, ''));
  v_eq public.equipos;
  v_es_privilegiado boolean;
  v_eq_json jsonb;
  v_jugs_json jsonb;
BEGIN
  v_ses := public.resolver_sesion_valida(p_token, NULL);

  IF v_codigo = '' THEN
    RAISE EXCEPTION 'Ingresa un código de acceso válido.';
  END IF;

  SELECT * INTO v_eq
  FROM public.equipos
  WHERE NOT eliminado
    AND ("codigoAcceso" = v_codigo OR codigo = v_codigo)
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No se encontró ningún equipo con ese código de acceso.';
  END IF;

  v_es_privilegiado := (v_ses.rol = 'admin')
    OR (v_eq.capitan_usuario_id IS NOT NULL AND v_eq.capitan_usuario_id = v_ses.usuario_id)
    OR (lower(trim(coalesce(v_eq.capitan->>'correo', ''))) = lower(v_ses.correo));

  v_eq_json := jsonb_build_object(
    'id', v_eq.id,
    'nombre', v_eq.nombre,
    'tipoEquipo', v_eq."tipoEquipo",
    'docente', v_eq.docente,
    'categoria', v_eq.categoria,
    'color', v_eq.color,
    'estado', v_eq.estado,
    'codigoAcceso', coalesce(v_eq."codigoAcceso", v_eq.codigo),
    'comprobanteAdjunto', v_eq."comprobanteAdjunto",
    'comprobanteDataUrl', CASE WHEN v_es_privilegiado THEN v_eq."comprobanteDataUrl" ELSE NULL END,
    'fechaRegistro', v_eq."fechaRegistro",
    'capitan', jsonb_build_object(
      'nombre', v_eq.capitan->>'nombre',
      'telefono', CASE WHEN v_es_privilegiado THEN v_eq.capitan->>'telefono' ELSE NULL END,
      'correo', CASE WHEN v_es_privilegiado THEN v_eq.capitan->>'correo' ELSE NULL END,
      'esPropioCapitan', v_es_privilegiado AND v_ses.rol <> 'admin'
    )
  );

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', j.id,
        'equipoId', coalesce(j."equipoId", j.equipo_id),
        'nombreEquipo', j."nombreEquipo",
        'nombre', j.nombre,
        'cuenta', j.cuenta,
        'correo', CASE
          WHEN v_es_privilegiado OR lower(coalesce(j.correo, '')) = lower(v_ses.correo) THEN j.correo
          ELSE ''
        END,
        'dni', CASE
          WHEN v_es_privilegiado OR lower(coalesce(j.correo, '')) = lower(v_ses.correo) THEN j.dni
          ELSE public.enmascarar_dni(j.dni)
        END,
        'tipoDocumento', coalesce(j."tipoDocumento", j.tipo_documento, 'carnet'),
        'fotoDocumento', CASE
          WHEN v_es_privilegiado OR lower(coalesce(j.correo, '')) = lower(v_ses.correo)
            THEN coalesce(j."fotoDocumento", j.foto_documento)
          ELSE NULL
        END,
        'tieneFoto', coalesce(j."fotoDocumento", j.foto_documento, '') <> '',
        'carrera', j.carrera,
        'esCapitan', coalesce(j."esCapitan", j.es_capitan, false),
        'correoVerificado', j.correo_verificado,
        'estadoCarnet', j.estado_carnet,
        'motivoRechazo', CASE
          WHEN v_es_privilegiado OR lower(coalesce(j.correo, '')) = lower(v_ses.correo) THEN j.motivo_rechazo
          ELSE NULL
        END,
        'estado', j.estado
      )
      ORDER BY coalesce(j."esCapitan", j.es_capitan, false) DESC, j.creado_en ASC
    ),
    '[]'::jsonb
  )
  INTO v_jugs_json
  FROM public.jugadores j
  WHERE NOT j.eliminado
    AND (j.equipo_id = v_eq.id OR j."equipoId" = v_eq.id);

  RETURN jsonb_build_object(
    'equipo', v_eq_json,
    'jugadores', v_jugs_json,
    'permisos', jsonb_build_object('esCapitanOAdmin', v_es_privilegiado),
    'modo', 'supabase'
  );
END;
$$;

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
  v_cfg jsonb;
  v_eq public.equipos;
  v_es_capitan_o_admin boolean;
  v_cant int;
  v_nombre text := trim(coalesce(p_jugador->>'nombre', ''));
  v_cuenta text := trim(coalesce(p_jugador->>'cuenta', ''));
  v_correo text;
  v_usuario_id uuid := NULL;
  v_correo_verif boolean := false;
  v_es_docente boolean := false;
  v_dni text;
  v_foto text := nullif(coalesce(p_jugador->>'fotoDocumento', ''), '');
  v_tipo_doc text := coalesce(nullif(trim(p_jugador->>'tipoDocumento'), ''), 'carnet');
  v_estado_carnet text;
  v_estado text;
  v_alerta boolean := false;
  v_conflicto text;
  v_nuevo_id text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('mecafut_registro_lock'));

  v_ses := public.resolver_sesion_valida(p_token, NULL);

  SELECT * INTO v_eq
  FROM public.equipos
  WHERE NOT eliminado
    AND ("codigoAcceso" = trim(coalesce(p_codigo, '')) OR codigo = trim(coalesce(p_codigo, '')))
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No se encontró ningún equipo con ese código de acceso.';
  END IF;

  IF v_eq.estado = 'Rechazado' THEN
    RAISE EXCEPTION 'Este equipo se encuentra en estado Rechazado y no admite nuevos integrantes.';
  END IF;

  -- Si no es auto-registro, exigir que sea el Capitán verificado del equipo o un Admin
  v_es_capitan_o_admin := (v_ses.rol = 'admin')
    OR (v_eq.capitan_usuario_id IS NOT NULL AND v_eq.capitan_usuario_id = v_ses.usuario_id)
    OR (lower(trim(coalesce(v_eq.capitan->>'correo', ''))) = lower(v_ses.correo));

  IF NOT p_es_auto_registro AND NOT v_es_capitan_o_admin THEN
    RAISE EXCEPTION 'Solo el Capitán del equipo o un Administrador puede agregar integrantes manualmente.';
  END IF;

  IF v_ses.rol <> 'admin' THEN
    SELECT data INTO v_cfg FROM public.configuracion WHERE id = 'general';
    IF coalesce((v_cfg->>'inscripcionesAbiertas')::boolean, true) = false
       OR now() > '2026-11-08T23:59:59-06:00'::timestamptz THEN
      RAISE EXCEPTION 'El periodo oficial de inscripciones está cerrado.';
    END IF;
  END IF;

  SELECT count(*) INTO v_cant
  FROM public.jugadores
  WHERE NOT eliminado
    AND (equipo_id = v_eq.id OR "equipoId" = v_eq.id);

  IF v_cant >= 15 THEN
    RAISE EXCEPTION 'El equipo ya alcanzó el límite reglamentario de 15 jugadores.';
  END IF;

  IF v_nombre = '' OR v_cuenta = '' THEN
    RAISE EXCEPTION 'El nombre completo y número de cuenta son obligatorios.';
  END IF;

  IF p_es_auto_registro THEN
    -- Forzar identidad autenticada del servidor (F-13)
    v_correo := lower(v_ses.correo);
    v_usuario_id := v_ses.usuario_id;
    v_correo_verif := true;
    v_es_docente := public.es_docente_oficial(v_correo);
  ELSE
    v_correo := lower(trim(coalesce(p_jugador->>'correo', '')));
    IF v_correo <> '' AND NOT public.es_correo_institucional(v_correo) THEN
      RAISE EXCEPTION 'El correo debe ser institucional (@unitec.edu o @unitec.edu.hn).';
    END IF;
    -- Sin sesión propia del compañero, jamás se conceden privilegios docentes automáticos
    v_es_docente := false;
  END IF;

  IF v_es_docente THEN
    v_dni := 'Exento (Docente)';
    v_tipo_doc := 'docente';
    v_estado_carnet := 'exento_docente';
    v_estado := 'Aprobado';
  ELSE
    v_dni := trim(coalesce(p_jugador->>'dni', ''));
    IF public.normalizar_dni(v_dni) = '' THEN
      RAISE EXCEPTION 'El Número de Identidad (DNI) es obligatorio para el registro de estudiantes.';
    END IF;
    IF p_es_auto_registro AND (v_foto IS NULL OR length(v_foto) < 25 OR left(v_foto, 5) <> 'data:') THEN
      RAISE EXCEPTION 'Debes adjuntar obligatoriamente la foto válida de tu carnet universitario o matrícula.';
    END IF;
    IF v_foto IS NOT NULL AND length(v_foto) >= 25 AND left(v_foto, 5) = 'data:' THEN
      v_estado_carnet := CASE WHEN v_ses.rol = 'admin' THEN 'verificado' ELSE 'en_revision' END;
      v_estado := CASE WHEN v_ses.rol = 'admin' THEN 'Aprobado' ELSE 'En revisión' END;
    ELSE
      v_foto := NULL;
      v_estado_carnet := 'pendiente';
      v_estado := 'Pendiente';
    END IF;
  END IF;

  -- Unicidad dentro del mismo equipo (incluso para docentes)
  IF EXISTS (
    SELECT 1 FROM public.jugadores
    WHERE (equipo_id = v_eq.id OR "equipoId" = v_eq.id)
      AND (
        cuenta = v_cuenta
        OR (v_correo <> '' AND lower(trim(coalesce(correo, ''))) = v_correo)
        OR (NOT v_es_docente AND public.normalizar_dni(v_dni) <> '' AND public.normalizar_dni(dni) = public.normalizar_dni(v_dni))
      )
  ) THEN
    RAISE EXCEPTION 'Este jugador (cuenta, correo o DNI) ya forma parte de la plantilla de este equipo.';
  END IF;

  -- Unicidad cruzada frente a todos los demás equipos activos para no-docentes
  IF NOT v_es_docente THEN
    SELECT format('%s (equipo %s)', j.nombre, coalesce(j."nombreEquipo", 'activo'))
    INTO v_conflicto
    FROM public.jugadores j
    JOIN public.equipos e ON e.id = coalesce(j.equipo_id, j."equipoId")
    WHERE NOT j.eliminado
      AND NOT e.eliminado
      AND coalesce(e.estado, 'Pendiente') <> 'Rechazado'
      AND j.periodo = v_eq.periodo
      AND NOT (j.correo_verificado AND public.es_docente_oficial(j.correo))
      AND (
        (v_usuario_id IS NOT NULL AND j.usuario_id = v_usuario_id)
        OR j.cuenta = v_cuenta
        OR (v_correo <> '' AND lower(trim(coalesce(j.correo, ''))) = v_correo AND NOT public.es_docente_oficial(v_correo))
        OR (public.normalizar_dni(v_dni) <> '' AND public.normalizar_dni(j.dni) = public.normalizar_dni(v_dni))
      )
    LIMIT 1;

    IF v_conflicto IS NOT NULL THEN
      RAISE EXCEPTION 'Este participante (cuenta, correo o DNI) ya está inscrito en otro equipo activo: %.', v_conflicto;
    END IF;
  END IF;

  IF p_es_auto_registro AND v_usuario_id IS NOT NULL THEN
    v_alerta := public.registrar_cambio_perfil_interno(
      v_usuario_id, v_correo, v_nombre, v_cuenta, v_dni, v_eq.periodo, 'auto_registro_jugador'
    );
  END IF;

  v_nuevo_id := 'jug-' || v_eq.id || '-' || (extract(epoch FROM clock_timestamp()) * 1000)::bigint::text;

  INSERT INTO public.jugadores (
    id, equipo_id, "equipoId", "nombreEquipo", nombre, cuenta, correo, dni,
    tipo_documento, "tipoDocumento", foto_documento, "fotoDocumento",
    carrera, codigo_clase, "codigoClase", es_capitan, "esCapitan",
    estado, estado_carnet, verificado_por, verificado_en,
    usuario_id, correo_verificado, registrado_por_correo, periodo, alerta_cambio_identidad
  ) VALUES (
    v_nuevo_id, v_eq.id, v_eq.id, v_eq.nombre, v_nombre, v_cuenta, v_correo, v_dni,
    v_tipo_doc, v_tipo_doc, v_foto, v_foto,
    coalesce(nullif(trim(p_jugador->>'carrera'), ''), 'Ingeniería Mecatrónica'),
    coalesce(nullif(trim(p_jugador->>'codigoClase'), ''), 'N/A'),
    coalesce(nullif(trim(p_jugador->>'codigoClase'), ''), 'N/A'),
    false, false, v_estado, v_estado_carnet,
    CASE WHEN v_estado_carnet = 'verificado' THEN v_ses.correo ELSE NULL END,
    CASE WHEN v_estado_carnet = 'verificado' THEN now() ELSE NULL END,
    v_usuario_id, v_correo_verif, v_ses.correo, v_eq.periodo, v_alerta
  );

  RETURN public.rpc_buscar_equipo_por_codigo(p_token, p_codigo);
END;
$$;

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
  v_autorizado boolean;
BEGIN
  v_ses := public.resolver_sesion_valida(p_token, NULL);

  SELECT * INTO v_eq
  FROM public.equipos
  WHERE "codigoAcceso" = trim(coalesce(p_codigo, '')) OR codigo = trim(coalesce(p_codigo, ''))
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Equipo no encontrado.';
  END IF;

  v_autorizado := (v_ses.rol = 'admin')
    OR (v_eq.capitan_usuario_id IS NOT NULL AND v_eq.capitan_usuario_id = v_ses.usuario_id)
    OR (lower(trim(coalesce(v_eq.capitan->>'correo', ''))) = lower(v_ses.correo));

  IF NOT v_autorizado THEN
    RAISE EXCEPTION 'Solo el Capitán verificado del equipo o un Administrador puede expulsar integrantes.';
  END IF;

  SELECT * INTO v_jug
  FROM public.jugadores
  WHERE id = p_jugador_id AND NOT eliminado AND (equipo_id = v_eq.id OR "equipoId" = v_eq.id);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El jugador no fue encontrado en la plantilla de este equipo.';
  END IF;

  IF coalesce(v_jug."esCapitan", v_jug.es_capitan, false) THEN
    RAISE EXCEPTION 'El Capitán es el fundador del equipo y no puede ser expulsado.';
  END IF;

  UPDATE public.jugadores SET eliminado = true WHERE id = p_jugador_id;

  RETURN public.rpc_buscar_equipo_por_codigo(p_token, p_codigo);
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_obtener_perfil_pendiente(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_ses public.auth_sesiones;
  v_j public.jugadores;
BEGIN
  v_ses := public.resolver_sesion_valida(p_token, NULL);

  IF public.es_docente_oficial(v_ses.correo) THEN
    RETURN NULL;
  END IF;

  SELECT j.* INTO v_j
  FROM public.jugadores j
  JOIN public.equipos e ON e.id = coalesce(j.equipo_id, j."equipoId")
  WHERE NOT j.eliminado
      AND NOT e.eliminado
      AND coalesce(e.estado, 'Pendiente') <> 'Rechazado'
    AND lower(trim(coalesce(j.correo, ''))) = lower(v_ses.correo)
    AND (
      j.estado_carnet IN ('pendiente', 'rechazado')
      OR coalesce(j.foto_documento, j."fotoDocumento", '') = ''
      OR public.normalizar_dni(j.dni) = ''
    )
  ORDER BY j.creado_en DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'id', v_j.id,
    'equipoId', coalesce(v_j."equipoId", v_j.equipo_id),
    'nombreEquipo', v_j."nombreEquipo",
    'nombre', v_j.nombre,
    'cuenta', v_j.cuenta,
    'dni', v_j.dni,
    'tipoDocumento', coalesce(v_j."tipoDocumento", v_j.tipo_documento, 'carnet'),
    'estadoCarnet', v_j.estado_carnet,
    'motivoRechazo', v_j.motivo_rechazo
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_actualizar_documento_jugador(
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
  v_jug_id text := trim(coalesce(p_payload->>'jugadorId', ''));
  v_dni text := nullif(trim(coalesce(p_payload->>'dni', '')), '');
  v_tipo text := nullif(trim(coalesce(p_payload->>'tipoDocumento', '')), '');
  v_foto text := nullif(coalesce(p_payload->>'fotoDocumento', ''), '');
  v_cuenta text := nullif(trim(coalesce(p_payload->>'cuenta', '')), '');
  v_j public.jugadores;
  v_eq public.equipos;
  v_es_propio boolean;
  v_es_capitan boolean;
  v_nuevo_estado_carnet text;
  v_nuevo_estado text;
BEGIN
  v_ses := public.resolver_sesion_valida(p_token, NULL);

  SELECT * INTO v_j FROM public.jugadores WHERE id = v_jug_id AND NOT eliminado FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Jugador no encontrado.';
  END IF;

  SELECT * INTO v_eq FROM public.equipos WHERE id = coalesce(v_j.equipo_id, v_j."equipoId");

  v_es_propio := lower(trim(coalesce(v_j.correo, ''))) = lower(v_ses.correo)
                 OR (v_j.usuario_id IS NOT NULL AND v_j.usuario_id = v_ses.usuario_id);
  v_es_capitan := FOUND AND (
    (v_eq.capitan_usuario_id IS NOT NULL AND v_eq.capitan_usuario_id = v_ses.usuario_id)
    OR lower(trim(coalesce(v_eq.capitan->>'correo', ''))) = lower(v_ses.correo)
  );

  IF v_ses.rol <> 'admin' AND NOT v_es_propio AND NOT v_es_capitan THEN
    RAISE EXCEPTION 'No tienes autorización para modificar el documento de este jugador.';
  END IF;

  IF v_foto IS NOT NULL AND (length(v_foto) < 25 OR left(v_foto, 5) <> 'data:') THEN
    RAISE EXCEPTION 'El archivo de imagen o documento adjunto no es válido.';
  END IF;

  IF v_dni IS NOT NULL AND NOT (v_j.correo_verificado AND public.es_docente_oficial(v_j.correo)) THEN
    IF EXISTS (
      SELECT 1
      FROM public.jugadores j2
      JOIN public.equipos e2 ON e2.id = coalesce(j2.equipo_id, j2."equipoId")
      WHERE j2.id <> v_j.id
        AND coalesce(e2.estado, 'Pendiente') <> 'Rechazado'
        AND j2.periodo = v_j.periodo
        AND public.normalizar_dni(j2.dni) = public.normalizar_dni(v_dni)
    ) THEN
      RAISE EXCEPTION 'Este Número de Identidad (DNI) ya se encuentra registrado en otro jugador activo.';
    END IF;
  END IF;

  IF v_foto IS NOT NULL THEN
    IF v_ses.rol = 'admin' THEN
      v_nuevo_estado_carnet := 'verificado';
      v_nuevo_estado := 'Aprobado';
    ELSE
      v_nuevo_estado_carnet := 'en_revision';
      v_nuevo_estado := 'En revisión';
    END IF;
  ELSE
    v_nuevo_estado_carnet := v_j.estado_carnet;
    v_nuevo_estado := v_j.estado;
  END IF;

  UPDATE public.jugadores
  SET
    dni = COALESCE(v_dni, dni),
    tipo_documento = COALESCE(v_tipo, tipo_documento),
    "tipoDocumento" = COALESCE(v_tipo, "tipoDocumento"),
    foto_documento = COALESCE(v_foto, foto_documento),
    "fotoDocumento" = COALESCE(v_foto, "fotoDocumento"),
    cuenta = CASE WHEN v_ses.rol = 'admin' AND v_cuenta IS NOT NULL THEN v_cuenta ELSE cuenta END,
    estado_carnet = v_nuevo_estado_carnet,
    estado = v_nuevo_estado,
    verificado_por = CASE WHEN v_foto IS NOT NULL AND v_ses.rol = 'admin' THEN v_ses.correo WHEN v_foto IS NOT NULL THEN NULL ELSE verificado_por END,
    verificado_en = CASE WHEN v_foto IS NOT NULL AND v_ses.rol = 'admin' THEN now() WHEN v_foto IS NOT NULL THEN NULL ELSE verificado_en END,
    motivo_rechazo = CASE WHEN v_foto IS NOT NULL THEN NULL ELSE motivo_rechazo END,
    usuario_id = CASE WHEN v_es_propio THEN COALESCE(usuario_id, v_ses.usuario_id) ELSE usuario_id END,
    correo_verificado = CASE WHEN v_es_propio THEN true ELSE correo_verificado END
  WHERE id = v_jug_id;

  RETURN jsonb_build_object(
    'ok', true,
    'estadoCarnet', v_nuevo_estado_carnet,
    'estado', v_nuevo_estado
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 7. RPCS ADMINISTRATIVAS PROTEGIDAS EN SERVIDOR (F-02, F-04, F-06)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rpc_obtener_datos_admin(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_ses public.auth_sesiones;
  v_jugadores jsonb;
  v_equipos jsonb;
  v_cfg jsonb;
  v_torneo jsonb;
BEGIN
  v_ses := public.resolver_sesion_valida(p_token, 'admin');

  SELECT COALESCE(
    jsonb_agg(
      to_jsonb(j) || jsonb_build_object(
        'equipoId', coalesce(j."equipoId", j.equipo_id),
        'fotoDocumento', coalesce(j."fotoDocumento", j.foto_documento),
        'tipoDocumento', coalesce(j."tipoDocumento", j.tipo_documento, 'carnet'),
        'esCapitan', coalesce(j."esCapitan", j.es_capitan, false),
        'estadoCarnet', j.estado_carnet,
        'correoVerificado', j.correo_verificado,
        'verificadoPor', j.verificado_por,
        'verificadoEn', j.verificado_en,
        'motivoRechazo', j.motivo_rechazo,
        'alertaCambioIdentidad', j.alerta_cambio_identidad,
        'historialCambios', COALESCE((
          SELECT jsonb_agg(
            jsonb_build_object(
              'campo', h.campo,
              'valorAnterior', h.valor_anterior,
              'valorNuevo', h.valor_nuevo,
              'periodo', h.periodo,
              'origen', h.origen,
              'fecha', h.creado_en
            )
            ORDER BY h.creado_en DESC
          )
          FROM public.usuarios_historial h
          WHERE (j.usuario_id IS NOT NULL AND h.usuario_id = j.usuario_id)
             OR (coalesce(j.correo, '') <> '' AND lower(h.correo) = lower(j.correo))
        ), '[]'::jsonb)
      )
      ORDER BY j.creado_en ASC
    ),
    '[]'::jsonb
  ) INTO v_jugadores
  FROM public.jugadores j
  WHERE NOT j.eliminado;

  SELECT COALESCE(jsonb_agg(to_jsonb(e) ORDER BY e.creado_en ASC), '[]'::jsonb)
  INTO v_equipos
  FROM public.equipos e
  WHERE NOT e.eliminado;

  SELECT data INTO v_cfg FROM public.configuracion WHERE id = 'general';
  SELECT data INTO v_torneo FROM public.configuracion WHERE id = 'torneo';

  RETURN jsonb_build_object(
    'jugadores', v_jugadores,
    'equipos', v_equipos,
    'configuracion', COALESCE(v_cfg, jsonb_build_object('inscripcionesAbiertas', true)),
    'torneo', v_torneo,
    'adminAutenticado', v_ses.correo,
    'modo', 'supabase'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_revisar_carnet_admin(
  p_token text,
  p_jugador_id text,
  p_decision text,
  p_motivo text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_ses public.auth_sesiones;
  v_j public.jugadores;
  v_nuevo_estado text;
BEGIN
  v_ses := public.resolver_sesion_valida(p_token, 'admin');

  IF p_decision NOT IN ('verificado', 'rechazado') THEN
    RAISE EXCEPTION 'Decisión de revisión inválida.';
  END IF;

  SELECT * INTO v_j FROM public.jugadores WHERE id = p_jugador_id AND NOT eliminado FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Jugador no encontrado.';
  END IF;

  IF p_decision = 'verificado' AND coalesce(v_j.foto_documento, v_j."fotoDocumento", '') = ''
     AND NOT (v_j.correo_verificado AND public.es_docente_oficial(v_j.correo)) THEN
    RAISE EXCEPTION 'No se puede verificar un jugador que aún no tiene foto de carnet adjunta.';
  END IF;

  v_nuevo_estado := CASE WHEN p_decision = 'verificado' THEN 'Aprobado' ELSE 'Rechazado' END;

  UPDATE public.jugadores
  SET
    estado_carnet = p_decision,
    estado = v_nuevo_estado,
    verificado_por = v_ses.correo,
    verificado_en = now(),
    motivo_rechazo = CASE WHEN p_decision = 'rechazado' THEN coalesce(nullif(trim(p_motivo), ''), 'Documento ilegible o incompleto. Vuelve a subir tu carnet.') ELSE NULL END
  WHERE id = p_jugador_id;

  RETURN jsonb_build_object(
    'ok', true,
    'estadoCarnet', p_decision,
    'estado', v_nuevo_estado,
    'verificadoPor', v_ses.correo,
    'verificadoEn', now()
  );
END;
$$;

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
  v_ses public.auth_sesiones;
  v_count int;
BEGIN
  v_ses := public.resolver_sesion_valida(p_token, 'admin');

  UPDATE public.jugadores
  SET
    estado_carnet = 'verificado',
    estado = 'Aprobado',
    verificado_por = v_ses.correo,
    verificado_en = now(),
    motivo_rechazo = NULL
  WHERE NOT eliminado
    AND (equipo_id = p_equipo_id OR "equipoId" = p_equipo_id)
    AND coalesce(foto_documento, "fotoDocumento", '') <> ''
    AND estado_carnet IN ('en_revision', 'pendiente');

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN jsonb_build_object('ok', true, 'verificadosCount', v_count, 'verificadoPor', v_ses.correo);
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_actualizar_estado_equipo(
  p_token text,
  p_equipo_id text,
  p_nuevo_estado text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_ses public.auth_sesiones;
BEGIN
  v_ses := public.resolver_sesion_valida(p_token, 'admin');

  IF p_nuevo_estado NOT IN ('Pendiente', 'Confirmado', 'Rechazado') THEN
    RAISE EXCEPTION 'Estado de equipo no válido.';
  END IF;

  UPDATE public.equipos
  SET estado = p_nuevo_estado,
      pago = jsonb_build_object('estado', lower(p_nuevo_estado), 'revisadoPor', v_ses.correo, 'fecha', now()),
      actualizado_en = now()
  WHERE id = p_equipo_id AND NOT eliminado;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Equipo no encontrado.';
  END IF;

  RETURN jsonb_build_object('ok', true, 'estado', p_nuevo_estado);
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_eliminar_equipo_admin(
  p_token text,
  p_equipo_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  PERFORM public.resolver_sesion_valida(p_token, 'admin');

  UPDATE public.jugadores SET eliminado = true WHERE equipo_id = p_equipo_id OR "equipoId" = p_equipo_id;
  UPDATE public.equipos SET eliminado = true, estado = 'Rechazado', actualizado_en = now() WHERE id = p_equipo_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_guardar_torneo(
  p_token text,
  p_torneo_data jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  PERFORM public.resolver_sesion_valida(p_token, 'admin');

  INSERT INTO public.configuracion (id, data, actualizado_en)
  VALUES ('torneo', p_torneo_data, now())
  ON CONFLICT (id) DO UPDATE
  SET data = EXCLUDED.data,
      actualizado_en = now();

  RETURN p_torneo_data;
END;
$$;

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
  v_actual jsonb;
  v_merged jsonb;
BEGIN
  PERFORM public.resolver_sesion_valida(p_token, 'admin');

  SELECT data INTO v_actual FROM public.configuracion WHERE id = 'general' FOR UPDATE;
  v_actual := COALESCE(v_actual, jsonb_build_object('inscripcionesAbiertas', true));
  v_merged := v_actual || coalesce(p_actualizaciones, '{}'::jsonb);

  INSERT INTO public.configuracion (id, data, actualizado_en)
  VALUES ('general', v_merged, now())
  ON CONFLICT (id) DO UPDATE
  SET data = EXCLUDED.data,
      actualizado_en = now();

  RETURN v_merged;
END;
$$;

GRANT EXECUTE ON FUNCTION
  public.rpc_registrar_otp_cliente(text, text),
  public.rpc_obtener_metricas_email(),
  public.rpc_registrar_envio_email(text),
  public.rpc_crear_cuenta_con_otp(text, text, text),
  public.rpc_iniciar_sesion(text, text),
  public.rpc_validar_sesion(text),
  public.rpc_cerrar_sesion(text),
  public.rpc_obtener_perfil(text),
  public.rpc_guardar_perfil(text, jsonb),
  public.rpc_obtener_resumen_publico(text),
  public.rpc_inscribir_equipo(text, jsonb),
  public.rpc_buscar_equipo_por_codigo(text, text),
  public.rpc_agregar_jugador_con_codigo(text, text, jsonb, boolean),
  public.rpc_expulsar_jugador(text, text, text),
  public.rpc_obtener_perfil_pendiente(text),
  public.rpc_actualizar_documento_jugador(text, jsonb),
  public.rpc_obtener_datos_admin(text),
  public.rpc_revisar_carnet_admin(text, text, text, text),
  public.rpc_verificar_carnets_equipo_admin(text, text),
  public.rpc_actualizar_estado_equipo(text, text, text),
  public.rpc_eliminar_equipo_admin(text, text),
  public.rpc_guardar_torneo(text, jsonb),
  public.rpc_guardar_configuracion_general(text, jsonb)
TO anon, authenticated, service_role;


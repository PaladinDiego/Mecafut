-- Maintenance gate, local Tegucigalpa deadline storage, and post-close roster rules.

CREATE OR REPLACE FUNCTION public.modo_mantenimiento_activo()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT coalesce((data->>'mantenimientoActivo')::boolean, false)
  FROM public.configuracion
  WHERE id = 'general';
$$;

CREATE OR REPLACE FUNCTION public.inscripciones_cerradas(p_config jsonb DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_cfg jsonb := p_config;
  v_fecha text;
  v_cierre timestamptz;
BEGIN
  IF v_cfg IS NULL THEN
    SELECT data INTO v_cfg FROM public.configuracion WHERE id = 'general';
  END IF;
  IF coalesce((v_cfg->>'inscripcionesAbiertas')::boolean, true) = false THEN
    RETURN true;
  END IF;

  v_fecha := nullif(trim(v_cfg->>'fechaCierreInscripciones'), '');
  IF v_fecha IS NULL THEN
    RETURN false;
  ELSIF v_fecha ~ '^\d{4}-\d{2}-\d{2}$' THEN
    v_cierre := ((v_fecha::date + 1)::timestamp - interval '1 second') AT TIME ZONE 'America/Tegucigalpa';
  ELSIF v_fecha ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$' THEN
    v_cierre := v_fecha::timestamp AT TIME ZONE 'America/Tegucigalpa';
  ELSE
    v_cierre := v_fecha::timestamptz;
  END IF;

  RETURN now() >= v_cierre;
END;
$$;

-- Convert legacy date-only values to end-of-day Tegucigalpa instants.
UPDATE public.configuracion
SET data = jsonb_set(
  data,
  '{fechaCierreInscripciones}',
  to_jsonb(to_char(
    ((((data->>'fechaCierreInscripciones')::date + 1)::timestamp - interval '1 second')
      AT TIME ZONE 'America/Tegucigalpa') AT TIME ZONE 'UTC',
    'YYYY-MM-DD"T"HH24:MI:SS"Z"'
  )),
  true
), actualizado_en = now()
WHERE id = 'general'
  AND data->>'fechaCierreInscripciones' ~ '^\d{4}-\d{2}-\d{2}$';

CREATE OR REPLACE FUNCTION public.rpc_obtener_estado_mantenimiento(p_token text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_activo boolean := public.modo_mantenimiento_activo();
  v_admin boolean := false;
BEGIN
  IF NOT v_activo THEN
    RETURN jsonb_build_object('mantenimientoActivo', false, 'puedeAcceder', true);
  END IF;

  IF p_token IS NOT NULL AND length(trim(p_token)) >= 32 THEN
    SELECT public.es_admin_oficial(s.correo) INTO v_admin
    FROM public.auth_sesiones s
    WHERE (s.token = trim(p_token) OR s.token = encode(digest(trim(p_token), 'sha256'), 'hex'))
      AND NOT s.revocada AND s.expira_en > now()
    LIMIT 1;
  END IF;

  RETURN jsonb_build_object(
    'mantenimientoActivo', true,
    'puedeAcceder', coalesce(v_admin, false)
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.rpc_obtener_estado_mantenimiento(text) TO anon, authenticated, service_role;

-- Preserve the existing session contract, but make the global gate authoritative for RPCs.
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
  v_raw text;
  v_hash text;
  v_debe_cambiar boolean := false;
BEGIN
  IF p_token IS NULL OR length(trim(p_token)) < 32 THEN
    RAISE EXCEPTION 'Sesión no autenticada o expirada. Por favor vuelve a iniciar sesión.';
  END IF;
  v_raw := trim(p_token);
  v_hash := encode(digest(v_raw, 'sha256'), 'hex');
  SELECT * INTO v_ses FROM public.auth_sesiones
  WHERE (token = v_raw OR token = v_hash) AND NOT revocada AND expira_en > now()
  LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tu sesión ha expirado o no es válida. Por favor vuelve a iniciar sesión.';
  END IF;

  v_ses.es_admin := public.es_admin_oficial(v_ses.correo);
  v_ses.es_docente := public.es_docente_oficial(v_ses.correo);
  v_ses.rol := CASE WHEN v_ses.es_admin THEN 'admin' WHEN v_ses.es_docente THEN 'docente' ELSE 'estudiante' END;
  IF public.modo_mantenimiento_activo() AND NOT v_ses.es_admin THEN
    RAISE EXCEPTION 'MANTENIMIENTO_ACTIVO: la plataforma está temporalmente fuera de servicio.';
  END IF;
  IF p_rol_requerido = 'admin' AND v_ses.rol <> 'admin' THEN
    RAISE EXCEPTION 'Acceso denegado: esta operación exige autorización de Administrador en el servidor.';
  END IF;

  IF v_ses.usuario_id IS NOT NULL THEN
    SELECT coalesce(debe_cambiar_password, false) INTO v_debe_cambiar
    FROM public.usuarios WHERE usuario_id = v_ses.usuario_id;
    IF v_debe_cambiar AND NOT p_permitir_cambio_clave THEN
      RAISE EXCEPTION 'Debes actualizar tu contraseña temporal antes de continuar utilizando la plataforma.';
    END IF;
  END IF;
  RETURN v_ses;
END;
$$;
REVOKE ALL ON FUNCTION public.resolver_sesion_valida(text, text, boolean) FROM PUBLIC, anon, authenticated;

-- Keep the old summary implementation, but expose no public content during maintenance.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE pronamespace = 'public'::regnamespace AND proname = 'rpc_obtener_resumen_publico_core'
  ) THEN
    ALTER FUNCTION public.rpc_obtener_resumen_publico(text) RENAME TO rpc_obtener_resumen_publico_core;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.rpc_obtener_resumen_publico_core(text) FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE FUNCTION public.rpc_obtener_resumen_publico(p_token text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_activo boolean := public.modo_mantenimiento_activo();
  v_admin boolean := false;
BEGIN
  IF v_activo THEN
    IF p_token IS NOT NULL AND length(trim(p_token)) >= 32 THEN
      SELECT public.es_admin_oficial(s.correo) INTO v_admin
      FROM public.auth_sesiones s
      WHERE (s.token = trim(p_token) OR s.token = encode(digest(trim(p_token), 'sha256'), 'hex'))
        AND NOT s.revocada AND s.expira_en > now()
      LIMIT 1;
    END IF;
    IF NOT coalesce(v_admin, false) THEN
      RETURN jsonb_build_object(
        'mantenimientoActivo', true,
        'inscripcionesAbiertas', false,
        'mensaje', 'La plataforma está temporalmente fuera de servicio.'
      );
    END IF;
  END IF;
  RETURN public.rpc_obtener_resumen_publico_core(p_token);
END;
$$;
GRANT EXECUTE ON FUNCTION public.rpc_obtener_resumen_publico(text) TO anon, authenticated, service_role;

-- Store datetime-local input as an explicit UTC instant; date-only legacy input means end of local day.
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
  v_fecha text;
  v_local timestamp;
  v_utc timestamp;
  v_wa text;
  v_max int;
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
  IF v_payload ? 'otpAutomaticoHabilitado' AND jsonb_typeof(v_payload->'otpAutomaticoHabilitado') <> 'boolean' THEN
    RAISE EXCEPTION 'otpAutomaticoHabilitado debe ser booleano.';
  END IF;
  IF v_payload ? 'mantenimientoActivo' AND jsonb_typeof(v_payload->'mantenimientoActivo') <> 'boolean' THEN
    RAISE EXCEPTION 'mantenimientoActivo debe ser booleano.';
  END IF;
  IF v_payload ? 'fechaCierreInscripciones' AND v_payload->'fechaCierreInscripciones' <> 'null'::jsonb THEN
    v_fecha := trim(coalesce(v_payload->>'fechaCierreInscripciones', ''));
    IF v_fecha = '' THEN
      v_payload := jsonb_set(v_payload, '{fechaCierreInscripciones}', 'null'::jsonb);
    ELSIF v_fecha ~ '^\d{4}-\d{2}-\d{2}$' THEN
      v_local := (v_fecha::date + 1)::timestamp - interval '1 second';
      v_utc := (v_local AT TIME ZONE 'America/Tegucigalpa') AT TIME ZONE 'UTC';
      v_payload := jsonb_set(v_payload, '{fechaCierreInscripciones}', to_jsonb(to_char(v_utc, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')));
    ELSIF v_fecha ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$' THEN
      v_local := v_fecha::timestamp;
      v_utc := (v_local AT TIME ZONE 'America/Tegucigalpa') AT TIME ZONE 'UTC';
      v_payload := jsonb_set(v_payload, '{fechaCierreInscripciones}', to_jsonb(to_char(v_utc, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')));
    ELSE
      PERFORM (v_fecha::timestamptz);
    END IF;
  END IF;

  SELECT data INTO v_data FROM public.configuracion WHERE id = 'general' FOR UPDATE;
  v_data := coalesce(v_data, '{}'::jsonb) || v_payload;
  IF v_payload ? 'maxJugadoresPorEquipo' THEN
    v_max := (v_payload->>'maxJugadoresPorEquipo')::int;
    IF v_max < 8 THEN RAISE EXCEPTION 'El máximo de integrantes por equipo no puede ser menor a 8.'; END IF;
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
GRANT EXECUTE ON FUNCTION public.rpc_guardar_configuracion_general(text, jsonb) TO anon, authenticated, service_role;

-- Closed periods allow correction, but not adding/removing roster entries by non-admins.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE pronamespace = 'public'::regnamespace AND proname = 'rpc_agregar_jugador_con_codigo_core'
  ) THEN
    ALTER FUNCTION public.rpc_agregar_jugador_con_codigo(text, text, jsonb, boolean) RENAME TO rpc_agregar_jugador_con_codigo_core;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.rpc_agregar_jugador_con_codigo_core(text, text, jsonb, boolean) FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE FUNCTION public.rpc_agregar_jugador_con_codigo(
  p_token text, p_codigo text, p_jugador jsonb, p_es_auto_registro boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_ses public.auth_sesiones;
BEGIN
  v_ses := public.resolver_sesion_valida(p_token);
  IF public.inscripciones_cerradas() AND NOT v_ses.es_admin THEN
    RAISE EXCEPTION 'El periodo está cerrado; solo un administrador puede agregar integrantes.';
  END IF;
  RETURN public.rpc_agregar_jugador_con_codigo_core(p_token, p_codigo, p_jugador, p_es_auto_registro);
END;
$$;
GRANT EXECUTE ON FUNCTION public.rpc_agregar_jugador_con_codigo(text, text, jsonb, boolean) TO anon, authenticated, service_role;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE pronamespace = 'public'::regnamespace AND proname = 'rpc_expulsar_jugador_core'
  ) THEN
    ALTER FUNCTION public.rpc_expulsar_jugador(text, text, text) RENAME TO rpc_expulsar_jugador_core;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.rpc_expulsar_jugador_core(text, text, text) FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE FUNCTION public.rpc_expulsar_jugador(p_token text, p_codigo text, p_jugador_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_ses public.auth_sesiones;
BEGIN
  v_ses := public.resolver_sesion_valida(p_token);
  IF public.inscripciones_cerradas() AND NOT v_ses.es_admin THEN
    RAISE EXCEPTION 'El periodo está cerrado; solo un administrador puede eliminar integrantes.';
  END IF;
  RETURN public.rpc_expulsar_jugador_core(p_token, p_codigo, p_jugador_id);
END;
$$;
GRANT EXECUTE ON FUNCTION public.rpc_expulsar_jugador(text, text, text) TO anon, authenticated, service_role;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE pronamespace = 'public'::regnamespace AND proname = 'rpc_editar_jugador_equipo_core'
  ) THEN
    ALTER FUNCTION public.rpc_editar_jugador_equipo(text, text, text, jsonb) RENAME TO rpc_editar_jugador_equipo_core;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.rpc_editar_jugador_equipo_core(text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE FUNCTION public.rpc_editar_jugador_equipo(p_token text, p_codigo text, p_jugador_id text, p_datos jsonb)
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
  v_es_propio boolean;
  v_nombre text;
  v_cuenta text;
  v_dni text;
  v_carrera text;
  v_nom_clase text;
  v_cod_clase text;
BEGIN
  v_ses := public.resolver_sesion_valida(p_token);
  SELECT * INTO v_eq FROM public.equipos
  WHERE NOT eliminado AND (codigo = trim(p_codigo) OR "codigoAcceso" = trim(p_codigo)) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Equipo no encontrado.'; END IF;
  SELECT * INTO v_jug FROM public.jugadores
  WHERE id = p_jugador_id AND equipo_id = v_eq.id AND NOT eliminado FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'El jugador no pertenece a este equipo o no fue encontrado.'; END IF;

  v_es_capitan := v_eq.capitan_usuario_id = v_ses.usuario_id
    OR lower(trim(coalesce(v_eq.capitan->>'correo', ''))) = v_ses.correo;
  v_es_propio := lower(trim(coalesce(v_jug.correo, ''))) = lower(v_ses.correo)
    OR (v_jug.usuario_id IS NOT NULL AND v_jug.usuario_id = v_ses.usuario_id);
  IF v_ses.es_admin OR v_es_capitan THEN
    RETURN public.rpc_editar_jugador_equipo_core(p_token, p_codigo, p_jugador_id, p_datos);
  END IF;
  IF NOT public.inscripciones_cerradas() OR NOT v_es_propio THEN
    RAISE EXCEPTION 'Solo después del cierre puedes corregir tus propios datos.';
  END IF;

  v_nombre := coalesce(nullif(trim(p_datos->>'nombre'), ''), v_jug.nombre);
  v_cuenta := coalesce(nullif(trim(p_datos->>'cuenta'), ''), v_jug.cuenta);
  v_dni := coalesce(nullif(trim(p_datos->>'dni'), ''), v_jug.dni);
  v_carrera := coalesce(nullif(trim(p_datos->>'carrera'), ''), v_jug.carrera);
  v_nom_clase := coalesce(nullif(trim(p_datos->>'nombreClase'), ''), nullif(trim(p_datos->>'nombre_clase'), ''), v_jug.nombre_clase);
  v_cod_clase := public.normalizar_codigo_clase(coalesce(p_datos->>'codigoClase', p_datos->>'codigo_clase', v_jug.codigo_clase));

  IF v_cuenta <> v_jug.cuenta AND EXISTS (
    SELECT 1 FROM public.jugadores WHERE NOT eliminado AND equipo_id = v_eq.id AND trim(cuenta) = v_cuenta AND id <> v_jug.id
  ) THEN RAISE EXCEPTION 'Ya existe un integrante con esa cuenta en este equipo.'; END IF;
  IF v_dni <> coalesce(v_jug.dni, '') AND EXISTS (
    SELECT 1 FROM public.jugadores j JOIN public.equipos e ON e.id = coalesce(j.equipo_id, j."equipoId")
    WHERE j.id <> v_jug.id AND NOT j.eliminado AND e.periodo = v_jug.periodo
      AND coalesce(e.estado, 'Pendiente') <> 'Rechazado'
      AND public.normalizar_dni(j.dni) = public.normalizar_dni(v_dni)
  ) THEN RAISE EXCEPTION 'Este DNI ya se encuentra registrado en otro jugador activo.'; END IF;

  IF v_nombre <> v_jug.nombre OR v_cuenta <> v_jug.cuenta OR v_dni <> coalesce(v_jug.dni, '') THEN
    INSERT INTO public.usuarios_historial (usuario_id, correo, campo, valor_anterior, valor_nuevo, periodo, origen, creado_en, actor_usuario_id, actor_correo)
    SELECT v_jug.usuario_id, coalesce(v_jug.correo, v_ses.correo), campo, anterior, nuevo, v_jug.periodo, 'edicion_equipo', now(), v_ses.usuario_id, v_ses.correo
    FROM (VALUES
      ('nombre', v_jug.nombre, v_nombre),
      ('cuenta', v_jug.cuenta, v_cuenta),
      ('dni', coalesce(v_jug.dni, ''), v_dni)
    ) AS cambios(campo, anterior, nuevo)
    WHERE anterior IS DISTINCT FROM nuevo;
  END IF;
  UPDATE public.jugadores SET nombre = v_nombre, cuenta = v_cuenta, dni = v_dni,
    carrera = v_carrera, nombre_clase = v_nom_clase, codigo_clase = v_cod_clase,
    "codigoClase" = v_cod_clase, alerta_cambio_identidad = true
  WHERE id = v_jug.id;
  RETURN jsonb_build_object('ok', true, 'mensaje', 'Datos del integrante actualizados con éxito.');
END;
$$;
GRANT EXECUTE ON FUNCTION public.rpc_editar_jugador_equipo(text, text, text, jsonb) TO anon, authenticated, service_role;

-- ==============================================================================
-- MECAFUT 2026 — Migración Idempotente: Alineación y Resiliencia de Contratos RPC
-- Archivo: 2026110802_rpc_contract_alignment.sql
-- Propósito: Normalizar parámetros y estructuras de retorno entre frontend y Supabase:
--   1. rpc_guardar_torneo: acepta p_torneo y p_torneo_data.
--   2. rpc_guardar_configuracion_general: acepta p_patch y p_actualizaciones.
--   3. rpc_guardar_perfil: acepta p_perfil y p_datos.
--   4. rpc_agregar_jugador_con_codigo: retorna estructura completa con equipo y jugadores.
--   5. rpc_expulsar_jugador: retorna estructura completa con equipo y jugadores.
--   6. rpc_obtener_resumen_publico: incluye config anidada y campos raíz, capitan y capitanNombre.
-- ==============================================================================

-- 1. RPC GUARDAR TORNEO (DUAL PARAMETERS)
DROP FUNCTION IF EXISTS public.rpc_guardar_torneo(text, jsonb);

CREATE OR REPLACE FUNCTION public.rpc_guardar_torneo(
  p_token text,
  p_torneo jsonb DEFAULT NULL,
  p_torneo_data jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_admin public.auth_sesiones;
  v_publico jsonb;
  v_payload jsonb;
BEGIN
  v_admin := public.resolver_sesion_valida(p_token, 'admin');
  v_payload := coalesce(p_torneo, p_torneo_data);

  IF v_payload IS NULL THEN
    RAISE EXCEPTION 'Payload de torneo vacío o no proporcionado.';
  END IF;

  -- 1. Guardar estado completo en 'torneo_interno' (solo accesible para el comité)
  INSERT INTO public.configuracion (id, data, actualizado_en)
  VALUES ('torneo_interno', v_payload, now())
  ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, actualizado_en = now();

  -- 2. Proyectar versión sanitizada en 'torneo' (leída por /torneo y Realtime)
  v_publico := public.proyectar_torneo_publico(v_payload);

  INSERT INTO public.configuracion (id, data, actualizado_en)
  VALUES ('torneo', v_publico, now())
  ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, actualizado_en = now();

  RETURN v_payload;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_guardar_torneo(text, jsonb, jsonb) TO anon, authenticated, service_role;

-- 2. RPC GUARDAR CONFIGURACIÓN GENERAL (DUAL PARAMETERS)
DROP FUNCTION IF EXISTS public.rpc_guardar_configuracion_general(text, jsonb);

CREATE OR REPLACE FUNCTION public.rpc_guardar_configuracion_general(
  p_token text,
  p_patch jsonb DEFAULT NULL,
  p_actualizaciones jsonb DEFAULT NULL
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
  v_payload jsonb;
BEGIN
  v_admin := public.resolver_sesion_valida(p_token, 'admin');
  v_payload := coalesce(p_patch, p_actualizaciones);

  IF v_payload IS NULL THEN
    RAISE EXCEPTION 'Payload de configuración vacío o no proporcionado.';
  END IF;

  SELECT data INTO v_data FROM public.configuracion WHERE id = 'general' FOR UPDATE;
  v_data := COALESCE(v_data, '{}'::jsonb) || v_payload;

  IF v_payload ? 'maxJugadoresPorEquipo' THEN
    v_max := (v_payload->>'maxJugadoresPorEquipo')::int;
    IF v_max < 8 THEN
      RAISE EXCEPTION 'El máximo de integrantes por equipo no puede ser menor a 8 (mínimo reglamentario).';
    END IF;
  END IF;

  IF v_payload ? 'whatsappCapitanesUrl' THEN
    v_wa := trim(coalesce(v_payload->>'whatsappCapitanesUrl', ''));
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

GRANT EXECUTE ON FUNCTION public.rpc_guardar_configuracion_general(text, jsonb, jsonb) TO anon, authenticated, service_role;

-- 3. RPC GUARDAR PERFIL (DUAL PARAMETERS)
DROP FUNCTION IF EXISTS public.rpc_guardar_perfil(text, jsonb);

CREATE OR REPLACE FUNCTION public.rpc_guardar_perfil(
  p_token text,
  p_perfil jsonb DEFAULT NULL,
  p_datos jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_ses public.auth_sesiones;
  v_user public.usuarios;
  v_payload jsonb;
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
  v_payload := coalesce(p_perfil, p_datos);

  IF v_payload IS NULL THEN
    RAISE EXCEPTION 'Payload de perfil vacío o no proporcionado.';
  END IF;

  v_nombre := coalesce(trim(v_payload->>'nombre'), '');
  v_cuenta := coalesce(trim(v_payload->>'cuenta'), '');
  v_dni := coalesce(trim(v_payload->>'dni'), '');
  v_tel := coalesce(trim(v_payload->>'telefono'), '');
  v_carrera := coalesce(trim(v_payload->>'carrera'), '');
  v_nom_clase := coalesce(trim(v_payload->>'nombreClase'), trim(v_payload->>'nombre_clase'), '');
  v_cod_clase := public.normalizar_codigo_clase(coalesce(v_payload->>'codigoClase', v_payload->>'codigo_clase', ''));
  v_foto := v_payload->>'fotoDocumento';
  v_tipo_doc := coalesce(v_payload->>'tipoDocumento', 'carnet');

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

GRANT EXECUTE ON FUNCTION public.rpc_guardar_perfil(text, jsonb, jsonb) TO anon, authenticated, service_role;

-- 4. RPC AGREGAR JUGADOR CON CÓDIGO (RETURN CONTRACT PRESERVATION)
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
    v_es_docente := false;
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

  RETURN jsonb_build_object('ok', true) || public.rpc_buscar_equipo_por_codigo(p_token, p_codigo);
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_agregar_jugador_con_codigo(text, text, jsonb, boolean) TO anon, authenticated, service_role;

-- 5. RPC EXPULSAR JUGADOR (RETURN CONTRACT PRESERVATION)
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

  RETURN jsonb_build_object('ok', true, 'mensaje', 'Integrante expulsado de la plantilla.') || public.rpc_buscar_equipo_por_codigo(p_token, p_codigo);
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_expulsar_jugador(text, text, text) TO anon, authenticated, service_role;

-- 6. RPC OBTENER RESUMEN PÚBLICO (DUAL CONFIG FORMAT & SCALAR/OBJECT CAPITAN)
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
  ELSE
    v_cfg := jsonb_build_object('inscripcionesAbiertas', true);
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
    'capitanNombre', coalesce(e.capitan->>'nombre', 'Capitán'),
    'color', e.color,
    'clasesRepresentadas', e.clases_representadas
  )) INTO v_equipos
  FROM public.equipos e
  WHERE NOT e.eliminado AND e.estado <> 'Rechazado';

  SELECT jsonb_agg(lower(trim(nombre))) INTO v_nombres
  FROM public.equipos
  WHERE NOT eliminado AND estado <> 'Rechazado';

  RETURN jsonb_build_object(
    'config', v_cfg || jsonb_build_object('inscripcionesAbiertas', v_abiertas),
    'inscripcionesAbiertas', v_abiertas,
    'fechaCierreInscripciones', v_fecha_cierre,
    'whatsappCapitanesUrl', v_cfg->>'whatsappCapitanesUrl',
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

GRANT EXECUTE ON FUNCTION public.rpc_obtener_resumen_publico(text) TO anon, authenticated, service_role;

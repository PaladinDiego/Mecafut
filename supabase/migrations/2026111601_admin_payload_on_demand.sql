-- Keep the initial admin response small. Private document payloads and the
-- account directory are fetched through separate, admin-authenticated RPCs.

-- Keep the legacy RPC unchanged for already-open tabs and cached frontend bundles.
-- The new UI opts into the lighter, versioned contract below.
CREATE OR REPLACE FUNCTION public.rpc_obtener_datos_admin_v2(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_admin public.auth_sesiones;
  v_equipos jsonb;
  v_jugadores jsonb;
  v_historial jsonb;
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
    'codigoAcceso', coalesce(e."codigoAcceso", e.codigo),
    'fechaRegistro', e."fechaRegistro",
    'tieneComprobante', e."comprobanteDataUrl" IS NOT NULL,
    'clasesRepresentadas', e.clases_representadas,
    'capitan', jsonb_build_object(
      'nombre', e.capitan->>'nombre',
      'correo', e.capitan->>'correo',
      'telefono', e.capitan->>'telefono',
      'cuenta', e.capitan->>'cuenta'
    )
  ) ORDER BY e.creado_en DESC) INTO v_equipos
  FROM public.equipos e
  WHERE NOT coalesce(e.eliminado, false);

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
    'tieneFoto', coalesce(j.foto_documento, j."fotoDocumento") IS NOT NULL,
    'esCapitan', coalesce(j.es_capitan, j."esCapitan", false),
    'estado', j.estado,
    'estadoCarnet', coalesce(j.estado_carnet, 'pendiente'),
    'motivoRechazo', j.motivo_rechazo,
    'alertaCambioIdentidad', coalesce(j.alerta_cambio_identidad, false),
    'correoVerificado', coalesce(j.correo_verificado, false)
  ) ORDER BY j.creado_en ASC) INTO v_jugadores
  FROM public.jugadores j
  WHERE NOT coalesce(j.eliminado, false);

  SELECT jsonb_agg(jsonb_build_object(
    'id', h.id,
    'usuarioId', h.usuario_id,
    'usuario_id', h.usuario_id,
    'correo', h.correo,
    'campo', h.campo,
    'valorAnterior', h.valor_anterior,
    'valorNuevo', h.valor_nuevo,
    'periodo', h.periodo,
    'origen', h.origen,
    'fecha', h.creado_en
  ) ORDER BY h.creado_en DESC) INTO v_historial
  FROM public.usuarios_historial h;

  SELECT data INTO v_cfg FROM public.configuracion WHERE id = 'general';

  SELECT data INTO v_torneo FROM public.configuracion WHERE id = 'torneo_interno';
  IF v_torneo IS NULL THEN
    SELECT data INTO v_torneo FROM public.configuracion WHERE id = 'torneo';
  END IF;

  RETURN jsonb_build_object(
    'equipos', coalesce(v_equipos, '[]'::jsonb),
    'jugadores', coalesce(v_jugadores, '[]'::jsonb),
    'usuarios', '[]'::jsonb,
    'historial', coalesce(v_historial, '[]'::jsonb),
    'configuracion', coalesce(v_cfg, '{}'::jsonb),
    'torneo', v_torneo,
    'modo', 'supabase'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_obtener_datos_admin_v2(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_obtener_datos_admin_v2(text) TO anon, authenticated;

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
    'id', u.usuario_id,
    'usuarioId', u.usuario_id,
    'correo', u.correo,
    'nombre', u.nombre,
    'cuenta', u.cuenta,
    'dni', u.dni,
    'telefono', u.telefono,
    'carrera', u.carrera,
    'nombreClase', u.nombre_clase,
    'nombre_clase', u.nombre_clase,
    'codigoClase', u.codigo_clase,
    'codigo_clase', u.codigo_clase,
    'rol', CASE
      WHEN public.es_admin_oficial(u.correo) THEN 'admin'
      WHEN public.es_docente_oficial(u.correo) THEN 'docente'
      ELSE 'jugador'
    END,
    'debeCambiarPassword', u.debe_cambiar_password,
    'debe_cambiar_password', u.debe_cambiar_password,
    'tempPasswordUsada', u.temp_password_usada,
    'tempPasswordPor', u.temp_password_por,
    'tempPasswordEn', u.temp_password_en,
    'creadoEn', u.creado_en,
    'esAdmin', public.es_admin_oficial(u.correo),
    'esDocente', public.es_docente_oficial(u.correo)
  ) ORDER BY u.creado_en DESC) INTO v_usuarios
  FROM public.usuarios u;

  RETURN coalesce(v_usuarios, '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_obtener_usuarios_admin(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_obtener_usuarios_admin(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.rpc_obtener_documento_admin(
  p_token text,
  p_tipo_documento text,
  p_registro_id text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_admin public.auth_sesiones;
  v_documento text;
BEGIN
  v_admin := public.resolver_sesion_valida(p_token, 'admin');

  IF p_tipo_documento = 'carnet' THEN
    SELECT coalesce(j.foto_documento, j."fotoDocumento") INTO v_documento
    FROM public.jugadores j
    WHERE j.id = p_registro_id AND NOT j.eliminado;
  ELSIF p_tipo_documento = 'comprobante' THEN
    SELECT e."comprobanteDataUrl" INTO v_documento
    FROM public.equipos e
    WHERE e.id = p_registro_id AND NOT e.eliminado;
  ELSE
    RAISE EXCEPTION 'Tipo de documento inválido.';
  END IF;

  RETURN v_documento;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_obtener_documento_admin(text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_obtener_documento_admin(text, text, text) TO anon, authenticated;

-- ============================================================================
-- MECAFUT Q4 2026 — FASE 2: CIERRE ESTRICTO DE POLÍTICAS RLS EN PRODUCCIÓN
-- Migración 2026110704 (cronológicamente posterior a 2026110703)
-- Aplica el cierre total de tablas privadas y acota la lectura a 'torneo'
-- ============================================================================

-- 1. Cerrar políticas permisivas existentes en usuarios y jugadores
ALTER POLICY "Permitir acceso publico a usuarios"
  ON public.usuarios
  USING (false)
  WITH CHECK (false);

ALTER POLICY "Permitir acceso publico a jugadores"
  ON public.jugadores
  USING (false)
  WITH CHECK (false);

-- 2. Cerrar políticas permisivas existentes en equipos
ALTER POLICY "Permitir lectura publica de equipos"
  ON public.equipos
  USING (false);

ALTER POLICY "Permitir creacion de equipos"
  ON public.equipos
  WITH CHECK (false);

ALTER POLICY "Permitir actualizacion de equipos"
  ON public.equipos
  USING (false)
  WITH CHECK (false);

ALTER POLICY "Permitir eliminacion de equipos"
  ON public.equipos
  USING (false);

-- 3. En configuracion solo queda legible la fila pública sanitizada 'torneo'
ALTER POLICY "Permitir lectura publica de configuracion"
  ON public.configuracion
  USING (id = 'torneo');

ALTER POLICY "Permitir insercion de configuracion"
  ON public.configuracion
  WITH CHECK (false);

ALTER POLICY "Permitir actualizacion de configuracion"
  ON public.configuracion
  USING (false)
  WITH CHECK (false);

-- 4. Revocación de privilegios directos de tabla para anon y authenticated
REVOKE ALL ON TABLE public.usuarios, public.usuarios_historial, public.auth_otps,
                    public.auth_sesiones, public.equipos, public.jugadores
FROM PUBLIC, anon, authenticated;

REVOKE ALL ON TABLE public.configuracion FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.configuracion TO anon, authenticated;

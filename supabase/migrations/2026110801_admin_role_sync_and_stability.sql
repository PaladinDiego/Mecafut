-- ==============================================================================
-- MECAFUT 2026 — Migración Idempotente: Sincronización de Roles Administrativos
-- Archivo: 2026110801_admin_role_sync_and_stability.sql
-- Propósito: Actualizar public.es_admin_oficial para reconocer a los 11 miembros
--            del Comité Organizador tanto bajo @unitec.edu como @unitec.edu.hn,
--            preservando administradores adicionales dinámicos de configuracion.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.es_admin_oficial(p_correo text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_c text := lower(trim(coalesce(p_correo, '')));
  v_user text;
  v_domain text;
  v_extra jsonb;
BEGIN
  -- Validar que no sea vacío, que contenga '@' y que contenga exactamente un delimitador '@'
  IF v_c = '' OR position('@' in v_c) = 0 OR split_part(v_c, '@', 3) <> '' OR (length(v_c) - length(replace(v_c, '@', ''))) <> 1 THEN
    RETURN false;
  END IF;

  v_user := split_part(v_c, '@', 1);
  v_domain := split_part(v_c, '@', 2);

  IF v_user = '' OR v_domain = '' THEN
    RETURN false;
  END IF;

  -- 1. Reconocimiento de los 11 administradores oficiales del Comité MECAFUT bajo @unitec.edu o @unitec.edu.hn
  IF (v_domain = 'unitec.edu' OR v_domain = 'unitec.edu.hn') AND v_user IN (
    'andresvalle',
    'carlos.rubi',
    'juan.mejia',
    'cristhyan.rivera',
    'joserodasgodoy',
    'c.marcelo.al',
    'cesar_lopez',
    'adioyuela',
    'maria_giron',
    'dereck.beltrand',
    'jalfaro'
  ) THEN
    RETURN true;
  END IF;

  -- 2. Respaldo de compatibilidad con lista literal histórica
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

  -- 3. Administradores adicionales dinámicos configurados en public.configuracion
  SELECT data->'adminsExtra' INTO v_extra
  FROM public.configuracion
  WHERE id = 'general';

  IF jsonb_typeof(v_extra) = 'array' THEN
    RETURN EXISTS (
      SELECT 1
      FROM jsonb_array_elements_text(v_extra) AS elem
      WHERE lower(trim(elem)) = v_c
         OR (
           (v_domain = 'unitec.edu' OR v_domain = 'unitec.edu.hn')
           AND lower(trim(split_part(elem, '@', 1))) = v_user
           AND lower(trim(elem)) LIKE '%@unitec.edu%'
         )
    );
  END IF;

  RETURN false;
END;
$$;

-- Permisos de ejecución
GRANT EXECUTE ON FUNCTION public.es_admin_oficial(text) TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.es_admin_oficial(text) IS
  'Determina si un correo institucional cuenta con rol de Administrador Oficial de MECAFUT 2026, admitiendo @unitec.edu y @unitec.edu.hn para los 11 miembros del comité y adminsExtra.';

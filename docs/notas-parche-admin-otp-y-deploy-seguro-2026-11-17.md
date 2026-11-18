# Handoff de deploy: parche de administración y OTP

**Estado:** preparado localmente. No se han ejecutado pruebas/build, no se aplicaron migraciones remotas y no se desplegó.

## Qué incluye

- La carga inicial del panel admin es más liviana: usuarios y documentos se solicitan al abrir sus vistas. `rpc_obtener_datos_admin_v2` conserva la carga anterior en `rpc_obtener_datos_admin` para pestañas antiguas.
- Los cinco admins principales son `andresvalle`, `carlos.rubi`, `cesar_lopez`, `juan.mejia` y `cristhyan.rivera` (con las variantes institucionales existentes). Juan Miguel Mejía y Cristhyan Rivera conservan también el rol docente. Solo los admins principales pueden dar/quitar admins delegados.
- El admin puede pausar el envío automático OTP o emitir un código manual. La verificación sigue activa; el código manual se guarda con hash, vence a los 10 minutos y se muestra una sola vez.
- El admin puede activar mantenimiento global; el sitio bloquea a usuarios no administradores y deja acceso a los admins. La comprobación también se aplica en las RPC del servidor.
- El cierre ahora admite fecha y hora de Tegucigalpa. Los valores antiguos con solo fecha se interpretan como el final de ese día local.
- Tras el cierre, cada jugador puede corregir sus datos y el capitán puede corregir integrantes existentes. Agregar integrantes queda restringido a admins y eliminar integrantes solo a admins; el UI oculta acciones no permitidas.

Archivos clave: `app/admin/page.jsx`, `app/equipo/page.jsx`, `components/AuthGate.jsx`, `lib/dbService.js`, `lib/authService.js`, `lib/torneoConfig.js`, las migraciones `2026111601_admin_payload_on_demand.sql`, `2026111701_admin_roles_and_manual_otp.sql`, `2026111801_maintenance_deadline_and_post_close_edits.sql` y `supabase/functions/mecafut-otp/index.ts`.

## Antes de producción

1. Confirma el modo real de Netlify. `next.config.js` indica export estático; `netlify.toml` configura `.next` y el plugin de Next.js; `.openai/hosting.json` apunta a `out` para Sites y no confirma la configuración de Netlify. Verifica el sitio y su último build log; no mezcles ambos modos. [Configuración Next.js en Netlify](https://docs.netlify.com/build/frameworks/overview/)
2. Confirma el proyecto/ref de Supabase y el historial remoto de migraciones. La guía antigua menciona `2026110702_lockdown_rls_policies.sql`, pero el archivo existente es `2026110704_lockdown_rls_policies.sql`. No ejecutes la secuencia histórica a ciegas ni apliques migraciones hasta reconciliar el historial.
3. Prepara un Deploy Preview conectado a Supabase de staging con datos sintéticos. Corre allí los checks existentes y el build; detente si falla alguno o si el modo de salida no coincide con Netlify.

## Orden recomendado

1. En staging, aplica las migraciones en orden: `2026111601_admin_payload_on_demand.sql`, `2026111701_admin_roles_and_manual_otp.sql` y `2026111801_maintenance_deadline_and_post_close_edits.sql`. Antes de producción, revisa el dry run del destino Supabase confirmado y el respaldo disponible. [Flujo de migraciones Supabase](https://supabase.com/docs/guides/local-development/cli-workflows)
2. Despliega solo la Edge Function `mecafut-otp` cuando las RPC nuevas estén disponibles y verificadas. [Deploy de Edge Functions](https://supabase.com/docs/guides/functions/deploy)
3. Publica el frontend después de aprobar el Preview. Netlify prepara el nuevo deploy antes de servirlo; confirma que terminó exitosamente.
4. Revisa `/`, `/equipo`, `/torneo` y `/admin`: carga inicial, padrón bajo demanda, apertura de documentos, concesión/retiro de admin principal, OTP automático/manual, bloqueo en mantenimiento, ediciones tras el cierre, restricciones de altas/bajas y cierre en la hora configurada de Tegucigalpa. Observa errores y latencia.

La versión nueva usa la RPC `v2`; la antigua permanece disponible para clientes con pestañas abiertas. Esto reduce el riesgo de incompatibilidad durante el cambio.

## Si falla

- Si falla Preview/build, no publiques.
- Si falla el frontend, restaura el deploy anterior de Netlify.
- El rollback de Netlify no revierte Supabase ni la Edge Function. Detén el frontend, diagnostica y corrige la base con una migración hacia delante; no uses `db reset` como rollback.

**Cierre:** considera el release completo solo al confirmar migraciones en el proyecto correcto, función OTP verificada, deploy Netlify exitoso y smoke checks aprobados. Esta guía no autoriza por sí sola un deploy.

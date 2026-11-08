# Project: MECAFUT 2026 — Bugfixes, Excel Engine, Eligibility & Tournament Management

## Architecture
- **Framework & Runtime**: Next.js 14.1.0 (App Router, `output: "export"`), React 18, Tailwind CSS.
- **Data & Realtime Layer**: `lib/dbService.js` interfacing with Supabase Cloud (`@supabase/supabase-js: ^2.119.0`) with automatic fallback to Firebase and LocalStorage (`SEED_DATA`).
- **Export Engine**: `lib/exportUtils.js` leveraging SheetJS (`xlsx: ^0.18.5`) for multi-sheet Excel workbooks and `jspdf` / `jspdf-autotable` for printable PDFs.
- **Bracket Logic**: `lib/bracketUtils.js` managing deterministic tournament trees (Masculina 12-team 4-BYEs and Femenina 3-team triangular).
- **Presentation Layer**:
  - `app/page.jsx`: Public landing page, rules modal, registration wizard.
  - `app/equipo/page.jsx`: Captain & team management portal.
  - `app/admin/page.jsx`: Tournament administration console (Equipos, Padrón, Llaves & Sorteo, Resultados).
  - `app/torneo/page.jsx`: Live bracket viewer with realtime subscription.
  - `components/Navbar.jsx`: Global navigation header with live indicator.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| F1 | Teléfono del Capitán en DB | Aceptar cualquier formato telefónico (+504, 504..., etc. >= 8 dígitos) y persistir en `filaCapitan` y `equipo.capitan.telefono` en Supabase/Firebase/LocalStorage | M1 | ORIGINAL_REQUEST §1 |
| F2 | Estabilidad Realtime en /torneo | Corregir crash "cannot add postgres_changes callbacks... after subscribe()" usando canales únicos con timestamp/random, try/catch y fallback polling (15s) | M1 | ORIGINAL_REQUEST §6 |
| F3 | Capa de Configuración General & WhatsApp | Función `guardarConfiguracionGeneral` en dbService con read-merge-write en tabla `configuracion` (id: `'general'`) para persistir `whatsappCapitanesUrl` sin sobrescribir otras opciones | M1 | ORIGINAL_REQUEST §7 |
| F4 | Helpers de Estado y Elegibilidad de Jugadores | Helpers `esJugadorHabilitado` (carnet o docente) y actualización de `estado` ("Aprobado" / "Pendiente") en dbService | M1 | ORIGINAL_REQUEST §4 |
| F5 | Plantilla Excel Profesional | Encabezados institucionales con banner fusionado, cálculo dinámico de `!cols` para anchos de columna y formato estricto de texto (`t: 's'`, `z: '@'`) para cuentas, teléfonos, DNI y códigos | M2 | ORIGINAL_REQUEST §2 |
| F6 | Teléfono del Capitán en Exportación Excel | Lectura correcta de `e.capitan?.telefono` en hojas de Excel oficiales para que nunca aparezca en blanco | M2 | ORIGINAL_REQUEST §1 |
| F7 | Fix Pérdida de Foto de Carnet (David Díaz) | Reemplazar stale closure y llamadas consecutivas en `app/page.jsx` con actualizaciones atómicas funcionales `setJugadores(prev => ...)` al subir fotos de jugadores | M3 | ORIGINAL_REQUEST §3 |
| F8 | Regla de Carnet Obligatorio en /equipo | En `app/equipo/page.jsx`, basar cupo mínimo en jugadores con carnet verificado (mínimo 8). Jugadores sin carnet permanecen en "Pendiente" y no suman a la elegibilidad | M3 | ORIGINAL_REQUEST §4 |
| F9 | Enlace Dinámico de WhatsApp en Vistas Públicas | Consumir `whatsappCapitanesUrl` dinámico en `app/page.jsx` (tarjeta de éxito) y `app/equipo/page.jsx` (banner del capitán) | M3 | ORIGINAL_REQUEST §7 |
| F10 | Subida y Edición de Carnets en /admin | Agregar modal de subida/actualización de carnet con compresión en Padrón de Jugadores de `app/admin/page.jsx` con sincronización en DB | M4 | ORIGINAL_REQUEST §4 |
| F11 | Filtro de Elegibilidad para Llaves en /admin | Filtrar solo equipos con pago y mínimo 8 jugadores con carnet verificado (docentes exentos) para ser elegibles al sorteo de llaves | M4 | ORIGINAL_REQUEST §4 |
| F12 | Armado Manual Interactivo de Llaves | Modal interactivo en "Llaves y Sorteo" de `/admin` para emparejar manualmente los 12 equipos masculinos (4 BYEs + 4 preliminares) y 3 femeninos (triangular) | M4 | ORIGINAL_REQUEST §5 |
| F13 | Editor Interactivo del Link de WhatsApp en /admin | Card interactiva en `/admin` para editar, validar y probar el enlace de WhatsApp persistido en `configuracion` | M4 | ORIGINAL_REQUEST §7 |
| F14 | Verificación E2E y Compilación Local | Verificación completa 100% de la suite de pruebas E2E y ejecución de `npm run build` exitosa con auditoría forense limpia | M5 | ORIGINAL_REQUEST §Restricción |
| F15 | Pop-up Alerta Plataforma en Desarrollo (BETA) | Modal de alerta 3s post-reglamento con estilo rojo/alerta (⚠️ ❗), botón directo a WhatsApp del organizador (+504 9474-4365) con texto precargado y cierre con sessionStorage | M3 | ORIGINAL_REQUEST §Follow-up 1 |
| F16 | Botón Permanente Reportar Problema | Botón visible y accesible en la interfaz (Navbar/flotante) "⚠️ Reportar Problema" que abre el modal de reporte o redirige a WhatsApp | M3 | ORIGINAL_REQUEST §Follow-up 2 |
| F17 | Despliegue a Producción en Netlify | Una vez verificado con build y tests, ejecutar commit y despliegue a producción en Netlify autorizado formalmente por el usuario | M5 | ORIGINAL_REQUEST §Follow-up 3 |
| F18 | Insignias Oficiales de Producción | Quitar textos de "Modo Simulado" en `app/page.jsx` y `app/admin/page.jsx`, reemplazando por "🟢 Servidor Oficial en Línea — Torneo Q4 2026" y "🟢 Servidor Cloud Activo" | M4, M4B | ORIGINAL_REQUEST §Follow-up 4 |
| F19 | Servicio de Usuarios & Auth KISS con Contraseña | Tabla `usuarios` (correo, password_hash, nombre, cuenta, dni, telefono, carrera, foto_documento, tipo_documento), hashing nativo Web Crypto SHA-256, registro con 1 OTP, login correo+contraseña, recuperación OTP | M4B | ORIGINAL_REQUEST §Follow-up 4 |
| F20 | AuthGate & Autocompletado de Perfil | Componente de autenticación con tabs Iniciar Sesión / Crear Cuenta, sesión persistente y autocompletado en inscripción de equipo | M4B | ORIGINAL_REQUEST §Follow-up 4 |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Core DB Services, Realtime Engine & Config Layer | Normalización y persistencia de teléfono en `filaCapitan`, fix de canales únicos en `suscribirTorneoEnVivo`, `guardarConfiguracionGeneral` y helpers de elegibilidad en `lib/dbService.js` | none | DONE |
| M2 | Professional Excel Template Engine | Cabeceras institucionales, cálculo dinámico de `!cols`, formato de texto estricto y emisión sin blancos de teléfono en `lib/exportUtils.js` | M1 | DONE |
| M3 | Public Registration, Team Portal & Beta Feedback | Actualización funcional atómica de fotos en `app/page.jsx`, visualización de regla de 8 carnets en `app/equipo/page.jsx`, enlaces dinámicos de WhatsApp, Pop-up Beta y botón "Reportar Problema" | M1 | DONE |
| M4 | Admin Control Center: Eligibility, Carnet Admin, Manual Brackets & Settings | Modal de carnet en Padrón, selector y emparejador manual de llaves en Llaves y Sorteo, filtro de 8 carnets para aptitud, editor de WhatsApp y badge oficial en `app/admin/page.jsx` | M1, M3 | IN_PROGRESS |
| M4B | KISS Authentication & Profile Autocomplete System | Servicios de autenticación con contraseña (SHA-256 Web Crypto), tabla `usuarios` en Supabase/Local, AuthGate con tabs Iniciar Sesión / Registro con 1 OTP, autocompletado en `app/page.jsx` e insignia oficial | M1, M3 | PLANNED |
| M5 | Final E2E Verification, Local Build & Production Deploy | Ejecución de suite E2E completa, `npm run build` sin errores, auditoría forense de integridad, commit y despliegue a producción en Netlify | M1, M2, M3, M4, M4B | PLANNED |

## Interface Contracts

### 1. `lib/dbService.js` ↔ Consumidores (`app/page.jsx`, `app/admin/page.jsx`, `app/equipo/page.jsx`, `lib/exportUtils.js`)
- **`inscribirEquipo(equipo, capitan, jugadores, comprobantePago)`**:
  - `capitan.telefono`: Acepta cualquier formato con al menos 8 dígitos (`+504 9474-4365`, `50494744365`, etc.). Limpia espacios sobrantes y persiste en `filaCapitan.telefono`.
  - `filaCapitan`: `{ nombre, cuenta, correo, telefono, dni, tipoDocumento, fotoDocumento, carrera, codigoClase, esCapitan: true }`.
  - Persistencia: `equipo.capitan.telefono` garantizado no-nulo.
- **`suscribirTorneoEnVivo(callback)`**:
  - Retorna: `unsub: () => void`.
  - Canal Supabase: `torneo_live_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`.
  - Manejo de errores: `try/catch` con fallback polling cada 15s si Realtime falla o no emite.
- **`guardarConfiguracionGeneral(actualizaciones)`**:
  - Parámetro: `actualizaciones: Record<string, any>`.
  - Operación: Read-merge-write sobre tabla `configuracion` (fila `id = 'general'`), preservando keys previas (`inscripcionesAbiertas`, `whatsappCapitanesUrl`, etc.).
  - Retorna: Objeto completo de configuración actualizado.
- **`actualizarEnlaceWhatsapp(url)`**:
  - Invoca `guardarConfiguracionGeneral({ whatsappCapitanesUrl: url.trim() })`.
- **`obtenerResumenPublico()` / `obtenerDatosAdmin()`**:
  - Devuelve en el objeto de configuración: `whatsappCapitanesUrl: config.whatsappCapitanesUrl || CONFIG_TORNEO.whatsappCapitanesUrl`.
- **`esJugadorHabilitado(j)`**:
  - Retorna: `Boolean(j.fotoDocumento || j.foto_documento || esDocenteAutorizado(j.correo))`.

### 2. `lib/exportUtils.js` ↔ Consumidores (`app/admin/page.jsx`)
- **`exportarExcelOficial(equipos, jugadores)`**:
  - Hoja 1 (`Resumen Equipos`): Muestra `e.capitan?.telefono || "N/A"` formateado como texto.
  - Columnas de texto estricto: `t: 's'`, `z: '@'` para cuentas, teléfonos, DNIs y códigos.
  - Anchos de columna: `ws['!cols']` calculados dinámicamente según `Math.min(Math.max(maxLen + 4, 12), 45)`.
  - Banner institucional: Filas 1-3 con título MECAFUT Q4 2026, Facultad y fecha, celdas fusionadas (`!merges`).

### 3. `lib/bracketUtils.js` ↔ `app/admin/page.jsx`
- **`generarBracketEliminacion(equiposOrdenados, false)`**:
  - Para 12 equipos: Recibe arreglo ordenado `[bye1, bye2, bye3, bye4, p1a, p1b, p2a, p2b, p3a, p3b, p4a, p4b]`.
  - Los primeros 4 equipos avanzan automáticamente a Cuartos de Final (BYEs).
  - Los siguientes 8 equipos se emparejan en 4 partidos preliminares cuyos ganadores enfrentan a los 4 BYEs en Cuartos.
- **`generarTriangularFemenino([eq1, eq2, eq3], false)`**:
  - Genera las 3 jornadas todos contra todos y programa la Gran Final entre 1° y 2°.

## Code Layout
- `lib/dbService.js` (exclusivo M1): Servicios de base de datos, persistencia, realtime, configuración.
- `lib/exportUtils.js` (exclusivo M2): Generación y formateo de Excel y PDF.
- `app/page.jsx` (exclusivo M3): Formulario público de inscripción y tarjeta de confirmación.
- `app/equipo/page.jsx` (exclusivo M3): Portal del equipo y capitán.
- `app/admin/page.jsx` (exclusivo M4): Consola administrativa, padrón de jugadores, llaves interactivas y settings.
- `tests/e2e/` (exclusivo E2E Testing Track): Pruebas automatizadas de extremo a extremo.

## Constraints & Rules
- PRODUCTION DEPLOYMENT AUTHORIZATION: El usuario aprobó formalmente el despliegue a producción en Netlify una vez verificado exitosamente con `npm run build` y la suite E2E completa.
- INTEGRITY ZERO-TOLERANCE: Ningún código falso, datos simulados en pruebas ni omisión de auditoría forense. Auditoría forense mandatoria antes de avanzar y desplegar.

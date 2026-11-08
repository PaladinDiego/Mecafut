# ⚽ MECAFUT Q4 2026 — Plataforma Oficial del Torneo de Fútbol

> Plataforma web oficial para la inscripción, verificación documental, armado de llaves y seguimiento en vivo del torneo de fútbol de la **Facultad de Ingeniería Mecatrónica** de **UNITEC Honduras**.

[![Next.js 14](https://img.shields.io/badge/Next.js-14.1.0-black?logo=next.js)](https://nextjs.org/)
[![React 18](https://img.shields.io/badge/React-18-blue?logo=react)](https://react.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.3.0-38bdf8?logo=tailwindcss)](https://tailwindcss.com/)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL_%2B_RLS-3ECF8E?logo=supabase)](https://supabase.com/)
[![Netlify Status](https://api.netlify.com/api/v1/badges/ffc92ca3-1746-46d5-bcf9-69897ed270ac/deploy-status)](https://app.netlify.com/projects/mecafut-2026/deploys)

🌐 **Sitio Web Oficial en Producción:** [https://mecafut-2026.netlify.app/](https://mecafut-2026.netlify.app/)

> 🤖 **Documentación Técnica y Operativa:**  
> - Protocolo para agentes IA y reglas de negocio: **[`AGENTS.md`](./AGENTS.md)**  
> - Arquitectura SQL, RPCs, Edge Functions y despliegue: **[`DEPLOYMENT_AI_GUIDE.md`](./DEPLOYMENT_AI_GUIDE.md)**

---

## 🚀 Características Principales

1. **📜 Reglamento Oficial Interactivo:**
   - Modal obligatorio al ingresar a `/` con lectura completa por scroll y temporizador de 5 segundos antes de habilitar *"Sí, leí todo"*.
   - Canal directo de soporte y reporte de incidencias vía WhatsApp oficial.

2. **🔐 Cuenta Institucional Segura (`@unitec.edu` / `@unitec.edu.hn`):**
   - Registro único verificado con código **OTP de 6 dígitos** gestionado en servidor (`mecafut-otp` + `bcrypt`) e inicio de sesión recurrente con contraseña propia (`>= 8` caracteres) y sesiones opacas validadas en PostgreSQL (`auth_sesiones`).
   - Autocompletado de datos personales para futuras ediciones de MECAFUT con bitácora de auditoría ante cambios de identidad (`usuarios_historial`).

3. **🛡️ Privacidad de Datos y Control por Rol en `/equipo`:**
   - Enmascaramiento automático de PII (DNI parcial, ocultamiento de correos, carnets y comprobantes de pago) cuando consulta un usuario que no es el Capitán dueño ni Administrador.
   - Bloqueos transaccionales (`pg_advisory_xact_lock`) para garantizar cupos exactos y unicidad de cuenta, correo y DNI normalizado en todo el torneo.

4. **🪪 Verificación Documental en 2 Pasos (`/admin`):**
   - Los carnets subidos por capitanes o jugadores ingresan en estado **`En revisión`** hasta ser aprobados por el Comité Organizador.
   - Aprobación en lote con 1 clic por equipo o revisión individual (**Aprobar / Rechazar con motivo**), notificando automáticamente al jugador si debe volver a subir una imagen legible.
   - Exención reglamentaria automática para docentes autorizados con identidad verificada.

5. **🏆 Generador de Llaves y Formatos Oficiales:**
   - **Categoría Masculina (12 equipos):** Eliminación directa con **4 pases directos (`BYE`)** a Cuartos de Final y 4 cruces preliminares.
   - **Categoría Femenina (hasta 4 equipos):** Soporte dual para **Triangular Todos contra Todos + Gran Final** (3 equipos) o **Semifinales + Gran Final** (4 equipos).
   - Recálculo en cascada con advertencia preventiva si se corrige el resultado de un partido previo ya propagado.

6. **🔴 Resultados en Vivo y Reportes Oficiales:**
   - Marcador en tiempo real en `/torneo` sincronizado con Supabase Realtime y zona horaria oficial de Honduras (`America/Tegucigalpa`, UTC-6).
   - Exportación en 1 clic a **Excel institucional (`.xlsx`, 4 hojas)** y **Planillas Arbitrales en PDF**.

---

## 🛠️ Stack Tecnológico

- **Frontend:** Next.js 14 (App Router, `output: "export"`) + React 18 + Tailwind CSS + Lucide React
- **Backend & Base de Datos:** Supabase PostgreSQL (`SECURITY DEFINER` RPCs, `pgcrypto`, RLS estricto) + Supabase Edge Functions (`mecafut-otp`)
- **Hosting:** Netlify CDN
- ** Procesamiento Cliente:** Compresión Canvas API (~50 KB), SheetJS (`xlsx`), `jsPDF` & `jspdf-autotable`

---

## 📦 Estructura del Proyecto

```text
├── app/
│   ├── admin/                  # Panel del Comité Organizador (Pagos, Padrón, Llaves, En Vivo)
│   ├── equipo/                 # Portal de equipo por código (vista Capitán vs Estudiante)
│   ├── torneo/                 # Marcadores, tablas y brackets en vivo
│   ├── layout.jsx              # Shell global con Navbar y AuthGate
│   └── page.jsx                # Inscripción de equipos y autocompletado de perfil
├── components/
│   ├── AuthGate.jsx            # Login/Registro institucional + flujo de carnet pendiente/rechazado
│   ├── BracketTorneo.jsx       # Visualizador de Eliminación Directa y Triangular Femenino
│   ├── ModalBetaAlert.jsx      # Canal de soporte y reporte de problemas por WhatsApp
│   ├── Navbar.jsx              # Navegación principal e indicadores de rol
│   └── ReglamentoModal.jsx     # Lectura obligatoria del reglamento oficial
├── lib/
│   ├── authService.js          # Cliente de sesiones opacas, OTP y perfil con auditoría
│   ├── bracketUtils.js         # Sorteo, BYEs, Triangular y propagación con cascada segura
│   ├── dbService.js            # Cliente RPC hacia Supabase PostgreSQL + modo dev local
│   ├── exportUtils.js          # Exportadores oficiales a Excel (.xlsx) y PDF
│   ├── supabase.js             # Inicialización del cliente Supabase
│   └── torneoConfig.js         # Cupos, colores, listas blancas y zona horaria Honduras
├── supabase/
│   ├── functions/mecafut-otp/  # Edge Function para emisión y envío de OTP institucional
│   └── migrations/             # Esquema de seguridad, RPCs transaccionales y cierre RLS
└── tests/                      # Suite E2E (Tiers 1-5) y arneses de verificación empírica
```

---

## 💻 Desarrollo y Pruebas Locales

```bash
# 1. Instalar dependencias
npm install

# 2. Copiar variables de entorno (opcional para conectar a Supabase; vacío usa modo dev local)
cp .env.example .env.local

# 3. Iniciar servidor de desarrollo
npm run dev

# 4. Ejecutar las 178 pruebas E2E (Tiers 1-5)
node tests/e2e/runner.mjs

# 5. Generar build estático de producción (carpeta out/)
npm run build
```

---

## 📄 Licencia

Desarrollado para el Comité Organizador de **MECAFUT 2026** — Facultad de Ingeniería Mecatrónica, UNITEC Honduras.

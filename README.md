# ⚽ MECAFUT Q4 2026 — Plataforma Oficial del Torneo de Fútbol

> Plataforma web oficial para la inscripción, validación documental, distribución de llaves y seguimiento en vivo del torneo de fútbol de la **Facultad de Ingeniería Mecatrónica** de **UNITEC Honduras**.

[![Next.js 14](https://img.shields.io/badge/Next.js-14.1.0-black?logo=next.js)](https://nextjs.org/)
[![React 18](https://img.shields.io/badge/React-18-blue?logo=react)](https://react.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.3.0-38bdf8?logo=tailwindcss)](https://tailwindcss.com/)
[![Firebase](https://img.shields.io/badge/Firebase-Firestore-FFA611?logo=firebase)](https://firebase.google.com/)
[![Vercel Ready](https://img.shields.io/badge/Deploy-Vercel-black?logo=vercel)](https://vercel.com/)

---

## 🚀 Características Principales

1. **📜 Reglamento Oficial Interactivo:**
   - Pop-up obligatorio en la vista de Inicio con scroll forzado y cuenta regresiva de 5 segundos para habilitar la confirmación *"Sí, leí todo"*.
   - Mantiene fijas la cabecera y la barra inferior de acción mientras se leen las 10 secciones reglamentarias.

2. **🔐 Autenticación Institucional Obligatoria (`@unitec.edu`):**
   - Candado global con validación de correo institucional mediante código OTP de 6 dígitos.
   - Integración nativa opcional con **EmailJS** para despacho directo al buzón del estudiante o generación en entorno de desarrollo.
   - Bloqueo y formulario para completar foto de Carnet/DNI en caso de que el capitán haya inscrito al estudiante sin adjuntos.

3. **🏆 Generador de Llaves y Formatos de Competición:**
   - **Categoría Masculina (12 equipos):** Eliminación directa con **4 pases directos (`BYE`)** automáticos a Cuartos de Final.
   - **Categoría Femenina (Reglamento Especial 3 equipos):** Genera automáticamente un **Triangular Todos contra Todos (3 partidos)** con tabla de posiciones oficial y **Gran Final** entre el 1° y 2° lugar.
   - Asignación manual o sorteo aleatorio en un clic (`🎲 Sorteo Aleatorio`).

4. **🔴 Resultados en Directo y Criterios Dinámicos de Premiación:**
   - Marcador en vivo por partidos con selector de goleador vinculado a la plantilla oficial.
   - Creador de premios dinámicos personalizados (ej. *"Portero con más goles tapados"*, *"MVP"*, etc.) con botones `+1` / `-1`.
   - Control de visibilidad pública por fecha (oculto para los estudiantes hasta el día del evento).

5. **📋 Padrón Administrativo Agrupado y Visor de Carnet:**
   - Vista agrupada por equipos por defecto con contadores de integrantes (`X / 15`) y fotos validadas.
   - Botón `🪪 Ver Carnet` / `🪪 Ver Matrícula` que abre un visor modal para inspeccionar el documento sin salir de la tabla.
   - Exportación oficial en 1 clic a **Excel (`.xlsx`)** y **Planillas de Juego en PDF** para la mesa de control arbitral.

6. **⚡ Modo Híbrido de Base de Datos:**
   - **Cloud:** Conexión directa a **Firebase Firestore** para sincronización multi-usuario en vivo.
   - **Fallback Simulado:** Si no se configuran variables de Firebase, la app funciona en modo local seguro (`localStorage`), ideal para demos o pruebas locales sin costos.

---

## 🛠️ Stack Tecnológico

- **Frontend & Routing:** Next.js 14 (App Router) + React 18
- **Estilos:** Tailwind CSS con animaciones fluidas y diseño responsivo
- **Iconografía:** Lucide React
- **Base de Datos:** Firebase Firestore (o Supabase / LocalStorage fallback)
- **Compresión de Imágenes:** Canvas API client-side (~50 KB por comprobante o carnet)
- **Generación de Reportes:** jsPDF, jsPDF-AutoTable y SheetJS (XLSX)
- **Testing y Auditoría:** Playwright Chromium E2E

---

## 📦 Estructura del Proyecto

```text
├── app/
│   ├── admin/             # Panel del Comité Organizador (Pagos, Padrón, Llaves, Resultados)
│   ├── equipo/            # Consulta de equipo por código y gestión de plantilla del Capitán
│   ├── torneo/            # Pantalla pública en vivo del torneo (Brackets y Goleadores)
│   ├── globals.css        # Estilos globales y utilidades de Tailwind
│   ├── layout.jsx         # Layout principal con Navbar y AuthGate
│   └── page.jsx           # Formulario principal de registro y consulta de cupos
├── components/
│   ├── AuthGate.jsx       # Candado de acceso institucional con verificación OTP
│   ├── BracketTorneo.jsx  # Renderizado de llaves (Eliminación directa & Triangular)
│   ├── Navbar.jsx         # Barra de navegación con estado de sesión y rol
│   └── ReglamentoModal.jsx # Modal obligatorio con scroll y cuenta regresiva
├── lib/
│   ├── authService.js     # Gestión de sesiones y códigos OTP (@unitec.edu)
│   ├── bracketUtils.js    # Algoritmos de sorteo, BYEs y cálculo de tablas
│   ├── dbService.js       # Capa de datos híbrida (Firebase Firestore / Local)
│   ├── exportUtils.js     # Generador de planillas en PDF y libros Excel
│   ├── firebase.js        # Inicialización del cliente de Firebase
│   └── torneoConfig.js    # Reglas, fechas, cupos, colores y listas blancas
├── firestore.rules        # Reglas de seguridad oficiales para Firebase Firestore
├── vercel.json            # Configuración para despliegue en Vercel
└── package.json           # Dependencias y scripts de ejecución
```

---

## ⚙️ Configuración y Variables de Entorno

Copia el archivo `.env.example` como `.env.local` en tu entorno local, o agrégalo en la sección **Environment Variables** en el panel de **Vercel**:

```bash
# Firebase Firestore (Producción)
NEXT_PUBLIC_FIREBASE_API_KEY=tu_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=tu_proyecto.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=tu_proyecto_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=tu_proyecto.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=tu_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=tu_app_id

# Servicio OTP real a buzón institucional (Opcional - EmailJS)
NEXT_PUBLIC_EMAILJS_SERVICE_ID=
NEXT_PUBLIC_EMAILJS_TEMPLATE_ID=
NEXT_PUBLIC_EMAILJS_PUBLIC_KEY=

# Lista adicional de administradores autorizados (Separados por coma)
NEXT_PUBLIC_ADMIN_EMAILS=
```

> **Nota de Seguridad y Roles:** 
> - El acceso al panel `/admin` y los controles de torneo en vivo están restringidos por la lista blanca oficial de administradores en `lib/torneoConfig.js` y `firestore.rules`.
> - Cualquier usuario que inicie sesión con uno de los 11 correos autorizados del Comité Organizador (`andresvalle@unitec.edu`, `carlos.rubi@unitec.edu`, etc.) recibe automáticamente el rol `admin` y la insignia `👑 ADMIN`.
> - Puedes agregar administradores adicionales en cualquier momento sin modificar código definiendo la variable `NEXT_PUBLIC_ADMIN_EMAILS` en el panel de Vercel (ejemplo: `coord@unitec.edu,asistente@unitec.edu.hn`).

---

## 🚢 Despliegue en Vercel

1. Haz un fork o sube este repositorio a tu cuenta de GitHub.
2. Ingresa a [Vercel](https://vercel.com/) y selecciona **Add New Project**.
3. Importa el repositorio `PaladinDiego/Mecafut`.
4. En **Environment Variables**, pega las variables de tu archivo `.env.local`.
5. Haz clic en **Deploy**. ¡Tu plataforma estará lista en segundos!

---

## 🔥 Reglas de Seguridad de Firebase Firestore

Si utilizas Firebase Firestore, copia y pega el contenido del archivo `firestore.rules` en la pestaña **Firestore Database > Reglas** de tu consola de Firebase para proteger las colecciones:
- `equipos`: Registro oficial y comprobantes.
- `jugadores`: Padrón con números de cuenta, DNI y carnets.
- `configuracion`: Estado de inscripciones, llaves generadas y resultados en vivo.

---

## 💻 Desarrollo Local

```bash
# 1. Instalar dependencias
npm install

# 2. Iniciar servidor local
npm run dev

# 3. Iniciar servidor accesible por red Wi-Fi local (móviles y tablets)
npm run dev:lan

# 4. Compilar para producción
npm run build
```

---

## 📄 Licencia

Desarrollado para el Comité Organizador de **MECAFUT 2026** — Facultad de Ingeniería Mecatrónica, UNITEC Honduras.

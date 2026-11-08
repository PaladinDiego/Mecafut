# Informe inicial de diagnóstico técnico — MECAFUT Q4 2026

**Fecha:** 7 de noviembre de 2026  
**Tipo:** revisión estática inicial, de solo lectura  
**Prioridad:** preliminar; no equivale a una evaluación CVSS ni a una prueba funcional

## 1. Resumen ejecutivo

El grafo de Graphify (354 nodos, 680 enlaces, 22 comunidades) orientó la revisión hacia autenticación, elegibilidad para llaves, persistencia del torneo y exportaciones. La inspección directa del código encontró riesgos de seguridad y consistencia que conviene resolver antes de confiar datos reales a la plataforma:

1. El flujo OTP conserva el código universal `123456` para cualquier OTP que no se haya enviado como real, sin comprobar el entorno en la función que verifica el código.
2. La sesión y el rol de administrador se leen del `localStorage` del navegador; el repositorio no muestra una sesión de autenticación del lado servidor que proteja las operaciones de datos.
3. Si el backend activo es Firestore y se publicaron las reglas del repositorio, el padrón de jugadores se puede leer públicamente y cualquiera puede crear equipos marcados como confirmados.
4. La elegibilidad cuenta la presencia de una foto como si el carnet ya estuviera verificado.
5. La ruta Supabase puede responder como inscripción exitosa aunque falle la inserción de los jugadores.
6. La identidad de la sesión no queda vinculada al registro de capitán/jugador: el correo se puede cambiar en el formulario y la deduplicación de nube usa principalmente el número de cuenta escrito por el cliente. El perfil existente sirve para autocompletar, pero no mantiene un historial verificable entre ediciones.

También se detectaron escrituras de visibilidad que no persisten en Supabase, posible estado obsoleto en llaves eliminatorias, diferencias de formato para la categoría femenina y un corte de fecha calculado en UTC. Son observaciones de código: no se verificaron contra la base de datos desplegada ni contra usuarios reales.

## 2. Alcance y método

- Se usó el grafo existente y se consultaron conexiones entre `esEquipoAptoParaLlaves()`, `esJugadorHabilitado()`, `AuthGate`, `authService`, `dbService`, `bracketUtils`, `xlsx` y los módulos de torneo.
- Se contrastaron las conexiones con `lib/authService.js`, `components/AuthGate.jsx`, `lib/dbService.js`, `app/admin/page.jsx`, `lib/bracketUtils.js`, `app/torneo/page.jsx`, `lib/torneoConfig.js`, `lib/supabase.js`, `lib/firebase.js` y `firestore.rules`.
- Se leyeron las pruebas existentes como evidencia documental, pero no se ejecutaron pruebas, build, lint, escrituras ni llamadas al backend.
- No se abrió `.env.local`, no se consultó una consola de Firebase/Supabase y no se comprobó la configuración del sitio publicado.
- Se auditó también el análisis Graphify adjunto. Su consulta principal se expandió a `react`, `layout`, `navbar`, `admin`, `torneo`, `page`, `gate` y `modal`; ayuda a describir la arquitectura general, pero no recorre por sí misma la relación entre sesión, perfil, formulario y reglas de duplicados. Se hizo una consulta complementaria a `AuthGate`, `authService` y `guardarPerfil`; el grafo se usó para ubicar código y las conclusiones de identidad se verificaron directamente en las funciones fuente.

**Límite del grafo:** la relación transversal de `react` refleja una dependencia común entre varios módulos, no un defecto por sí misma. Graphify marca algunas relaciones como `INFERRED`; no deben tratarse como llamadas probadas. En particular, las copias de `esEquipoAptoParaLlaves()` en archivos de prueba no son rutas adicionales de producción. El diagnóstico de integridad del grafo contó 61 enlaces con un extremo sin nodo, 2 autoenlaces y pares que se colapsan al exportar como grafo sin dirección. El mapa sirve para orientar la revisión, pero no sustituye al código fuente.

## 3. Hallazgos priorizados

### F-01 — OTP universal aceptado fuera de desarrollo

**Prioridad preliminar: P1 — alta. Confianza: alta en el comportamiento del código; impacto efectivo condicionado por el proveedor OTP y las reglas del backend.**

`solicitarOtp()` guarda `modoReal: false` cuando no consigue enviar el mensaje. `verificarOtp()` acepta `123456` siempre que el OTP no sea real; también lo acepta si no hay registro OTP. La verificación no comprueba `NODE_ENV`. El flujo de “crear cuenta/olvidé mi contraseña” llama a `crearCuentaConOtp()`, que consume esa misma verificación. Después, `construirSesion()` asigna el rol a partir del correo permitido y el panel confía en el rol de esa sesión local.

**Evidencia:** `lib/authService.js:222-235, 263-299, 344-376, 459-468`; `components/AuthGate.jsx:60-73, 101-119`; `app/admin/page.jsx:113-120`.

**Impacto:** cuando el envío real no funciona o no se registra un OTP real, una persona puede obtener una sesión local con rol de administrador usando el código universal y un correo de la lista autorizada. Esto demuestra acceso a la interfaz; la capacidad de modificar datos depende de las reglas activas del backend.

**Mejora:** retirar el código universal del bundle de producción; mover generación, almacenamiento y validación OTP al servidor; bloquear la creación de sesión si el envío real falla; imponer límites de intentos y consumo de un solo uso. La sesión debe emitirse después de guardar correctamente la cuenta.

### F-02 — El rol local no constituye autorización del backend

**Prioridad preliminar: P1 — alta. Confianza: alta en el diseño visible; políticas externas no verificadas.**

`obtenerSesionActual()` solo parsea un objeto de `localStorage`; el panel administrativo abre cuando `s.rol === "admin"`. El rol no está firmado y el código del navegador lo puede modificar. El cliente Supabase usa la clave anónima y `persistSession: false`; en el código revisado no aparece una autenticación Supabase ni un endpoint propio que valide cada operación. El cliente Firebase inicializa Firestore, pero no Firebase Auth.

**Evidencia:** `lib/authService.js:316-324, 344-376`; `app/admin/page.jsx:113-120`; `lib/supabase.js:6-20`; `lib/firebase.js:3-21`.

**Impacto:** el bloqueo visual de `/admin` no basta para proteger datos. La protección depende por completo de políticas RLS de Supabase o reglas de Firestore. El repositorio no incluye políticas SQL de Supabase para comprobar quién puede leer y modificar cada tabla. En modo Firestore, las reglas esperan `request.auth`, pero el flujo de sesión examinado no obtiene una credencial de Firebase Auth; por ello el panel puede mostrarse como admin y aun así recibir rechazos del backend.

**Mejora:** definir una única identidad de servidor y exigirla en las políticas de datos. Confirmar las políticas efectivas del entorno activo con cuentas no privilegiadas y de administrador antes de cargar datos reales. Mantener la validación del rol fuera del `localStorage`.

### F-03 — Reglas Firestore exponen y permiten alterar datos personales

**Prioridad preliminar: P1 — alta si Firestore es el backend activo y estas reglas están publicadas. Confianza: alta en las reglas del repositorio; estado de publicación no verificado.**

Las reglas permiten `read: if true` para `equipos`, `jugadores` y `configuracion`. En `jugadores`, cualquier visitante puede crear documentos con validaciones mínimas y actualizar campos de documento/DNI; en `equipos`, la creación permite `estado` igual a `Confirmado`. Los registros creados por la aplicación incluyen DNI, correo, cuenta y foto del documento.

**Evidencia:** `firestore.rules:24-70`; estructura enviada a la base en `lib/dbService.js:491-509`.

**Impacto:** si esas reglas están activas, el padrón puede revelar datos personales y documentos; además, una creación directa puede evadir la revisión de pago. La regla de admin no corrige esto: las rutas públicas de lectura y creación no requieren `request.auth`.

**Mejora:** no exponer la colección privada completa; separar un resumen público de los registros personales; restringir lectura, actualización y creación por campo y propietario; aceptar estados de pago únicamente desde una operación privilegiada del servidor. Verificar las reglas publicadas, no solo el archivo local.

### F-04 — “Carnet verificado” se implementa como “foto presente”

**Prioridad preliminar: P1 — alta para la integridad del torneo. Confianza: alta.**

`esJugadorHabilitado()` devuelve verdadero si existe `fotoDocumento`/`foto_documento` o si el correo corresponde a un docente exento. `esEquipoAptoParaLlaves()` cuenta ese resultado para alcanzar el mínimo de ocho. Al registrar capitanes y jugadores, la misma condición inicializa `estado: "Aprobado"`; subir una foto también activa ese estado. No se comprueba una decisión de revisión humana ni otro indicador de verificación.

**Evidencia:** `lib/dbService.js:166-170, 373-404, 957-978`; `app/admin/page.jsx:30-43`; pruebas que aceptan la presencia de una cadena como carnet: `tests/verification_m4_challenger.mjs:483-492` y `tests/e2e/tier1_features.test.mjs:554-610`.

**Impacto:** un documento vacío, ilegible o falso puede contribuir al mínimo reglamentario y habilitar al equipo. Las pruebas actuales parecen consolidar esa interpretación aunque la interfaz y la regla se refieran a carnets “verificados”.

**Mejora:** separar estados `pendiente`, `subido`, `verificado` y `rechazado`; contar solo `verificado` (y docentes exentos); añadir evidencia y actor/fecha de revisión. Actualizar las pruebas para comprobar estados, no solo presencia de imagen.

### F-05 — Inscripción Supabase puede informar éxito con plantilla incompleta

**Prioridad preliminar: P1 — alta para integridad de registros. Confianza: alta.**

La rama Supabase inserta primero el equipo y después los jugadores en otra petición. Si falla la segunda, solo escribe un `console.error` y devuelve `codigoAcceso` como si la inscripción hubiera terminado. No hay transacción ni compensación en esa rama. La rama Firestore, en cambio, agrupa equipo y jugadores en `writeBatch()`.

**Evidencia:** `lib/dbService.js:468-517`; comparación Firestore: `lib/dbService.js:540-567`.

**Impacto:** el capitán puede recibir un código de acceso y confirmación mientras su equipo carece de plantilla en el padrón. Los contadores, elegibilidad, pagos y exportaciones posteriores pueden divergir.

**Mejora:** crear equipo y plantilla dentro de una función transaccional del backend, o implementar compensación explícita y devolver error si falla cualquier inserción. Confirmar el resultado de ambas operaciones antes de mostrar éxito.

### F-06 — Guardado de torneo no comprueba errores; visibilidad omite Supabase

**Prioridad preliminar: P2 — media-alta. Confianza: alta.**

`guardarTorneoCompleto()` espera la petición Supabase pero no inspecciona el campo `error` que devuelve el cliente; luego retorna los datos como si se hubieran guardado. Además, `actualizarConfigVisibilidadTorneo()` no tiene rama Supabase: con Supabase activo escribe en `localStorage`; si ambos proveedores están configurados, puede escribir Firestore mientras las lecturas generales priorizan Supabase. La administración llama esa función desde los controles de fecha y visibilidad.

**Evidencia:** `lib/dbService.js:1139-1167`; uso en `app/admin/page.jsx:1890-1900`.

**Impacto:** una llave o marcador puede parecer guardado y perderse al recargar. Los cambios de publicación/fecha pueden no llegar al proveedor que lee el público.

**Mejora:** centralizar todas las escrituras del torneo en el mismo adaptador que las lecturas; inspeccionar y propagar los errores Supabase; actualizar el estado de React solo después de confirmar persistencia remota.

### F-07 — Cambiar un ganador no invalida resultados posteriores

**Prioridad preliminar: P2 — media-alta. Confianza: alta.**

`propagarGanadorEliminacion()` cambia el ganador del partido y el equipo en el siguiente slot. No limpia el marcador, ganador, goleadores o campeón de rondas descendientes si el resultado anterior ya había avanzado. El formulario administrativo permite quitar el ganador guardando un valor nulo.

**Evidencia:** `lib/bracketUtils.js:314-355`; edición y persistencia desde `app/admin/page.jsx:502-546`.

**Impacto:** tras corregir un resultado preliminar, las rondas siguientes pueden conservar equipos/resultados incompatibles y el campeón puede quedar obsoleto.

**Mejora:** detectar cambios en un partido ya propagado e invalidar/recalcular toda la rama descendiente; pedir confirmación cuando la corrección afecte resultados publicados y mantener historial de cambios.

### F-08 — La categoría femenina permite cuatro equipos pero genera el triangular solo con tres

**Prioridad preliminar: P2 — media. Confianza: alta respecto del código y documentación consultada.**

La configuración permite hasta cuatro equipos femeninos. La generación automática usa el formato triangular especial únicamente cuando hay exactamente tres; con cuatro genera eliminación directa. El armado manual, por otro lado, exige exactamente tres. La documentación oficial describe un triangular de tres equipos.

**Evidencia:** `lib/torneoConfig.js:9-20`; `app/admin/page.jsx:293-307, 397-420`; `README.md:31-32`; `AGENTS.md:53-54`.

**Impacto:** un cuarto equipo puede inscribirse y luego recibir un formato distinto según el método de armado. El usuario administrador no tiene una regla uniforme para esa situación.

**Mejora:** definir una sola fuente de verdad para cupos y formato. Rechazar el cuarto equipo o documentar/aprobar el formato alternativo; hacer que armado automático y manual apliquen la misma regla.

### F-09 — La visibilidad automática usa fecha UTC en lugar de fecha local

**Prioridad preliminar: P2 — media. Confianza: alta en la conversión; impacto depende de la hora esperada de publicación.**

La vista pública compara `fechaEvento` con `new Date().toISOString().split("T")[0]`, que usa UTC. Tegucigalpa está en UTC−6: la fecha UTC cambia a las 18:00 hora local. Para una fecha de evento configurada como día calendario de Honduras, el modo automático puede cambiar a visible seis horas antes de la medianoche local.

**Evidencia:** `app/torneo/page.jsx:105-110`; fecha predeterminada con offset local en `lib/torneoConfig.js:23-28`.

**Mejora:** comparar fechas calendario con una zona horaria explícita (`America/Tegucigalpa`) y fijar por escrito si la regla cambia al inicio del día del evento o a una hora específica.

### F-10 — Cupos y duplicados dependen de lectura seguida de inserción

**Prioridad preliminar: P2 — media. Confianza: media; restricciones externas de base de datos no verificadas.**

La inscripción lee el resumen, comprueba cupos, nombre/color y luego inserta. La unicidad interequipos también consulta cuentas antes de insertar. Esas comprobaciones no son atómicas con la escritura; dos solicitudes simultáneas pueden superar un cupo o duplicar un valor si la base no impone restricciones equivalentes.

**Evidencia:** `lib/dbService.js:330-344, 431-457, 468-484`. No se encontró en el repositorio un esquema SQL o migración con restricciones únicas/RPC para cerrar esta carrera; esto no demuestra que no existan en el proyecto desplegado.

**Mejora:** aplicar cupos y unicidad dentro de una transacción o RPC del backend y respaldarlos con índices/restricciones. Mantener las validaciones del navegador como ayuda de UX, no como garantía de integridad.

### F-11 — Hash rápido de contraseña y mínimo de seis caracteres

**Prioridad preliminar: P2 — media. Confianza: alta.**

Las contraseñas se derivan con SHA-256 y un prefijo fijo combinado con el correo; la validación mínima es seis caracteres. No hay sal aleatoria por usuario ni un algoritmo diseñado para encarecer ataques de diccionario. El hash se guarda en la tabla `usuarios` cuando Supabase está configurado.

**Evidencia:** `lib/authService.js:380-385, 396-418, 421-424`.

**Impacto:** si se filtran hashes, probar contraseñas fuera de línea es barato. El impacto real depende de la política de acceso a esa tabla.

**Mejora:** delegar credenciales a un proveedor de autenticación o calcular hashes en servidor con Argon2id/scrypt/bcrypt y sal aleatoria. Aplicar límite de intentos y recuperación de cuenta también del lado servidor.

### F-12 — Guías de backend y despliegue se contradicen

**Prioridad preliminar: P2 — operativa. Confianza: alta.**

`AGENTS.md` instruye Firebase y Vercel; `README.md` muestra Supabase/Netlify pero también describe Firebase; `DEPLOYMENT_AI_GUIDE.md` nombra Supabase y Netlify y contiene apartados/diagramas de Firebase y Vercel. El código prioriza Supabase, después Firestore y finalmente almacenamiento local; `authService` usa Supabase o `localStorage`, no Firestore para cuentas.

**Evidencia:** `AGENTS.md:13-23`; `README.md:8-9, 46-56`; `DEPLOYMENT_AI_GUIDE.md:5-6, 21-27`; `lib/dbService.js:181-234`; `lib/authService.js:11-12, 396-418`.

**Impacto:** un despliegue puede configurar el proveedor equivocado, publicar reglas que no protegen el backend usado o creer que las cuentas sincronizan cuando quedan guardadas por navegador.

**Mejora:** declarar proveedor, proyecto, política de autenticación y hosting como configuración oficial única; alinear guías y retirar rutas obsoletas. Añadir una comprobación visible de backend activo que no muestre credenciales.

### F-13 — La identidad de sesión no se vincula con el registro ni conserva historial entre torneos

**Prioridad preliminar: P1 — alta para integridad del padrón y prevención de suplantación. Confianza: alta en el desacople visible en el código; autenticación real, restricciones y esquema desplegado no verificados.**

**Matiz sobre el acceso:** en el flujo actual, el OTP se usa al crear una cuenta o recuperar la contraseña; el ingreso habitual usa correo y contraseña. Por tanto, la aplicación no vuelve a demostrar el control del buzón en cada visita. Aunque el correo se hubiera verificado correctamente al crear la cuenta, el registro del torneo sigue aceptando un valor de correo separado.

**Evidencia y recorrido:**

- `components/AuthGate.jsx:37-48, 77-119` carga la sesión local y ofrece inicio cotidiano con contraseña; el texto de la interfaz reserva el OTP para crear cuenta/recuperar acceso. `lib/authService.js:263-324, 434-468` guarda el correo de la sesión en `localStorage`; no entrega al servicio de inscripción una identidad de servidor verificable.
- `app/page.jsx:83-113` copia el correo de sesión al formulario solo cuando el campo está vacío y autocompleta nombre, cuenta y otros campos desde el perfil. Los campos de correo siguen siendo editables (`app/page.jsx:501-510, 835-844`).
- Al enviar, `app/page.jsx:194-210` pasa el objeto editable `capitan` a `inscribirEquipo()` y después llama `guardarPerfil()` bajo el correo de sesión. De forma análoga, `app/page.jsx:221-237` pasa `jugadorSelf` a `agregarJugadorConCodigo()` y guarda el perfil bajo el correo de sesión. Así, la clave usada para identificar el perfil puede ser distinta del correo guardado en la fila del jugador.
- Sí existe un perfil parcial en `usuarios`, consultado por correo y usado como autocompletado (`lib/authService.js:396-418, 471-510`). Tras una inscripción se actualizan campos como nombre, cuenta, DNI y carrera bajo el correo de sesión, pero no se conserva cada versión: se sobrescriben los valores actuales y se omiten campos vacíos. Este perfil no es una relación obligatoria entre la cuenta y cada fila de inscripción.
- En Supabase, la inscripción de equipo consulta repetidos por `cuenta` y no compara el correo (`lib/dbService.js:453-465`); el alta individual también busca duplicados por `cuenta` (`lib/dbService.js:767-777`). La rama Firebase hace una comprobación equivalente por cuenta (`lib/dbService.js:523-540, 810-816`). La rama local sí revisa cuenta, correo y DNI al cruzar equipos (`lib/dbService.js:579-604, 838-849`), de modo que el comportamiento varía según el proveedor.
- Las filas de jugador examinadas se guardan con los datos suministrados y el vínculo al equipo (`lib/dbService.js:491-510, 780-799`); no incluyen un identificador estable de usuario ni una clave explícita de edición/temporada en esos caminos. En el repositorio no se encontró un esquema SQL o migración que permita confirmar restricciones adicionales en Supabase.

**Impacto:** una persona con una sesión local asociada al correo A puede enviar en el formulario otro correo B y una cuenta estudiantil modificada; las validaciones de dominio solo comprueban el formato del correo recibido. Además, `esDocenteAutorizado()` se decide a partir del correo editable (`lib/dbService.js:361-369, 741-756`), por lo que escribir uno de los correos docentes reconocidos puede activar excepciones reglamentarias de DNI/carnet y participación múltiple. En las ramas cloud, cambiar un dígito de la cuenta puede eludir la comprobación actual si la nueva cuenta no coincide con otra fila. A la vez, `guardarPerfil()` puede almacenar los datos del formulario bajo la identidad A sin registrar que se declararon como B. Si el caso se repite entre Q4 y Q1, el sistema visible no ofrece un historial que una ambas declaraciones por usuario ni que señale el cambio de nombre o cuenta; cuando la escritura funciona, el perfil conserva como máximo el último valor actualizado. Esto coincide con los testimonios y explica el mensaje de cuenta duplicada cuando la misma cuenta sí se vuelve a usar.

**Mejora prioritaria propuesta:**

1. Enlazar cada cuenta a un identificador estable emitido por autenticación confiable del backend y a un correo institucional verificado. El servidor debe derivar la identidad desde esa sesión; no debe confiar en `correo` enviado por el formulario. El campo de correo puede seguir visible en gris/no editable por claridad, pero esa presentación solo complementa la regla del backend.
2. Separar identidad de datos académicos: el usuario estable identifica a la persona; nombre, cuenta, DNI y carrera son atributos declarados que pueden cambiar y deben guardarse como instantáneas por edición/torneo. Un cambio de cuenta o nombre bajo el mismo usuario debe quedar registrado y, si corresponde al reglamento, marcarse para revisión, no convertirse en otra identidad ni sobrescribir silenciosamente la anterior.
3. Aplicar unicidad por usuario y edición dentro de una operación atómica del backend, conservando las excepciones reglamentarias de docentes. Definir una política para cambios de cuenta y para el historial antes de migrar datos existentes.
4. Diferenciar autoinscripción de altas hechas por un capitán: la sesión del capitán solo prueba su propia identidad. Los correos de compañeros introducidos por él deben quedar pendientes de verificación o vincularse cuando cada compañero reclame su registro; no deben tratarse como correos ya verificados del capitán.
5. Conservar únicamente los datos históricos necesarios y establecer quién puede consultar documentos y cuánto tiempo se retienen, para no convertir la trazabilidad en acumulación indefinida de carnets o DNI.

**Límite:** el repositorio muestra el desacople y las validaciones del cliente, pero no permite confirmar el esquema, las restricciones, políticas RLS ni la identidad del proveedor activo en producción. La captura con cambio de número y el relato de los compañeros son evidencia reportada, no una reproducción independiente en el entorno publicado.

## 4. Otras señales y límites

- El grafo muestra `esJugadorHabilitado()` entre los nodos centrales que enlazan inscripción, documentos y admin. La conexión ayuda a localizar el problema de semántica, pero la evidencia principal es la función en código.
- El análisis Graphify adjunto explica puentes entre comunidades, dependencias y deuda de modularización (`dbService.js`, `app/admin/page.jsx`), pero su consulta destacada sobre React no demuestra ni descarta una asociación entre el usuario autenticado y sus registros. La evidencia de F-13 viene del recorrido del código de autenticación, autocompletado, envío de formularios, persistencia y deduplicación.
- La centralidad de `react` y `xlsx` es esperable por ser dependencias compartidas; no es por sí sola motivo de refactorización.
- La extracción semántica de Graphify no produjo nodos para 3 de 11 documentos considerados. El informe del grafo no cubre todo el contenido documental.
- No se confirmó qué proveedor está activo en producción, qué reglas RLS existen en Supabase, si estas reglas Firestore están publicadas, si EmailJS entrega correos ni si las rutas descritas pasan en navegador.
- Las métricas de Graphify (cohesión, puentes y conexiones `INFERRED`) son guías de navegación, no severidades ni pruebas de fallo.

## 5. Orden recomendado de verificación y mejora

1. **Contener autenticación y fijar identidad:** retirar el OTP universal de producción; verificar correo de forma confiable en servidor; enlazar el usuario autenticado con inscripciones y distinguir datos actuales de instantáneas por torneo. Confirmar que cambiar correo/cuenta desde el cliente o llamar la base directamente no evada la regla.
2. **Cerrar autorización y privacidad:** inspeccionar políticas reales del proveedor activo con una cuenta anónima, una cuenta regular y una cuenta administradora; revisar exposición de jugadores/documentos e historial.
3. **Asegurar integridad de inscripción:** volver atómica la creación equipo+plantilla y la unicidad por usuario/edición; probar fallos parciales y concurrencia en entorno sintético.
4. **Alinear elegibilidad:** diferenciar foto subida y carnet aprobado; actualizar función, interfaz y pruebas con decisiones de revisión.
5. **Corregir persistencia del torneo:** manejar errores Supabase y guardar visibilidad en el mismo proveedor de lectura.
6. **Proteger resultados:** invalidar descendientes cuando se corrige un partido; unificar cupo y formato femeninos; fijar zona horaria del cambio automático.
7. **Consolidar despliegue y seguridad de contraseñas:** elegir una guía operativa y sustituir hashing del cliente por autenticación/derivación segura en servidor.

## 6. Conclusión

Este primer análisis no permite afirmar que el despliegue actual sea vulnerable o que estos fallos ya hayan ocurrido en producción. Sí demuestra rutas concretas en el código que justifican priorizar autenticación/autorización, privacidad de jugadores, identidad persistente entre ediciones y consistencia de registros antes de una aceptación funcional. La siguiente fase debería comprobar las políticas del backend activo y ejecutar pruebas negativas y de fallo parcial con datos sintéticos, sin usar datos reales del torneo.

# Regla de Implementación y Despliegue para Agentes IA

Cuando se te solicite implementar, configurar o desplegar este proyecto:
1. Lee obligatoriamente `AGENTS.md` y `DEPLOYMENT_AI_GUIDE.md` en la raíz del repositorio.
2. Identifica si el usuario cuenta con credenciales de Firebase Firestore (`NEXT_PUBLIC_FIREBASE_*`) o requiere guía para crearlas.
3. Verifica que la compilación pase con `npm run build` sin errores estáticos.
4. Recuerda que hay 11 administradores autorizados por defecto en `lib/torneoConfig.js` y que se pueden agregar más vía `NEXT_PUBLIC_ADMIN_EMAILS`.
5. Si tocas archivos de código, corre `graphify update .` al finalizar.

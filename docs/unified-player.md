# Reproductor unificado

- `/player` muestra Portada, Letras y Video cuando el motor de YouTube está activo. Video abre por defecto para fuentes online; audio sin video conserva Portada y Letras.
- `/online-player` conserva compatibilidad con enlaces y redirige a la misma pantalla. La interfaz duplicada se retiró.
- La superficie nativa reutiliza el motor de YouTube existente. Los cambios de pestaña no ordenan cargar otra canción.
- El progreso online se publica en el almacén selectivo usado por letras y referencias de posición, sin actualizar el proveedor por cada muestra.
- Temporizador: opciones de 5 a 90 minutos, entrada de 1 a 720 minutos, cuenta atrás al abrir, ampliar cinco minutos y cancelar. Verifica vencimiento al volver al primer plano. El disparo durante suspensión de JavaScript sigue dependiendo del sistema; pendiente probar pantalla bloqueada.
- Ajustes ya no ofrece importar Muzio. Se conservan los datos importados.

## Verificación

Lint, TypeScript, 230 pruebas Node y exportación Android correctos. Se observó un video en la nueva pantalla en el celular conectado. Pendiente comprobación manual de cambio entre pestañas, letras online, fallback de video bloqueado y temporizador con pantalla bloqueada. No se creó otro APK; los cambios cargan mediante Metro en la development build existente.

## Continuidad al minimizar

Se conserva `route: online-player` como identificador del protocolo nativo: los APK existentes lo usan para clasificar reproducción individual, restaurar órdenes locales y abrir notificaciones. La ruta visual de compatibilidad sigue abriendo el reproductor unificado. El contenedor nativo concede 500 ms de protección frente a pausas durante el traslado de la WebView; aplica la intención vigente al completar el traslado, sin borrar interrupciones locales reales ni reconstruir el video.

Validación: lint, TypeScript, 230 pruebas Node y `compileDebugKotlin` correctos. La parte de Android requiere una nueva development build. Pendiente comprobar minimizar/reabrir con video, Portada, pantalla bloqueada, pausa explícita y desconexión de audífonos; el teléfono no está conectado.

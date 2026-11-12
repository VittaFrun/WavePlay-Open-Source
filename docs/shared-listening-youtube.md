# Salas con YouTube y controles colaborativos

## Implementado

- Selector Dispositivo / YouTube: búsqueda o enlace, validación de video reproducible y acciones al final, siguiente o ahora.
- Desde Explorar, una sala activa solicita la acción antes de añadir el video.
- Cada participante reproduce el video desde el reproductor oficial visible; no se sube audio de YouTube a Storage.
- Estado compartido con reloj del servidor y revisión: pausa, reproducción, búsqueda de posición, anterior y siguiente. Las órdenes obsoletas se rechazan y recuperan el estado actual.
- Solo el anfitrión controla inicialmente. Puede activar controles colaborativos para participantes activos. Los permisos se verifican en el servidor.
- El anfitrión avanza al terminar el video. La retirada opcional de canciones terminadas conserva los originales locales.
- El reproductor se desmonta al salir de foco o pasar a segundo plano. Al regresar aplica el estado de la sala.
- Se conserva el mecanismo de archivos locales, sus cuotas y limpieza temporal. YouTube ocupa metadatos, no archivos de audio.

## Despliegue del servicio

Migración `20261007142504_youtube_rooms_collaborative_controls.sql` aplicada. Función `room-audio-cleanup` actualizada para limpiar archivos solo de entradas locales, conservando la autenticación existente.

## Verificación

Lint y TypeScript sin errores. Pruebas Node de enlaces, permisos, reloj y puente del reproductor. Pruebas transaccionales del servidor: invitado bloqueado en modo anfitrión, autorizado en colaborativo, revisión antigua rechazada, usuario ajeno bloqueado y canción actual protegida. Datos de prueba revertidos.

Exportación Android verificada. Expo Doctor informa dos avisos existentes: configuración nativa con carpetas Android y seis actualizaciones de parches de Expo disponibles.

## Validación pendiente en dispositivos

El emulador abre la versión de desarrollo, pero necesita iniciar sesión. El teléfono conserva el APK anterior. Ambos deben usar esta versión para comprobar una sala con YouTube.

Probar: anfitrión crea sala; invitado entra; ambos añaden videos; anfitrión reproduce, pausa y cambia posición; activa colaboración y el invitado repite; desactiva colaboración y comprueba restricciones; navegación fuera de la sala y regreso; video terminado y retirada opcional; archivo local después de YouTube.

La sincronización usa correcciones periódicas, no garantiza precisión de muestras de audio. Anuncios, restricciones regionales y buffering pueden diferir entre participantes. YouTube requiere la sala visible. WebRTC, extracción, reproducción oculta y PiP no forman parte de esta etapa.

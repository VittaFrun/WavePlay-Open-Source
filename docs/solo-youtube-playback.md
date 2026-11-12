# YouTube individual en Android

La búsqueda conserva la ruta online-player. Cuando existe el módulo nativo,
la vista utiliza la misma WebView persistente que las salas. El coordinador
global elige una única fuente; entrar a una sala retira la sesión individual.
Iniciar una canción local detiene YouTube y recupera la sesión multimedia local.

Volver conserva la sesión individual. El minirreproductor permite volver a la
vista, pausar y reanudar después de una interrupción. La notificación abre
online-player y ofrece reinicio, pausa y reanudación; no anuncia una siguiente
canción cuando no existe cola individual. Detener termina esa sesión.

El progreso no provoca renders de controles ni nuevos comandos. Las revisiones
se incrementan en acciones explícitas; el cambio de video reutiliza el iframe.
No se añaden dependencias ni se extrae el flujo de YouTube.

En plataformas o APK sin módulo se conserva el reproductor visible anterior:
esa alternativa no implementa el segundo plano individual.

Verificación: lint y TypeScript correctos, 116 pruebas Node aprobadas y
exportación Android correcta. La compilación Kotlin comprueba el cambio de
ruta y controles de la notificación. No hay dispositivos conectados durante
esta implementación; sigue pendiente probar pantalla bloqueada, apertura
desde notificación, cambio local/YouTube/sala y pérdida de foco de audio.
La ruta de notificación y sus controles necesitan un APK que incluya este
cambio nativo; el APK preview anterior no contiene esta implementación.

Revisión de descargas: el motor utiliza newCachedThreadPool y la interfaz
inicia cada trabajo inmediatamente; permite varias descargas sin límite
explícito. Cada trabajo convierte a MP3, añade metadatos y carátula y escanea
la biblioteca al guardar. El guardado en carpeta elegida realiza lectura y
escritura Base64 del archivo completo. Son candidatos a medición y mejora;
no se ha modificado este flujo ni medido una ganancia en el dispositivo.

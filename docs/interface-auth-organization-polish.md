# Pulido de interfaz, acceso y organización local

## Implementado

- Superficie compartida del minirreproductor para canciones locales y YouTube, con fondo opaco y desenfoque pequeño cuando corresponde al tema.
- Reproductor YouTube más compacto. Las acciones de canción y temas están en el ajuste del encabezado; se elimina el menú inferior duplicado.
- Controles de playlist fuera de los elementos arrastrables; se mantiene el arrastre rápido y se desactiva el segundo controlador de desplazamiento por defecto para evitar competencia con el nativo.
- Importador de playlists accesible mediante un botón compacto y exclusivamente desde un enlace. La mezcla online se mueve al inicio de Explorar.
- Inicio de Explorar con recientes, favoritos, playlists y sugerencias explícitas. No hace búsquedas remotas automáticas.
- Alertas centralizadas en una cola: superficie consistente con los menús, confirmaciones destructivas, accesibilidad, respeto a movimiento reducido y protección frente a pulsaciones repetidas sobre un aviso ya cerrado.
- Aviso de nueva versión con versión y notas. Se escucha la detección automática o manual, se evita cubrir la pantalla de actualización o acceso y se recuerda la versión pospuesta. No se instala nada automáticamente.
- Bienvenida de autenticación con Google, correo, crear cuenta y Continuar sin cuenta. Accesible desde Perfil, Cuenta y salas; no se convierte el acceso en requisito al abrir la app. Los formularios aparecen tras elegir correo. Se mantienen Google nativo, Supabase y el callback existentes.
- Cuenta utiliza la suscripción de usuario existente en lugar de abrir otra lectura y suscripción de autenticación. Los respaldos siguen disponibles sin cuenta.
- Ajustes → Organizar archivos: revisión previa para mover música local a Music/WavePlay, opcionalmente por artista/álbum. Android 11 o posterior y nueva compilación con el módulo nativo.

## Protección de archivos

El organizador conserva identificadores MediaStore y actualiza metadatos en una transacción SQLite, sin reconstruir playlists, favoritos, letras ni historial. Los vínculos online y las descargas mantienen el identificador original. No se usa coincidencia por título para vincular archivos.

El usuario confirma la revisión y el permiso del sistema. Los movimientos son secuenciales, pausables entre archivos y recuperables mediante un diario interno antes de cada movimiento. Una interrupción entre mover e indexar permite recuperar la indexación sin volver a mover el archivo. Se comprueban identidad, tamaño, nombre, versión de MediaStore y destino; las colisiones se resuelven con nombres distintos. Al finalizar se retira el diario completado y su caché de metadatos. No hay organización automática al abrir la pantalla.

## Verificación

- TypeScript: correcto.
- Expo lint: correcto.
- Node: 214 pruebas, todas correctas. Incluyen conservación de relaciones SQLite, interrupción y recuperación de organización, cancelación de permisos, acciones repetidas, cola de alertas, descarte y revisiones de avisos de actualización.
- Exportación Android: correcta.
- Compilación Kotlin del módulo nativo y su registro en el paquete: correcta.
- Expo Doctor: 19/21. Se mantienen dos avisos existentes: configuración nativa no sincronizada automáticamente por CNG y nueve paquetes con parches disponibles dentro de SDK 57. No se han actualizado dependencias en esta fase.

Registros en .cache/performance/alerts-auth-*.log e interface-organizer-kotlin.log. No se ha iniciado un APK nuevo ni publicado esta fase.

## Pendiente de dispositivo

ADB no presenta dispositivos conectados al comprobar esta fase. Falta validar visualmente los formularios y modales, Google real, teclado, accesibilidad, arrastre rápido con biblioteca grande y la autorización/movimiento real de archivos en Android. La compilación nativa por sí sola no prueba el comportamiento de MediaStore de cada fabricante. No se han movido canciones del usuario desde este equipo ni se han medido mejoras de FPS en esta fase.


## Revisión en emulador — 26 de octubre de 2026

Se creó y abrió WavePlay_QA (Android 15 / API 35, Google APIs x86_64) utilizando la instalación completa de emulator-2. La imagen y la aceleración AEHD estaban disponibles; no había AVD registrados. Se instaló waveplay-review-development.apk existente y se cargó el código actual desde Metro en el puerto 8081. Se corrigió la conexión del servidor, que con --localhost escuchaba solamente en IPv6; --lan permite el túnel ADB por IPv4. No se modificaron datos del celular ni se generó un APK.

Comprobación visual: bienvenida con fondo anime y acciones Google/correo/crear cuenta/continuar sin cuenta. Se abrió correo y se verificó el error de correo vacío sin realizar un inicio de sesión remoto. Continuar sin cuenta regresó a la navegación principal. Ajustes y Explorar también se visualizaron. No se encontraron errores ReactNativeJS:E ni AndroidRuntime:E en el recorrido consultado.

Capturas: .cache/performance/emulator-welcome.png y emulator-signin.png. La captura emulator-alert.png corresponde a Explorar: no debe presentarse como evidencia de una alerta. El usuario comenzó a revisar simultáneamente y se detuvo la automatización de toques para no interferir.

Pendientes: confirmaciones personalizadas y aviso real de actualización en el emulador, acceso Google real y funcionamiento nativo del organizador. La build existente no incluye el nuevo módulo de organización. El emulador y Metro quedan abiertos para la revisión del usuario. Por memoria disponible de la PC y herramientas de desarrollo activas, esta sesión no valida objetivos de rendimiento del teléfono.


## Cierre del cliente de desarrollo durante la revisión

Logcat confirmó un cierre nativo a las 20:54:37 UTC: IllegalStateException: closed, en OkHttp TaskRunner → MessageDeflater → RealBufferedSink. No hubo una excepción JavaScript asociada. El inspector de red de Expo negocia perMessageDeflate en /inspector/network; el cliente nativo instalado sigue usando su implementación compilada de OkHttp.

Se añadió scripts/patch-expo-devtools.cjs al postinstall: desactiva exclusivamente la compresión del WebSocket del inspector de red del servidor de desarrollo. Mantiene el inspector y la retransmisión de mensajes, así como el límite de 16 MiB. No altera los sockets remotos ni incorpora un manejador que silencie excepciones. El parche es idempotente y falla explícitamente si cambia la estructura esperada de Expo CLI. Es una mitigación de la ruta que falló, no una actualización del código nativo del APK existente.

Se reinició Metro con dos workers para limitar la presión de memoria de la PC. La app volvió a cargar en el emulador (nuevo proceso 5795), conservando datos. No aparecen nuevas excepciones en el registro consultado después del cierre original. Captura: .cache/performance/emulator-recovered.png.

Validación: lint y TypeScript correctos; 215 pruebas Node aprobadas. La nueva prueba abre conexiones WebSocket reales contra el servidor del inspector, comprueba que no se negocia compresión, verifica la retransmisión tras tres reconexiones y conserva el límite de mensajes. Falta observar un uso más prolongado; no se asegura que todo cierre de cualquier WebSocket quede resuelto con este cambio de desarrollo.

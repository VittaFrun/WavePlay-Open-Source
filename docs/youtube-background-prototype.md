# Prototipo Android: YouTube en segundo plano

## Arquitectura

Una instancia de WebView pertenece al proceso de WavePlay. Dos superficies nativas la alojan: la vista de la sala y una superficie persistente fuera del navegador. Cambiar de pantalla mueve la misma instancia; no crea otro reproductor ni vuelve a descargar metadatos.

El ajuste local **YouTube en segundo plano** activa un servicio `mediaPlayback` con MediaSession, notificación, controles de anterior/pausa/siguiente y posición. El invitado sin permisos puede suspender o reanudar su audio local; las acciones de la cola siguen verificándose en el servidor. El ajuste está desactivado inicialmente.

La WebView adapta sus avisos nativos de visibilidad cuando está activo el ajuste. No se extraen enlaces de audio ni se descargan videos. Chromium conserva la gestión del foco de audio; el servicio no crea otro cliente de foco. Desconectar audífonos suspende el audio local. Una interrupción requiere reanudar en el dispositivo.

El servicio aplica correcciones cada ocho segundos y solicita recuperar el estado de la sala cada quince segundos mediante el puente nativo. Realtime continúa como señal principal. Los eventos usan identificador de canción y revisión para descartar finalizaciones antiguas. El anfitrión también corrige el reloj compartido cuando su posición real difiere del estado proyectado.

El bloqueo parcial de CPU se libera al pausar, interrumpir o detener el servicio. Tiene un vencimiento de seguridad de treinta minutos y se renueva cuando hay reproducción activa. Una pausa de cinco minutos detiene el servicio. Salir de la sala, cerrar sesión o cambiar a audio local libera el reproductor y la notificación de YouTube. No se garantiza continuar tras forzar el cierre de WavePlay o la destrucción del proceso.

## Compilación

Los clientes de desarrollo antiguos conservan el reproductor visible y muestran el ajuste deshabilitado. Esta función necesita una nueva compilación nativa. Perfil EAS `development`: cliente de desarrollo para arm64 y x86_64. La compilación que se instale debe conservar la firma actual del dispositivo; no desinstalar la app para resolver diferencias de firma.

## Aceptación pendiente

No considerar verificado el segundo plano solo por pasar pruebas JavaScript o compilar Kotlin.

1. Instalar la nueva compilación en teléfono y emulador; entrar con cuentas distintas.
2. Activar el ajuste en ambos. Reproducir un video e ir a Inicio y Biblioteca: mismo audio, sin recarga ni duplicación.
3. Bloquear las dos pantallas diez minutos. Confirmar que ambos siguen escuchando.
4. Pausar y avanzar desde la notificación del anfitrión. Activar colaboración y repetir desde el invitado.
5. Esperar al final de un video: la siguiente entrada debe reproducirse en ambos dispositivos.
6. Desconectar audífonos o simular una interrupción. Confirmar suspensión local y reanudación voluntaria.
7. Desactivar el ajuste: al dejar la sala el audio local se suspende; al volver recupera la posición compartida.
8. Alternar video y archivo local. Confirmar una sola notificación activa y controles correctos.
9. Abandonar la sala/cerrar sesión. Confirmar que servicio, bloqueo de CPU y browser se liberan.

Registrar versión de Android/WebView, desfase observado y consumo. El comportamiento puede variar entre fabricantes, anuncios y versiones de WebView; el prototipo todavía necesita estas pruebas reales.

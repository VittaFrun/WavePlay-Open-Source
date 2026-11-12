# Recuperación de reproducción local — 22 de octubre de 2026

## Cambios

- La sesión no se escribe hasta terminar de leer su checkpoint anterior. Las consultas de datos secundarios se ejecutan después de recuperar la cola.
- Se restaura por identificador y ocurrencia, no únicamente por índice. Si falta la canción activa se elige la siguiente disponible (o la anterior al final), desde cero. Se descartan archivos marcados como ausentes y entradas temporales de salas.
- Se respetan las colas vaciadas expresamente, sin resucitar una cola heredada.
- Cola y checkpoint se guardan en una única transacción SQLite, manteniendo la serialización existente. Las actualizaciones de posición no reescriben la tabla de cola.
- La posición se aplica después de cargar el audio. Una generación invalida búsquedas de posición correspondientes a una canción anterior.
- Se guarda al pausar, cambiar de cola/orden, mover la barra y cambiar de estado de la app. Durante la reproducción hay checkpoints cada cinco segundos, también en segundo plano; se deduplican instantáneas sin cambios.
- Pasar a YouTube o entrar en una sala guarda primero la sesión local. La reproducción compartida no la sobrescribe. Si una sala se abre durante el arranque, la sesión local leída se conserva para salir de ella.
- Quitar canciones actualiza también el orden original; desactivar aleatorio no vuelve a añadir canciones retiradas. Las acciones de cola actualizan referencias inmediatamente y no ejecutan efectos dentro de actualizadores de estado React.
- Recuperar la sesión prepara el audio pausado. La pérdida de foco y el micrófono del juego conservan su configuración anterior.

## Alcance y límites

Esta fase corrige el checkpoint del reproductor local. No añade persistencia de la cola independiente de YouTube ni reconexión automática a una sala después de terminar el proceso; las salas mantienen su recuperación de conexión ya existente. No cambia el esquema remoto, respaldos ni archivos musicales.

Un cierre forzado puede conservar solo el último checkpoint completado; no se promete guardar código JavaScript después de que Android termine el proceso. En funcionamiento normal la posición se guarda cada cinco segundos y en las acciones indicadas.

## Verificación

- TypeScript y lint aprobados.
- 147 pruebas Node aprobadas. Nueve regresiones nuevas cubren recuperación por identidad, archivos ausentes, cola vacía, datos malformados, ocurrencias repetidas, seeks obsoletos, carga fallida y escritura transaccional en lotes con rollback simulado.
- Exportación Android aprobada.
- No hay cambios nativos: se puede revisar con la development build instalada, sin crear otro APK.
- Pendiente validar un cierre/reapertura real en el teléfono: al terminar las verificaciones ADB no detectaba el dispositivo. La prueba requiere una canción local adelantada aproximadamente un minuto y pausada, revisar checkpoint, reiniciar y verificar canción, posición, cola y ausencia de reproducción automática.


## Prueba real completada — 22 de octubre de 2026

Dispositivo `23117RA68G`, Android 16, development build 1.1.0 (3).

Después de conectar Metro y cargar los cambios, se capturó la sesión pausada, se terminó el proceso con `am force-stop` y se reabrió sin limpiar datos. La comparación válida final dio:

- Canción: mismo identificador antes/después (`1000280136`).
- Posición SQLite: **122,580 s antes y después**.
- Cola: **6 canciones, mismo orden**.
- Índice, repetición y aleatorio: iguales.
- Interfaz Android mediante jerarquía de accesibilidad: **2:02**, botón **Reproducir**, **Cola · 6**. Confirma posición recuperada y reproducción pausada.
- Evidencia local: `.cache/performance/recovery-final-before/session.json` y `.cache/performance/recovery-final-after/result.json`.

La primera lectura, anterior a reconectar el código actualizado, tenía una posición de disco desfasada. No se usó como prueba aprobada. También apareció un error del lanzador de desarrollo al adjuntarse a una instancia caliente (`App react context shouldn't be created before`); se recuperó mediante un arranque en frío. Esa incidencia no se presenta como una validación del APK preview.

La posición publicada en MediaSession al restaurar estando pausado no coincidía con la posición de la interfaz (marcaba cero). Queda registrada para revisar los metadatos de notificación al restaurar; esta prueba confirma la recuperación del reproductor y del checkpoint, no ese indicador de notificación.

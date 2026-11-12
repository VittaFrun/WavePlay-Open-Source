# Auditoría del motor de descargas de WavePlay

Fecha: 26 de octubre de 2026. Alcance: revisión de código Android, orquestación React, transporte alternativo Python, persistencia, guardado, notificaciones y pruebas. No se modificó el motor ni se creó un APK durante la auditoría.

## Estado actual

- Android usa youtubedl-android/FFmpeg 0.18.1, con hasta dos trabajos de extracción/descarga/conversión simultáneos en un executor fijo. Los demás esperan en su cola de memoria.
- Una carpeta UUID por intento aísla los archivos. Los duplicados de identificador activo se rechazan; no se deduplican canciones por su identidad de origen.
- Todos los trabajos producen MP3 a 192, 256 o 320 kb/s; la opción inicial es 320. Se añaden metadatos y carátula antes de guardar.
- La carpeta elegida usa copia nativa de 64 KiB. El escaneo final se agrupa. React filtra cambios de progreso por 2 puntos y SQLite/notificaciones por hitos de 5 puntos.
- Persistir historial no equivale a persistir ejecución: faltan reconciliación del trabajo real, destino recuperable y reanudación al reiniciar el proceso.

## Hallazgos prioritarios

### 1. Carrera de cancelación antes de crear el trabajo nativo — alta

`src/services/downloader.ts:18` solicita permiso de notificaciones antes de registrar/iniciar el trabajo. `cancelDownload` no tiene un token compartido con ese paso. Puede cancelar un identificador aún inexistente y después iniciar la descarga.

Reproducción aislada con el código real del transporte y un módulo nativo simulado: mantener pendiente el permiso, cancelar el trabajo y resolver el permiso. Resultado: una llamada de cancelación y una descarga nativa iniciada después. Evidencia: `.cache/performance/downloader-audit-probe.cjs`.

Hay otra ventana en Android entre comprobar el indicador cancelado y registrar el proceso en yt-dlp. El resultado visual también necesita confirmación: hoy la interfaz declara Cancelada antes de saber si el proceso se detuvo.

Propuesta: identidad estable del trabajo más identificador por intento, cancelación compartida en todas las fases, estado Cancelando y confirmación terminal. Definir un punto de compromiso del guardado; no borrar un archivo ya publicado para simular una cancelación tardía.

### 2. Se pierde el audio preparado si falla el guardado — alta

`src/app/(tabs)/downloads.tsx:61` libera siempre el resultado en finally. Si se agotó el espacio, faltó permiso o falló el proveedor de carpetas después de descargar/convertir, el reintento vuelve a procesar todo.

Propuesta: conservar temporalmente el resultado validado y ofrecer Reintentar guardado. Registrar etapa y URI de staging; borrar después de publicar o tras una caducidad limitada. No mantener cachés ilimitadas.

### 3. No hay recuperación de trabajos tras terminar el proceso — alta

`WaveProvider.tsx:289` carga estados guardados sin consultar el executor ni corregir trabajos que ya no existen. `running`, cancelaciones y continuaciones del guardado viven en la pantalla. Un cambio normal de pestaña no demuestra que se detengan: las promesas pueden continuar. El problema es la falta de un coordinador duradero y de reconciliación al recrear pantalla/proceso.

Propuesta: sacar ejecución/guardado de la pantalla, conservar una única fuente de verdad nativa y reconciliar SQLite, staging y destino al arrancar. Un trabajo interrumpido no debe aparecer indefinidamente como Descargando.

### 4. Notificación de progreso sin ejecución de descarga protegida — alta

La descarga se ejecuta en threads del módulo React; no existe un servicio/job Android específico de transferencias. Una notificación normal no mantiene por sí sola vivo el trabajo al bloquear el teléfono o cuando Android termina el proceso.

Propuesta: coordinador compatible con Android 24–36. Evaluar jobs de transferencia iniciados por el usuario en Android 14+ y una alternativa apropiada para versiones anteriores; tratar conversión como procesamiento de archivos, respetando límites del sistema. No prometer continuidad después de Forzar detención.

### 5. Guardado sin reconciliación de destino — alta

La ruta SAF crea el archivo final directamente. No guarda su URI en DownloadItem y no valida tamaño/audio al terminar. En MediaLibrary, crear el asset y persistir Done son operaciones separadas: un cierre entre ambas puede producir una descarga duplicada al reintentar. Un fallo de eliminación tras una copia parcial se ignora.

Propuesta: registrar destino, bytes y fase antes de escribir; comprobar el archivo y reconciliar antes de repetir. MediaStore IS_PENDING donde corresponda; en SAF usar staging/renombrado solo si el proveedor lo admite. No existe una transacción única universal que englobe archivos y SQLite: hace falta un diario recuperable.

### 6. Solo con Wi-Fi se comprueba una vez — media/alta

La verificación está en la pantalla antes de entrar al executor. Una tarea puede esperar en cola y empezar después con datos móviles; tampoco se reevalúa durante la transferencia.

Propuesta: condición de red del coordinador, revisada al comenzar y cuando cambia la conexión. Estado Esperando Wi-Fi y reanudación segura cuando vuelva. Tratar correctamente VPN y conectividad sin internet.

### 7. Vista previa obsoleta puede asociarse a otra URL — media/alta

`downloads.tsx:37` aplica el resultado sin comparar petición/URL vigentes. Si se edita el enlace mientras llega la respuesta, se puede mostrar información del enlace anterior; Start usa el URL actual con esos metadatos. Tampoco se bloquean múltiples solicitudes de vista previa.

Propuesta: normalizar URL/identificador, descartar respuestas antiguas, deduplicar y cancelar consultas. Guardar siempre el enlace que originó la vista previa, no leerlo nuevamente de un input mutable al iniciar.

### 8. Dos trabajos pueden convertir simultáneamente — media

Cada plaza del executor abarca extracción, red y postprocesado. Por tanto, dos FFmpeg pueden competir con audio, YouTube o un juego. No hay mediciones que justifiquen aumentar concurrencia.

Propuesta: empezar con dos transferencias y como máximo una conversión, con cola acotada. Separar las fases requiere refactorizar la ejecución combinada de yt-dlp; no basta añadir un semáforo alrededor del método completo. Como primera medida segura puede ofrecerse un perfil de baja carga de un trabajo completo mientras se mide la división de fases.

### 9. MP3 implica conversión y trabajo adicional — media

Convertir siempre a MP3 puede consumir más tiempo/CPU que conservar un formato de audio compatible. Elegir 320 kb/s no recupera información perdida en el origen y produce archivos mayores que un bitrate inferior. No se afirma que la ruta actual descargue video innecesariamente: yt-dlp CLI selecciona bestaudio/best al usar extract-audio sin formato explícito.

Propuesta: conservar MP3 compatible y añadir Original/rápido opcional, con formato, extensión y MIME reales. No cambiar solo una opción del extractor: hoy staging, validación, copia y guardado están fijados a .mp3/audio-mpeg. Comprobar reproducción, portadas y edición de etiquetas para cada formato.

### 10. La comprobación de actualización bloquea el inicio — media

`WavePlayDownloaderModule.kt:167` actualiza yt-dlp antes de empezar la transferencia. Los dos workers comparten un lock. Si falla, no se registra una espera de recuperación: las siguientes tareas pueden volver a intentarlo.

Propuesta: comprobar actualizaciones una vez en mantenimiento, con límite de tiempo y espera tras fallos, conservando el motor utilizable. Coordinar la actualización manual con el mismo mecanismo y no sustituir archivos del motor durante trabajos activos.

### 11. Progreso y errores demasiado dependientes de texto — media

El callback nativo emite todas las líneas; React filtra después del cruce entre hilos. Los estados se infieren con búsquedas como Embedding y ffmpeg. Mensajes reales como EmbedThumbnail / Adding thumbnail no coinciden con Embedding y pueden clasificarse como conversión. El 100 % de transferencia no representa el final del guardado.

Propuesta: hitos de fase comprobables, emisión nativa limitada (por ejemplo cada 200 ms, conservando cambios de fase/finales), bytes/velocidad/espera cuando puedan obtenerse de forma fiable. Separar porcentaje de transferencia y fase; no simular una estimación precisa para conversión o proveedores sin progreso. Errores tipados y mensajes útiles; conservar registros técnicos acotados fuera de la interfaz.

### 12. Limpieza y límites insuficientes — media

Si el proceso muere después de preparar el MP3 y antes de liberarlo, no hay barrido al reiniciar. Tampoco hay control de espacio libre, límite explícito para directos/duración ni presupuesto de staging. La existencia de un único .mp3 no verifica su integridad.

Propuesta: validar archivo decodificable, tamaño y duración cuando se conozca; impedir directos sin límite en una función de canciones; cupo de caché, margen de espacio y limpieza solo de carpetas propias no referenciadas por trabajos activos. Conservar parciales útiles hasta su caducidad.

### 13. El historial y sus actualizaciones escalan mal — media/baja

La vista renderiza todo el historial con map dentro de Screen/ScrollView. Cada evento busca su trabajo recorriendo el array. Hay un listener de eventos nativos por trabajo y las notificaciones conservan firmas de identificadores retirados.

Propuesta: una suscripción nativa, estado por identificador, filas memoizadas y lista virtualizada. Separar activas de terminadas, paginar historial y retirar firmas sin referencia. Mantener la limitación de escrituras de SQLite y agrupar la incorporación de archivos sin reescanear toda la biblioteca por cada canción.

### 14. La vía Python no tiene las mismas garantías — secundaria

El transporte alternativo consulta trabajos sin plazo total ni cancelación; usa un identificador remoto diferente del local. El servidor mantiene trabajos en RAM, crea threads sin límite, comparte nombres de salida y no limpia historial/archivos. Devuelve una URL 127.0.0.1:8000, que en un teléfono no representa necesariamente el PC. Las rutas y validación del servidor tampoco son adecuadas para exponerlo públicamente sin otra revisión.

Propuesta: decidir si se sigue soportando. Si se conserva, necesita contrato de estados, cancelación, plazo, límites, directorios por trabajo y URLs relativas/resueltas contra el servidor real. Priorizar Android nativo, que es la ruta del APK actual.

## Implementación propuesta

1. **Corrección y recuperación:** coordinador independiente, intentos/cancelación, preview consistente, reconciliación de trabajos, reintento de guardado, destino recuperable y Wi-Fi efectivo.
2. **Rapidez y consumo:** medir fases, actualización del motor fuera del camino crítico, metadatos disponibles desde Explorar, caché corta de preview sin reutilizar enlaces de medios caducados, emisiones de progreso limitadas y concurrencia controlada.
3. **Formatos e interfaz:** Original/rápido opcional, MP3 mantenido, estados claros, cola/reordenación, reintento por fase, lista virtualizada e historial paginado.
4. **Aceptación:** dos descargas + cola; cancelar antes/durante extracción/conversión; desconectar Wi-Fi; carpeta sin permiso; disco lleno; misma canción con URLs distintas; títulos iguales; muerte del proceso antes/después del guardado; reproducir/navegar mientras descarga.

No presentar Pausar como una garantía hasta comprobar que el formato/protocolo permite reanudar. Algunas transferencias requerirán resolver de nuevo la URL o reiniciar la fase. No aumentar fragmentos ni workers indiscriminadamente: la concurrencia de fragmentos de yt-dlp aplica a determinados protocolos, no a todas las canciones.

## Medición y pruebas de esta revisión

- Lint y TypeScript: aprobados.
- Cinco pruebas existentes de progreso, copia, agrupación de escaneos y resolución de archivos: aprobadas.
- Carrera de permiso/cancelación: reproducida con el transporte real y nativo simulado; no hizo descargas de red.
- No se ejecutó una descarga real ni un benchmark: el teléfono no aparecía en ADB. No se asignan porcentajes de mejora ni un cuello de botella temporal medido.
- Antes/después deberá comparar el mismo conjunto de canciones autorizadas, red y dispositivo: p50/p95 por fase, tiempo total, bytes transferidos, CPU/memoria y tirones al navegar/reproducir. Diferenciar primera inicialización, ejecución caliente y motor actualizado.

## Fuentes primarias

- Android, elección de mecanismos de transferencia en segundo plano: https://developer.android.com/develop/background-work/background-tasks/data-transfer-options
- Wrapper Android utilizado por el proyecto: https://github.com/JunkFood02/youtubedl-android
- yt-dlp, formatos, calidad y concurrencia: https://github.com/yt-dlp/yt-dlp#usage-and-options
- Selección CLI de audio sin video al extraer: https://github.com/yt-dlp/yt-dlp/blob/master/yt_dlp/__init__.py
- Mensajes del postprocesador de carátula: https://github.com/yt-dlp/yt-dlp/blob/master/yt_dlp/postprocessor/embedthumbnail.py

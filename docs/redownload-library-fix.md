# Recuperación de canciones descargadas después de eliminarlas

## Fallos reproducidos

1. Eliminar físicamente usaba `hideTrack`, creando la misma exclusión permanente que Quitar de WavePlay. Si un archivo volvía a la misma URI, `upsertTracks` lo ignoraba incluso durante un reescaneo completo.
2. El escaneo automático excluía duraciones de 90 segundos o menos y de 13 minutos o más, además de duraciones todavía sin indexar. Las descargas elegidas expresamente también quedaban sometidas a esos límites.
3. Un escaneo iniciado antes de finalizar una descarga podía marcar su nueva entrada como ausente al terminar.

No se ha inspeccionado todavía el archivo concreto del usuario; son fallos de código reproducidos que pueden producir su síntoma.

## Correcciones

- Separar `markTrackDeleted` de `hideTrack`: eliminar un archivo no crea una prohibición permanente de importarlo después. Quitar de WavePlay sigue respetando la intención de ocultar.
- Al guardar en Música del teléfono, registrar directamente el asset confirmado y revelar solamente su ID/URI. El resto de canciones ocultas permanece igual. Guardar el nombre real asignado por Android, incluyendo posibles sufijos por colisión.
- El historial de descargas confirmadas permite reconocer sus assets por ID y nombre y conservarlos durante escaneos posteriores sin aplicar límites de duración del descubrimiento automático. Se añade webm a las extensiones de audio detectables; MediaLibrary sigue consultando exclusivamente audio.
- Leer duración de los metadatos nativos si MediaStore todavía no la proporciona.
- Al finalizar un escaneo, limitar las declaraciones de ausente a la biblioteca existente al comenzar, protegiendo descargas registradas durante el recorrido.
- Un fallo de indexación conserva el ID del archivo guardado. Reintentar no crea otro archivo ni necesita que siga existiendo el staging si el asset ya está guardado.
- En Descargas, ofrecer Recuperar en Biblioteca para entradas completadas con un asset identificado pero ausente en la biblioteca. Antes de recuperar se valida ID, tipo de audio y nombre, para no revelar otro archivo cuyo identificador se haya reutilizado.

## Validación

176 pruebas Node aprobadas, incluidas pruebas con SQLite real en memoria de eliminación/reimportación, exclusión intencional, revelado individual, canción corta con duración inicial cero y finalización concurrente de escaneo. Compilación Kotlin aprobada; lint, TypeScript y exportación Android se comprueban en los registros `redownload-fix-*` de `.cache/performance`.

No se borran archivos, cuentas o datos del teléfono para aplicar esta corrección. No se ha generado un APK nuevo; queda agrupada con el pulido general solicitado. Falta verificar el archivo concreto en el dispositivo. El registro directo corresponde al destino Música del teléfono; las carpetas SAF siguen dependiendo de su visibilidad en MediaStore para el descubrimiento automático.

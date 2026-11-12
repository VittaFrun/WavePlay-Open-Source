# Reproductor de YouTube y Wave DJ

- Portada / Video conservan una única superficie nativa con marco 16:9 centrado.
- El selector de temas se comparte con el reproductor local; YouTube guarda su
  elección en una clave independiente.
- Cola de YouTube en memoria, hasta 100 entradas únicas, con anterior/siguiente,
  avance al terminar, selección y retirada de próximas canciones. Detener la
  sesión limpia la cola. No escribe playlists ni canciones en SQLite.
- Explorar permite añadir videos a la cola y muestra el estado de cada entrada.
  Dentro de una sala mantiene las acciones colaborativas existentes.
- Icono de descarga abre el flujo de descargas autorizado existente.
- Se retira el filtro visible de videos insertables; las búsquedas individuales
  muestran todos los resultados. Las restricciones de reproducción de YouTube
  siguen dependiendo del video.
- «Ver en YouTube» abre la página oficial dentro de una WebView separada cuando
  el reproductor integrado falla. Pausa el reproductor anterior y conserva su
  cola, sin extracción de audio. La página oficial usa sus propios controles;
  no promete el mismo transporte ni segundo plano que el reproductor integrado.
- Mi música alinea título y orden en la misma fila. Biblioteca presenta Wave DJ,
  Canciones y Playlists, inicialmente Canciones.
- Wave DJ agrupa controles, admite cantidad/duración ajustable y balance gradual
  entre favoritas y descubrimientos; conserva sus opciones y sesiones locales.

## Fallo de Android aportado por el usuario

`IllegalStateException: The specified child already has a parent` al alternar
portada/video. `attach` omite reinsertar en el mismo padre, termina la transición
del padre anterior y comprueba que el hijo esté desprendido. `onDropViewInstance`
limpia ambas referencias antes de devolver la superficie, difiere el traslado
hasta finalizar el desmontaje de Fabric y excluye la vista retirada. Se ajustan
las medidas de la WebView al nuevo marco sin recrear la sesión.

Las pruebas de cola cubren avance, fin de sesión, duplicados, retirada y
conservación del progreso. La reproducción real y los cambios rápidos de
portada/video requieren un APK actualizado y verificación en teléfono.

Verificación: 123 pruebas Node, TypeScript y lint correctos; exportación Android
correcta y compilación Kotlin correcta. Los archivos de compilación se generaron
fuera de OneDrive con un script de inicialización de Gradle temporal, debido a
directorios de recursos bloqueados. No se modificó la configuración de Gradle
del proyecto para esa comprobación. No hubo dispositivo conectado para instalar.

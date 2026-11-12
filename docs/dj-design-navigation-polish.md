# Wave DJ y navegación — 22 de octubre de 2026

## Diseño y funciones

- Encabezado compacto con el tema activo, navegación Sesiones / Crear / Preferencias y acceso Nueva.
- Se eliminaron las etiquetas y textos «temporal» de Wave DJ. Se conserva el guardado explícito como playlist; las sesiones no guardadas siguen viviendo en memoria.
- Tarjetas con portada, cantidad, duración, reproducción directa y menú para duplicar o eliminar. Duplicar conserva canciones fijadas sin crear una playlist permanente.
- Creación con presets Favoritas, Descubrir y Sesión larga; cantidad/duración, balance y variedad. La selección se calcula después de permitir un frame para mostrar el estado de preparación.
- Búsqueda diferida por nombre cuando hay varias sesiones y búsqueda por título/artista dentro de una sesión.
- Edición con resumen, reproducción, guardado, fijado, renovación, sustitución y retirada. Se mantienen filas memoizadas de altura fija y virtualización.
- Los sliders comunican el valor al panel al terminar el arrastre, evitando recalcular la vista completa con cada movimiento del dedo.
- El menú Android tiene tres acciones; el acceso a canciones queda en la propia tarjeta.

## Menos trabajo durante navegación

- Biblioteca no calcula colecciones cuando no muestra Playlists ni filtra/ordena canciones mientras muestra Wave DJ.
- Wave DJ está memoizado; sus portadas, duración y búsquedas se derivan con memoización. Se muestran hasta seis playlists guardadas con acceso al listado completo.
- El progreso de Inicio actualiza únicamente su barra, no la portada, el título ni los controles de la tarjeta completa.
- El componente de arranque se suscribe al estado de biblioteca.
- Se evita cambiar parámetros de navegación de Biblioteca cuando no hay un parámetro que limpiar.
- Cambiar secciones del DJ devuelve el scroll al inicio sin animación adicional. El gesto horizontal de cambio de pestaña está desactivado sobre los controles DJ para no competir con sliders; se conserva la navegación de borde.
- Se conservan escenas opacas, tema anime, lazy, freezeOnBlur, detachInactiveScreens y transiciones existentes.

## Verificación

- TypeScript y lint aprobados.
- 147 pruebas Node aprobadas.
- Exportación Android aprobada.
- Vista inicial nueva verificada en el teléfono con 800 canciones. La persona confirmó que crear una sesión, fijar una canción, renovar y buscar funcionan, y que el contenido se ve completo.
- La conexión USB se perdió otra vez después de la revisión visual; el código actualizado ya había cargado en la app.
- No se creó otro APK: no hay cambios nativos.

No hay una comparación controlada antes/después de cuadros lentos o tiempos de respuesta. Los registros de desarrollo aislados (por ejemplo una transición de Biblioteca de 170,8 ms) no certifican las metas generales de rendimiento; durante la revisión había además un video externo en picture-in-picture.

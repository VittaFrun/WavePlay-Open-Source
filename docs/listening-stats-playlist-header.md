# Estadísticas y encabezado de playlist

## Cambios

- Encabezado transparente en el flujo nativo de la pantalla. La lista comienza después de los controles; no hay una superficie absoluta cubriendo canciones.
- La portada se contrae al desplazar. Se congela durante el arrastre y un espaciador final compensa el cambio del alto visible para conservar el rango de scroll.
- Se conserva el controlador de autoscroll existente y el guardado/cancelación del reordenamiento.
- «Tu ritmo» en Perfil y estadísticas de playlist desde portada/ajustes. Períodos de 7 días, 30 días y todo el historial; tiempo real, canciones distintas, días activos, escuchas, actividad diaria y rankings.
- Rankings de artistas/canales respetan los metadatos disponibles. No se infieren géneros ni comparaciones con otros usuarios.
- Agregaciones SQLite limitadas y dentro de una lectura consistente. Solicitudes concurrentes equivalentes se comparten. No se suscribe la pantalla al progreso de reproducción; respuestas de pantallas o períodos anteriores se descartan.
- Se utiliza el historial existente. La actividad diaria se asigna al día de inicio de cada evento; no se reconstruyen minutos históricos inexistentes. El gráfico de Todo muestra los últimos 30 días y el resumen abarca todo el historial.
- Comparación con el período anterior equivalente solo si existe tiempo previo. Estadísticas de playlist incluyen únicamente eventos iniciados desde esa playlist.
- Explorar ya no muestra «Tu mezcla de YouTube». En Biblioteca, Importar precede a cambiar vista y crear playlist.

## Verificación

- TypeScript y Expo lint: correctos.
- Node: 222 pruebas correctas, incluyendo agregaciones reales, límites de fecha, fuentes de playlist, eventos futuros, metadatos ausentes, deduplicación y espacio del encabezado.
- Exportación Android: correcta, sin nuevas dependencias ni cambios nativos de esta fase.
- Expo Doctor: 19/21; continúan las advertencias existentes por carpetas nativas/configuración y nueve parches disponibles de Expo SDK 57.
- Emulador WavePlay_QA: apertura de estadísticas generales y de playlist, datos reales y estado vacío, header transparente y desplazamiento. Capturas en .cache/performance/stats-*.png.
- No se modificaron archivos musicales ni se sembraron datos de prueba en el emulador.

## Límites

La validación del emulador con Metro no acredita metas de rendimiento del teléfono ni fluidez durante juegos. Se requiere la revisión física del arrastre y una medición sin herramientas de desarrollo. No se ha creado ni publicado un APK en esta fase.

## Segunda pasada visual de Tu ritmo

- Canción principal con portada grande, degradado estático para legibilidad y tiempo real de escucha.
- Resumen de tiempo, canciones distintas y días activos integrado directamente en la pantalla.
- Actividad diaria más compacta, artistas/canales en retratos circulares y ranking con portadas.
- Playlists en mosaicos con acceso a sus estadísticas; no se muestran secciones sin actividad.
- Sin animaciones continuas, nuevas dependencias ni consultas adicionales. Se mantienen los períodos y la protección contra respuestas obsoletas.
- Validación: lint, TypeScript, 222 pruebas y exportación Android correctos. El exportador recuperó automáticamente una caché de Metro ilegible mediante un recorrido completo.
- Emulador: revisados portada, textos largos, ranking y estado sin escuchas; capturas stats-design-*.png. Rendimiento en teléfono pendiente de medición.

## Corrección de tirones durante el colapso

La revisión física del usuario encontró tirones en el encabezado. La solución anterior animaba la altura del hero y del espaciador final: cambiaba continuamente el viewport y el contenido de la lista. Se sustituyó por un marco de tamaño estable que desplaza encabezado y lista juntos mediante transform. Los controles y las canciones mantienen su posición relativa sin superponerse. El padre recorta el excedente de la portada. Ya no hay un footer animado ni cambios de altura durante el scroll.

FastDraggableList toma scrollOffset mediante onAnimValInit de la biblioteca y alimenta encabezado/barra rápida con una reacción en el hilo gráfico. El callback JS de scroll queda solo si el consumidor lo solicita expresamente. El encabezado permanece congelado durante el arrastre.

Explorar: retirados los ambientes de «Qué suena hoy» y el historial de la portada. Las búsquedas recientes se muestran al enfocar el buscador, se filtran por el texto y permiten repetir/eliminar entradas. El historial se registra al confirmar una búsqueda, no cada fragmento tecleado.

Verificación: lint y TypeScript correctos; 223 pruebas correctas; exportación Android correcta. Emulador: portada de Explorar, enfoque del buscador y playlist contraída sin superposición. La apreciación de fluidez final requiere repetir el gesto en el celular conectado; no se declara una mejora porcentual sin medición comparable.

## Sustitución del colapso tras segunda revisión en el celular

El usuario siguió percibiendo tirones. El marco transformado también movía el contenedor nativo durante el gesto; se retiró por completo el colapso y su código. PlaylistHeader presenta una portada de 56 puntos con resumen y acciones fijas. La lista tiene un viewport normal e invariable; no se transforma, no cambia altura y no necesita compensadores. Se conserva el arrastre rápido y el modo explícito de reordenamiento.

También se encontró una llamada runOnJS por cuadro dentro de DraggableFlatList aun sin consumidor. El parche postinstall ahora la condiciona a la existencia del callback y mantiene intactos los consumidores que sí lo usan. Es idempotente y falla si cambia la estructura esperada de la dependencia.

Lint, TypeScript, 223 pruebas y exportación Android correctos. Se reinició Metro, que estaba detenido, y se recargó completamente el celular para evitar evaluar una revisión anterior. Pendiente la confirmación manual del scroll. No se presentan los números acumulados de gfxinfo como comparación: mezclan rutas y recorridos no equivalentes.

## Lista de 229 canciones

El usuario confirmó que desaparecieron los tirones del encabezado, aunque siguió notando lentitud en las filas. Los registros de desarrollo mostraron actualizaciones costosas de VirtualizedList al montar nuevas tandas.

Se redujo la ventana de cinco a tres pantallas y las tandas de ocho a cuatro filas (32 ms entre tandas), manteniendo arrastre directo. Los renderizadores y callbacks del envoltorio se estabilizaron. Las filas de playlist tienen altura explícita calculada según la escala de fuente, dos líneas de texto y objetivos táctiles; getItemLayout utiliza esa altura y la altura medida del encabezado de búsqueda. No se utiliza una altura supuesta para fuentes grandes.

Las portadas pequeñas sin imagen pasan de seis degradados/vistas a un fondo e icono; las imágenes usan resizeMethod=resize para limitar la decodificación a su tamaño visible. Las portadas grandes mantienen el diseño anterior.

Lint y TypeScript correctos; 224 pruebas y exportación Android correctas. Se solicitó repetir scroll y comprobar huecos rápidos en Love (229 canciones). Pendiente resultado físico antes de atribuir una mejora cuantitativa.

## Ajuste de anticipación tras confirmar mejor fluidez

El usuario confirmó que la lista se siente más fluida, pero las filas a veces llegan tarde al deslizar rápido. Se equilibró la virtualización: ventana de cinco pantallas, doce filas iniciales y tandas de cuatro cada 16 ms. Se mantienen las filas ligeras, la geometría explícita y los callbacks estables. No se vuelve a las tandas grandes. Este ajuste busca reducir los espacios transitorios sin atribuirlos al tamaño de la playlist ni darlos por resueltos sin otra prueba física.

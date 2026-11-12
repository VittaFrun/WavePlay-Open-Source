# Mejoras funcionales de WavePlay

## 1. Abrir y reproducir mezclas de Inicio

Implementado: apertura independiente del botón de reproducción, pantalla de canciones, reproducción completa/aleatoria y selección estable al abrir. TypeScript y lint verificados. Pendiente: prueba en el teléfono y guardar la mezcla como playlist manual.

- Portada, título y cuerpo de «Tu selección de hoy» y «Tus mezclas» abren una pantalla con las canciones de esa mezcla.
- Solo el botón de reproducción inicia la lista; su pulsación no debe abrirla también.
- Usar la misma lista de canciones para la vista y para la cola, incluyendo su orden y origen.
- Permitir guardar una mezcla como playlist manual, conservando la selección de ese momento.
- Verificar mezclas vacías, favoritas, artista, más escuchadas y canciones sin reproducciones.

## 2. Navegación rápida por listas

- Barra lateral visible y arrastrable: tocar una posición salta a esa zona; arrastrar recorre la lista.
- Indicador flotante de letra en orden alfabético, fecha en recientes y posición en orden manual.
- Ampliar el área táctil sin tapar los controles de canciones.
- Guardar la posición al abrir una canción y regresar.
- Verificar bibliotecas grandes, listas cortas y texto ampliado.

## 3. Selección múltiple

- Mantener pulsado el cuerpo de una canción activa selección; tocar otras añade o quita canciones.
- Mostrar cantidad seleccionada, seleccionar todas y cancelar; Atrás sale de selección primero.
- Acciones: añadir a playlist, añadir a cola, marcar favoritas y quitar de una playlist.
- Separar «quitar de playlist» de «borrar archivo», con confirmación para borrar archivos.
- Compartir este comportamiento entre biblioteca, playlists y colecciones.

## 4. Arrastre optimizado

- Reservar el asa de arrastre para reordenar, evitando conflicto con selección múltiple y scroll.
- Reducir actualizaciones de filas durante el gesto; usar claves estables y filas memorizadas.
- Desplazamiento automático cerca de los extremos y respuesta háptica al iniciar y soltar.
- Guardar el orden una sola vez al terminar, recuperar el orden anterior si falla el guardado.
- Activar orden manual explícito en listas con orden automático.
- Verificar fluidez con cientos de canciones y persistencia tras reiniciar.

## 5. Funciones útiles después de lo anterior

- Temporizador para dormir: minutos o finalizar la canción actual.
- Detección de duplicados por archivo y metadatos, con revisión antes de eliminar.
- Carpetas excluidas del escáner y duración mínima configurable.
- Edición de título, artista, álbum y portada.
- Importación/exportación de playlists y respaldo local de ajustes.

## Apertura y ajustes visuales

La pantalla nativa debe mostrar exclusivamente el vector de WavePlay. La fase React utiliza WaveLogo con los colores de la apariencia. Los cambios nativos requieren una nueva APK; comprobar un arranque en frío de la APK instalada, no solo una recarga de JavaScript.

# Revisión de diseño y arrastre — 26 de octubre de 2026

## Cambios

- Acceso: composición con disco y carátula estáticos, tipografía y jerarquía propias de WavePlay, botones diferenciados y acceso sin cuenta visible. El formulario de correo tiene un encabezado reducido para dejar espacio al teclado. Se conserva la autenticación existente.
- Explorar: selección destacada basada en escucha reciente o favoritas, accesos por ambiente en dos columnas, carruseles de canciones y playlists, y búsquedas recientes al final. Los accesos hacen una búsqueda solo al tocarlos; no se añaden consultas automáticas ni falsas listas de tendencias.
- Menús: BottomSheet compartido con portada opcional, subtítulo, cierre explícito y tarjeta flotante. MenuAction y MenuGroup centralizan iconos, categorías, estados y acciones destructivas. Se aplican a biblioteca, playlist, reproductor local y YouTube.
- Playlist: portada y estadísticas que salen al desplazar, con una única barra de controles que permanece fija. El encabezado usa transformaciones de Reanimated, sin setState de React durante el scroll. Se congela durante el arrastre y se libera al completar la colocación. La superficie opaca evita ver canciones o el campo de búsqueda mezclados debajo del encabezado. Buscar y seleccionar están dentro del contenido desplazable.

## Autoscroll

Se encontró una referencia funcional donde la librería necesita un objeto con current. FastDraggableList ahora entrega una referencia de objeto, correctamente tipada para GestureHandler FlatList.

Durante la prueba, el desplazamiento animado también quedaba detenido al mover el dedo. El parche de postinstall patch-draggable-autoscroll.cjs conserva el controlador de la librería y sustituye los saltos animados por pasos inmediatos de un máximo de ocho puntos, proporcionales a la proximidad al borde. Así no queda esperando un destino de smoothScroll interrumpido. Se retira el controlador secundario de JavaScript para evitar competencia entre ambos. El parche valida la estructura esperada de la dependencia y es idempotente.

Se mantiene el modo de reordenamiento explícito con Guardar/Cancelar y el arrastre rápido desde el asa izquierda. Los controles no forman parte de los datos reordenables.

## Pruebas

- Lint y TypeScript: correctos.
- Node: 217 pruebas correctas.
- Android export: correcto, en .cache/design-pass-export.
- Regresiones nuevas: congelación y límites del encabezado, referencia real que usa el hook de autoscroll instalado, comandos inmediatos y tamaño máximo del paso.
- Emulador Android API 35: acceso y menú comprobados visualmente; explorador nuevo visible; playlist con 45 filas de prueba. El primer elemento y otro que se movía junto al borde cambiaron de posición; se comprobó la persistencia de las 45 entradas y el nuevo orden mediante SQLite después de reiniciar la app. La canción qa-reorder-002 terminó en la posición 8 contando desde cero. Evidencia en .cache/performance/drag-qa/result.json.
- Se restauró el estado previo del emulador tras la prueba: 25 referencias de canciones y una playlist. Los datos de QA y las copias temporales de transferencia se retiraron de la app. No se movieron ni borraron archivos musicales del usuario.

Capturas locales: redesign-welcome.png, redesign-playlist-top.png, redesign-playlist-menu.png y redesign-drag-fixed.png en .cache/performance. Algunas capturas de desarrollo se tomaron antes del ajuste final de la superficie opaca del encabezado.

No se creó un APK en esta fase. No se usan los tiempos del emulador o desarrollo para afirmar objetivos de rendimiento en el celular. La conexión ADB del emulador presentó interrupciones puntuales; los resultados funcionales se comprobaron con las conexiones recuperadas.

La captura redesign-explore.png muestra los ambientes y favoritas del nuevo Explorador. redesign-explore-top.png terminó mostrando la playlist original «Mi música» con los controles contraídos; no se debe usar como captura de la cabecera de Explorar. No se siguieron enviando gestos tras finalizar las comprobaciones.

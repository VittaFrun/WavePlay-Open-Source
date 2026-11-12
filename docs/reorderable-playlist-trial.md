# Prueba de reemplazo del arrastre de playlists

## Implementación

- React Native Reorderable List 0.18.2 instalado mediante Expo. Reutiliza Reanimated 4.5.1 y Gesture Handler existentes; no añade un módulo nativo propio ni necesita otro APK.
- Playlists usa el reemplazo tanto en navegación habitual como en reordenamiento explícito. Selección usa lista ligera. Cola y otras listas conservan el motor anterior.
- Se conservan tirador izquierdo, encabezado fijo, barra rápida, filas de altura constante, guardado inmediato y borrador con guardar/cancelar en modo explícito.
- Animación de colocación de 150 ms, sin escalado ni transparencia adicionales. Movimiento reducido lleva la duración a cero. No se usan listeners de arrastre por fila.
- SQLite actualiza únicamente posiciones modificadas, en lotes de hasta 100 canciones y dos fases dentro de la misma transacción. Se validan identificadores, se conservan entradas añadidas concurrentemente y se revierte ante fallos.

## Resultado comprobado

Lint, TypeScript, 239 pruebas Node y exportación Android correctos. El teléfono conectado abrió Love (229 canciones) sin errores en los registros revisados. Queda pendiente la evaluación del usuario del nuevo arrastre; no se considera demostrada la mejora de FPS por pasar las pruebas.

La prueba SQLite de desplazar la canción del índice 1 al 4 realiza 2 consultas UPDATE y modifica 8 filas contando ambas fases, frente a 458 consultas y modificaciones anteriores. Un orden sin cambios no escribe posiciones. La prueba fuerza un fallo en la segunda fase bajo índice único y confirma que se conserva íntegramente el orden anterior.

No se generó APK. La corrección nativa pendiente de YouTube al minimizar es independiente de esta entrega.

## Corrección tras la prueba del celular

El usuario reportó scroll lento y fallos intermitentes de guardado. El diagnóstico `[PlaylistOrderFailure]` confirmó `NativeStatement.finalizeAsync: database is locked`.

- La transacción exclusiva de orden configura su propio busy timeout de 1500 ms y reserva el escritor antes de leer posiciones. Expo abre una conexión distinta y el PRAGMA de la conexión principal no se hereda.
- Se eliminó la actualización React de la fila activa. El gesto Pan necesita una pulsación de 120 ms para no competir con el scroll normal. Se conserva la demora de autoscroll elegida por el módulo para Android/Fabric y escala 1.5.
- El guardado rápido permite nuevos movimientos mientras se escribe: conserva el último pendiente, serializa y descarta únicamente órdenes intermedios obsoletos. Un fallo antiguo no revierte una selección posterior. Un fallo final restaura el último orden confirmado.
- Actualizar portada/contadores después del commit no puede hacer fallar un orden ya persistido.
- Se reinició el proceso del teléfono sin borrar datos para liberar la conexión anterior de desarrollo.

Lint, TypeScript, 242 pruebas Node y exportación Android correctos. Las pruebas incluyen coalescencia, fallo obsoleto, recuperación al último commit y navegación durante escritura. Pendiente respuesta del usuario sobre scroll y dos movimientos consecutivos en el teléfono. No se afirma resuelta la fluidez por superar las pruebas automáticas.

# Motor de descargas: implementación posterior a la auditoría

## Implementado

- Coordinador fuera de la pantalla y guardado de la fila de historial antes de iniciar el trabajo nativo.
- Cancelación comprobada después del permiso de notificaciones y antes de iniciar el extractor; cierre de la carrera del registro del proceso nativo. La interfaz espera la confirmación del trabajo para mostrar Cancelada.
- Registro nativo de audios convertidos y diario de guardado. Al reabrir se reconcilian trabajos activos y terminados; una transferencia interrumpida pasa a reintento, no queda bloqueada en Descargando.
- Reintento de guardado con el archivo ya descargado. SAF reutiliza el destino registrado. Android 10+ registra una fila MediaStore pendiente antes de copiar y reutiliza esa URI tras un fallo/reinicio. Los guardados ambiguos de la API antigua se señalan para comprobar Biblioteca, sin repetir automáticamente la creación.
- No se borra el audio convertido al fallar el guardado. Al retirar una descarga se intenta limpiar su destino parcial y caché. Los archivos MediaStore ya publicados se conservan; solo se eliminan filas pendientes durante la retirada de temporales.
- Servicio Android dataSync durante transferencia/conversión, con notificación y atención al límite de ejecución del sistema. Las notificaciones de progreso nativas no dependen de renders de la pantalla ni de que exista un contexto React activo.
- Dos trabajos nativos simultáneos como antes. La restricción Wi-Fi se vuelve a comprobar al salir de la cola y los cambios de red interrumpen los trabajos configurados para Wi-Fi.
- Mantenimiento del extractor en la inicialización, con exclusión frente a su ejecución y una hora de espera tras un intento fallido. Se retira la comprobación de actualización de cada descarga. Si coincide una actualización ya iniciada con un nuevo trabajo, este espera el bloqueo; no se promete arranque inmediato en ese caso.
- Progreso nativo limitado a 200 ms y cambios de etapa. Un listener JS compartido; notificaciones nativas agrupadas por etapa y tramos de 5 %. Se identifican los mensajes reales de carátula.
- Preview con deduplicación, caché de 60 segundos/24 entradas y protección contra respuestas atrasadas. Explorar y el reproductor reutilizan los metadatos ya disponibles; no se reutilizan URLs de medios caducadas.
- MP3 se mantiene por defecto. Original evita transcodificar cuando el extractor puede conservar el audio; puede necesitar remultiplexado y metadatos/carátula. Extensión y MIME se conservan en el guardado. El diario nativo verifica archivo no vacío y el copiador comprueba bytes escritos.
- Historial virtualizado y filas memoizadas. Se evita duplicar una entrada por doble toque. Los directos y estrenos pendientes se rechazan en la descarga nativa de canciones.
- Métricas de preparación/etapas/guardado/total mediante el instrumento existente, solo en desarrollo.

## Validación

Pruebas de cancelación antes del motor/permiso, reintentos simultáneos, guardado recuperable, destino SAF reutilizado, interrupción, commit antiguo ambiguo, recuperación MediaStore, MIME y caché/deduplicación. TypeScript, lint, suite Node, exportación Android y compilación Kotlin comprobados; los registros están en `.cache/performance/downloader-hardening-*` y `general-polish-*`.

## Pendiente de aceptación y trabajo posterior

No hay mediciones de descargas reales en el teléfono todavía. Faltan pruebas de Wi-Fi a datos móviles, disco lleno, permisos revocados, dos descargas con una tercera en cola, cambio de pantalla, pantalla bloqueada y muerte del proceso durante guardado. El servicio no garantiza continuidad después de Forzar detención ni evita las restricciones de batería del fabricante.

La concurrencia sigue siendo de dos pipelines completos, **no** dos transferencias y una conversión independiente. Separar ambas fases requiere otro contrato del extractor y se decidirá con mediciones. No se añade reanudación garantizada de transferencias parciales, reordenación de trabajos nativos, paginación SQLite del historial, validación completa por decodificación ni cuota/TTL general de staging en esta entrega.

El servidor Python alternativo conserva un contrato más limitado: cancelar la espera del cliente no acredita que el trabajo remoto se haya detenido. El APK Android usa la ruta nativa. No se afirma equivalencia de recuperación o ejecución en segundo plano para esa alternativa.

Se aplaza la nueva compilación de desarrollo mientras se agrupan, a petición del usuario, las mejoras generales de fluidez. No se ha publicado un APK nuevo ni un catálogo de actualización desde estos cambios.

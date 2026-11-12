# Pulido de continuidad y navegación

## Cambios

- El reproductor permanece montado entre canciones y cambios de fuente. Conserva la pestaña elegida cuando es compatible, el tema y las superficies existentes. La transición de 180 ms depende de la identidad de canción y respeta movimiento reducido del usuario y del sistema.
- Los títulos reservan dos líneas y los detalles una línea para estabilizar los controles. La carga de audio mantiene un indicador hasta que el motor confirma que está listo.
- Playlists y el botón aleatorio de Biblioteca consumen únicamente la presencia de reproducción para reservar espacio al minirreproductor; ya no dependen de toda la cola.
- Biblioteca conserva el desplazamiento entre pestañas mediante memoria acotada a 40 entradas. Solo registra final de arrastre e inercia, sin eventos de scroll por cuadro en JavaScript.
- Las descargas rápidas publican estado de espera al tocar, antes de crear el trabajo, sin admitir solicitudes duplicadas. Indicadores y etiquetas accesibles distinguen espera, descarga y preparación.
- La inicialización SQLite consulta si quedan datos antiguos antes de solicitar escrituras de migración sin cambios. Mantiene reparaciones de migraciones incompletas y serialización existente. Los errores iniciales ofrecen una instrucción de recuperación sin mostrar excepciones internas.

## Validación

Lint, TypeScript, 234 pruebas Node y exportación Android correctos. Se añadieron comprobaciones de pestañas, desplazamientos acotados, descargas simultáneas y migración sin escrituras innecesarias.

Durante Fast Refresh se observó un bloqueo SQLite de 5 segundos; se reinició el proceso sin borrar datos y volvió a cargar Inicio. No se afirma que la causa de ese bloqueo esté eliminada de forma definitiva. El usuario confirmó en el teléfono que Letras/Portada se conservan y los controles siguen estables al cambiar canciones.

No se generó un APK ni se cambiaron dependencias o código nativo en esta entrega. La protección nativa del video al minimizar sigue pendiente de la siguiente compilación por cuota EAS. No se han medido FPS ni latencias comparables antes/después en una versión sin herramientas de desarrollo.

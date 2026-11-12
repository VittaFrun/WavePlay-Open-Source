# Descargas y Explorar

## Cambios

- Dos trabajos Android activos como máximo; los demás esperan en cola. El resto
  de operaciones nativas conserva su executor para que vista previa y cancelación
  no esperen detrás de descargas. Se rechazan identificadores activos repetidos.
- Una carpeta UUID por trabajo evita asociar una canción al MP3 de otra descarga.
  Cancelar una tarea pendiente impide ejecutarla; los errores retiran temporales.
- El guardado en una carpeta elegida usa copia nativa en bloques de 64 KiB,
  evitando Base64 completo en JavaScript. APK antiguos conservan el fallback.
- Cada trabajo conserva su calidad y carpeta originales. Guardado no cancelable
  una vez iniciado; trabajos cancelados no se convierten visualmente en errores.
- Finalización visible después de guardar; el escaneo se agrupa con espera de
  800 ms y una pasada pendiente si otra está en curso. Temporales nativos se
  retiran después del guardado o fallo. No se borran archivos musicales originales.
- Explorar / Mi música añade Recientes (predeterminado), Título, Artista y Más
  escuchadas. Mantiene búsqueda diferida y la misma función de orden de Biblioteca.
- Búsqueda YouTube solicita videos insertables y filtra resultados cuyos detalles
  indican embeddable=false. Errores en reproducción individual y salas Android
  ofrecen buscar otra versión y abrir YouTube. No evita bloqueos posteriores del
  propietario, territoriales o de derechos sobre videos inicialmente insertables.

## Comprobaciones

119 pruebas Node aprobadas, TypeScript y lint correctos, compilación Kotlin y
exportación Android correctas. Pruebas nuevas comprueban agrupación de escaneos,
pasada pendiente, copia nativa/fallback y filtro de disponibilidad de YouTube.
No se han medido tiempos de descarga en un dispositivo; faltan pruebas con dos
canciones del mismo nombre, tareas en cola, cancelación y carpeta SAF.
Los cambios nativos requieren un APK actualizado; no se solicitó una compilación
nueva durante esta implementación.

## Propuesta para Wave DJ

Pestaña DJ en Biblioteca con mezclas rápidas, preferencias y selecciones guardadas.
Primera etapa: duración o cantidad, variedad de artistas, equilibrio entre
favoritas y descubrimientos, menor repetición reciente, preferencias reversibles
y generar/guardar una selección. Usar metadatos locales y calcular al solicitar
la mezcla, no durante el progreso de reproducción. No se añadió esta pestaña.

YouTube puede usar una presentación musical con portada y controles compartidos,
con botón Ver video para mostrar la misma WebView sin crear otro reproductor.
Este cambio visual se propuso como siguiente etapa; no se implementó aquí.

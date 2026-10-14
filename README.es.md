> The README is machine-generated, if you find issues please submit a PR.
>
> Este README ha sido generado automáticamente; si encuentras problemas, envía una pull request.

<p align="center">
  <img src="./icons/android-chrome-512x512.png" alt="WaySlice Terra">
</p>

<h1 align="center">WaySlice Terra</h1>

<p align="center">
  <strong>Telemetry for every way. Sliced.</strong><br><strong>Todo camino recorrido se convierte en telemetría; toda telemetría se recorta y se analiza.</strong>
</p>

<p align="center">
  <a href="README.md">English</a> | <a href="README.zh-CN.md">简体中文</a> | <a href="README.zh-TW.md">繁體中文</a> | <a href="README.ja.md">日本語</a> | <a href="README.ko.md">한국어</a><br><a href="README.fr.md">Français</a> | <a href="README.de.md">Deutsch</a> | Español | <a href="README.it.md">Italiano</a>
</p>

WaySlice Terra es un analizador de trazas de código abierto, cien por cien front-end, para trazas
GPX/FIT/TCX/KML/KMZ.

Las estadísticas de la traza completa dicen poco: lo que quieres saber es cómo te fue en la subida
larga, en la bajada técnica, en los últimos 5 km de la carrera.

WaySlice Terra te permite recortar cualquier tramo y analizarlo por separado, igual que se lee la telemetría
de una carrera automovilística o los registradores de datos de vuelo (QAR) de la aviación:

```text
Traza → Elegir un tramo → Analizar el tramo
```

<p align="center"><img src="./screenshots/overview.jpg" alt="image"></p>

<p align="center"><a href="./screenshots/README.es.md">Más capturas de pantalla</a></p>

## Cómo se usa

Abre [https://waysliceterra.com](https://waysliceterra.com) o [ejecuta WaySlice Terra en local](#primeros-pasos) e importa tus datos de actividad.

¿Primer contacto con los términos? Empieza por la sección de [Terminología](#terminología) — todas las
demás secciones emplean estas palabras exactamente con el sentido definido ahí.

## Índice

- [Terminología](#terminología)
- [Características](#características)
- [Formatos compatibles](#formatos-compatibles)
- [Primeros pasos](#primeros-pasos)
  - [Cómo analizar un tramo](#cómo-analizar-un-tramo)
- [Privacidad](#privacidad)
- [Sistemas de unidades](#sistemas-de-unidades)
- [Notas de diseño](#notas-de-diseño)
- [Pruebas](#pruebas)
- [Contribuir](#contribuir)
  - [Estructura del proyecto](#estructura-del-proyecto)
  - [Añadir un idioma a la interfaz](#añadir-un-idioma-a-la-interfaz)
  - [Añadir o editar mapas base](#añadir-o-editar-mapas-base)
  - [Proveedores de terreno (DEM)](#proveedores-de-terreno-dem)
  - [Superposición de red viaria](#superposición-de-red-viaria)
  - [Sustituir los iconos del sitio](#sustituir-los-iconos-del-sitio)
  - [Añadir un README traducido](#añadir-un-readme-traducido)
- [Hoja de ruta](#hoja-de-ruta)
- [Licencia](#licencia)
- [Agradecimientos](#agradecimientos)
- [Colaboradores](#colaboradores)

## Terminología

Estos términos tienen un significado fijo en este README y en la interfaz de la aplicación. Cuando una
palabra aparece con mayúscula, hay que tomarla exactamente en este sentido:

| Término | Significado |
|------|---------|
| Traza (Track) | Una ruta grabada, cargada desde un único archivo: una lista ordenada de puntos de traza. |
| Punto de traza (Track point) | Una medición individual a lo largo de la traza: la posición, más la altitud, la marca de tiempo, la frecuencia cardíaca, la cadencia, la potencia y la temperatura cuando el archivo las proporciona. |
| **Tramo (Sector)** | El concepto central de WaySlice Terra. Un tramo es la parte de la traza comprendida entre un punto de inicio y otro de fin que tú eliges. Los límites pueden quedar en cualquier punto entre dos puntos de traza (interpolados). Toda la traza también es un tramo: la «Toda la traza» por defecto. Cada métrica se calcula para el tramo actual. |
| Tirador del tramo (Sector handle) | El punto arrastrable que fija uno de los límites del tramo: verde = inicio, rojo = fin. Los tiradores aparecen a la vez en el mapa y en el perfil altimétrico y permanecen sincronizados. |
| Desnivel positivo / negativo (Elevation gain / loss) | Ascenso / descenso totales dentro del tramo, tras el filtro de ruido de 3 m (véase [Notas de diseño](#notas-de-diseño)). |
| VAM / VDM | Velocidad ascensional / de descenso en metros por hora: velocidad vertical en m/h, calculada solo con el tiempo empleado efectivamente en subir / bajar. |
| Tiempo en movimiento (Moving time) | Tiempo transcurrido menos las pausas: una pausa es una velocidad inferior a 0,5 km/h mantenida durante 10 s o más. |
| GAP | Ritmo ajustado a la pendiente (grade-adjusted pace): el ritmo del tramo dividido por el factor de pendiente de Minetti (2002) — el ritmo en llano al mismo esfuerzo. |
| Distancia equivalente (Effort distance) | Distancia horizontal + desnivel positivo ÷ 100: cada 100 m de ascenso cuentan como 1 km. |
| Distancia 3D (3D distance) | La distancia que sigue el terreno: suma segmento a segmento de √(horizontal² + vertical²), presentada por separado de la distancia horizontal. |
| Pendiente (Grade) | La inclinación en un punto o en un trecho: variación vertical ÷ distancia horizontal, mostrada en % (positiva = subida, negativa = bajada). |
| Ritmo (Pace) | El tiempo por unidad de distancia: min/km o min/mi. |
| Waypoint | Un lugar con nombre almacenado en el propio archivo de traza (etiquetas `<wpt>` de GPX, placemarks `<Point>` de KML). |
| Mapa base (Basemap) | La fuente de teselas cartográficas dibujada bajo tu traza. Por defecto OpenStreetMap. |
| Terreno (DEM) | El modelo de elevación que convierte el mapa en terreno 3D. Independiente del mapa base — cualquier mapa base lo admite. Por defecto Mapterhorn (datos Copernicus DEM). |
| Superposición de red viaria (Road network overlay) | Carreteras, nombres de lugares, áreas de parque con sus nombres y puntos naturales (cimas, collados, manantiales, cascadas…) sobre la imagen satelital (la vista «híbrida»); en cualquier otro mapa base el botón lleva los puntos naturales y los nombres de parque, y en los mapas ráster estándar también los nombres de lugares en vista 3D (OSM, OpenTopoMap, CyclOSM solo en vista 3D, pues sus teselas ya dibujan marcadores naturales propios). |

## Características

- **Vista de terreno 3D.** Un único botón en la esquina superior izquierda del mapa — o un clic derecho sobre una zona vacía del mapa en escritorio — alterna entre el mapa plano orientado al norte y una vista de terreno DEM, con la etiqueta del modo al que se pasa: la traza, los tiradores y los waypoints se pegan al relieve; los interruptores de capa situados justo debajo (sombreado, curvas de nivel) comparten el mismo estado en los dos modos de vista, y ese par se recuerda (curvas de nivel activadas y sombreado desactivado por defecto). La cámara conserva tu posición al cambiar. Las teselas DEM vienen de un proveedor sin clave, las curvas de nivel se generan en el navegador a partir de ese mismo DEM con elevaciones redondas que siguen tu sistema de unidades — sobre cualquier mapa base, también los que no traen curvas — y el mapa base sigue siendo independiente.
- **Vista satelital híbrida.** Sobre un mapa base de satélite, la pila de botones de la esquina del mapa gana un interruptor de red viaria (el icono de mapa entre el cambio 2D/3D y el sombreado): dibuja carreteras, nombres de vías, nombres de lugares, áreas de parque con sus nombres y puntos naturales sobre la imagen para que la foto siga leyéndose como un mapa. La superposición funciona en los dos modos de vista, y sus líneas y etiquetas se pegan al relieve 3D como todo lo demás. Los puntos naturales —cimas, collados, volcanes, bocas de cueva, manantiales, cascadas, rocas y piedras— llevan etiqueta con nombre y una altitud que sigue tu sistema de unidades, y aparecen progresivamente al acercar. Las áreas de parque reciben un lavado verde translúcido que se queda bajo las carreteras. Arranca apagada y recuerda tu elección — al salir del mapa base satelital se desmonta, y al volver al satélite se restaura tal como la dejaste. En todo mapa base no satelital, el mismo botón pasa a ser el interruptor de puntos naturales (el icono map-pinned): las ocho clases de puntos naturales y las etiquetas de nombre de parque se superponen, y en los mapas ráster estándar también los nombres de lugares en vista 3D — desde la fuente planet que los estilos de OpenFreeMap ya cargan, o desde la fuente planet sin clave de la app en los mapas ráster; los mapas ráster estándar (OSM, OpenTopoMap, CyclOSM), cuyas teselas llevan marcadores naturales propios, solo la tienen en vista 3D — activada por defecto, con su propia elección recordada.
- **Mapa + perfil altimétrico.** Arrastra los tiradores del tramo en cualquiera de las dos superficies.
  Ambas permanecen sincronizadas en tiempo real, y un límite puede quedar en cualquier punto entre dos
  puntos de traza, interpolación incluida.
- **Waypoints en el mapa y el perfil.** Los waypoints de GPX (`<wpt>`) y KML (`<Point>`) se dibujan
  como chinchetas con su nombre en una ventana emergente — actívalos con el botón de chincheta situado
  bajo «Zoom a la traza». Cada waypoint se ajusta a su punto más cercano de la traza y se muestra en el
  orden de la traza; el que quede a más de 50 m de la traza no se muestra. Al pasar el cursor sobre una chincheta se marca el punto correspondiente en
  el perfil altimétrico, y al hacer clic en ella el mapa se centra en ese punto sin cambiar el nivel de
  zoom. Las chinchetas también se manejan con el teclado: Tab se mueve entre ellas, Intro o Espacio
  centra el mapa, y al enfocar una chincheta se muestra su ventana emergente con el nombre, igual que
  al pasar el cursor.
- **Zoom con rueda en el perfil (escritorio), zoom por pellizco (táctil).** Coloca el cursor sobre el
  perfil altimétrico y haz scroll para hacer zoom en su eje de distancia/tiempo alrededor del cursor;
  Mayús + arrastre para desplazarlo; en pantallas táctiles, un dedo desplaza y un pellizco de dos dedos hace zoom. Doble
  clic en cualquier parte del perfil — o doble toque en pantalla táctil — restaura la traza completa.
- **Ajustar al tramo.** El botón de enfoque de la cabecera del perfil acerca el eje x al
  tramo seleccionado: el tramo ocupa en torno al 82 % del gráfico con ≈9 % de contexto junto a cada
  tirador, centrado y ajustado a los datos. Un tramo casi tan largo como la traza restaura la vista
  completa y uno diminuto aterriza en la ventana de zoom máximo — la selección nunca se mueve.
- **Una cabecera de perfil que se ajusta a su panel.** La barra de herramientas del perfil de elevación
  se mantiene en una sola línea a cualquier ancho: al estrecharse el panel, los botones de acción pasan
  a solo icono (conservando su tooltip y su nombre accesible), después los de menor prioridad —
  análisis, superposiciones, ajuste a waypoints — se mueven como los mismos botones a un menú «Más
  acciones» (⋯), el conmutador Distancia/Tiempo es el que más conserva sus etiquetas y solo un panel
  muy estrecho pliega el título en su icono. Nada se comprime, se trunca ni queda inalcanzable.
- **División automática.** El botón de tijeras de la cabecera construye una lista de tramos para toda
  la traza: cortes en los waypoints (de CP en CP), a distancia fija (1 km / 5 km / personalizado — en
  millas cuando el sistema imperial está activo), o por pendiente en tramos de subida / bajada. Cada fila muestra número, rango, cápsula de tipo (subida, bajada, llano o mixto, según su relieve)
  y tiempo, ritmo y frecuencia cardíaca; en pantallas estrechas la fila se parte en dos, la
  cápsula lleva su texto y los datos se alinean con el inicio del rango; al desplegar una fila
  aparecen
  los detalles de ese tramo — distancia, distancia 3D, distancia equivalente, desnivel
  positivo/negativo, pendiente media, GAP, VAM/VDM, frecuencia cardíaca media/máxima y zonas de
  frecuencia cardíaca — y el tramo principal pasa a él.
- **Métricas del tramo.** Distancia horizontal y 3D, distancia equivalente, desnivel
  positivo/negativo, pendientes, tiempo transcurrido y tiempo en movimiento, ritmo, velocidad, GAP,
  más frecuencia cardíaca, cadencia, potencia y temperatura cuando el archivo las lleva. Cuando falta
  un dato de entrada obtienes *No disponible*, no 0.
- **Análisis de dos variables.** El icono de dispersión junto a los controles del perfil abre un
  mapa de calor de densidad 2D para cualquier par válido de magnitudes — frecuencia cardíaca,
  velocidad, ritmo, GAP, cadencia, potencia, temperatura, pendiente, altitud. El análisis sigue
  el tramo seleccionado, y cada magnitud toma sus valores del mecanismo del propio panel de
  métricas: frecuencia cardíaca, cadencia y potencia descartan las lecturas en pausa y reciben
  el suavizado de 5 puntos del panel, la temperatura se mantiene en bruto (pausas incluidas),
  la pendiente usa las ventanas de gradiente de 50 m del panel, y la familia de velocidad es
  la serie de velocidad máxima del panel para el tramo. Al pasar el puntero se leen la X, la Y
  y la densidad relativa de la celda. Temas, unidades e idiomas se aplican al instante, y un módulo de gráfico
  independiente mantiene fluidas incluso las trazas de 100 000 puntos. En pantalla táctil, dos dedos hacen zoom y desplazan, un dedo recorre los datos y un
  doble toque recupera el intervalo completo.
- **Exportación.** Descarga el tramo actual — sus métricas como csv, txt o md, sus puntos de traza como
  archivo GPX. Las exportaciones siguen el idioma y el sistema de unidades activos en el momento del
  clic.
- **Unidades métricas / imperiales.** Cambia las unidades de visualización en cualquier momento. El
  sistema métrico es el valor por defecto y tu elección se guarda localmente.
- **Multilingüe.** English, 日本語, 한국어, 简体中文, 繁體中文, Français, Deutsch, Español e Italiano vienen
  integrados. Cada idioma adicional es un único archivo de datos (véase [Contribuir](#contribuir)).
- **Privacidad por arquitectura.** No existe código de subida. Tu archivo se lee con la File API y
  después se procesa y se dibuja en tu navegador.
- **Sin paso de compilación.** Módulos ES tal cual. Léelos, ejecútalos, cámbialos.

## Formatos compatibles

| Formato | Geometría | Altitud | Marcas de tiempo |
|--------|----------|-----------|------------|
| `.gpx` | `<trk><trkseg><trkpt>` (multisegmento); `<rte><rtept>` como fuente de ruta degradada | ✅ | ✅ |
| `.fit` | Archivos de actividad binarios Garmin FIT | ✅ | ✅ |
| `.tcx` | XML TrainingCenterDatabase | ✅ | ✅ |
| `.kml` | `LineString` + `gx:Track` | ✅ (de las coordenadas) | ✅ (`gx:Track` / `<when>`) |
| `.kmz` | ZIP → KML (`DecompressionStream` nativo, sin bibliotecas) | ✅ | ✅ |

El decodificado FIT lo realiza la biblioteca [fit-parser](https://github.com/jimmykane/fit-parser)
(MIT) incluida en `vendor/fit-parser/`; el TCX lo lee un analizador DOM integrado. Las extensiones de sensores
GPX se leen sin fijarse en el espacio de nombres: Garmin TrackPointExtension (frecuencia cardíaca,
cadencia, temperatura, velocidad, distancia) y las tres variantes habituales de potencia (`<power>`
desnuda, `PowerInWatts`, `ns3:Watts`). Todos los formatos desembocan en el mismo modelo de punto de
traza, así que las métricas del tramo funcionan igual con independencia del formato de origen. Las webs
de carreras publican a menudo GPX cuya geometría es una `<rte>` de ruta en lugar de una `<trk>` grabada.
WaySlice Terra los carga como fuente de ruta degradada: el mapa, la distancia y el análisis de altitud
funcionan, mientras que el tiempo, la velocidad y la frecuencia cardíaca se muestran como «No disponible»
en lugar de inventar valores. Si el archivo contiene ambos, gana la traza grabada y la ruta se ignora.

## Primeros pasos

**Try it: https://waysliceterra.com**

Cualquier servidor de archivos estáticos sirve. No hay nada que compilar:

```bash
# Python
python -m http.server 8080

# o Node
npx serve .
```

Después abre <http://localhost:8080> y suelta un archivo GPX/FIT/TCX/KML/KMZ.

> Abrir `index.html` directamente mediante `file://` no funciona porque los navegadores bloquean las
> importaciones de módulos ES en URL `file://`.

### Cómo analizar un tramo

1. Suelta tu traza. Toda la traza está seleccionada por defecto.
2. **Arrastra los tiradores verdes/rojos del tramo** en el mapa o en el perfil altimétrico. También
   puedes hacer clic en la traza o en el perfil para mover el límite más cercano, o arrastrar sobre el
   perfil para seleccionar un nuevo rango. En pantallas táctiles, un dedo desplaza el perfil ampliado y
   un pellizco hace zoom; el tramo solo se cambia con los tiradores.
3. Cada cambio recalcula el tramo al instante: distancia, distancia 3D, desnivel positivo/negativo,
   pendientes, ritmo/velocidad, kilómetro más rápido / más lento.
4. Teclado: pon el foco en un tirador y usa las flechas (Mayús = ×10, Inicio/Fin = salto). `Esc` cierra
   los menús.
5. Los dispositivos táctiles usan gestos cooperativos: un dedo desplaza la página, dos dedos mueven y
   hacen zoom en el mapa (aparece una pista sobre el mapa).
6. Tramos listos para usar: el botón `División automática` de la cabecera construye una lista de
   tramos para toda la traza — por waypoint, a distancia fija o por pendiente.

## Privacidad

- Tu traza se procesa **solo** en tu navegador: analizar → calcular → dibujar, todo en local.
- Las únicas peticiones de red son las **teselas cartográficas y DEM** del mapa base y del proveedor de terreno que elijas. Los datos de
  tu traza nunca se transmiten y no hay estadísticas de uso.
- El tema, el idioma, el mapa base, el terreno y las unidades se guardan solo en el `localStorage` de tu
  dispositivo.
- Este texto también está disponible en la app: **Acerca de → Privacidad** en `Ajustes` (botón del engranaje de la cabecera).

## Sistemas de unidades

WaySlice Terra viene con el sistema **métrico** por defecto y también admite el **imperial**. Abre el panel
de `Ajustes` desde el botón del engranaje de la cabecera — las unidades están junto al idioma y el
tema:

| Mostrado | Métrico | Imperial |
|---|---|---|
| Distancia larga | km | mi |
| Distancia corta / altitud | m | ft |
| Velocidad | km/h | mph |
| Ritmo | min/km | min/mi |
| Pendiente | % | % |

Todo el análisis y los cálculos se mantienen en unidades SI (metros, metros/segundo,
segundos/kilómetro). Cambiar de unidades solo vuelve a formatear los números que ves: el archivo no se
vuelve a analizar, el tramo no se recalcula y la geometría de la traza no cambia. La preferencia se
guarda con la clave `wayslice-units` y sobrevive a las recargas. Idioma y unidades son ajustes
independientes: cualquier idioma funciona con cualquiera de los dos sistemas.

## Notas de diseño

- La **distancia 3D** se calcula segmento a segmento como `√(horizontal² + vertical²)` y se presenta
  por separado de la distancia horizontal.
- La **distancia equivalente** = distancia horizontal + desnivel positivo ÷ 100 (100 m de ascenso
  cuentan como 1 km).
- La **pendiente media** es el ascenso acumulado del tramo dividido por la distancia horizontal, no la
  media de las pendientes punto a punto; un tramo que solo desciende no tiene ascenso que promediar y
  muestra «—». Las pendientes máxima/mínima usan ventanas de ~50 m para que
  el ruido del GPS no fabrique una pendiente récord.
- El **desnivel positivo/negativo** aplica un filtro de histéresis de 3 m: el cambio de altitud se
  acumula hasta superar ±3 m y solo entonces cuenta — el ruido inferior a 3 m nunca hincha los
  totales.
- **VAM/VDM** dividen el desnivel entre el tiempo realmente empleado en subir/bajar (la tendencia de
  altitud filtrada), no entre el tiempo total del tramo.
- El **tiempo en movimiento** cuenta solo los segmentos fuera de las pausas (velocidad inferior a
  0,5 km/h mantenida 10 s o más).
- La **velocidad media y el ritmo medio** se calculan a partir de las velocidades de movimiento por
  segmento y se depuran como la curva del perfil: con velocidades registradas, una ventana deslizante
  de 5 puntos diluye el pico en su vecindad; sin velocidades registradas, solo se aplica la regla de
  3 desviaciones estándar. La **velocidad máxima** lee la curva por puntos depurada del perfil, para
  que la lista y el gráfico coincidan siempre.
- El **GAP medio** divide el ritmo de cada segmento por el factor de pendiente de Minetti (2002)
  (limitado a ±45 % de pendiente) antes de promediar: el ritmo en llano al mismo esfuerzo. En el
  perfil, velocidad/ritmo/GAP comparten una única ranura de superposición.
- **Las curvas de velocidad del perfil** eligen la regla según la fuente: las velocidades registradas
  se comprueban primero frente al dd/dt del segmento (las lecturas más de un 50 % por encima se
  descartan) y después se suavizan con una ventana deslizante de 5 puntos (cada valor = la media de
  hasta cinco puntos centrados en cada uno); las calculadas siguen directamente la regla 3σ (fuera de
  rango se sustituyen por interpolación de las vecinas). Un cero registrado (una parada) es un dato y
  participa en la media como cualquier otro.
- La **simplificación de visualización** (una muestra equidistante de la traza grabada para el mapa; el perfil dibuja la serie bruta completa, sin
  muestreo por píxel) nunca toca los puntos originales. Las métricas se calculan siempre con los datos
  completos.
- El **zoom del perfil** baja hasta una ventana de 100 m en modo distancia y de 1 minuto en modo
  tiempo; los dispositivos táctiles hacen zoom en el perfil con un pellizco de dos dedos — no hay rueda.
  «Ajustar al tramo» comparte ese límite: nunca amplía más allá del máximo de rueda o pellizco ni
  muestra espacio sin datos tras los extremos de la traza.
- Las trazas grandes (100 000 puntos o más) funcionan sin problema. Mientras arrastras un tirador, la
  búsqueda del límite parte de la coincidencia anterior y amplía su ventana según hace falta.

## Pruebas

Abre `tests/index.html` en el mismo servidor:

```text
http://localhost:8080/tests/
```

La suite cubre los cálculos de distancia, la interpolación entre puntos, las ventanas de pendiente,
las métricas temporales, el análisis GPX/FIT/TCX/KML/KMZ (incluidos archivos malformados y archivos
comprimidos, además de las variantes de potencia y extensiones de sensores GPX y la fuente de ruta degradada `<rtept>`), la matriz de
preferencias de tema (sistema/manual × claro/oscuro del SO), la cadena de reserva de idiomas y las
conversiones métrico/imperial (incluidos el redondeo del ritmo, el VAM, la persistencia y las
pendientes independientes de las unidades), además de la exportación de tramos (contenido csv/txt/md/gpx y
nombres de archivo).

## Contribuir

### Estructura del proyecto

```text
index.html              carcasa + guion de arranque del tema (sin destello de tema equivocado)
icons/                  recursos de iconos (favicon.svg + tamaños PNG/ICO, vista previa)
site.webmanifest        metadatos de instalación PWA (nombre, colores de tema, iconos)
css/                    tokens de diseño (claro/oscuro), base, maquetación, componentes
js/
  parsers/              GPX / FIT / TCX / KML / KMZ → una única matriz unificada de puntos de traza
  geo/                  haversine + distancia 3D, interpolación, simplificación
  metrics/              métricas del tramo (funciones puras, verificables por separado)
  sector/               estado de selección del tramo (única fuente de verdad)
  map/                  vista MapLibre, catálogo de mapas base, tiradores del tramo, terreno 3D y modo de vista 2D/3D
  charts/               gráficos en canvas (perfil altimétrico, análisis de dos variables)
  theme/                sistema / claro / oscuro con sincronización en vivo del SO
  language/             núcleo de idioma + paquetes lang-*.js + plantilla
  units/                preferencia métrico/imperial, conversiones SI de visualización, etiquetas de unidades localizadas
  ui/                   panel de métricas, panel de ajustes, división automática, menús, hojas, carga, iconos
  core/                 pequeño bus de eventos + stores
  utils/                formato sensible a la configuración regional (Intl)
tests/                  suite de pruebas ejecutable en el navegador (tests/index.html)
vendor/fit-parser/      kit de herramientas fit-parser incluido (decodificación FIT, MIT) + shim de buffer
```

La lógica de cálculo vive separada de la UI: `computeSectorMetrics()` y las demás funciones de métricas
nunca tocan el DOM, y la suite de pruebas las cubre.

### Añadir un idioma a la interfaz

El sistema de traducción no tiene ningún framework detrás: **un idioma es un único archivo de datos**.
Si sabes editar un archivo JavaScript, puedes traducir la aplicación.

1. Copia [`js/language/lang-template.js`](js/language/lang-template.js) como `lang-xx.js`
   (`xx` = un código BCP 47 como `de`, `pt-BR`).
2. Traduce los valores de la derecha. Deja las claves y los `{marcadores}` tal cual y mantén la
   coherencia de los términos técnicos (tramo, distancia 3D, desnivel positivo/negativo, pendiente,
   ritmo, VAM).
3. Añade una entrada al catálogo de [`js/language/langs.js`](js/language/langs.js) — código de
   idioma, nombre nativo y cargador diferido. Los paquetes se cargan bajo demanda: al arrancar solo
   se descargan el idioma del visitante y el inglés.
4. Abre la aplicación, cambia a tu idioma y mira la consola. WaySlice Terra valida los paquetes cargados contra
   las claves inglesas y avisa de las claves que falten o sobren.
5. Envía una pull request.

Las claves que falten recurren al inglés (y después a la propia clave), así que la interfaz nunca
muestra `undefined`. El idioma, el tema y el mapa base elegidos sobreviven a las recargas en el
`localStorage`.

### Añadir o editar mapas base

El catálogo de mapas base vive en un único archivo: [`js/map/sources.js`](js/map/sources.js). El menú
del mapa, la hoja de ajustes, la persistencia y la creación de capas de teselas leen todos de él —
añadir o editar una fuente no requiere código de interfaz.

**Añadir una fuente** — añade un objeto a `MAP_SOURCES`:

```js
{
  id: 'esri-topo',           // único; sirve además como clave de persistencia
  labelKey: 'srcEsriTopo',   // clave i18n del nombre mostrado
  group: 'outdoor',          // street | outdoor | satellite | minimal
  url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
  maxZoom: 19,
  attribution: 'Tiles &copy; Esri',
},
```

| Campo | Significado |
|---|---|
| `id` | Identificador único y clave de persistencia. Cambiarlo equivale a una fuente nueva (las selecciones guardadas recurren al valor por defecto); eliminar una entrada también recurre de forma segura. |
| `labelKey` | Clave i18n del nombre mostrado. |
| `group` | Uno de `street`, `outdoor`, `satellite`, `minimal`. |
| `url` | Plantilla de teselas: `{z}` `{x}` `{y}`, opcionalmente `{s}` (requiere `subdomains`) y `{r}` (retina). Atento al orden de coordenadas del proveedor — Esri usa `{z}/{y}/{x}`. |
| `overlayUrl` | Opcional: plantilla de una capa de etiquetas transparente sobre las teselas base. |
| `maxZoom` | El zoom máximo que sirve el proveedor. |
| `attribution` | Lo exigen legalmente OSM, OpenTopoMap, OpenFreeMap, EOX y Esri — consérvala. |
| `subdomains`, `crossOrigin`, `hintKey` | Opcionales: rotación de subdominios; `crossOrigin: false` para servidores de teselas sin cabeceras CORS; línea de pista gris en el selector. |

A continuación añade el nombre mostrado a **todos** los paquetes de idioma — `srcEsriTopo: 'Esri Topo',`
en `lang-en.js`, `lang-zh-CN.js`, `lang-zh-TW.js`, `lang-fr.js`, `lang-ko.js`, `lang-ja.js`,
`lang-de.js`, `lang-es.js`, `lang-it.js` y `lang-template.js`. La prueba de integridad de idiomas sigue
en rojo hasta que todos los paquetes tienen la clave; es deliberado.

**Editar una fuente** cambiando `url`, `maxZoom`, los nombres o la atribución en su sitio. Para un
**grupo nuevo**, añádelo al array `GROUP_ORDER`, úsalo en tus fuentes y añade una clave
`group<Nombre>` (p. ej. `groupTopo`). Los servicios que exigen clave de API (Maptiler, Mapbox)
funcionan con la clave incrustada en `url`, pero no subas la tuya. Mejor teselas en HTTPS: en una
página servida por HTTPS el navegador bloquea las teselas HTTP o las fuerza por HTTPS.
Para comprobarlo: recarga, abre el menú `Mapa` y revisa teselas, zoom máximo y atribución.

### Proveedores de terreno (DEM)

El terreno 3D tiene su propia costura de proveedor, deliberadamente separada del mapa base: [`js/map/providers/terrain.js`](js/map/providers/terrain.js) guarda el catálogo DEM, [`js/map/terrain.js`](js/map/terrain.js) cuelga la fuente raster-dem y el sombreado en el mapa, y [`js/map/viewMode.js`](js/map/viewMode.js) posee la máquina de estados 2D/3D (un botón del mapa etiquetado con el modo de destino, más el clic derecho de escritorio sobre el mapa vacío). El proveedor predeterminado es [Mapterhorn](https://mapterhorn.com/) — sin clave ni registro, datos Copernicus DEM en teselas WebP de 512 px codificadas terrarium, hasta el zoom 12. Añadir un proveedor consiste en añadir una entrada a `TERRAIN_PROVIDERS`; ningún proveedor de China se incluye en la v1, pero esa costura es su punto de intercambio.

Las curvas de nivel se generan en el navegador con el plugin [maplibre-contour](https://github.com/onthegomap/maplibre-contour) incluido en el proyecto ([`js/map/providers/contours.js`](js/map/providers/contours.js) guarda los cuatro rangos recomendados ajustados a mano (métrico / imperial × 2D / 3D — la vista plana y la vista 3D llevan cada una sus propios rangos: allí las curvas de nivel son la información primaria del relieve), y [`js/map/terrain.js`](js/map/terrain.js) lo representa como capas de línea sobre el mapa base, bajo la traza), a partir del mismo DEM de Mapterhorn que el terreno 3D — una sola caché de teselas compartida, con el cálculo de isolíneas en un Web Worker. Métrico e imperial son sistemas separados: elevaciones redondas en metros y en pies — nunca se convierte una curva entre unidades. La equidistancia misma se elige de forma dinámica en cada encuadre: cuando el desplazamiento se asienta, [`js/map/terrain-analysis.js`](js/map/terrain-analysis.js) muestrea el DEM ya visible, ajusta el objetivo de cada banda de zoom y encaja en el valor más cercano de la escala fija de candidatos del sistema de unidades — 20/50/100/200/500/1000 m o 50/100/200/500/1000/2000 ft, nunca nada intermedio. Las mesetas suaves y los llanos leen las equidistancias más gruesas; las montañas de relieve enérgico conservan las finas a cualquier altitud. Las líneas siguen el ejemplo oficial de curvas de nivel de MapLibre (curvas maestras 1 px, secundarias 0,5 px) y las maestras llevan etiquetas de elevación que corren a lo largo de la línea según la convención cartográfica de cada sistema (como en los mapas reales, p. ej. del USGS): números sin unidad en métrico, prima para los pies (3300') en imperial. Con el interruptor de curvas de nivel activado, la atribución del DEM aparece en el control de atribución del mapa.

### Superposición de red viaria

Los mapas base satelitales del catálogo son solo imagen, así que la vista «híbrida» necesita su propia costura de capas: [`js/map/hybrid.js`](js/map/hybrid.js) cuelga sobre la imagen una fuente vectorial con las teselas planet sin clave de OpenFreeMap (la misma familia de proveedores que los mapas base vectoriales y los glifos de las etiquetas) y dibuja un conjunto de capas escogido a mano — líneas de carretera con case, senderos y pistas punteados, etiquetas de vías y de lugares. Desde la ampliación del 2026-10-09 este conjunto dibuja también un relleno translúcido de áreas de parque con sus etiquetas de nombre permanentes (los nombres de parque viajan con el panel natural en todo mapa base no satelital). Ocho clases de puntos naturales viajan en la misma pila: cimas, collados y volcanes vienen directamente de la capa `mountain_peak` de las teselas planet, mientras que bocas de cueva, manantiales, cascadas, rocas y piedras se traen por viewport de la API pública Overpass al acercar (las cascadas por su etiqueta waterway=waterfall; si la petición falla, solo esas cinco faltan). Las etiquetas combinan el nombre localizado con una altitud entera en el sistema de unidades de la app; los iconos aparecen desde z10, los nombres un escalón después, las altitudes al final — las clases pequeñas y densas nunca aparecen en los zooms bajos. Sin edificios, sin etiquetas de POI aparte de los puntos naturales y sin un segundo estado del mapa: la superposición está estrictamente atada al mapa base satelital (al cambiar a cualquier otro mapa base se elimina por completo), el interruptor solo invierte la visibilidad de las capas en lugar de reconstruir nada, los cambios de estilo pasan por la misma costura de rehang de mapView que el módulo de terreno, y no se carga nada hasta que la activas por primera vez sobre un mapa base satelital. Sus capas quedan entre la imagen y la pila de sombreado/curvas de nivel, el orden documentado del módulo de terreno no se toca, y la traza siempre se dibuja por encima de todo.

Fuera del grupo satelital, el botón lleva una segunda cara: las ocho clases de puntos naturales, los nombres de parque y — en los mapas ráster estándar en vista 3D — los nombres de lugares, guardadas en su propia clave wayslice-natural-overlay y activadas por defecto en la primera visita, independientes del interruptor viario satelital. En los estilos vectoriales de OpenFreeMap las cimas se extraen de la fuente planet que el estilo ya carga; en los mapas ráster, la cara aprovisiona la fuente planet sin clave de la app para la extracción (una capa feeder invisible hace que MapLibre descargue sus teselas). Los mapas ráster estándar (OSM, OpenTopoMap, CyclOSM) dibujan marcadores naturales en sus teselas: llevan la superposición solo en vista 3D — en 2D el botón queda desactivado y no se monta nada; una entrada del catálogo también puede excluirse por completo (`naturalOverlay: false`).

### Sustituir los iconos del sitio

Todos los iconos del sitio derivan de un único archivo fuente, `icons/favicon.svg` — una tesela redondeada
de 1024×1024 con dos crestas de montaña naranjas sobre un degradado oscuro, una línea de traza GPX
blanca y puntos verde/rojo que replican los tiradores de tramo de la aplicación. A partir de él se
regeneran `favicon.ico`, los tamaños PNG de 16 a 512 px, `apple-touch-icon.png`, los iconos de Android
Chrome y `site.webmanifest`. Los buscadores tienen sus propios requisitos (Google necesita un PNG de
48 px o más, el manifest y un robots.txt rastreable — de ahí el `robots.txt` en la raíz del
repositorio). `icons/icon-preview.html` muestra todos los tamaños en local. Dentro de la aplicación, la
cabecera y el estado vacío reutilizan la marca de `icons/favicon.svg`; los iconos funcionales provienen de
la biblioteca de iconos Lucide (licencia ISC) y están reunidos en `js/ui/icons.js`. El enlace a
GitHub de la cabecera es la única excepción: carga como imágenes los archivos de logotipo de
GitHub de `icons/` (la marca Octocat y el logotipo denominativo son marcas registradas de
GitHub, Inc., usadas solo para enlazar a este repositorio).

Para poner tu propia marca, edita `icons/favicon.svg`, regenera a partir de él los demás tamaños y mantén
sincronizados los enlaces de `index.html` y `site.webmanifest`.

### Añadir un README traducido

Las traducciones existentes ([English](README.md), [简体中文](README.zh-CN.md), [繁體中文](README.zh-TW.md), [日本語](README.ja.md), [한국어](README.ko.md), [Français](README.fr.md), [Deutsch](README.de.md),
[Italiano](README.it.md)) te sirven de ejemplo. Para añadir una:

1. Copia este `README.md` (o cualquier traducción existente) como `README.xx.md`
   (`xx` = un código BCP 47, p. ej. `README.de.md`).
2. Traduce el texto. Mantén sin cambios la estructura, el orden de las secciones, las tablas, los
   bloques de código y las rutas de archivos, para que todas las versiones sigan siendo fáciles de
   comparar y mantener.
3. Actualiza la línea de cambio de idioma bajo el título en **todos** los README: añade tu idioma como
   enlace en los demás y conserva el formato `A | B | C | D`. En tu propia versión, tu idioma es la
   entrada en texto plano.
4. Envía una pull request.

## Hoja de ruta

- Un mejor algoritmo de depuración de picos que tenga en cuenta la deriva del GPS y el muestreo disperso
- Un mejor algoritmo de detección de pendientes para la división automática (subida / bajada / llano / mixto)
- Mejora opcional de la altitud con servicios DEM externos (solo con consentimiento — el valor por
  defecto sigue siendo 100 % local)

## Licencia

Publicado bajo la [licencia MIT](LICENSE). Libre para uso comercial y privado — por favor, conserva
intactas las atribuciones de los proveedores de mapas:

- [MapLibre GL JS](https://maplibre.org) (BSD-3-Clause)
- © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors (ODbL)
- [OpenTopoMap](https://opentopomap.org) (CC-BY-SA), [CyclOSM](https://github.com/cyclosm/cyclosm-cartocss-style)
- Mapas base de [OpenFreeMap](https://openfreemap.org), [EOX](https://tiles.maps.eox.at), [Esri World Imagery](https://www.esri.com)
- Teselas de terreno (DEM) de [Mapterhorn](https://mapterhorn.com), [maplibre-contour](https://github.com/onthegomap/maplibre-contour) (BSD-3-Clause)
- Iconos de [Lucide](https://lucide.dev) (ISC)

## Agradecimientos

- El proyecto está libremente inspirado en el artículo
  [GPS data analysis](https://trailrunningmovement.com/training/gps-data-analysis/) de
  [Trail Running Movement](https://trailrunningmovement.com/).
- A [Ken Zemach](https://fastestknowntime.com/athlete/ken-zemach) por su
  [traza GPX](https://fastestknowntime.com/fkt/ken-zemach-bruksleden-100-miler-sweden-2020-08-02) del
  Bruksleden 100 Miler (Suecia).
- A [polyvertex](https://github.com/polyvertex) por sus [archivos FIT](https://github.com/polyvertex/fitdecode/tree/master/tests/files).
- A [ToolElewaut](https://github.com/ToonElewaut) por sus [archivos TCX](https://github.com/ToonElewaut/TDF/tree/main/src/Data/Routes) del Tour de Francia 2020 - 2023.
- A [tingard](https://github.com/tingard) por sus [archivos TCX](https://github.com/tingard/cycling_power_analysis).
- A [pherris](https://github.com/pherris) por su [archivo TCX](https://github.com/pherris/IOT-Value-Cycling/tree/master/rides) de una salida ciclista de larga distancia con datos de potencia.
- A [Tommi](https://www.youtube.com/@bewarethemountainman) por su [traza GPX](https://drive.google.com/file/d/1lPVebrcOImAw035d9r0tqP63O-2yZe4E/view) de la ruta de senderismo Kai Kung Leng - Tai To Yan - Tai Mo Shan en Hong Kong.

## Colaboradores

Gracias a todas las personas que ayudan a mantener WaySlice Terra y a que siga funcionando.

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/I8U4273MZK)

### Ko-fi

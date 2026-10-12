> The README is machine-generated, if you find issues please submit a PR.
>
> Questo README è stato generato automaticamente; se trovi problemi, apri una pull request.

<p align="center">
  <img src="./icons/android-chrome-512x512.png" alt="WaySlice Terra">
</p>

<h1 align="center">WaySlice Terra</h1>

<p align="center">
  <strong>Telemetry for every way. Sliced.</strong><br><strong>Ogni strada percorsa diventa telemetria; ogni telemetria si ritaglia e si analizza.</strong>
</p>

<p align="center">
  <a href="README.md">English</a> | <a href="README.zh-CN.md">简体中文</a> | <a href="README.zh-TW.md">繁體中文</a> | <a href="README.ja.md">日本語</a> | <a href="README.ko.md">한국어</a><br><a href="README.fr.md">Français</a> | <a href="README.de.md">Deutsch</a> | <a href="README.es.md">Español</a> | Italiano
</p>

WaySlice Terra è un analizzatore open source di tracce GPX/FIT/TCX/KML/KMZ che gira interamente nel browser.

Le statistiche sull'intera traccia dicono poco: quello che vuoi sapere è come hai affrontato la lunga
salita, la discesa tecnica, gli ultimi 5 km di gara.

WaySlice Terra ti permette di ritagliare qualsiasi tratto e analizzarlo da sé, come si leggono le telemetrie
delle corse automobilistiche o i registratori di dati di volo (QAR) dell'aviazione:

```text
Traccia → Scegli un tratto → Analizza il tratto
```

<p align="center"><img src="./screenshots/overview.jpg" alt="image"></p>

<p align="center"><a href="./screenshots/README.it.md">Altri screenshot</a></p>

Prima volta con questi termini? Parti dalla sezione [Terminologia](#terminologia) — tutte le altre
sezioni usano queste parole esattamente con il significato definito lì.

## Indice

- [Terminologia](#terminologia)
- [Funzionalità](#funzionalità)
- [Formati supportati](#formati-supportati)
- [Per iniziare](#per-iniziare)
  - [Come analizzare un tratto](#come-analizzare-un-tratto)
- [Privacy](#privacy)
- [Sistemi di unità](#sistemi-di-unità)
- [Note di progettazione](#note-di-progettazione)
- [Test](#test)
- [Contribuire](#contribuire)
  - [Struttura del progetto](#struttura-del-progetto)
  - [Aggiungere una lingua all'interfaccia](#aggiungere-una-lingua-allinterfaccia)
  - [Aggiungere o modificare mappe di base](#aggiungere-o-modificare-mappe-di-base)
  - [Fornitori di terreno (DEM)](#fornitori-di-terreno-dem)
  - [Sovrapposizione della rete stradale](#sovrapposizione-della-rete-stradale)
  - [Sostituire le icone del sito](#sostituire-le-icone-del-sito)
  - [Aggiungere un README tradotto](#aggiungere-un-readme-tradotto)
- [Roadmap](#roadmap)
- [Licenza](#licenza)
- [Ringraziamenti](#ringraziamenti)
- [Sostenitori](#sostenitori)

## Terminologia

Questi termini hanno un significato fisso in questo README come nell'interfaccia dell'app. Quando una
parola compare con la maiuscola, va presa esattamente in questo senso:

| Termine | Significato |
|------|---------|
| Traccia (Track) | Un percorso registrato, caricato da un unico file: un elenco ordinato di punti della traccia. |
| Punto della traccia (Track point) | Una singola misurazione lungo la traccia: la posizione, più quota, marca temporale, frequenza cardiaca, cadenza, potenza e temperatura quando il file le fornisce. |
| **Tratto (Sector)** | Il concetto centrale di WaySlice Terra. Un tratto è la parte della traccia compresa tra un punto di inizio e uno di fine scelti da te. I confini possono stare in qualsiasi punto tra due punti della traccia (interpolati). Anche l'intera traccia è un tratto: la «Traccia completa» predefinita. Ogni metrica è calcolata per il tratto corrente. |
| Maniglia del tratto (Sector handle) | Il punto trascinabile che fissa un confine del tratto: verde = inizio, rosso = fine. Le maniglie compaiono sia sulla mappa sia sul profilo altimetrico e restano sincronizzate. |
| Dislivello positivo / negativo (Elevation gain / loss) | Salita / discesa totali all'interno del tratto, dopo il filtro del rumore di 3 m (vedi [Note di progettazione](#note-di-progettazione)). |
| VAM / VDM | Velocità ascensionale / di discesa in metri all'ora: velocità verticale in m/h, calcolata solo sul tempo effettivamente speso a salire / scendere. |
| Tempo in movimento (Moving time) | Tempo trascorso meno le pause: una pausa è una velocità sotto 0,5 km/h prolungata per 10 s o più. |
| GAP | Ritmo adeguato alla pendenza (grade-adjusted pace): il ritmo del tratto diviso il fattore di pendenza di Minetti (2002) — il ritmo in piano a pari sforzo. |
| Distanza equivalente (Effort distance) | Distanza orizzontale + dislivello positivo ÷ 100: ogni 100 m di salita contano come 1 km. |
| Distanza 3D (3D distance) | La distanza che segue il terreno: somma per segmento di √(orizzontale² + verticale²), riportata separatamente dalla distanza orizzontale. |
| Pendenza (Grade) | La ripidezza in un punto o su un tratto di percorso: variazione verticale ÷ distanza orizzontale, mostrata in % (positiva = salita, negativa = discesa). |
| Ritmo (Pace) | Il tempo per unità di distanza: min/km o min/mi. |
| Waypoint | Un luogo con nome memorizzato nel file della traccia stessa (tag `<wpt>` GPX, placemark `<Point>` KML). |
| Mappa di base (Basemap) | La fonte di tile cartografiche disegnata sotto la tua traccia. Predefinita OpenStreetMap. |
| Terreno (DEM) | Il modello di elevazione che trasforma la mappa in terreno 3D. Indipendente dalla mappa di base — si combina con qualsiasi mappa. Predefinito Mapterhorn (dati Copernicus DEM). |
| Sovrapposizione della rete stradale (Road network overlay) | Strade, nomi di luoghi, aree di parco con i loro nomi e punti naturali (cime, selle, sorgenti, cascate…) disegnati sull'immagine satellitare (la vista «ibrida»); su ogni altra mappa di base il pulsante porta i punti naturali e i nomi dei parchi, e sulle mappe raster standard anche i nomi dei luoghi in vista 3D (OSM, OpenTopoMap, CyclOSM solo in vista 3D, poiché le loro tile disegnano marker naturali propri). |

## Funzionalità

- **Vista del terreno 3D.** Un unico pulsante in alto a sinistra della mappa — o un clic destro su un'area vuota della mappa al desktop — passa dalla mappa piatta orientata a nord a una vista del terreno DEM, con etichetta sempre sulla modalità di destinazione: traccia, maniglie e waypoint aderiscono al rilievo; gli interruttori di layer subito sotto (ombreggiatura, curve di livello) condividono lo stesso stato nelle due modalità di vista, e la coppia viene ricordata (curve di livello attive e ombreggiatura spenta per impostazione predefinita). La camera conserva la posizione al cambio. I tile DEM arrivano da un fornitore senza chiave, le curve di livello vengono generate nel browser dallo stesso DEM con quote tonde che seguono il tuo sistema di unità — su qualsiasi mappa di base, anche priva di curve — e la mappa di base resta indipendente.
- **Vista satellite ibrida.** Su una mappa di base satellitare la colonna di pulsanti in alto a sinistra guadagna un interruttore della rete stradale (l'icona della mappa tra il cambio 2D/3D e l'ombreggiatura): disegna strade, nomi delle strade, nomi dei luoghi, aree di parco con i loro nomi e punti naturali sull'immagine, così la foto continua a leggersi come una mappa. La sovrapposizione funziona in entrambe le modalità di vista, e linee ed etichette aderiscono al rilievo 3D come tutto il resto. I punti naturali — cime, selle, vulcani, ingressi di grotte, sorgenti, cascate, rocce e sassi — hanno etichette con nome e un'altitudine che segue il sistema di unità dell'app, e compaiono progressivamente avvicinandosi. Le aree di parco ricevono una velatura verde translucida che resta sotto le strade. Parte spenta e ricorda la tua scelta — lasciando una mappa satellitare la sovrapposizione viene rimossa, e tornando al satellite ritorna com'era. Su ogni mappa di base non satellitare, lo stesso pulsante diventa l'interruttore dei punti naturali (l'icona map-pinned): le otto classi di punti naturali e le etichette dei nomi dei parchi si sovrappongono, e sulle mappe raster standard anche i nomi dei luoghi in vista 3D — dalla sorgente planet che gli stili OpenFreeMap caricano già, oppure dalla sorgente planet senza chiave dell'app sulle mappe raster; le mappe raster standard (OSM, OpenTopoMap, CyclOSM), le cui tile portano marker naturali propri, la hanno solo in vista 3D — attiva per impostazione predefinita, con la sua scelta ricordata.
- **Mappa + profilo altimetrico.** Trascina le maniglie del tratto su una delle due superfici. Le due
  restano sincronizzate in tempo reale e un confine può stare in qualsiasi punto tra due punti della
  traccia, interpolazione compresa.
- **Waypoint su mappa e profilo.** I waypoint GPX (`<wpt>`) e KML (`<Point>`) sono mostrati come
  puntine con il nome in una soffietta — attivale con il bottone a puntina sotto «Zoom sulla traccia».
  Ogni waypoint viene agganciato al punto più vicino della traccia e mostrato nell'ordine della traccia;
  uno che dista più di 50 m dalla traccia non viene mostrato affatto.
  Passando sopra una puntina, il punto corrispondente viene marcato sul profilo altimetrico;
  cliccandola la mappa si centra su di essa senza cambiare il livello di zoom. Le puntine funzionano
  anche da tastiera: Tab passa da una all'altra, Invio o Spazio centra la mappa e una puntina con il
  focus mostra la sua soffietta, come al passaggio del mouse.
- **Zoom a rotella del profilo (desktop), zoom a pizzico (touch).** Passa col cursore sul profilo
  altimetrico e scorri per ingrandire l'asse distanza/tempo attorno al cursore; Maiusc + trascinamento
  per spostarlo; sul touch, un dito sposta e un pizzico di due dita fa zoom. Un doppio clic in un punto qualsiasi del
  profilo — o un doppio tocco su schermo tattile — ripristina la traccia completa.
- **Adatta al tratto.** Il bottone di messa a fuoco dell'intestazione del profilo
  ingrandisce l'asse x sul tratto selezionato: il tratto occupa circa l'82% del grafico con ≈9% di
  contesto oltre ogni maniglia, centrato e limitato ai dati. Un tratto quasi lungo quanto la traccia
  ripristina la vista completa e uno minuscolo approda alla finestra di zoom massimo — la selezione
  non si sposta mai.
- **Un'intestazione del profilo che sta nel suo pannello.** La barra strumenti del profilo altimetrico
  resta su una riga a qualsiasi larghezza: restringendosi il pannello, i pulsanti delle azioni passano
  a sola icona (tooltip e nome accessibile conservati), poi i meno prioritari — analisi,
  sovrapposizioni, aggancio ai waypoint — si spostano come gli stessi pulsanti in un menu «Altre
  azioni» (⋯), il selettore Distanza/Tempo mantiene le etichette più a lungo e solo un pannello molto
  stretto ripiega il titolo nella sua icona. Niente viene compresso, troncato o reso irraggiungibile.
- **Suddivisione automatica.** Il bottone a forbici dell'intestazione costruisce un elenco di tratti
  per l'intera traccia: tagli ai waypoint (da CP a CP), a distanza fissa (1 km / 5 km / personalizzato
  — in miglia con l'imperiale attivo), o per pendenza in segmenti di salita / discesa. Ogni riga mostra numero, intervallo, capsula di tipo (salita, discesa, piatto o misto, in base
  al dislivello), poi tempo, ritmo e frequenza cardiaca; sugli schermi stretti la riga si divide
  in due, la capsula porta il suo testo e i dati si allineano all'inizio dell'intervallo;
  espansa una riga appaiono i dettagli di quel
  tratto — distanza, distanza 3D, distanza equivalente, dislivello positivo/negativo, pendenza media,
  GAP, VAM/VDM, frequenza cardiaca media/massima e zone di frequenza cardiaca — e il tratto
  principale vi passa.
- **Metriche del tratto.** Distanza orizzontale e 3D, distanza equivalente, dislivello
  positivo/negativo, pendenze, tempo totale e tempo in movimento, ritmo, velocità, GAP, più frequenza
  cardiaca, cadenza, potenza e temperatura quando il file le porta. Manca un dato di input? Ottieni
  *Non disponibile*, non 0.
- **Analisi a due variabili.** L'icona a dispersione accanto ai controlli del profilo apre una
  mappa di densità 2D per qualsiasi coppia valida di grandezze — frequenza cardiaca, velocità,
  ritmo, GAP, cadenza, potenza, temperatura, pendenza, quota. L'analisi segue il tratto
  selezionato, e ogni grandezza prende i valori dal meccanismo del pannello delle metriche
  stesso: frequenza cardiaca, cadenza e potenza scartano le letture in pausa e ricevono la
  media mobile a 5 punti del pannello, la temperatura resta grezza (pause incluse), la pendenza
  usa le finestre di gradiente da 50 m del pannello, e la famiglia velocità è la serie di
  velocità massima del pannello per il tratto. Passando il puntatore si leggono X, Y e la
  densità relativa della cella. Temi, unità e lingue
  si applicano in tempo reale, e un modulo grafico dedicato tiene fluidi anche i tracciati da
  100 000 punti. Sul touch due dita fanno zoom e spostano, un dito scorre i dati, un doppio tocco
  riporta all'intervallo completo.
- **Esportazione.** Scarica il tratto corrente — le metriche come csv, txt o md, i punti della traccia come
  file GPX. Le esportazioni seguono la lingua e il sistema di unità attivi al momento del clic.
- **Unità metriche / imperiali.** Cambia unità di visualizzazione quando vuoi. Il metrico è il
  predefinito e la scelta resta salvata in locale.
- **Multilingua.** English, 日本語, 한국어, 简体中文, 繁體中文, Français, Deutsch, Español e Italiano sono
  integrati. Ogni lingua in più è un solo file di dati (vedi [Contribuire](#contribuire)).
- **Privacy per architettura.** Non esiste codice di caricamento. Il tuo file viene letto con la File
  API, poi analizzato e disegnato nel tuo browser.
- **Nessun passaggio di build.** Semplici moduli ES. Da leggere, eseguire e modificare così come sono.

## Formati supportati

| Formato | Geometria | Quota | Marcature temporali |
|--------|----------|-----------|------------|
| `.gpx` | `<trk><trkseg><trkpt>` (multi-segmento); `<rte><rtept>` come sorgente degradata di route | ✅ | ✅ |
| `.fit` | File di attività binari Garmin FIT | ✅ | ✅ |
| `.tcx` | XML TrainingCenterDatabase | ✅ | ✅ |
| `.kml` | `LineString` + `gx:Track` | ✅ (dalle coordinate) | ✅ (`gx:Track` / `<when>`) |
| `.kmz` | ZIP → KML (`DecompressionStream` nativo, senza librerie) | ✅ | ✅ |

La decodifica FIT è affidata alla libreria [fit-parser](https://github.com/jimmykane/fit-parser)
(MIT) inclusa in `vendor/fit-parser/`; il TCX è letto da un parser DOM integrato. Le estensioni sensori GPX
sono lette in modo agnostico rispetto al namespace: Garmin TrackPointExtension (frequenza cardiaca,
cadenza, temperatura, velocità, distanza) e le tre varianti comuni di potenza (`<power>` nuda,
`PowerInWatts`, `ns3:Watts`). Tutti i formati confluiscono nello stesso modello di punto della traccia,
così le metriche del tratto funzionano identicamente a prescindere dal formato di origine. I siti delle
gare pubblicano spesso GPX la cui geometria è una `<rte>` (route) invece di una `<trk>` registrata.
WaySlice Terra li carica come sorgente degradata di route: mappa, distanza e analisi della quota funzionano,
mentre tempo, velocità e frequenza cardiaca appaiono «Non disponibile» invece di numeri inventati.
Se il file contiene entrambi, vince la traccia registrata e la route viene ignorata.

## Per iniziare

**Try it: https://wayslice.com**

Va bene qualsiasi server di file statici. Non c'è nulla da compilare:

```bash
# Python
python -m http.server 8080

# o Node
npx serve .
```

Poi apri <http://localhost:8080> e trascina un file GPX/FIT/TCX/KML/KMZ.

> Aprire `index.html` direttamente via `file://` non funziona perché i browser bloccano gli import di
> moduli ES sugli URL `file://`.

### Come analizzare un tratto

1. Trascina la tua traccia. Per impostazione predefinita è selezionata l'intera traccia.
2. **Trascina le maniglie verdi/rosse del tratto** sulla mappa o sul profilo altimetrico. Puoi anche
   fare clic sulla traccia o sul profilo per spostare il confine più vicino, o trascinare sul profilo
   per selezionare un nuovo intervallo. Sul touch, un dito sposta il profilo ingrandito e un pizzico
   fa zoom; il tratto si cambia solo trascinando le maniglie.
3. Ogni modifica ricalcola il tratto all'istante: distanza, distanza 3D, dislivello positivo/negativo,
   pendenze, ritmo/velocità, chilometro più veloce / più lento.
4. Tastiera: dai il focus a una maniglia e usa le frecce (Maiusc = ×10, Inizio/Fine = salto). `Esc`
   chiude i menu.
5. I dispositivi touch usano gesti cooperativi: un dito scorre la pagina, due dita spostano e
   ingrandiscono la mappa (un suggerimento compare sulla mappa).
6. Tratti pronti all'uso: il bottone `Suddivisione auto` dell'intestazione costruisce un elenco di
   tratti per l'intera traccia — per waypoint, a distanza fissa o per pendenza.

## Privacy

- La tua traccia viene elaborata **solo** nel tuo browser: parsing → analisi → rendering, tutto in
  locale.
- Le uniche richieste di rete sono i **tile cartografici e DEM** della mappa di base e del fornitore di terreno che scegli. I dati della
  tua traccia non vengono mai trasmessi e non ci sono statistiche d'uso.
- Tema, lingua, mappa di base, terreno e unità sono salvati solo nel `localStorage` del tuo dispositivo.
- Questo testo è disponibile anche nell'app: **Informazioni → Privacy** in `Impostazioni` (bottone a ingranaggio dell'intestazione).

## Sistemi di unità

WaySlice Terra nasce con le unità **metriche** e supporta anche quelle **imperiali**. Apri il pannello
`Impostazioni` dal bottone a ingranaggio dell'intestazione — le unità stanno accanto a lingua e tema:

| Visualizzato | Metrico | Imperiale |
|---|---|---|
| Distanza lunga | km | mi |
| Distanza corta / quota | m | ft |
| Velocità | km/h | mph |
| Ritmo | min/km | min/mi |
| Pendenza | % | % |

Tutto il parsing e i calcoli restano in unità SI (metri, metri/secondo, secondi/chilometro). Cambiare
unità riformatta solo i numeri che vedi: il file non viene riletto, il tratto non viene ricalcolato e
la geometria della traccia non cambia. La preferenza è salvata con la chiave `wayslice-units` e
sopravvive ai ricaricamenti. Lingua e unità sono impostazioni indipendenti: ogni lingua funziona con
entrambi i sistemi.

## Note di progettazione

- La **distanza 3D** è calcolata per segmento come `√(orizzontale² + verticale²)` e riportata
  separatamente dalla distanza orizzontale.
- La **distanza equivalente** = distanza orizzontale + dislivello positivo ÷ 100 (100 m di salita
  contano come 1 km).
- La **pendenza media** è il dislivello positivo cumulato del tratto diviso la distanza orizzontale,
  non la media delle pendenze punto per punto; un tratto in sola discesa non ha salite da mediare e
  mostra «—». Le pendenze max/min usano finestre di circa 50 m, così il rumore GPS
  non può fabbricare una pendenza record.
- Il **dislivello positivo/negativo** applica un filtro a isteresi di 3 m: la variazione di quota si
  accumula finché non supera ±3 m e solo allora conta — il rumore sotto i 3 m non gonfia mai i
  totali.
- **VAM/VDM** dividono il dislivello per il tempo effettivamente speso a salire/scendere (la tendenza
  di quota filtrata), non per il tempo totale del tratto.
- Il **tempo in movimento** conta solo i segmenti fuori pausa (velocità sotto 0,5 km/h prolungata per
  10 s o più).
- **Velocità media e ritmo medio** sono calcolate dalle velocità di movimento per segmento e
  ripulite come la curva del profilo: con velocità registrate, una finestra scorrevole di 5 punti
  diluisce il picco nel suo intorno; senza velocità registrate, si applica solo la regola delle 3
  deviazioni standard. La **velocità massima** legge la curva per punto ripulita del profilo, così
  elenco e grafico coincidono sempre.
- Il **GAP medio** divide il ritmo di ogni segmento per il fattore di pendenza di Minetti (2002)
  (limitato a ±45% di pendenza) prima di fare la media: il ritmo in piano a pari sforzo. Nel profilo,
  velocità/ritmo/GAP condividono uno stesso slot di sovrapposizione.
- **Le curve di velocità del profilo** scelgono la regola in base alla fonte: le velocità registrate
  vengono prima verificate confrontandole con il dd/dt del segmento (le letture oltre il 50 % vengono
  scartate) e poi smussate con una finestra scorrevole di 5 punti (ogni valore = la media di al più
  cinque punti centrati su ciascuno); quelle calcolate seguono direttamente la regola 3σ (fuori
  soglia sostituite con l'interpolazione dei vicini). Uno zero registrato (una pausa) è un dato e
  partecipa alla media come gli altri.
- La **semplificazione di visualizzazione** (un campionamento equidistante della traccia registrata per la mappa; il profilo disegna la serie grezza completa, senza
  campionamento per pixel) non tocca mai i punti originali. Le metriche girano sempre sui dati completi.
- Lo **zoom del profilo** scende fino a una finestra di 100 m in modalità distanza e 1 minuto in
  modalità tempo; i dispositivi touch fanno zoom sul profilo con un pizzico di due dita — niente rotella.
  «Adatta al tratto» condivide questo limite: non ingrandisce mai oltre il massimo rotella/pizzico e
  non mostra mai spazio senza dati oltre i capi della traccia.
- Le tracce grandi (100.000 punti o più) funzionano bene. Mentre trascini una maniglia, la ricerca del
  confine parte dalla corrispondenza precedente e amplia la finestra di ricerca al bisogno.

## Test

Apri `tests/index.html` sullo stesso server:

```text
http://localhost:8080/tests/
```

La suite copre i calcoli di distanza, l'interpolazione tra punti, le finestre di pendenza, le metriche
temporali, il parsing GPX/FIT/TCX/KML/KMZ (file malformati e archivi compresi, oltre alle varianti di
potenza ed estensioni sensori GPX e la sorgente degradata di route `<rtept>`), la matrice delle preferenze di tema (sistema/manuale × chiaro/scuro
dell'OS), la catena di fallback delle lingue e le conversioni metrico/imperiale (arrotondamento del
ritmo, VAM, persistenza e pendenze indipendenti dalle unità comprese), più l'esportazione del tratto
(contenuto csv/txt/md/gpx e nomi dei file).

## Contribuire

### Struttura del progetto

```text
index.html              guscio + script di avvio del tema (nessun flash del tema sbagliato)
icons/                  risorse icona (favicon.svg + dimensioni PNG/ICO, pagina di anteprima)
site.webmanifest        metadati di installazione PWA (nome, colori del tema, icone)
css/                    token di design (chiaro/scuro), base, layout, componenti
js/
  parsers/              GPX / FIT / TCX / KML / KMZ → un unico array unificato di punti della traccia
  geo/                  haversine + distanza 3D, interpolazione, semplificazione
  metrics/              metriche del tratto (funzioni pure, testabili in modo indipendente)
  sector/               stato di selezione del tratto (unica fonte di verità)
  map/                  vista MapLibre, catalogo mappe di base, maniglie del tratto, terreno 3D e modalità di vista 2D/3D
  charts/               grafici su canvas (profilo altimetrico, analisi a due variabili)
  theme/                sistema / chiaro / scuro con sincronizzazione live dell'OS
  language/             nucleo lingua + pacchetti lang-*.js + modello
  units/                preferenza metrico/imperiale, conversioni SI di visualizzazione, etichette di unità localizzate
  ui/                   pannello metriche, pannello impostazioni, suddivisione auto, menu, sheet, upload, icone
  core/                 piccolo event bus + store
  utils/                formattazione locale-aware (Intl)
tests/                  suite di test eseguibile nel browser (tests/index.html)
vendor/fit-parser/      toolkit fit-parser incluso (decodifica FIT, MIT) + shim per buffer
```

La logica di calcolo vive separata dalla UI: `computeSectorMetrics()` e le altre funzioni di metrica
non toccano mai il DOM, e la suite di test le copre.

### Aggiungere una lingua all'interfaccia

Il sistema di traduzione non ha framework alle spalle: **una lingua è un solo file di dati**. Se sai
modificare un file JavaScript, puoi tradurre l'app.

1. Copia [`js/language/lang-template.js`](js/language/lang-template.js) in `lang-xx.js`
   (`xx` = un codice BCP 47 come `es`, `pt-BR`).
2. Traduci i valori a destra. Lascia le chiavi e i `{segnaposto}` come sono e mantieni coerenti i
   termini tecnici (tratto, distanza 3D, dislivello positivo/negativo, pendenza, ritmo, VAM).
3. Aggiungi una voce al catalogo in [`js/language/langs.js`](js/language/langs.js) — codice lingua,
   nome nativo e caricatore lazy. I pacchetti si caricano su richiesta: all'avvio vengono scaricati
   solo la lingua del visitatore e l’inglese.
4. Apri l'app, passa alla tua lingua e guarda la console. WaySlice Terra valida i pacchetti caricati contro le
   chiavi inglesi e avvisa di quelle mancanti o sconosciute.
5. Invia una pull request.

Le chiavi mancanti ripiegano sull'inglese (poi sulla chiave stessa), quindi l'interfaccia non mostra
mai `undefined`. Le scelte di lingua, tema e mappa di base sopravvivono ai ricaricamenti nel
`localStorage`.

### Aggiungere o modificare mappe di base

Il catalogo delle mappe di base sta in un solo file: [`js/map/sources.js`](js/map/sources.js). Il menu
Mappa, il pannello impostazioni, la persistenza e la creazione dei layer di tile leggono tutti da lì —
aggiungere o modificare una fonte non richiede codice di interfaccia.

**Aggiungere una fonte** — aggiungi un oggetto a `MAP_SOURCES`:

```js
{
  id: 'esri-topo',           // univoco; fa anche da chiave di persistenza
  labelKey: 'srcEsriTopo',   // chiave i18n del nome mostrato
  group: 'outdoor',          // street | outdoor | satellite | minimal
  url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
  maxZoom: 19,
  attribution: 'Tiles &copy; Esri',
},
```

| Campo | Significato |
|---|---|
| `id` | Id univoco e chiave di persistenza. Cambiarlo equivale a una nuova fonte (le scelte salvate ripiegano sul predefinito); rimuovere una voce ripiega allo stesso modo in sicurezza. |
| `labelKey` | Chiave i18n del nome mostrato. |
| `group` | Uno tra `street`, `outdoor`, `satellite`, `minimal`. |
| `url` | Template dei tile: `{z}` `{x}` `{y}`, opzionalmente `{s}` (richiede `subdomains`) e `{r}` (retina). Attenzione all'ordine delle coordinate del provider — Esri usa `{z}/{y}/{x}`. |
| `overlayUrl` | Opzionale: template di un livello etichette trasparente sopra i tile di base. |
| `maxZoom` | Lo zoom massimo servito dal provider. |
| `attribution` | Richiesta legalmente da OSM, OpenTopoMap, OpenFreeMap, EOX e Esri — conservala. |
| `subdomains`, `crossOrigin`, `hintKey` | Opzionali: rotazione dei sottodomini; `crossOrigin: false` per i server di tile senza header CORS; riga di suggerimento grigia nel selettore. |

Poi aggiungi il nome mostrato a **ogni** pacchetto lingua — `srcEsriTopo: 'Esri Topo',` in
`lang-en.js`, `lang-zh-CN.js`, `lang-zh-TW.js`, `lang-fr.js`, `lang-ko.js`, `lang-ja.js`, `lang-de.js`,
`lang-es.js`, `lang-it.js` e `lang-template.js`. Il test di completezza delle lingue resta rosso finché
tutti i pacchetti non hanno la chiave; è voluto.

**Modificare una fonte** cambiando `url`, `maxZoom`, nomi o attribuzione sul posto. Per un **gruppo
nuovo**, aggiungilo all'array `GROUP_ORDER`, usalo sulle tue fonti e aggiungi una chiave
`group<Nome>` (es. `groupTopo`). I servizi che richiedono una chiave API (Maptiler, Mapbox)
funzionano con la chiave incorporata in `url`, ma non committare la tua. Meglio tile in HTTPS: su
una pagina servita in HTTPS il browser blocca i tile HTTP o li forza in HTTPS.
Per verificare: ricarica, apri il menu `Mappa` e controlla tile, zoom massimo e attribuzione.

### Fornitori di terreno (DEM)

Il terreno 3D ha una propria cucitura di fornitore, deliberatamente separata dalla mappa di base: [`js/map/providers/terrain.js`](js/map/providers/terrain.js) custodisce il catalogo DEM, [`js/map/terrain.js`](js/map/terrain.js) appende la sorgente raster-dem e l'ombreggiatura alla mappa, e [`js/map/viewMode.js`](js/map/viewMode.js) possiede la macchina a stati 2D/3D (un pulsante della mappa etichettato con la modalità di destinazione, più il clic destro desktop sulla mappa vuota). Il fornitore predefinito è [Mapterhorn](https://mapterhorn.com/) — senza chiave né registrazione, dati Copernicus DEM in tile WebP 512 px con codifica terrarium, fino allo zoom 12. Aggiungere un fornitore significa aggiungere una voce a `TERRAIN_PROVIDERS`; nessun fornitore cinese è incluso nella v1, ma quella cucitura è il loro punto di scambio.

Le curve di livello vengono generate nel browser dal plugin [maplibre-contour](https://github.com/onthegomap/maplibre-contour) incluso nel progetto ([`js/map/providers/contours.js`](js/map/providers/contours.js) custodisce i quattro intervalli raccomandati regolati a mano (metrico / imperiale × 2D / 3D — la vista piatta e la vista 3D portano ciascuna i propri intervalli: lì le curve di livello sono l'informazione primaria del rilievo), e [`js/map/terrain.js`](js/map/terrain.js) lo rende come layer di linee sopra la mappa di base, sotto la traccia), a partire dallo stesso DEM Mapterhorn del terreno 3D — una sola cache di tile condivisa, con il calcolo che gira in un Web Worker. Metrico e imperiale sono due sistemi separati: quote tonde in metri e in piedi — una curva non viene mai convertita tra unità. L'equidistanza stessa viene scelta dinamicamente inquadratura per inquadratura: a ogni spostamento assestato [`js/map/terrain-analysis.js`](js/map/terrain-analysis.js) campiona il DEM già visibile, aggiusta l'obiettivo di ogni banda di zoom e aggancia il valore più vicino della scala fissa di candidati del sistema di unità — 20/50/100/200/500/1000 m o 50/100/200/500/1000/2000 ft, mai nulla nel mezzo. Gli altipiani dolci e le pianure leggono le equidistanze più grosse; le montagne dal rilievo aspro mantengono le fini a qualsiasi quota. Il tratto segue l'esempio ufficiale di curve di livello di MapLibre (curve direttrici 1 px, secondarie 0,5 px) e le direttrici portano etichette di quota che corrono lungo la linea secondo la convenzione cartografica di ciascun sistema (come nelle carte reali, es. USGS): numeri senza unità in metrico, apice per i piedi (3300') in imperiale. Con l'interruttore curve di livello attivo, l'attribuzione del DEM compare nel controllo di attribuzione della mappa.

### Sovrapposizione della rete stradale

Le mappe di base satellitari del catalogo sono solo immagine, quindi la vista «ibrida» ha bisogno della sua cucitura di layer: [`js/map/hybrid.js`](js/map/hybrid.js) appende sull'immagine una sorgente vettoriale con i tile planet senza chiave di OpenFreeMap (la stessa famiglia di fornitori delle mappe vettoriali e dei glifi delle etichette) e disegna un set di layer scelto a mano — linee delle strade con bordo, sentieri e tratturi tratteggiati, etichette di strade e luoghi. Dall'estensione del 2026-10-09 questo set disegna anche un riempimento translucido delle aree di parco con le sue etichette di nome permanenti (i nomi dei parchi viaggiano con il pannello naturale su ogni mappa non satellitare). Otto classi di punti naturali viaggiano nella stessa pila: cime, selle e vulcani arrivano direttamente dal layer `mountain_peak` dei tile planet, mentre ingressi di grotte, sorgenti, cascate, rocce e sassi vengono recuperati per viewport dall'API pubblica Overpass avvicinandosi (le cascate tramite il loro tag waterway=waterfall; un fallimento lascia fuori solo quelle cinque). Le etichette abbinano il nome localizzato a un'altitudine intera nel sistema di unità dell'app; le icone compaiono da z10, i nomi un gradino dopo, le altitudini per ultime — le classi piccole e dense non affollano mai gli zoom bassi. Niente edifici, niente etichette POI oltre ai punti naturali, niente secondo stato della mappa: la sovrapposizione è legata strettamente alle mappe satellitari (appena si sceglie un'altra mappa viene rimossa del tutto), l'interruttore cambia solo la visibilità dei layer invece di ricostruirli, i cambi di stile passano dalla stessa cucitura di rehang di mapView del modulo del terreno, e non si carica nulla finché non la attivi per la prima volta su una mappa satellitare. I suoi layer stanno tra l'immagine e la pila ombreggiatura/curve di livello, l'ordine documentato del modulo del terreno resta intatto, e la traccia si disegna sempre sopra a tutto.

Fuori dal gruppo satellitare, il pulsante ha un secondo volto: le otto classi di punti naturali, i nomi dei parchi e — sulle mappe raster standard in vista 3D — i nomi dei luoghi, conservati sotto la propria chiave wayslice-natural-overlay e attivi per impostazione predefinita alla prima visita, indipendenti dall'interruttore stradale satellitare. Sugli stili vettoriali OpenFreeMap le cime vengono estratte dalla sorgente planet che lo stile carica già; sulle mappe raster, il volto approvvigiona la sorgente planet senza chiave dell'app per l'estrazione (un livello feeder invisibile fa sì che MapLibre scarichi le sue tile). Le mappe raster standard (OSM, OpenTopoMap, CyclOSM) disegnano marker naturali nelle loro tile: portano la sovrapposizione solo in vista 3D — in 2D il pulsante è disabilitato e nulla viene montato; una voce del catalogo può anche escludersi del tutto (`naturalOverlay: false`).

### Sostituire le icone del sito

Tutte le icone del sito derivano da un unico file sorgente, `icons/favicon.svg` — un tile arrotondato da
1024×1024 con due creste montuose arancioni su un gradiente scuro, una linea di traccia GPX bianca e
puntini verde/rosso che riprendono le maniglie del tratto dell'app. Da lì si rigenerano `favicon.ico`,
le dimensioni PNG da 16 a 512 px, `apple-touch-icon.png`, le icone Android Chrome e `site.webmanifest`.
I motori di ricerca hanno requisiti propri (Google richiede un PNG da almeno 48 px, il manifest e un
robots.txt esplorabile — da qui il `robots.txt` alla radice del repository). `icons/icon-preview.html` mostra
tutte le dimensioni in locale. Nell'app, intestazione e stato vuoto riutilizzano il marchio di
`icons/favicon.svg`; le icone funzionali provengono dalla libreria di icone Lucide (licenza ISC) e sono
raccolte in `js/ui/icons.js`. L'unica eccezione è il link a GitHub nell'intestazione: carica come
immagini i file del logo GitHub in `icons/` (il marchio Octocat e il logotipo sono marchi di
GitHub, Inc., usati solo per rimandare a questo repository).

Per mettere il tuo marchio, modifica `icons/favicon.svg`, rigenera da lì le altre dimensioni e tieni
sincronizzati i link in `index.html` e `site.webmanifest`.

### Aggiungere un README tradotto

Le traduzioni esistenti ([English](README.md), [简体中文](README.zh-CN.md), [繁體中文](README.zh-TW.md), [日本語](README.ja.md), [한국어](README.ko.md), [Français](README.fr.md), [Deutsch](README.de.md),
[Español](README.es.md)) sono il tuo esempio. Per aggiungerne una:

1. Copia questo `README.md` (o qualsiasi traduzione esistente) in `README.xx.md`
   (`xx` = un codice BCP 47, es. `README.es.md`).
2. Traduci il testo. Mantieni invariati struttura, ordine delle sezioni, tabelle, blocchi di codice e
   percorsi dei file, così tutte le versioni restano facili da confrontare e mantenere.
3. Aggiorna la riga di cambio lingua sotto il titolo in **ogni** README: aggiungi la tua lingua come
   link altrove e mantieni il formato `A | B | C | D`. Nella tua versione, la tua lingua è la voce in
   testo semplice.
4. Invia una pull request.

## Roadmap

- Un algoritmo migliore per la pulizia dei picchi che consideri la deriva GPS e il campionamento rado
- Un algoritmo migliore di rilevamento delle pendenze per la suddivisione automatica (salita / discesa / piatto / misto)
- Miglioramento opzionale della quota da servizi DEM esterni (solo opt-in — il predefinito resta
  completamente locale)

## Licenza

Distribuito sotto [licenza MIT](LICENSE). Libero per uso commerciale e privato — per favore mantieni
intatte le attribuzioni dei fornitori di mappe:

- [MapLibre GL JS](https://maplibre.org) (BSD-3-Clause)
- © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors (ODbL)
- [OpenTopoMap](https://opentopomap.org) (CC-BY-SA), [CyclOSM](https://github.com/cyclosm/cyclosm-cartocss-style)
- Mappe di base di [OpenFreeMap](https://openfreemap.org), [EOX](https://tiles.maps.eox.at), [Esri World Imagery](https://www.esri.com)
- Tile del terreno (DEM) di [Mapterhorn](https://mapterhorn.com), [maplibre-contour](https://github.com/onthegomap/maplibre-contour) (BSD-3-Clause)
- Icone di [Lucide](https://lucide.dev) (ISC)

## Ringraziamenti

- Il progetto è liberamente ispirato all'articolo
  [GPS data analysis](https://trailrunningmovement.com/training/gps-data-analysis/) di
  [Trail Running Movement](https://trailrunningmovement.com/).
- A [Ken Zemach](https://fastestknowntime.com/athlete/ken-zemach) per la sua
  [traccia GPX](https://fastestknowntime.com/fkt/ken-zemach-bruksleden-100-miler-sweden-2020-08-02) del
  Bruksleden 100 Miler (Svezia).
- A [polyvertex](https://github.com/polyvertex) per i suoi [file FIT](https://github.com/polyvertex/fitdecode/tree/master/tests/files).
- A [ToolElewaut](https://github.com/ToonElewaut) per i suoi [file TCX](https://github.com/ToonElewaut/TDF/tree/main/src/Data/Routes) del Tour de France 2020 - 2023.
- A [tingard](https://github.com/tingard) per i suoi [file TCX](https://github.com/tingard/cycling_power_analysis).
- A [pherris](https://github.com/pherris) per il suo [file TCX](https://github.com/pherris/IOT-Value-Cycling/tree/master/rides) di un'uscita in bici di lunga distanza con dati di potenza.
- A [Tommi](https://www.youtube.com/@bewarethemountainman) per la sua [traccia GPX](https://drive.google.com/file/d/1lPVebrcOImAw035d9r0tqP63O-2yZe4E/view) dell'escursione Kai Kung Leng - Tai To Yan - Tai Mo Shan a Hong Kong.

## Sostenitori

Grazie a chi contribuisce a mantenere WaySlice Terra e a farlo funzionare.

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/I8U4273MZK)

### Ko-fi

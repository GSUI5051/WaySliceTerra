<p align="center">
  <img src="./icons/android-chrome-512x512.png" alt="WaySlice Terra">
</p>

<h1 align="center">WaySlice Terra</h1>

<p align="center">
  <strong>Telemetry for every way. Sliced.</strong><br><strong>所經之路，皆成遙測；所成遙測，皆可切析。</strong>
</p>

<p align="center">
  <a href="README.md">English</a> | <a href="README.zh-CN.md">简体中文</a> | 繁體中文 | <a href="README.ja.md">日本語</a> | <a href="README.ko.md">한국어</a><br><a href="README.fr.md">Français</a> | <a href="README.de.md">Deutsch</a> | <a href="README.es.md">Español</a> | <a href="README.it.md">Italiano</a>
</p>

WaySlice Terra 是一個開源、純前端的 GPX/FIT/TCX/KML/KMZ 運動資料分析器。

整條軌跡的統計說明不了什麼：你想知道的是那段長爬坡花了多久、技術性下坡敢不敢放開跑、比賽最後 5 公里有沒有掉速。

WaySlice Terra 讓你切出任意分段，對該分段單獨分析，像讀賽車遙測資料或航空領域的 QAR（飛航資料記錄器）資料那樣：

```text
軌跡 → 選擇分段 → 分析分段
```

<p align="center"><img src="./screenshots/overview.jpg" alt="image"></p>

<p align="center"><a href="./screenshots/README.zh-TW.md">更多截圖</a></p>

## 使用方法

點擊 [https://waysliceterra.com](https://waysliceterra.com) 或 [本機部署](#快速開始)，匯入運動記錄。

第一次接觸這些詞？先讀[術語表](#術語表)，全文的術語都按那裡的定義使用。

## 目錄

- [術語表](#術語表)
- [功能特色](#功能特色)
- [支援的格式](#支援的格式)
- [快速開始](#快速開始)
  - [如何分析一個分段](#如何分析一個分段)
- [隱私](#隱私)
- [單位系統](#單位系統)
- [設計要點](#設計要點)
- [測試](#測試)
- [參與貢獻](#參與貢獻)
  - [專案結構](#專案結構)
  - [新增介面語言](#新增介面語言)
  - [新增或編輯底圖](#新增或編輯底圖)
  - [地形資料來源（DEM）](#地形資料來源dem)
  - [混合路網疊加層](#混合路網疊加層)
  - [替換網站圖示](#替換網站圖示)
  - [新增翻譯版 README](#新增翻譯版-readme)
- [改進方向](#改進方向)
- [授權條款](#授權條款)
- [特別銘謝](#特別銘謝)
- [支持者](#支持者)

## 術語表

本 README 和應用介面裡，這些術語的含義是固定的。後文出現時，一律按本表的定義理解：

| 術語 | 含義 |
|------|---------|
| 軌跡（Track） | 從一個檔案載入的一條記錄路線：按順序排列的軌跡點。 |
| 軌跡點（Track point） | 軌跡上的單個測量點：位置，以及檔案有提供時的海拔、時間戳、心率、踏頻、功率、溫度。 |
| **分段（Sector）** | WaySlice Terra 的核心概念。軌跡上由你選定的起點和終點之間的一段。邊界可以落在任意兩個軌跡點之間（自動內插）。整條軌跡本身也是一個分段，即預設的「整條軌跡」。所有指標都針對當前分段計算。 |
| 分段手柄（Sector handle） | 地圖和海拔剖面上可拖曳的圓點，用來設定分段邊界：綠色 = 起點，紅色 = 終點。地圖和剖面兩邊即時同步。 |
| 爬升 / 下降（Elevation gain / loss） | 分段內上升 / 下降的總量，先經 3 m 降噪濾波（見[設計要點](#設計要點)）。 |
| VAM / VDM | 每小時垂直爬升 / 下降公尺數（Vertical Ascent / Descent Meters per hour），只統計實際處於上升 / 下降狀態的時間。 |
| 移動時間（Moving time） | 總時間減去暫停。暫停指速度低於 0.5 km/h 且持續 10 秒以上。 |
| 等價配速（GAP） | 實測配速除以 Minetti（2002）坡度修正因子後的等效平路配速：同等努力下在平地的配速。 |
| 等效距離（Effort distance） | 水平距離 + 爬升 ÷ 100：每 100 m 爬升折算 1 km。 |
| 3D 距離（3D distance） | 沿地形的距離：逐段累加 √(水平² + 垂直²)，與水平距離分開報告。 |
| 坡度（Grade） | 某點或某段的陡峭程度：垂直變化 ÷ 水平距離，以百分比顯示（正 = 上坡，負 = 下坡）。 |
| 配速（Pace） | 每單位距離所需時間：min/km 或 min/mi。 |
| 航點（Waypoint） | 軌跡檔案自帶的命名位置（GPX `<wpt>`、KML `<Point>`）。 |
| 底圖（Basemap） | 軌跡下方繪製的地圖圖磚來源。預設 OpenStreetMap。 |
| 地形資料來源（DEM） | 把平面地圖抬升成 3D 地形的數值高程模型。與底圖相互獨立——任何底圖都能搭配 DEM 使用。預設 Mapterhorn（Copernicus DEM 資料）。 |
| 路網疊加層（Road network overlay） | 疊在衛星影像上的道路、地名、公園區域及其名稱，以及自然地標（山峰、鞍部、湧泉、瀑布等）（即「混合」檢視）；其餘底圖上按鈕承載自然地標與公園名，標準柵格地圖在 3D 檢視中還承載居民點名（OSM、OpenTopoMap、CyclOSM 的圖磚自帶自然標記，僅 3D 檢視提供）。 |

## 功能特色

- **3D 地形檢視。** 地圖左上角的單一按鈕——桌面版在地圖空白處點右鍵也行——在平面地圖和 DEM 地形檢視之間切換，按鈕文字始終顯示要切換到的模式：軌跡、分段手柄、航點都貼合地形渲染；按鈕下方的圖層開關（山體陰影、等高線）在兩種檢視下共用同一狀態，並持久記憶（預設等高線開、山體陰影關）；切換時相機位置不動。DEM 圖磚來自無需 API key 的資料來源，等高線在瀏覽器端由同一份 DEM 即時生成、高程讀數跟隨單位制——任何底圖（包括沒有等高線的底圖）都能疊加，與底圖互不綁定。
- **混合衛星檢視。** 選擇衛星類底圖後，地圖左上角的按鈕群組會多出一枚路網疊加開關（2D/3D 切換與山體陰影之間的地圖圖示）：它在影像上繪製道路、路名、地名、公園區域及其名稱與自然地標，讓衛星圖保持一張「地圖」的可讀性。疊加層在兩種檢視下都可用，線條與標註和其餘要素一樣貼合 3D 地形。自然地標是七類 OSM 點要素——山峰、鞍部、火山、洞穴入口、湧泉、瀑布、岩石、石塊——標註名稱與海拔，海拔跟隨目前單位制顯示，並隨縮放層級漸進出現。公園區域疊加一層保持在路網之下的半透明綠色面罩。它預設關閉、並記住你的開與關——離開衛星底圖即自動拆除疊加層，切回衛星後依上次的開關狀態還原。其餘所有底圖上，同一枚按鈕都是自然地標開關（map-pinned 圖釘地圖圖示）：八類自然地標與公園名標註疊在其上，標準柵格地圖的 3D 檢視還疊加居民點名——OpenFreeMap 系樣式重用其自帶的 planet 源，柵格地圖由應用自備無 key planet 源；標準柵格地圖（OSM、OpenTopoMap、CyclOSM）圖磚自帶自然標記，僅 3D 檢視提供——預設開啟，並獨立記憶開關狀態。
- **地圖 + 海拔剖面。** 在地圖或剖面上拖曳分段手柄，兩邊即時同步。邊界可以落在兩個軌跡點之間，自動內插。
- **地圖與剖面圖上的航點。** GPX（`<wpt>`）和 KML（`<Point>`）航點以圓點標註在地圖和海拔剖面上，游標停留顯示名稱——用「顯示整條軌跡」下方的圖釘按鈕開關顯示。每個航點都會對齊到軌跡上最近的位置，按軌跡順序顯示；距軌跡超過 50 公尺的航點不會顯示。游標停在地圖上的航點，剖面圖會在對應位置標記出來；點擊航點，地圖會將其置中，縮放比例不變。鍵盤同樣可用：Tab 在圖釘之間移動焦點，Enter 或空格與點擊等效，聚焦圖釘時也會像停留那樣顯示名稱。
- **剖面滾輪縮放（桌面版）/ 雙指捏合縮放（觸控）。** 滑鼠游標停在海拔剖面上滾動滾輪，以游標為中心縮放距離/時間軸；按住 Shift 左右拖曳可平移縮放後的橫軸；觸控裝置單指平移、雙指捏合縮放。在剖面上雙擊（觸控輕點兩下）任意位置，直接恢復整條軌跡。
- **縮放至分段。** 海拔剖面圖頭部行的焦點按鈕，把橫軸縮放到所選分段：分段約占圖表寬度的 82%，兩個手柄之外各留約 9% 的上下文，置中顯示且不越過資料兩端。所選分段接近全程時恢復完整檢視，極小的分段則落在最大縮放窗口上——分段選區本身不會移動。
- **始終單行的剖面頭部。** 海拔剖面圖工具列在任何寬度下都保持一行：面板變窄時，操作按鈕先改為純圖示（保留游標提示與無障礙名稱），隨後低優先級的按鈕——雙變數分析、疊加、航點吸附——作為原按鈕移入「更多控制項」（⋯）選單，距離/時間堅持到最後一刻，只有極窄的面板才把標題收進圖示。任何語言下都不會擠壓、截斷，也不會讓控制項夠不著。
- **一鍵分段。** 點擊頁首的剪刀按鈕，可自動生成整條軌跡的分段列表：按航點分段（CP 到 CP）、按固定距離分段（1 km / 5 km / 自訂，英制下自動改用英里）、按坡度分段（爬升/下降段）。每行依次為序號、里程範圍、類型膠囊（按段內起伏判為爬升、下降、平路或混合）與時間、配速、心率；窄螢幕下每行拆成兩行，膠囊內帶文字，資料行與首行里程起點靠左對齊；展開一行能看到該段的距離、3D 距離、等效距離、爬升/下降、平均坡度、等價配速、VAM/VDM、平均/最大心率與心率區間，主分段同步跳到這一段。
- **分段數據。** 水平距離、3D 距離、等效距離、爬升/下降、坡度、總時間/移動時間、配速、速度、等價配速；檔案裡帶心率、踏頻、功率、溫度時還有對應的體能數據。缺什麼資料就顯示「暫無資料」，不會用 0 強行覆蓋。
- **雙變數分析。** 剖面控制項旁的散點圖示打開二維密度熱力圖，任意有效物理量組合均可分析——心率、速度、配速、等價配速、踏頻、功率、溫度、坡度、海拔。分析範圍跟隨當前選中分段。各物理量的取值與指標面板同源：心率、踏頻、功率按面板口徑剔除暫停讀數並做 5 點滑動視窗平滑，溫度原樣保留（含暫停），坡度取 50 公尺梯度窗口，速度族為面板「最大速度」的分段序列；游標停留即讀所在格子的 X、Y 與相對密度。主題、單位、語言即時跟隨，獨立的圖表模組讓十萬點級軌跡照樣流暢。觸控下：雙指捏合縮放、雙指滑動平移，單指滑動查看資料，輕點兩下恢復完整範圍。
- **匯出。** 把當前分段下載下來：指標數據存為 csv、txt 或 md，軌跡點存為 GPX 檔案。匯出內容跟隨點擊時的語言和單位設定。
- **公制 / 英制單位。** 顯示單位隨時切換。預設公制，選擇儲存在本機。
- **多語言。** 內建 English、日本語、한국어、简体中文、繁體中文、Français、Deutsch、Español、Italiano 九種介面文字，切換即時生效。想再加一種語言？一個資料檔案就夠（見[參與貢獻](#參與貢獻)）。
- **架構級隱私保護。** 程式碼裡沒有上傳功能。檔案透過 File API 讀取，解析、分析、渲染全部在你的瀏覽器裡完成。
- **無需建置。** 純 ES 模組，拿來就能讀、能跑、能改。

## 支援的格式

| 格式 | 幾何資料 | 海拔 | 時間戳 |
|--------|----------|-----------|------------|
| `.gpx` | `<trk><trkseg><trkpt>`（多段）；`<rte><rtept>` 作為降級路線源 | ✅ | ✅ |
| `.fit` | Garmin FIT 二進位活動檔案 | ✅ | ✅ |
| `.tcx` | TrainingCenterDatabase XML | ✅ | ✅ |
| `.kml` | `LineString` + `gx:Track` | ✅（來自座標） | ✅（`gx:Track` / `<when>`） |
| `.kmz` | ZIP → KML（原生 `DecompressionStream`，無第三方函式庫） | ✅ | ✅ |

FIT 的解碼由內建的 fit-parser 函式庫（MIT，`vendor/fit-parser/`）完成；TCX 由內建的 DOM 解析器直接讀取。GPX 的常見感測器擴充按 localName 識別、不挑命名空間前綴：Garmin TrackPointExtension（心率/踏頻/氣溫/速度/距離）和三種功率寫法（裸 `<power>`、`PowerInWatts`、`ns3:Watts`）。所有格式都匯入同一個軌跡點模型，分段指標不區分來源格式。賽事官網發布的 GPX 常以 `<rte>` 路線而非 `<trk>` 軌跡記錄承載幾何。WaySlice Terra 將這類檔案作為降級路線源載入：地圖、距離與海拔分析照常運作，時間、速度與心率等指標如實顯示無法使用，絕不編造數值；同一檔案兩者並存時以軌跡為準，路線忽略。

## 快速開始

**線上試用：<https://waysliceterra.com>**

任何靜態檔案伺服器都可以執行，不需要建置：

```bash
# Python
python -m http.server 8080

# 或 Node
npx serve .
```

然後打開 <http://localhost:8080>，拖入 GPX/FIT/TCX/KML/KMZ 檔案。

> 直接用 `file://` 打開 `index.html` 無法執行，因為瀏覽器會阻止 `file://` URL 上的 ES 模組匯入。

### 如何分析一個分段

1. 匯入軌跡，預設選中整條軌跡。
2. **在地圖或海拔剖面圖上拖曳綠/紅分段手柄**。也可以點擊軌跡或海拔剖面圖，把最近的邊界移過去；在剖面上按住拖曳，可以直接框出一段新範圍。觸控裝置上，單指平移縮放後的剖面，雙指捏合縮放；選區只能透過拖曳手柄調整。
3. 每次調整都會即時重新計算該分段：距離、3D 距離、爬升/下降、坡度、配速/速度、最快/最慢一公里。
4. 鍵盤操作：聚焦手柄後用方向鍵（Shift = ×10，Home/End = 跳到端點）。`Esc` 關閉選單。
5. 觸控裝置採用協作手勢：單指滑動頁面，雙指平移和縮放地圖（地圖上會出現提示）。
6. 想要現成的分段？頁首「一鍵分段」按鈕按航點、距離或坡度，生成整條軌跡的分段列表。

## 隱私

- 軌跡**只**在瀏覽器裡處理：解析 → 分析 → 渲染，全程本機。
- 唯一的網路請求是你所選底圖和地形資料來源的**地圖與 DEM 圖磚**。軌跡資料不會被傳輸，也沒有追蹤碼。
- 主題、語言、底圖、地形和單位偏好只存在你裝置的 `localStorage` 裡。
- 本聲明也可在應用內查看：在「設定」抽屜（頁頭齒輪按鈕）中開啟**關於 → 隱私**。

## 單位系統

WaySlice Terra 預設使用**公制**，同時支援**英制**。點頁首右上角的齒輪打開「設定」抽屜，單位和語言、主題放在一起：

| 顯示項 | 公制 | 英制 |
|---|---|---|
| 長距離 | km | mi |
| 短距離 / 海拔 | m | ft |
| 速度 | km/h | mph |
| 配速 | min/km | min/mi |
| 坡度 | % | % |

解析和計算始終用 SI 單位（公尺、公尺/秒、秒/公里）。切換單位只是把數字換個格式顯示：檔案不重新解析，分段不重新計算，軌跡幾何也不變。這個偏好以 `wayslice-units` 為鍵儲存，重新整理頁面後依然有效。語言和單位是兩個獨立的設定，任何語言都可以搭配任意一種單位系統。

## 設計要點

- **3D 距離**逐段計算 `√(水平² + 垂直²)`，和水平距離分開報告。
- **等效距離** = 水平距離 + 爬升 ÷ 100（每 100 m 爬升折算 1 km）。
- **平均坡度**是分段累計爬升除以水平距離，不是各點坡度的平均值；純下降的分段沒有爬升可平均，顯示「—」。最大/最小坡度用約 50 m 的窗口計算，GPS 雜訊造不出虛假的紀錄坡度。
- **爬升/下降**採用 3 m 閾值過濾：海拔變化累計超過 ±3 m 才計入，小於 3 m 的雜訊不會虛增總量。
- **VAM/VDM** 的分母是實際處於上升/下降狀態的時間（以過濾後的趨勢方向為準），而不是整個分段的总時間。
- **移動時間**只統計暫停以外的片段——暫停指速度低於 0.5 km/h 且持續 10 秒以上。
- **平均速度、平均配速**基於逐段移動速度計算，並按剖面圖的同源規則清洗：有記錄速度時用 5 點滑動視窗把尖峰攤入鄰域；無記錄速度時僅做 3 個標準差剔除。**最大速度**與剖面圖速度曲線一致：取清洗後的逐點速度最大值，列表和圖表永遠一致。
- **平均等價配速（GAP）**：分段配速除以 Minetti（2002）坡度修正因子（坡度鉗制在 ±45% 以內）後取平均——同等努力下的等效平路配速。剖面上速度/配速/GAP 共用一個疊加層槽位。
- **剖面速度曲線清洗**：按速度來源選規則——實測速度先把每個讀數與當時的 dd/dt 交叉校驗（高出 50% 以上的讀數剔除），再用 5 點滑動視窗平滑（每個繪製值取自身及前後各 2 個有效點的均值）；推算速度由位置差推算並直接用 3σ 原則清洗（超限值用鄰點內插補全）；休息時錄得的零速也是資料，正常參與視窗均值。
- **顯示簡化**（地圖用 記錄軌跡的等距取樣，剖面直接繪製完整原始序列，無逐像素取樣）從不改動原始資料，指標始終基於完整資料計算。
- **剖面縮放**最小可到距離模式 100 m、時間模式 1 分鐘的窗口；觸控裝置以雙指捏合縮放剖面，沒有滾輪。縮放至分段共用這一下限：縮放不會深過滾輪/捏合的最大倍率，也不會讓軌跡兩端之外露出空白。
- 大軌跡（10 萬點以上）沒問題。拖曳手柄時，邊界查找從上一次的匹配位置開始，按需擴大搜尋視窗。

## 測試

在同一伺服器上打開 `tests/index.html`：

```text
http://localhost:8080/tests/
```

測試覆蓋距離計算、點間內插、坡度窗口、時間指標、GPX/FIT/TCX/KML/KMZ 解析（包括損壞的檔案、壓縮檔、功率/感測器擴充和降級的 `<rtept>` 路線源）、主題偏好矩陣（系統/手動 × 作業系統淺色/深色）、語言回退鏈、地形資料來源目錄與 2D/3D 檢視狀態機，以及公制/英制轉換（包括配速捨入、VAM、持久化和與單位無關的坡度），還有分段匯出（csv/txt/md/gpx 的內容與檔名）。

## 參與貢獻

### 專案結構

```text
index.html              頁面外殼 + 主題啟動腳本（無主題閃爍）
icons/                  網站圖示資產（favicon.svg 及各尺寸 PNG/ICO、預覽頁）
site.webmanifest        PWA 安裝元資料（名稱、主題色、圖示）
css/                    設計 token（淺色/深色）、基礎、版面、元件
js/
  parsers/              GPX / FIT / TCX / KML / KMZ → 統一的軌跡點陣列
  geo/                  半正矢 + 3D 距離、內插、簡化
  metrics/              分段指標（純函式，可獨立測試）
  sector/               分段選擇狀態（唯一資料源）
  map/                  MapLibre 檢視、底圖目錄、分段手柄、3D 地形 + 2D/3D 檢視模式
  map/providers/        地形（DEM）資料來源目錄——與底圖分離
  charts/               Canvas 圖表（海拔剖面、雙變數分析）
  theme/                系統 / 淺色 / 深色主題，即時跟隨作業系統
  language/             語言核心 + lang-*.js 語言包 + 範本
  units/                公制 / 英制偏好、SI 顯示轉換與在地化單位標籤
  ui/                   指標面板、設定抽屜、一鍵分段、選單、彈出層、上傳、圖示
  core/                 輕量事件匯流排 + 狀態儲存庫
  utils/                locale 感知的格式化（Intl）
tests/                  瀏覽器可執行的測試套件（tests/index.html）
vendor/fit-parser/      內建的 fit-parser 工具函式庫（FIT 解碼，MIT）+ buffer 墊片
vendor/maplibre/        內建的 MapLibre GL JS（BSD-3-Clause）
```

計算邏輯和 UI 是分開的：`computeSectorMetrics()` 等指標函式不碰 DOM，測試套件覆蓋了它們。

### 新增介面語言

翻譯系統背後沒有任何框架：**一種語言就是一個資料檔案**。會改 JavaScript 檔案，就能翻譯這個應用。

1. 把 [`js/language/lang-template.js`](js/language/lang-template.js) 複製為 `lang-xx.js`（`xx` 是 BCP 47 代碼，比如 `es`、`pt-BR`）。
2. 翻譯右邊的值。鍵名和 `{placeholders}` 原樣保留，術語保持一致（分段、3D 距離、爬升/下降、坡度、配速、VAM）。
3. 在 [`js/language/langs.js`](js/language/langs.js) 的目錄裡加一行：語言代碼、本語言名稱、懶加載入口。語言包按需載入：啟動時只拉取訪客的語言和英文回退包。
4. 打開應用切換到你的語言，看主控台。WaySlice Terra 會拿英文鍵校驗已載入的語言包，缺鍵、多鍵都會警告。
5. 送出 pull request。

缺鍵時回退英文（再回退到鍵名本身），介面永遠不會顯示 `undefined`。語言、主題、底圖、地形的選擇都存在 `localStorage` 裡，重新整理後依然有效。

### 新增或編輯底圖

底圖目錄集中在一個檔案裡：[`js/map/sources.js`](js/map/sources.js)。地圖選單、持久化和圖磚圖層建立都從它讀取——加一個圖源不需要動任何 UI 程式碼。

**新增圖源**——往 `MAP_SOURCES` 追加一個物件：

```js
{
  id: 'esri-topo',           // 唯一；同時是持久化鍵
  labelKey: 'srcEsriTopo',   // 顯示名稱的翻譯鍵
  group: 'outdoor',          // street | outdoor | satellite | minimal
  url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
  maxZoom: 19,
  attribution: 'Tiles &copy; Esri',
},
```

| 欄位 | 含義 |
|---|---|
| `id` | 唯一 id，兼作持久化鍵。改 id 等於換了一個新圖源（已保存的選擇會回退到預設）；刪掉條目同樣安全回退。 |
| `labelKey` | 顯示名稱的 i18n 鍵。 |
| `group` | `street`、`outdoor`、`satellite`、`minimal` 之一。 |
| `url` | 圖磚模板：`{z}` `{x}` `{y}`，可選 `{s}`（需配 `subdomains`）和 `{r}`（高解析度螢幕）。注意各家座標軸順序——Esri 用 `{z}/{y}/{x}`。 |
| `overlayUrl` | 可選的透明註記疊加層，畫在底圖圖磚之上。 |
| `maxZoom` | 資料來源提供的最高縮放層級。 |
| `attribution` | OSM、OpenTopoMap、OpenFreeMap、EOX、Esri 的法律要求——保留。 |
| `subdomains`, `crossOrigin`, `hintKey` | 可選：子網域輪替；`crossOrigin: false` 給不發 CORS 標頭的圖磚伺服器；選擇器裡的灰色提示行。 |

然後把顯示名稱加進**每一個**語言包——比如 `srcEsriTopo: 'Esri Topo',` 加進 `lang-en.js`、`lang-zh-CN.js`、`lang-zh-TW.js`、`lang-fr.js`、`lang-ko.js`、`lang-ja.js`、`lang-de.js`、`lang-es.js`、`lang-it.js` 和 `lang-template.js`。缺一個包，語言完整性測試就會一直紅著——這是故意的。

**編輯圖源**直接改 `url`、`maxZoom`、名稱或來源標示即可。要加**新分組**：往 `GROUP_ORDER` 陣列加一項，用在你的圖源上，再加一個 `group<Name>` 鍵（比如 `groupTopo`）。需要 API key 的服務（Maptiler、Mapbox）可以把 key 寫進 `url`，但別把你自己的 key 提交上來。優先 HTTPS 圖磚：HTTPS 頁面會攔截純 HTTP 圖磚，或強制升級到 HTTPS。驗證方法：重新整理頁面，打開「地圖」選單，檢查圖磚、最大縮放和來源標示。

### 地形資料來源（DEM）

3D 地形有自己獨立的資料來源接縫，有意與底圖分開：[`js/map/providers/terrain.js`](js/map/providers/terrain.js) 存放 DEM 目錄，[`js/map/terrain.js`](js/map/terrain.js) 把 raster-dem 資料源和山體陰影掛到地圖上，[`js/map/viewMode.js`](js/map/viewMode.js) 負責 2D/3D 狀態機（一枚顯示目標模式的地圖按鈕，加上桌面版地圖空白處右鍵）。預設資料來源是 [Mapterhorn](https://mapterhorn.com/)——不需要 API key，不用註冊，Copernicus DEM 資料，terrarium 編碼的 512 px WebP 圖磚，最高縮放 12 級。要加資料來源，往 `TERRAIN_PROVIDERS` 追加一個條目即可；初版沒有內建中國資料來源，但這個接縫就是將來它們的替換點。

等高線在瀏覽器端由內建的 [maplibre-contour](https://github.com/onthegomap/maplibre-contour) 外掛生成，與 3D 地形共用同一份 Mapterhorn DEM 和圖磚快取，等值線計算放在 Web Worker 裡：[`js/map/providers/contours.js`](js/map/providers/contours.js) 存放公制/英制 × 2D/3D 四張手工調校的等高距推薦範圍（平面檢視與 3D 檢視的等高距各自獨立——2D 下等高線就是主要地形資訊），[`js/map/terrain.js`](js/map/terrain.js) 把它作為線圖層渲染在底圖之上、軌跡之下。兩套等高距各自獨立：整十公尺高程與整十英尺高程，等高線絕不跨單位換算。等高距本身依檢視動態選定：每次平移停穩後，[`js/map/terrain-analysis.js`](js/map/terrain-analysis.js) 會取樣當前檢視內的 DEM，修正各 zoom 檔的目標值，再吸附到該單位制固定候選梯級中最接近的一檔——20/50/100/200/500/1000 m 或 50/100/200/500/1000/2000 ft，絕無梯級之外的取值。平緩高原與平原讀到較粗的等高距，切割強烈的高山地區無論海拔多高都保持較細的一檔。線型沿用 MapLibre 官方等高線範例（計曲線 1 px、首曲線 0.5 px），計曲線上帶沿等高線走向排布的高程數字標籤，寫法從屬各制的製圖慣例（USGS 等現實等高線圖即如此）：公制是不帶單位的純高程數字，英制以撇號標記英尺（如 3300'）。等高線開關打開時，DEM 署名顯示在地圖的來源標示控制項中。

### 混合路網疊加層

目錄裡的衛星類底圖只有影像，所以「混合」檢視需要自己的圖層接縫：[`js/map/hybrid.js`](js/map/hybrid.js) 在影像之上掛一個 OpenFreeMap planet 向量資料來源（與向量底圖、註記字型同一族的無 key 服務），繪製手工挑選的圖層組——帶襯裡的道路線、虛線小徑與步道、路名和地名標註。2026-10-09 擴容起，這一組還繪製半透明的公園區域填充及其站立名稱標註（公園名在其餘底圖上同樣隨自然面提供）。同一圖層組還承載八類自然地標點：山峰、鞍部、火山直接來自 planet 圖磚的 mountain_peak 層，洞穴入口、湧泉、瀑布、岩石、石塊則依視野自公共 Overpass API 取得（瀑布走其 waterway=waterfall 標籤；放大到 z12 以上才發出請求；請求失敗只是這五類暫缺，其餘一切照舊）。標籤把在地化名稱與依目前單位制取整的海拔組合在一起；圖示 z10 起出現，名稱晚一檔，海拔最後——數量龐大的小類不會在低縮放層級出現。沒有建築、除自然地標外不含其他 POI 標註、也沒有第二套地圖狀態：疊加層嚴格綁定衛星類底圖（一旦切到其他底圖即整個卸載），開關本身只翻轉圖層可見性而不是重建，樣式重掛走與地形模組相同的 mapView rehang 接縫，並且在你於衛星底圖上首次打開它之前不載入任何東西。它的圖層位於影像與山體陰影/等高線之間，地形模組的既有層序不受影響，軌跡始終畫在最上層。

衛星群組之外的底圖上，這枚按鈕還有第二副面孔：承載八類自然地標、公園名與（標準柵格地圖 3D 檢視的）居民點名，開關寫入自己的 wayslice-natural-overlay 鍵、首次造訪預設開啟，與衛星圖的路網開關互不影響。OpenFreeMap 系向量樣式的山峰三角直接從樣式自帶的 planet 源裡抬升；柵格底圖則由應用自備一份無 key planet 源供抬升（一層不可見的 feeder 圖層讓 MapLibre 抓取其圖磚）。標準柵格地圖（OSM、OpenTopoMap、CyclOSM）的圖磚自帶自然標記，因此僅在 3D 檢視承載疊加層——2D 下按鈕停用、什麼都不掛載；目錄項目也可用 naturalOverlay: false 徹底豁免。

### 替換網站圖示

所有網站圖示都源自一個檔案 `icons/favicon.svg`——1024×1024 圓角方塊，深色漸層底上兩道橙色山脊，一條白色 GPX 軌跡線橫穿中間，線兩端的綠/紅點與介面裡的分段手柄配色一致。由它重新生成 `favicon.ico`、16–512 px 的各尺寸 PNG、`apple-touch-icon.png`、Android Chrome 圖示和 `site.webmanifest`。搜尋引擎有各自的要求（Google 顯示圖示需要 48 px 以上 PNG、manifest 和不擋抓取的 robots.txt——儲存庫根目錄的 `robots.txt` 就是為此存在）。`icons/icon-preview.html` 可本機預覽全部尺寸。介面內部：頁首和空狀態的品牌圖形直接複用 `icons/favicon.svg`；功能圖示來自 Lucide 圖示庫（ISC 授權），收在 `js/ui/icons.js` 裡。頁首的 GitHub 連結是唯一例外：它直接以圖片載入 `icons/` 裡的 GitHub 標誌檔案（GitHub 標誌是 GitHub, Inc. 的商標，這裡只用來連結到本儲存庫）。

想換成自己的圖示，改 `icons/favicon.svg` 並由它重新生成其餘尺寸，再同步 `index.html` 裡的連結和 `site.webmanifest`。

### 新增翻譯版 README

現有的翻譯版（[简体中文](README.zh-CN.md)、[日本語](README.ja.md)、[한국어](README.ko.md)、[Français](README.fr.md)、[Deutsch](README.de.md)、[Español](README.es.md)、[Italiano](README.it.md)）就是現成的例子。想加一種：

1. 把本 `README.md`（或任意一份現有翻譯）複製為 `README.xx.md`（`xx` 是 BCP 47 代碼，比如 `README.es.md`）。
2. 翻譯內文。結構、小節順序、表格、程式碼區塊和檔案路徑保持不變，方便各版本對照維護。
3. 更新**每一個** README 標題下的語言導覽列：在別處把你的語言加為連結，並保持 `A | B | C | D` 的格式。在你自己的版本裡，你的語言是純文字。
4. 送出 pull request。

## 改進方向

- 更好的速度資料清洗演算法，以應對 GPS 定位漂移和稀疏取樣的情況
- 一鍵分段中更好的坡段檢測演算法（爬升/下降/平路/混合）
- 可選的外部 DEM 海拔增強（只能手動開啟，預設保持完全本機化）

## 授權條款

基於 [MIT 授權條款](LICENSE)發布，商業和個人使用皆可。地圖資料方的來源標示請保留：

- [MapLibre GL JS](https://maplibre.org)（BSD-3-Clause）
- © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors（ODbL）
- [OpenTopoMap](https://opentopomap.org)（CC-BY-SA）、[CyclOSM](https://github.com/cyclosm/cyclosm-cartocss-style)
- [OpenFreeMap](https://openfreemap.org)、[EOX](https://tiles.maps.eox.at)、[Esri World Imagery](https://www.esri.com) 底圖
- [Mapterhorn](https://mapterhorn.com) 地形（DEM）圖磚、[maplibre-contour](https://github.com/onthegomap/maplibre-contour)（BSD-3-Clause）
- 圖示來自 [Lucide](https://lucide.dev)（ISC）

## 特別銘謝

- 本專案大致受到 Trail Running Movement 的 [GPS data analysis](https://trailrunningmovement.com/training/gps-data-analysis/) 文章啟發。

感謝所有為 WaySlice Terra 的開發和測試提供 GPX、TCX、FIT 及其他資料的人士。

- [Ken Zemach](https://fastestknowntime.com/athlete/ken-zemach) 分享的 Bruksleden 100 Miler（瑞典）[GPX 軌跡](https://fastestknowntime.com/fkt/ken-zemach-bruksleden-100-miler-sweden-2020-08-02)。
- [polyvertex](https://github.com/polyvertex) 分享的 [FIT 檔案](https://github.com/polyvertex/fitdecode/tree/master/tests/files)。
- [ToolElewaut](https://github.com/ToonElewaut) 提供的 2020 - 2023 年環法自由車賽 [TCX 檔案](https://github.com/ToonElewaut/TDF/tree/main/src/Data/Routes)。
- [tingard](https://github.com/tingard) 分享的 [TCX 檔案](https://github.com/tingard/cycling_power_analysis)。
- [pherris](https://github.com/pherris) 分享的帶功率資料的長距離騎行 [TCX 檔案](https://github.com/pherris/IOT-Value-Cycling/tree/master/rides)。
- [Tommi](https://www.youtube.com/@bewarethemountainman) 提供的香港雞公嶺 - 大刀屻 - 大帽山行山 [GPX 軌跡](https://drive.google.com/file/d/1lPVebrcOImAw035d9r0tqP63O-2yZe4E/view)。

## 支持者

感謝所有支持 WaySlice Terra 維護和持續營運的人士。

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/I8U4273MZK)

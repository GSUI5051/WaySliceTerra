<p align="center">
  <img src="./icons/android-chrome-512x512.png" alt="WaySlice Terra">
</p>

<h1 align="center">WaySlice Terra</h1>

<p align="center">
  <strong>Telemetry for every way. Sliced.</strong><br><strong>所经之路，皆成遥测；所成遥测，皆可切析。</strong>
</p>

<p align="center">
  <a href="README.md">English</a> | 简体中文 | <a href="README.zh-TW.md">繁體中文</a> | <a href="README.ja.md">日本語</a> | <a href="README.ko.md">한국어</a><br><a href="README.fr.md">Français</a> | <a href="README.de.md">Deutsch</a> | <a href="README.es.md">Español</a> | <a href="README.it.md">Italiano</a>
</p>

WaySlice Terra 是一个开源、纯前端的 GPX/FIT/TCX/KML/KMZ 运动数据分析器。

整条轨迹的统计说明不了什么：你想知道的是那段长爬坡花了多久、技术性下坡敢不敢放开跑、比赛最后 5 公里有没有掉速。

WaySlice Terra 让你切出任意分段，对该分段单独分析，像读赛车遥测数据或航空领域的 QAR（飞行数据记录器）数据那样：

```text
轨迹 → 选择分段 → 分析分段
```

<p align="center"><img src="./screenshots/overview.jpg" alt="image"></p>

<p align="center"><a href="./screenshots/README.zh-CN.md">更多截图</a></p>

## 使用方法

点击 [https://waysliceterra.com](https://waysliceterra.com) 或 [本地部署](#快速开始)，导入运动记录。

第一次接触这些词？先读[术语表](#术语表)，全文的术语都按那里的定义使用。

## 目录

- [术语表](#术语表)
- [功能特性](#功能特性)
- [支持的格式](#支持的格式)
- [快速开始](#快速开始)
  - [如何分析一个分段](#如何分析一个分段)
- [隐私](#隐私)
- [单位系统](#单位系统)
- [设计要点](#设计要点)
- [测试](#测试)
- [参与贡献](#参与贡献)
  - [项目结构](#项目结构)
  - [添加界面语言](#添加界面语言)
  - [添加或编辑底图](#添加或编辑底图)
  - [地形数据源（DEM）](#地形数据源dem)
  - [混合路网叠加层](#混合路网叠加层)
  - [替换站点图标](#替换站点图标)
  - [添加翻译版 README](#添加翻译版-readme)
- [改进方向](#改进方向)
- [许可证](#许可证)
- [特别鸣谢](#特别鸣谢)
- [支持者](#支持者)

## 术语表

本 README 和应用界面里，这些术语的含义是固定的。后文出现时，一律按本表的定义理解：

| 术语 | 含义 |
|------|---------|
| 轨迹（Track） | 从一个文件载入的一条记录路线：按顺序排列的轨迹点。 |
| 轨迹点（Track point） | 轨迹上的单个测量点：位置，以及文件有提供时的海拔、时间戳、心率、踏频、功率、温度。 |
| **分段（Sector）** | WaySlice Terra 的核心概念。轨迹上由你选定的起点和终点之间的一段。边界可以落在任意两个轨迹点之间（自动插值）。整条轨迹本身也是一个分段，即默认的「完整轨迹」。所有指标都针对当前分段计算。 |
| 分段手柄（Sector handle） | 地图和海拔剖面上可拖动的圆点，用来设定分段边界：绿色 = 起点，红色 = 终点。地图和剖面两边实时同步。 |
| 爬升 / 下降（Elevation gain / loss） | 分段内上升 / 下降的总量，先经 3 m 降噪滤波（见[设计要点](#设计要点)）。 |
| VAM / VDM | 每小时垂直爬升 / 下降米数（Vertical Ascent / Descent Meters per hour），只统计实际处于上升 / 下降状态的时间。 |
| 移动时间（Moving time） | 总用时减去暂停。暂停指速度低于 0.5 km/h 且持续 10 秒以上。 |
| 等强配速（GAP） | 实测配速除以 Minetti（2002）坡度修正因子后的等效平路配速：同等努力下在平地的配速。 |
| 等效距离（Effort distance） | 水平距离 + 爬升 ÷ 100：每 100 m 爬升折算 1 km。 |
| 3D 距离（3D distance） | 沿地形的距离：逐段累加 √(水平² + 垂直²)，与水平距离分开报告。 |
| 坡度（Grade） | 某点或某段的陡峭程度：垂直变化 ÷ 水平距离，以百分比显示（正 = 上坡，负 = 下坡）。 |
| 配速（Pace） | 每单位距离所需时间：min/km 或 min/mi。 |
| 航路点（Waypoint） | 轨迹文件自带的命名位置（GPX `<wpt>`、KML `<Point>`）。 |
| 底图（Basemap） | 轨迹下方绘制的地图瓦片来源。默认 OpenStreetMap。 |
| 地形数据源（DEM） | 把平面地图抬升成 3D 地形的数字高程模型。与底图相互独立——任何底图都能搭配 DEM 使用。默认 Mapterhorn（Copernicus DEM 数据）。 |
| 路网叠加层（Road network overlay） | 叠在卫星影像上的道路、地名、公园区域及其名称，以及自然地标（山峰、鞍部、泉、瀑布等）（即「混合」视图）；其余底图上按钮承载自然地标与公园名，标准栅格地图在 3D 视图中还承载居民点名（OSM、OpenTopoMap、CyclOSM 的瓦片自带自然标记，仅 3D 视图提供）。 |

## 功能特性

- **3D 地形视图。** 地图左上角的单个按钮——桌面端在地图空白处点右键也行——在平面地图和 DEM 地形视图之间切换，按钮文字始终显示要切换到的模式：轨迹、分段手柄、航路点都贴合地形渲染；按钮下方的图层开关（山体阴影、等高线）在两种视图下共用同一状态，并持久记忆（默认等高线开、山体阴影关）；切换时相机位置不动。DEM 瓦片来自无需 API key 的数据源，等高线在浏览器端由同一份 DEM 实时生成、高程读数跟随单位制——任何底图（包括没有等高线的底图）都能叠加，与底图互不绑定。
- **混合卫星视图。** 选择卫星类底图后，地图左上角的按钮组会多出一枚路网叠加开关（2D/3D 切换与山体阴影之间的地图图标）：它在影像上绘制道路、路名、地名、公园区域及其名称与自然地标，让卫星图保持一张「地图」的可读性。叠加层在两种视图下都可用，线条与标注和其余要素一样贴合 3D 地形。自然地标是七类 OSM 点要素——山峰、鞍部、火山、洞穴入口、泉、瀑布、岩石、石块——标注名称与海拔，海拔跟随当前单位制显示，并随缩放逐级出现。公园区域叠加一层保持在路网之下的半透明绿色面罩。它默认关闭、并记住你的开与关——离开卫星底图即自动拆除叠加层，切回卫星后按上次的开关状态恢复。其余所有底图上，同一枚按钮都是自然地标开关（map-pinned 图钉地图图标）：八类自然地标与公园名标注叠在其上，标准栅格地图的 3D 视图还叠加居民点名——OpenFreeMap 系样式复用其自带的 planet 源，栅格地图由应用自备无 key planet 源；标准栅格地图（OSM、OpenTopoMap、CyclOSM）瓦片自带自然标记，仅 3D 视图提供——默认开启，并独立记忆开关状态。
- **地图 + 海拔剖面。** 在地图或剖面上拖动分段手柄，两边实时同步。边界可以落在两个轨迹点之间，自动插值。
- **地图与剖面图上的航路点。** GPX（`<wpt>`）和 KML（`<Point>`）航路点以圆点标注在地图和海拔剖面上，悬停显示名称——用「显示完整轨迹」下方的图钉按钮开关显示。每个航路点都会对齐到轨迹上最近的位置，按轨迹顺序显示；距轨迹超过 50 米的航路点不会显示。悬停地图上的航路点，剖面图会在对应位置标记出来；点击航路点，地图会将其居中，缩放比例不变。键盘同样可用：Tab 在图钉之间移动焦点，Enter 或空格与点击等效，聚焦图钉时也会像悬停那样显示名称。
- **剖面滚轮缩放（桌面端）/ 双指捏合缩放（触屏）。** 鼠标悬停在海拔剖面上滚动滚轮，以光标为中心缩放距离/时间轴；按住 Shift 左右拖动可平移缩放后的横轴；触屏设备单指平移、双指捏合缩放。在剖面上双击（触屏轻点两下）任意位置，直接恢复完整轨迹。
- **缩放至分段。** 海拔剖面头部行的焦点按钮，把横轴缩放到所选分段：分段约占图表宽度的 82%，两个手柄之外各留约 9% 的上下文，居中显示且不越过数据两端。所选分段接近全程时恢复完整视图，极小的分段则落在最大缩放窗口上——分段选区本身不会移动。
- **始终单行的剖面头部。** 海拔剖面工具栏在任何宽度下都保持一行：面板变窄时，操作按钮先改为纯图标（保留悬停提示与无障碍名称），随后低优先级的按钮——分析、叠加、航路点吸附——作为原按钮移入「更多控件」（⋯）菜单，距离/时间坚持到最后一刻，只有极窄的面板才把标题收进图标。任何语言下都不会挤压、截断，也不会让控件够不着。
- **一键分段。** 点击顶栏的剪刀按钮，可自动生成整条轨迹的分段列表：按航路点分段（CP 到 CP）、按固定距离分段（1 km / 5 km / 自定义，英制下自动改用英里）、按坡度分段（爬升/下降段）。每行依次为序号、里程范围、类型胶囊（按段内起伏判为爬升、下降、平路或混合）与用时、配速、心率；窄屏下每行拆成两行，胶囊内带文字，数据行与首行里程起点左对齐；展开一行能看到该段的距离、3D 距离、等效距离、爬升/下降、平均坡度、等强配速、VAM/VDM、平均/最大心率与心率区间，主分段同步跳到这一段。
- **分段数据。** 水平距离、3D 距离、等效距离、爬升/下降、坡度、总用时/移动时间、配速、速度、等强配速；文件里带心率、踏频、功率、温度时还有对应的体能数据。缺什么数据就显示「暂无数据」，不会用 0 强行覆盖。
- **双变量分析。** 剖面控件旁的散点图标打开二维密度热力图，任意有效物理量组合均可分析——心率、速度、配速、等强配速、踏频、功率、温度、坡度、海拔。分析范围跟随当前选中分段。各物理量的取值与指标面板同源：心率、踏频、功率按面板口径剔除暂停读数并做 5 点滑窗平滑，温度原样保留（含暂停），坡度取 50 米梯度窗口，速度族为面板「最大速度」的分段序列；悬停即读所在格子的 X、Y 与相对密度。主题、单位、语言实时跟随，独立的图表模块让十万点级轨迹照样流畅。触屏下：双指捏合缩放、双指滑动平移，单指滑动查看数据，轻点两下恢复完整范围。
- **导出。** 把当前分段下载下来：指标数据存为 csv、txt 或 md，轨迹点存为 GPX 文件。导出内容跟随点击时的语言和单位设置。
- **公制 / 英制单位。** 显示单位随时切换。默认公制，选择保存在本地。
- **多语言。** 内置 English、日本語、한국어、简体中文、繁體中文、Français、Deutsch、Español、Italiano 九种界面文本，切换即时生效。想再加一种语言？一个数据文件就够（见[参与贡献](#参与贡献)）。
- **架构级隐私保护。** 代码里没有上传功能。文件通过 File API 读取，解析、分析、渲染全部在你的浏览器里完成。
- **无需构建。** 纯 ES 模块，拿来就能读、能跑、能改。

## 支持的格式

| 格式 | 几何数据 | 海拔 | 时间戳 |
|--------|----------|-----------|------------|
| `.gpx` | `<trk><trkseg><trkpt>`（多段）；`<rte><rtept>` 作为降级路线源 | ✅ | ✅ |
| `.fit` | Garmin FIT 二进制活动文件 | ✅ | ✅ |
| `.tcx` | TrainingCenterDatabase XML | ✅ | ✅ |
| `.kml` | `LineString` + `gx:Track` | ✅（来自坐标） | ✅（`gx:Track` / `<when>`） |
| `.kmz` | ZIP → KML（原生 `DecompressionStream`，无第三方库） | ✅ | ✅ |

FIT 的解码由内置的 fit-parser 库（MIT，`vendor/fit-parser/`）完成；TCX 由内置的 DOM 解析器直接读取。GPX 的常见传感器扩展按 localName 识别、不挑命名空间前缀：Garmin TrackPointExtension（心率/踏频/气温/速度/距离）和三种功率写法（裸 `<power>`、`PowerInWatts`、`ns3:Watts`）。所有格式都汇入同一个轨迹点模型，分段指标不区分来源格式。赛事官网发布的 GPX 常以 `<rte>` 路线而非 `<trk>` 轨迹记录承载几何。WaySlice Terra 将这类文件作为降级路线源加载：地图、距离与海拔分析照常工作，时间、速度与心率等指标如实显示不可用，绝不编造数值；同一文件两者并存时以轨迹为准，路线忽略。

## 快速开始

**在线试用：<https://waysliceterra.com>**

任何静态文件服务器都可以运行，不需要构建：

```bash
# Python
python -m http.server 8080

# 或 Node
npx serve .
```

然后打开 <http://localhost:8080>，拖入 GPX/FIT/TCX/KML/KMZ 文件。

> 直接用 `file://` 打开 `index.html` 无法运行，因为浏览器会阻止 `file://` URL 上的 ES 模块导入。

### 如何分析一个分段

1. 导入轨迹，默认选中整条轨迹。
2. **在地图或海拔剖面图上拖动绿/红分段手柄**。也可以点击轨迹或海拔剖面图，把最近的边界移过去；在剖面上按住拖动，可以直接框出一段新范围。触屏设备上，单指平移缩放后的剖面，双指捏合缩放；选区只能通过拖动手柄调整。
3. 每次调整都会即时重新计算该分段：距离、3D 距离、爬升/下降、坡度、配速/速度、最快/最慢一公里。
4. 键盘操作：聚焦手柄后用方向键（Shift = ×10，Home/End = 跳到端点）。`Esc` 关闭菜单。
5. 触屏设备采用协作手势：单指滑动页面，双指平移和缩放地图（地图上会出现提示）。
6. 想要现成的分段？顶栏「一键分段」按钮按航路点、距离或坡度，生成整条轨迹的分段列表。

## 隐私

- 轨迹**只**在浏览器里处理：解析 → 分析 → 渲染，全程本地。
- 唯一的网络请求是你所选底图和地形数据源的**地图与 DEM 瓦片**。轨迹数据不会被传输，也没有统计埋点。
- 主题、语言、底图、地形和单位偏好只存在你设备的 `localStorage` 里。
- 本声明也可在应用内查看：在「设置」抽屉（页头齿轮按钮）中打开**关于 → 隐私**。

## 单位系统

WaySlice Terra 默认使用**公制**，同时支持**英制**。点顶栏右上角的齿轮打开「设置」抽屉，单位和语言、主题放在一起：

| 显示项 | 公制 | 英制 |
|---|---|---|
| 长距离 | km | mi |
| 短距离 / 海拔 | m | ft |
| 速度 | km/h | mph |
| 配速 | min/km | min/mi |
| 坡度 | % | % |

解析和计算始终用 SI 单位（米、米/秒、秒/公里）。切换单位只是把数字换个格式显示：文件不重新解析，分段不重新计算，轨迹几何也不变。这个偏好以 `wayslice-units` 为键保存，刷新页面后依然有效。语言和单位是两个独立的设置，任何语言都可以搭配任意一种单位系统。

## 设计要点

- **3D 距离**逐段计算 `√(水平² + 垂直²)`，和水平距离分开报告。
- **等效距离** = 水平距离 + 爬升 ÷ 100（每 100 m 爬升折算 1 km）。
- **平均坡度**是分段累计爬升除以水平距离，不是各点坡度的平均值；纯下降的分段没有爬升可平均，显示「—」。最大/最小坡度用约 50 m 的窗口计算，GPS 噪声造不出虚假的纪录坡度。
- **爬升/下降**采用 3 m 阈值过滤：海拔变化累计超过 ±3 m 才计入，小于 3 m 的噪声不会虚增总量。
- **VAM/VDM** 的分母是实际处于上升/下降状态的时间（以过滤后的趋势方向为准），而不是整个分段的总时间。
- **移动时间**只统计暂停以外的片段——暂停指速度低于 0.5 km/h 且持续 10 秒以上。
- **平均速度、平均配速**基于逐段移动速度计算，并按剖面图的同源规则清洗：有记录速度时用 5 点滑动窗口把尖峰摊入邻域；无记录速度时仅做 3 个标准差剔除。**最大速度**与剖面图速度曲线一致：取清洗后的逐点速度最大值，列表和图表永远一致。
- **平均等强配速（GAP）**：分段配速除以 Minetti（2002）坡度修正因子（坡度钳制在 ±45% 以内）后取平均——同等努力下的等效平路配速。剖面上速度/配速/GAP 共用一个叠加层槽位。
- **剖面速度曲线清洗**：按速度来源选规则——实测速度先把每个读数与当时的 dd/dt 交叉校验（高出 50% 以上的读数剔除），再用 5 点滑动窗口平滑（每个绘制值取自身及前后各 2 个有效点的均值）；推算速度由位置差推算并直接用 3σ 原则清洗（超限值用邻点插值补全）；休息时录得的零速也是数据，正常参与窗口均值。
- **显示简化**（地图用 记录轨迹的等距采样，剖面直接绘制完整原始序列，无逐像素采样）从不改动原始数据，指标始终基于完整数据计算。
- **剖面缩放**最小可到距离模式 100 m、时间模式 1 分钟的窗口；触屏设备以双指捏合缩放剖面，没有滚轮。缩放至分段共用这一下限：缩放不会深过滚轮/捏合的最大倍率，也不会让轨迹两端之外露出空白。
- 大轨迹（10 万点以上）没问题。拖动手柄时，边界查找从上一次的匹配位置开始，按需扩大搜索窗口。

## 测试

在同一服务器上打开 `tests/index.html`：

```text
http://localhost:8080/tests/
```

测试覆盖距离计算、点间插值、坡度窗口、时间指标、GPX/FIT/TCX/KML/KMZ 解析（包括损坏的文件、压缩包、功率/传感器扩展和降级的 `<rtept>` 路线源）、主题偏好矩阵（系统/手动 × 操作系统浅色/深色）、语言回退链、地形数据源目录与 2D/3D 视图状态机，以及公制/英制转换（包括配速舍入、VAM、持久化和与单位无关的坡度），还有分段导出（csv/txt/md/gpx 的内容与文件名）。

## 参与贡献

### 项目结构

```text
index.html              页面外壳 + 主题启动脚本（无主题闪烁）
icons/                  站点图标资产（favicon.svg 及各尺寸 PNG/ICO、预览页）
site.webmanifest        PWA 安装元数据（名称、主题色、图标）
css/                    设计令牌（浅色/深色）、基础、布局、组件
js/
  parsers/              GPX / FIT / TCX / KML / KMZ → 统一的轨迹点数组
  geo/                  半正矢 + 3D 距离、插值、简化
  metrics/              分段指标（纯函数，可独立测试）
  sector/               分段选择状态（唯一数据源）
  map/                  MapLibre 视图、底图目录、分段手柄、3D 地形 + 2D/3D 视图模式
  map/providers/        地形（DEM）数据源目录——与底图分离
  charts/               Canvas 图表（海拔剖面、双变量分析）
  theme/                系统 / 浅色 / 深色主题，实时跟随操作系统
  language/             语言核心 + lang-*.js 语言包 + 模板
  units/                公制 / 英制偏好、SI 显示转换与本地化单位标签
  ui/                   指标面板、设置抽屉、一键分段、菜单、弹层、上传、图标
  core/                 轻量事件总线 + 状态仓库
  utils/                locale 感知的格式化（Intl）
tests/                  浏览器可运行的测试套件（tests/index.html）
vendor/fit-parser/      内置的 fit-parser 工具库（FIT 解码，MIT）+ buffer 垫片
vendor/maplibre/        内置的 MapLibre GL JS（BSD-3-Clause）
```

计算逻辑和 UI 是分开的：`computeSectorMetrics()` 等指标函数不碰 DOM，测试套件覆盖了它们。

### 添加界面语言

翻译系统背后没有任何框架：**一种语言就是一个数据文件**。会改 JavaScript 文件，就能翻译这个应用。

1. 把 [`js/language/lang-template.js`](js/language/lang-template.js) 复制为 `lang-xx.js`（`xx` 是 BCP 47 代码，比如 `es`、`pt-BR`）。
2. 翻译右边的值。键名和 `{placeholders}` 原样保留，术语保持一致（分段、3D 距离、爬升/下降、坡度、配速、VAM）。
3. 在 [`js/language/langs.js`](js/language/langs.js) 的目录里加一行：语言代码、本语言名称、懒加载入口。语言包按需加载：启动时只拉取访问者的语言和英文回退包。
4. 打开应用切换到你的语言，看控制台。WaySlice Terra 会拿英文键校验已加载的语言包，缺键、多键都会警告。
5. 提交 pull request。

缺键时回退英文（再回退到键名本身），界面永远不会显示 `undefined`。语言、主题、底图、地形的选择都存在 `localStorage` 里，刷新后依然有效。

### 添加或编辑底图

底图目录集中在一个文件里：[`js/map/sources.js`](js/map/sources.js)。地图菜单、持久化和瓦片图层创建都从它读取——加一个图源不需要动任何 UI 代码。

**添加图源**——往 `MAP_SOURCES` 追加一个对象：

```js
{
  id: 'esri-topo',           // 唯一；同时是持久化键
  labelKey: 'srcEsriTopo',   // 显示名称的翻译键
  group: 'outdoor',          // street | outdoor | satellite | minimal
  url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
  maxZoom: 19,
  attribution: 'Tiles &copy; Esri',
},
```

| 字段 | 含义 |
|---|---|
| `id` | 唯一 id，兼作持久化键。改 id 等于换了一个新图源（已保存的选择会回退到默认）；删掉条目同样安全回退。 |
| `labelKey` | 显示名称的 i18n 键。 |
| `group` | `street`、`outdoor`、`satellite`、`minimal` 之一。 |
| `url` | 瓦片模板：`{z}` `{x}` `{y}`，可选 `{s}`（需配 `subdomains`）和 `{r}`（高分屏）。注意各家坐标系顺序——Esri 用 `{z}/{y}/{x}`。 |
| `overlayUrl` | 可选的透明注记叠加层，画在底图瓦片之上。 |
| `maxZoom` | 数据源提供的最高缩放级别。 |
| `attribution` | OSM、OpenTopoMap、OpenFreeMap、EOX、Esri 的法律要求——保留。 |
| `subdomains`, `crossOrigin`, `hintKey` | 可选：子域轮换；`crossOrigin: false` 给不发 CORS 头的瓦片服务器；选择器里的灰色提示行。 |

然后把显示名称加进**每一个**语言包——比如 `srcEsriTopo: 'Esri Topo',` 加进 `lang-en.js`、`lang-zh-CN.js`、`lang-zh-TW.js`、`lang-fr.js`、`lang-ko.js`、`lang-ja.js`、`lang-de.js`、`lang-es.js`、`lang-it.js` 和 `lang-template.js`。缺一个包，语言完整性测试就会一直红着——这是故意的。

**编辑图源**直接改 `url`、`maxZoom`、名称或归属即可。要加**新分组**：往 `GROUP_ORDER` 数组加一项，用在你的图源上，再加一个 `group<Name>` 键（比如 `groupTopo`）。需要 API key 的服务（Maptiler、Mapbox）可以把 key 写进 `url`，但别把你自己的 key 提交上来。优先 HTTPS 瓦片：HTTPS 页面会拦截纯 HTTP 瓦片，或强制升级到 HTTPS。验证方法：刷新页面，打开「地图」菜单，检查瓦片、最大缩放和归属信息。

### 地形数据源（DEM）

3D 地形有自己独立的数据源接缝，有意与底图分开：[`js/map/providers/terrain.js`](js/map/providers/terrain.js) 存放 DEM 目录，[`js/map/terrain.js`](js/map/terrain.js) 把 raster-dem 数据源和山体阴影挂到地图上，[`js/map/viewMode.js`](js/map/viewMode.js) 负责 2D/3D 状态机（一枚显示目标模式的地图按钮，加上桌面端地图空白处右键）。默认数据源是 [Mapterhorn](https://mapterhorn.com/)——不需要 API key，不用注册，Copernicus DEM 数据，terrarium 编码的 512 px WebP 瓦片，最高缩放 12 级。要加数据源，往 `TERRAIN_PROVIDERS` 追加一个条目即可；初版没有内置中国数据源，但这个接缝就是将来它们的替换点。

等高线在浏览器端由内置的 [maplibre-contour](https://github.com/onthegomap/maplibre-contour) 插件生成，与 3D 地形共用同一份 Mapterhorn DEM 和瓦片缓存，等值线计算放在 Web Worker 里：[`js/map/providers/contours.js`](js/map/providers/contours.js) 存放公制/英制 × 2D/3D 四张手工调校的等高距推荐范围（平面视图与 3D 视图的等高距各自独立——2D 下等高线就是主要地形信息），[`js/map/terrain.js`](js/map/terrain.js) 把它作为线图层渲染在底图之上、轨迹之下。两套等高距各自独立：整十米高程与整十英尺高程，等高线绝不跨单位换算。等高距本身按视野动态选定：每次平移停稳后，[`js/map/terrain-analysis.js`](js/map/terrain-analysis.js) 会采样当前视野内的 DEM，修正各 zoom 档的目标值，再吸附到该单位制固定候选梯级中最接近的一档——20/50/100/200/500/1000 m 或 50/100/200/500/1000/2000 ft，绝无梯级之外的取值。平缓高原与平原读到较粗的等高距，切割强烈的高山地区无论海拔多高都保持较细的一档。线型沿用 MapLibre 官方等高线示例（计曲线 1 px、首曲线 0.5 px），计曲线上带沿等高线走向排布的高程数字标签，写法从属各制的制图惯例（USGS 等现实等高线图即如此）：公制是不带单位的纯高程数字，英制以撇号标记英尺（如 3300'）。等高线开关打开时，DEM 署名显示在地图的归属信息控件中。

### 混合路网叠加层

目录里的卫星类底图只有影像，所以「混合」视图需要自己的图层接缝：[`js/map/hybrid.js`](js/map/hybrid.js) 在影像之上挂一个 OpenFreeMap planet 矢量数据源（与矢量底图、注记字体同一族的无 key 服务），绘制手工挑选的图层组——带衬线的道路线、虚线小径与步道、路名和地名标注。2026-10-09 扩容起，这一组还绘制半透明的公园区域填充及其站立名称标注（公园名在其余底图上同样随自然面提供）。同一图层组还承载八类自然地标点：山峰、鞍部、火山直接来自 planet 瓦片的 mountain_peak 层，洞穴入口、泉、瀑布、岩石、石块则按视野从公共 Overpass API 获取（瀑布走其 waterway=waterfall 标签；放大到 z12 以上才发起请求；请求失败只是这五类暂缺，其余一切照旧）。标签把本地化名称与按当前单位制取整的海拔组合在一起；图标 z10 起出现，名称晚一档，海拔最后——数量庞大的小类不会在低缩放级别出现。没有建筑、除自然地标外不含其他 POI 标注、也没有第二套地图状态：叠加层严格绑定卫星类底图（一旦切到其他底图即整个卸载），开关本身只翻转图层可见性而不是重建，样式重挂走与地形模块相同的 mapView rehang 接缝，并且在你于卫星底图上首次打开它之前不加载任何东西。它的图层位于影像与山体阴影/等高线之间，地形模块的既有层序不受影响，轨迹始终画在最上层。

卫星组之外的底图上，这枚按钮还有第二副面孔：承载八类自然地标、公园名与（标准栅格地图 3D 视图的）居民点名，开关写入自己的 wayslice-natural-overlay 键、首次访问默认开启，与卫星图的路网开关互不影响。OpenFreeMap 系矢量样式的山峰三角直接从样式自带的 planet 源里抬升；栅格底图则由应用自备一份无 key planet 源供抬升（一层不可见的 feeder 图层让 MapLibre 拉取其瓦片）。标准栅格地图（OSM、OpenTopoMap、CyclOSM）的瓦片自带自然标记，因此仅在 3D 视图承载叠加层——2D 下按钮禁用、什么都不挂载；目录条目也可用 naturalOverlay: false 彻底豁免。

### 替换站点图标

所有站点图标都源自一个文件 `icons/favicon.svg`——1024×1024 圆角方块，深色渐变底上两道橙色山脊，一条白色 GPX 轨迹线横穿中间，线两端的绿/红点与界面里的分段手柄配色一致。由它重新生成 `favicon.ico`、16–512 px 的各尺寸 PNG、`apple-touch-icon.png`、Android Chrome 图标和 `site.webmanifest`。搜索引擎有各自的要求（Google 显示图标需要 48 px 以上 PNG、manifest 和不挡抓取的 robots.txt——仓库根目录的 `robots.txt` 就是为此存在）。`icons/icon-preview.html` 可本地预览全部尺寸。界面内部：页头和空状态的品牌图形直接复用 `icons/favicon.svg`；功能图标来自 Lucide 图标库（ISC 许可），收在 `js/ui/icons.js` 里。页头的 GitHub 链接是唯一例外：它直接以图片加载 `icons/` 里的 GitHub 标志文件（GitHub 标志是 GitHub, Inc. 的商标，这里只用来链接到本仓库）。

想换成自己的图标，改 `icons/favicon.svg` 并由它重新生成其余尺寸，再同步 `index.html` 里的链接和 `site.webmanifest`。

### 添加翻译版 README

现有的翻译版（[繁體中文](README.zh-TW.md)、[日本語](README.ja.md)、[한국어](README.ko.md)、[Français](README.fr.md)、[Deutsch](README.de.md)、[Español](README.es.md)、[Italiano](README.it.md)）就是现成的例子。想加一种：

1. 把本 `README.md`（或任意一份现有翻译）复制为 `README.xx.md`（`xx` 是 BCP 47 代码，比如 `README.es.md`）。
2. 翻译正文。结构、小节顺序、表格、代码块和文件路径保持不变，方便各版本对照维护。
3. 更新**每一个** README 标题下的语言导航行：在别处把你的语言加为链接，并保持 `A | B | C | D` 的格式。在你自己的版本里，你的语言是纯文本。
4. 提交 pull request。

## 改进方向

- 更好的速度数据清洗算法，以应对 GPS 定位漂移和稀疏采样的情况
- 一键分段中更好的坡段检测算法（爬升/下降/平路/混合）
- 可选的外部 DEM 海拔增强（只能手动开启，默认保持完全本地化）

## 许可证

基于 [MIT 许可证](LICENSE)发布，商业和个人使用皆可。地图数据方的署名请保留：

- [MapLibre GL JS](https://maplibre.org)（BSD-3-Clause）
- © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors（ODbL）
- [OpenTopoMap](https://opentopomap.org)（CC-BY-SA）、[CyclOSM](https://github.com/cyclosm/cyclosm-cartocss-style)
- [OpenFreeMap](https://openfreemap.org)、[EOX](https://tiles.maps.eox.at)、[Esri World Imagery](https://www.esri.com) 底图
- [Mapterhorn](https://mapterhorn.com) 地形（DEM）瓦片、[maplibre-contour](https://github.com/onthegomap/maplibre-contour)（BSD-3-Clause）
- 图标来自 [Lucide](https://lucide.dev)（ISC）

## 特别鸣谢

- 本项目大致受到 Trail Running Movement 的 [GPS data analysis](https://trailrunningmovement.com/training/gps-data-analysis/) 文章启发。

感谢所有为 WaySlice Terra 的开发和测试提供 GPX、TCX、FIT 及其他数据的人士。

- [Ken Zemach](https://fastestknowntime.com/athlete/ken-zemach) 分享的 Bruksleden 100 Miler（瑞典）[GPX 轨迹](https://fastestknowntime.com/fkt/ken-zemach-bruksleden-100-miler-sweden-2020-08-02)。
- [polyvertex](https://github.com/polyvertex) 分享的 [FIT 文件](https://github.com/polyvertex/fitdecode/tree/master/tests/files)。
- [ToolElewaut](https://github.com/ToonElewaut) 提供的 2020 - 2023 年环法自行车赛 [TCX 文件](https://github.com/ToonElewaut/TDF/tree/main/src/Data/Routes)。
- [tingard](https://github.com/tingard) 分享的 [TCX 文件](https://github.com/tingard/cycling_power_analysis)。
- [pherris](https://github.com/pherris) 分享的带功率数据的长距离骑行 [TCX 文件](https://github.com/pherris/IOT-Value-Cycling/tree/master/rides)。
- [Tommi](https://www.youtube.com/@bewarethemountainman) 提供的香港鸡公岭 - 大刀屻 - 大帽山徒步 [GPX 轨迹](https://drive.google.com/file/d/1lPVebrcOImAw035d9r0tqP63O-2yZe4E/view)。

## 支持者

感谢所有支持 WaySlice Terra 维护和持续运营的人士。

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/I8U4273MZK)

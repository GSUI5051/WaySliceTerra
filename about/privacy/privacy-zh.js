/**
 * 中文语言包 — the privacy page's simplified Chinese version. Also shown for a
 * zh-TW interface choice (only these two language files exist). Pure content:
 * the selection logic lives in privacy-lang.js.
 *
 * Every factual claim mirrors what the app actually does.
 */

export const PRIVACY_ZH_CN = {
  htmlLang: 'zh-CN',
  title: 'WaySlice Terra — 隐私',
  heading: '隐私',
  tagline: '所经之路，皆成遥测；所成遥测，皆可切析。',
  lede: 'WaySlice Terra 如何处理你的数据。',
  sections: [
    {
      h: '架构级隐私',
      ps: [
        'WaySlice Terra 不需要服务器，无需账号和登录，没有上传功能。浏览器通过内置 File API 读取你的文件，轨迹的解析、分析、渲染全部在你自己的浏览器中完成。',
        'WaySlice Terra 不会收集任何数据，也没有统计埋点。',
      ],
    },
    {
      h: '数据不上网',
      ps: [
        'WaySlice Terra 只会保存你的设置，它们保存在你设备的 localStorage 中，不会上传到任何服务器。',
        '删除浏览数据的同时，会删除这些数据。',
      ],
    },
    {
      h: '需要联网的功能',
      ps: [
        '唯一需要联网的功能是地图。底图瓦片来自各地图供应商的服务器：OpenStreetMap、OpenTopoMap、CyclOSM、OpenFreeMap、EOX 与 Esri；高程（DEM）瓦片来自 Mapterhorn（Copernicus DEM 数据）——免 API key、免注册——山体阴影由你的浏览器根据该 DEM 本地计算。打开等高线开关时，等高线由你的浏览器从同一份 DEM 实时生成（使用内置的 maplibre-contour 库，不请求任何等高线服务）。等高线上高程标签的字体文件来自 OpenFreeMap。在卫星底图上打开路网叠加层时，其中四类较小的自然地标点（洞穴入口、泉、岩石、石块）从公共 Overpass API（z.overpass-api.de / lz4.overpass-api.de / overpass.osm.rambler.ru / overpass.private.coffee / maps.mail.ru）获取——该查询包含当前地图视野的边界框；山峰、鞍部与火山来自前述 OpenFreeMap 瓦片。',
        '只有加载地图需要联网，就像加载网页上的图片一样。你的轨迹、你的文件与你的设置不会上传到任何服务器。',
      ],
    },
    {
      h: '开源',
      ps: [
        'WaySlice Terra 是开源软件（MIT 许可证），所有机制都有源代码佐证。',
        '你甚至可以自行部署 WaySlice Terra。它是一个静态 Web 应用，任何静态文件服务器都能托管，无需构建。',
      ],
    },
  ],
};

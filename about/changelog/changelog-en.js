/**
 * English content pack — the changelog page's English version. Pure content:
 * the selection logic lives in changelog-lang.js, the same split the story
 * page uses (story-en.js + story-lang.js).
 *
 * One section per day, newest first; the section headings are the dates
 * (YYYY-MM-DD) and the paragraphs state that day's user-visible changes.
 * The Chinese pack is the source of the entries. The English pack mirrors it
 * day for day, paragraph for paragraph.
 */

export const CHANGELOG_EN = {
  htmlLang: 'en',
  title: 'WaySlice Terra — Changelog',
  heading: 'Changelog',
  tagline: 'Telemetry for every way. Sliced.',
  lede: 'What changed in the analyzer, day by day.',
  sections: [
    {
      h: '2026-10-15',
      ps: [
        'Settings gains a "Track Elevation" group: fill the elevations a track is missing from DEM data, replace every elevation with a DEM sample, or restore the file\'s original elevations at any time; replacing asks for confirmation first.',
        'Once a correction runs, everything that depends on elevation — the profile, elevation gain and loss, grade and 3D distance — is recomputed from the new data right away. Coordinates, timestamps and the rest of the file stay untouched.',
      ],
    },
    {
      h: '2026-10-14',
      ps: [
        'Some watches record running and hiking cadence as single-leg cycles, so the raw number is half the real step rate. WaySlice now reads the step-length and speed data inside each file to tell how that file counts cadence. It shows the converted value in steps per minute. Files without the data to tell keep the raw values, and a notice in the header says so. On the narrowest screens the notice folds into the file chip popover.',
        'Converted cadence is labeled as step cadence in steps per minute. The exported track file carries the converted values too, matching what the page shows.',
      ],
    },
    {
      h: '2026-10-11',
      ps: [
        'Redesigned the responsive collapse points of the top bar.',
        'All buttons in the top bar now share the same height.',
        'On the narrowest screens, the file format menu of the Export button no longer appears together with a menu that is already open.',
        'The map attribution now uses the compact control of the map library. The control is styled to match this app.',
      ],
    },
    {
      h: '2026-10-10',
      ps: [
        'Added the grade to the telemetry readings of the elevation profile.',
        'The chart lowers the opacity of the area outside the selected sector. The old translucent veil over that area is removed.',
        'Restored the heart-rate zone highlight that broke when the chart moved to the uPlot library.',
        'The telemetry at the cursor still shows when the pointer moves across a handle. No telemetry shows while you drag a handle.',
        'The map source menu and the overlays menu of the elevation profile follow the page layout.',
        'The elevation profile now zooms in to a narrower window: 100 m in distance mode and 1 minute in time mode.',
        'The top bar now uses the same adaptive compression as the elevation profile toolbar.',
      ],
    },
    {
      h: '2026-10-09',
      ps: [
        'Waterfalls join the natural landmarks. The icon comes from the OSM wiki.',
        'Parks and place names join the basemap overlays.',
        'The elevation profile toolbar buttons now sit in a new order.',
        'Added landing pages in eight more languages and a social share image. The pages target search engine crawlers and AI crawlers.',
      ],
    },
    {
      h: '2026-10-08',
      ps: [
        'Improved dragging and swiping on the elevation profile for very long tracks.',
        'Non-satellite maps gained a natural landmarks overlay. The toggle stores its state on its own and defaults to on.',
      ],
    },
    {
      h: '2026-10-07',
      ps: [
        'Waypoints now align to the track first and then show in order of distance. A waypoint more than 50 meters from the track does not show, and Auto slice does not use it.',
        'GPX files with a route and no recorded track now import. The map, the distance, the elevation profile and the sector analysis work as usual. Time, speed, pace and heart rate show as unavailable, and a warning square appears beside the track info. When a file holds both forms, the app uses the track and ignores the route.',
        'Contour intervals now adjust automatically to the terrain of the visible map area.',
        'After a language or unit change, the axis labels of the elevation profile repaint at once. The grid values on both axes read better.',
      ],
    },
    {
      h: '2026-10-06',
      ps: [
        'Added waypoint marking. A marked waypoint shows a purple pushpin badge on the map.',
        'When a marked waypoint exists, hovering the elevation profile shows the telemetry at the cursor, not the telemetry of the marked waypoint.',
        'The Auto slice segment details follow the order of the metrics panel: distance first, heart-rate zones last. Horizontal distance, average grade, average heart rate and maximum heart rate joined the list.',
      ],
    },
    {
      h: '2026-10-05',
      ps: [
        'With the whole track selected, the track shows its own color. Only a selected segment shows the segment color.',
        'The range highlight now draws from the evenly thinned line of the full track. During a handle drag, the map renders a lighter preview and settles to the exact line on release.',
        'The vertical grid lines of the elevation profile no longer poke above the top elevation row.',
        'The shapes of the natural landmark icons received corrections for the smallest sizes.',
        'The natural landmark queries now use a polling mechanism.',
      ],
    },
    {
      h: '2026-10-04',
      ps: [
        'The road overlay gained these natural landmarks: peaks, saddles, volcanoes, caves, springs, rocks and stones. A named landmark shows its name in the interface language, and an elevation shows in your unit system.',
        'Redrew the natural landmark icons.',
        'The road overlay now uses a full road symbol system.',
        'Contour colors now follow the basemap source.',
      ],
    },
    {
      h: '2026-10-03',
      ps: [
        'The button group at the top left of the map gained a road overlay toggle. It draws vector roads, road names and place names over satellite imagery.',
        'Overlay labels show in two languages: the first line follows the interface language, the second line shows the raw local name. When both names are the same, the label shows one line.',
        'The elevation profile now renders with the uPlot chart library.',
        'Removed the color fill below the elevation curve in the elevation profile.',
      ],
    },
    {
      h: '2026-10-02',
      ps: [
        'The 3D view in light mode gained a sky layer.',
        'Fixed a height mismatch in the elevation profile header between an empty app and a loaded track.',
        'Enlarged the touch targets of the map and profile controls.',
      ],
    },
    {
      h: '2026-10-01',
      ps: [
        'Rebuilt Settings. Each settings group now expands and collapses on its own.',
        'Added a Fit to sector button.',
        'Reworked how the elevation profile toolbar displays.',
      ],
    },
    {
      h: '2026-09-30',
      ps: [
        'The terrain controls moved to the top left of the map area, and a 2D/3D toggle button joined them.',
        'Hillshade and contours work in both view modes. The browser stores the layer state for each map mode separately.',
        'Terrain occlusion now uses the DEM raycasting built into the map library.',
      ],
    },
    {
      h: '2026-09-29',
      ps: [
        'Contours, terrain and hillshade render from the Mapterhorn global DEM with MapLibre GL JS and the maplibre-contour library.',
        'Contour intervals use whole values for each unit system. The unit suffix follows the display language.',
        'Added the Story page, the privacy statement and this changelog page.',
      ],
    },
    {
      h: '2026-09-27',
      ps: [
        'Initial build: a pure front-end, no-build activity analyzer for GPX/FIT/TCX/KML/KMZ files.',
        'The map ships with a 3D terrain view: a switch between the flat map and a DEM terrain view. The track, the sector handles and the waypoints drape onto the terrain, and hillshade and contours are map layers.',
        'A file import delivers the full sector analysis. The map and the elevation profile stay in sync while you drag a sector boundary. Auto slice builds a segment list for the whole track in one click. All metrics and the dual-variable analysis always read the selected sector, and waypoints land on the map and the profile. The interface comes in nine languages.',
      ],
    },
  ],
};

# Vendored: fit-file-parser

Source: <https://github.com/jimmykane/fit-parser> — npm package
[`fit-file-parser`](https://www.npmjs.com/package/fit-file-parser), version **6.1.2**.
License: MIT (see `LICENSE`). The `package.json` is the upstream file kept for
version provenance.

## What is vendored

The ESM `dist/` parse-path subset only — no CJS mirror, no `.d.ts`, and not the
optional entry modules skipped outright (`fit_types.js`, `types.js`) or unable
to run in a browser (`type_generator.js` imports the `typescript` package):

```
fit-parser.js                FitParser class (options + parse loop; re-exports below)
binary.js                    low-level record/message decoder
fit.js                       FIT profile facade (types + messages)
profile.js                   generated FIT interoperability profile (messages,
                             fields, wire metadata, types, Garmin products) —
                             absorbed garmin_profile.generated.js and the former
                             FIT_VENDOR_MESSAGE_EXTENSIONS block in 6.0
profile-lookup-data.js       static manufacturer/product/sport lookup tables
profile-lookup.js            lookup helpers re-exported by fit-parser.js
raw-message-reader.js        strict raw-message reader re-exported by fit-parser.js
messages.js                  message-number lookup
helper.js                    lap/session cascade mapping
fit-encoder.js               kept only because fit-parser.js re-exports it
```

Upstream `dist/` verbatim except for one line (below). Output parity of the
6.0 profile consolidation was verified against the 5.0.2 decoder on the
project's sample FIT files: byte-identical full JSON.

## Local modifications (one line)

`binary.js` line 1 — the upstream bare specifier

```js
import { Buffer } from 'buffer';
```

was rewritten to

```js
import { Buffer } from './buffer-shim.js';
```

because the app has no build step and no import map. `buffer-shim.js` (local,
not upstream) implements the single upstream call shape
(`Buffer.from(bytes).toString('utf-8')`, string-field decoding) on top of
`TextEncoder`/`TextDecoder`. See the file header for upgrade notes.

## Notes for the WaySliceTerra adapter (`js/parsers/fit.js`)

- Output field names are the FIT profile names verbatim (snake_case):
  `position_lat`, `position_long`, `altitude`, `enhanced_altitude`, `heart_rate`,
  `cadence`, `power`, `temperature`, `speed`, `enhanced_speed`, `distance`.
- Coordinates arrive in **degrees** (semicircle conversion built in); speeds in
  m/s, lengths in m, temperatures in °C with the options used by the adapter
  (`force: true`, `speedUnit: 'm/s'`, `lengthUnit: 'm'`, `temperatureUnit: 'celsius'`).
- Invalid/sentinel fields are omitted from records (not `null`), timestamps are `Date`.
- `parse()` reports failures by calling back with an error **string**; `parseAsync()`
  rejects with that string.
- Default `mode: 'list'` yields flat `records` / `laps` / `sessions` arrays; the
  adapter consumes only `records`, concatenated in file order.
- 6.x additions (`includeRawMessages`, `includeUnmappedMessages`, …) are opt-in
  and default off — default parsed output is unchanged from 5.x.

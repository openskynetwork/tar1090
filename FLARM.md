# FLARM Display in tar1090

## Overview

FLARM aircraft are displayed alongside ADS-B traffic in the OpenSky tar1090
frontend. They are sourced from a separate JSON endpoint, normalised into
tar1090-compatible fields, and clearly distinguished from ADS-B aircraft by
source colour, filter category, marker icon, and a dedicated FLARM detail
section in the sidebar.

---

## Configuration

Two variables in `html/defaults.js` control the FLARM data source:

| Variable | Default | Description |
|---|---|---|
| `flarm_server` | `"data/flarm_aircraft.json"` | URL or path to a JSON endpoint returning an array of Avro-deserialized FLARM aircraft objects (or `{"aircraft": [...]}`) |
| `flarm_refresh` | `5` | Polling interval in seconds |

Set or override them in `html/config.js`.

---

## Data Format

The endpoint must return Avro-deserialised JSON conforming to the
`org.opensky.avro.v2.FLARMDecodedMessage` schema. A mock file is at
`html/data/flarm_aircraft.json`. The top-level object may be either a bare
array or `{"aircraft": [...]}`.

### Field mapping (Avro -> tar1090)

| Avro field | tar1090 field | Conversion |
|---|---|---|
| `latitude` / `longitude` | `lat` / `lon` | direct |
| `altitude` (m) | `alt_geom` (ft) | `* 3.28084` |
| `speed` (m/s) | `gs` (kt) | `* 1.94384` |
| `climb_rate` (m/s) | `geom_rate` (ft/min) | `* 196.85` |
| `track` | `track` | direct |
| `turn_rate` | `track_rate` | direct |
| `aircraft_type` | `category` | direct (enum string) |

The remaining Avro fields are preserved in a `flarm` sub-object on the
PlaneObject and rendered in the FLARM detail section.

---

## Synthetic Hex Keys

All FLARM records receive a synthetic hex key prefixed with `~F`:

    ~F<icao24>

The `~` prefix prevents namespace collision with ADS-B records in
`g.planes` (keyed by `hex`). The real ICAO24 is preserved in
`plane.flarm.icao24`.

When `MergeNonIcao` is enabled (default: `false`), aircraft with `~`-prefixed
hexes have the prefix stripped. Because the prefix is `~F`, stripping produces
`F<icao24>`, which is not a valid ICAO hex and will not accidentally merge
with ADS-B records. FLARM aircraft will still appear, but their hex keys will
lack the `~` prefix.

---

## Source Classification

In `PlaneObject.updateData()` (`planeObject.js:1670`):

```
const flarm = !isArray && (data.source == "flarm" || data.type == "flarm" || data.flarm != null);
```

When the check passes, the aircraft is classified:

- `dataSource = "flarm"`
- `source = "flarm"`
- `flarm = data.flarm` (preserved Avro fields)

This happens after the ADS-B source-classification cascade, so `dataSource`
is always `"flarm"` for FLARM aircraft.

---

## Filtering

The source filter list in `html/script.js` (line 89) includes `'flarm'`:

```js
let sources = ['adsb', ['uat', 'adsr'], 'mlat', 'tisb', 'modeS', 'other', 'adsc', 'ais', 'flarm'];
```

The filter button appears in the **Filters** section with label **FLARM** and
a light orange background (`#ffd27f` unselected, `#f69d00` selected). When
selected, only aircraft with `dataSource == "flarm"` are shown.

---

## Marker

In `getBaseMarker()` (`markers.js:1259`), FLARM aircraft use the glider SVG
shape:

```js
if (addrtype == 'flarm') {
    return ['glider', 1];
}
```

The colour is determined by the marker colour system (defaulting to the
FLARM source colour in `tableColors`).

---

## Sidebar Details

When a FLARM aircraft is selected, a **FLARM** section appears in the sidebar
between the Accuracy section and Export KML. It contains a table of
FLARM-native fields rendered by `refreshSelectedFlarm()` (`script.js:3931`):

| Label | Avro field |
|---|---|
| ICAO24 | `icao24` |
| Radio ID Type | `radio_identifier_type` |
| Aircraft Type | `aircraft_type` |
| Urgency | `urgency` |
| Stealth | `is_stealth` |
| No Track | `is_no_track` |
| Movement Mode | `movement_mode` |
| Turn Rate | `turn_rate` |
| Version | `version` |
| H-ACC | `acc_pos_hor` |
| V-ACC | `acc_pos_ver` |
| Vel. ACC | `acc_vel` |
| SIL | `sil` |
| SDA | `sda` |
| NIC | `nic` |

The existing **Signal > Source** line shows "FLARM" via
`format_data_source()` (`formatter.js:328`).

---

## Legend

The map legend includes a **FLARM** entry with the same orange background,
added in `initLegend()` (`script.js:1865`).

---

## Data Fetch Flow

1. `setIntervalTimers()` (`script.js:2177`) starts a polling interval via
   `timers.flarm = setInterval(processFlarmUpdate, flarm_refresh * 1000)`
   and calls `processFlarmUpdate()` immediately.

2. `processFlarmUpdate()` (`script.js:2204`) fetches the URL at
   `flarm_server` via jQuery AJAX.

3. On success, the callback iterates the aircraft array, calls
   `normalizeFlarmAircraft()` on each element, and passes the result to
   `processAircraft(ac, false, false)`.

4. `normalizeFlarmAircraft()` (`script.js:189`) maps Avro fields to
   tar1090-compatible fields and nests remaining Avro fields under `flarm`.

5. `processAircraft()` creates or updates a `PlaneObject`, which calls
   `updateData()` to set all fields including the FLARM classification.

If `now` has not been set by the ADS-B data stream yet (race condition),
the AJAX callback initialises `now` to the current wall-clock time
(`script.js:2213-2215`).

---

## Reaping / Timeout

FLARM aircraft use the standard `seenTimeout` (default ~58 s) via
`checkVisible()`. The `seen` / `seen_pos` fields are set to `0` on every
update, so the aircraft appears "just received" as long as the poller runs.

---

## File Change Summary

| File | Change |
|---|---|
| `html/defaults.js:407-408` | Added `flarm_server`, `flarm_refresh` |
| `html/config.js:377-378` | Added commented example overrides |
| `html/script.js:89` | Added `'flarm'` to `sources[]` |
| `html/script.js:189-231` | Added `normalizeFlarmAircraft()` |
| `html/script.js:170` | Added `flarm_data` variable |
| `html/script.js:2177-2180` | Wired FLARM timer in `setIntervalTimers()` |
| `html/script.js:2204-2229` | Added `processFlarmUpdate()` |
| `html/script.js:1865` | Added FLARM to legend |
| `html/script.js:1844` | FLARM filter button label |
| `html/script.js:3591` | Guarded Non-ICAO info block for FLARM |
| `html/script.js:3930` | Calls `refreshSelectedFlarm()` from `refreshSelected()` |
| `html/script.js:3931-3971` | Added `refreshSelectedFlarm()` |
| `html/planeObject.js:56` | `this.flarm = null` in `setNull()` |
| `html/planeObject.js:204` | `target.flarm = source.flarm` in `planeCloneState()` |
| `html/planeObject.js:1670-1674` | FLARM classification in `updateData()` |
| `html/formatter.js:328-329` | `case 'flarm': return "FLARM"` |
| `html/markers.js:1259-1261` | FLARM marker returns glider icon |
| `html/index.html:719-731` | FLARM detail block inside `infoblock-container` |
| `html/data/flarm_aircraft.json` | New mock data file |

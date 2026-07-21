// airlines.js
// Loads the IATA -> ICAO callsign prefix table from OpenTravelData at
// runtime and caches it in localStorage, so it's fetched at most once
// per AIRLINE_CACHE_MAX_AGE_MS instead of on every page load.
"use strict";

const AIRLINE_CSV_URL = "https://raw.githubusercontent.com/opentraveldata/opentraveldata/master/opentraveldata/optd_airline_best_known_so_far.csv";
const AIRLINE_CACHE_KEY = "tar1090_iata_to_icao_v1";
const AIRLINE_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 1 week

let iata_to_icao = {};

function parseAirlineCsv(text) {
    // Columns: pk^env_id^validity_from^validity_to^3char_code^2char_code^...^type^...
    // Only currently valid (validity_to empty), non-cargo-only (type != "C")
    // entries are kept, to avoid ambiguity between passenger and cargo
    // airlines sharing an IATA code (see the Lufthansa special case in
    // iataToIcao() in planeObject.js).
    const map = {};
    const lines = text.split('\n');
    for (let i = 1; i < lines.length; i++) {
        const f = lines[i].split('^');
        if (f.length < 12) {
            continue;
        }
        const validityTo = f[3];
        const icao3 = f[4];
        const iata2 = f[5];
        const type = f[11];
        if (!iata2 || !icao3 || validityTo || type === 'C') {
            continue;
        }
        map[iata2] = icao3;
    }
    return map;
}

// Re-run setFlight() on already-tracked aircraft so their callsigns pick
// up the table once it's loaded (planes seen before that point were left
// with their raw, unconverted callsign).
function refreshTrackedCallsigns() {
    if (typeof g === 'undefined' || !g.planes) {
        return;
    }
    for (const hex in g.planes) {
        const plane = g.planes[hex];
        if (plane.flight) {
            plane.setFlight(plane.flight);
        }
    }
}

function loadAirlineTable() {
    try {
        const cached = JSON.parse(localStorage.getItem(AIRLINE_CACHE_KEY));
        if (cached && Date.now() - cached.ts < AIRLINE_CACHE_MAX_AGE_MS) {
            iata_to_icao = cached.data;
            return;
        }
    } catch (e) {
        // ignore missing/corrupt cache, fall through to fetch
    }

    fetch(AIRLINE_CSV_URL)
        .then(res => res.text())
        .then(text => {
            iata_to_icao = parseAirlineCsv(text);
            refreshTrackedCallsigns();
            try {
                localStorage.setItem(AIRLINE_CACHE_KEY, JSON.stringify({ ts: Date.now(), data: iata_to_icao }));
            } catch (e) {
                // localStorage full or unavailable, not fatal
            }
        })
        .catch(err => {
            console.error("airlines.js: failed to load IATA->ICAO table", err);
        });
}

loadAirlineTable();

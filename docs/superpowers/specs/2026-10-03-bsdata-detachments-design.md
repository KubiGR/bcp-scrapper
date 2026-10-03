# BSData Detachments — Design Spec

- **Date:** 2026-10-03
- **Status:** Approved design, pending spec review
- **Builds on:** detachment names (links, "Not English", learned translations), list tidying,
  Meta's "Detachment unknown or not in English", the hourly catalogue refresh. Where this spec
  differs from earlier ones, this spec wins.

## 1. Goals

The owner wants the app to know each faction's real detachments, from BSData
(`github.com/BSData/wh40k-11e`, the community's Warhammer 40,000 11th edition data), and use them
to:

1. **Know detachments:** Settings' known detachments per faction, and the link picker, come from
   BSData.
2. **Auto-match names:** names in lists that match a BSData detachment (case, spacing,
   punctuation, accents, small typos) are stored under BSData's spelling without manual links.
3. **Flag wrong pairs:** a list's detachment that isn't in its army's BSData list is flagged;
   Meta counts it as detachment unknown.

### Non-goals

- Units, datasheets, points or enhancements (detachments only).
- Showing detachments nobody played in Meta or Factions.
- Any BCP request; BSData comes from GitHub only.
- Editions other than 11th.

## 2. Getting the data

- **Source:** repository `BSData/wh40k-11e`, branch `main`. Each faction is a JSON file at the
  repository root (e.g. `Necrons.json`, `Chaos - World Eaters.json`,
  `Imperium - Space Marines.json`).
- **Files read:** every root `*.json` file except those whose name contains `Library`, plus
  `Warhammer 40,000.json` (game system) and `Unaligned Forces.json`, which hold no faction.
- **Schedule:** once a day, with the hourly catalogue refresh timer (a run starts when the last
  successful check is 24 hours old or more), and on demand from Settings (`Refresh`, admin only
  when accounts are on).
- **Requests:** one GitHub API request for the tree
  (`GET https://api.github.com/repos/BSData/wh40k-11e/git/trees/main`), then
  `https://raw.githubusercontent.com/BSData/wh40k-11e/<sha-of-main>/<path>` only for files whose
  blob sha differs from the stored one. Unauthenticated; one request at a time; 30 s timeout per
  request. A file over 20 MB or not valid JSON is an error for that file.
- **Reading detachments:** in a catalogue (`{ catalogue: {...} }`), the detachments are the
  `selectionEntries` of the first object named `Detachment` that has `selectionEntries`
  (searched depth-first through the catalogue). Each entry's `name` is a detachment.
- **Faction:** from the catalogue's `name` (e.g. "Xenos - Necrons", "Chaos - World Eaters",
  "Imperium - Adeptus Astartes - Space Marines"): the last `-` part, mapped with
  `canonicalArmy` to the app's faction name ("Space Marines" → "Space Marines (Astartes)").
  BSData names the app doesn't know yet get aliases in `canonicalArmy` (at least "Craftworlds" →
  Aeldari and "Agents of the Imperium" → Imperial Agents). A catalogue whose faction still
  doesn't map is skipped and listed in the status as unknown.
- **Chapters:** a detachment entry with modifiers whose conditions refer to category ids is tied
  to those categories' names (from the same catalogue's `categoryEntries`, e.g. "Blood Angels").
  A detachment tied to categories that are app factions (Blood Angels, Dark Angels, Space
  Wolves, Black Templars, Deathwatch) belongs to those factions; one tied to none (e.g. Gladius
  Task Force) belongs to the catalogue's faction and to every chapter faction. Chapters without
  their own app faction (Ultramarines, Imperial Fists, …) map to Space Marines (Astartes) through
  `canonicalArmy`, so their detachments count there.
- **Storage:** table `bsdata_detachments (faction, name)` (primary key both) and table
  `bsdata_files (path primary key, sha, faction nullable, detachments int, checked_at, error
nullable)`, plus the time of the last successful tree check in `app_settings`.
- **Keeping data safe:** a file that fails keeps its previous detachments and records the error.
  A parsed file with zero detachments for a faction that had some keeps the old list (and
  records "no detachments found"). A faction with no detachments in BSData is **not covered**.
- **Coverage:** a faction is covered when BSData has at least one detachment for it.

## 3. What changes

### Known detachments

- Settings' "Known {faction} detachments" chips: BSData's detachments for a covered faction;
  BCP's names (as now) for an uncovered one.
- The link picker's targets: BSData's detachments of the name's factions first, then BCP's
  names.

### Auto-match

`matchDetachment(name, candidates)` returns the candidate that matches, else null:

1. **Exact** (after `cleanDetachmentName`).
2. **Loose:** equal after lower-casing, removing accents, apostrophes and hyphens, and collapsing
   spaces.
3. **Typo:** among candidates of 8 or more letters, the one within a Levenshtein distance of 2
   on the loose forms, only if exactly one candidate is that close.

During list tidying (startup and each automatic-fetching pass), each detachment name read from a
list that isn't linked by hand, marked "Not English" or translated is matched against BSData's
detachments of the list's army (`parsedArmy`, else the player's BCP faction); for an uncovered
army, against all BSData detachments. A match is stored under BSData's spelling. Hand links and
"Not English" marks always win.

### Wrong pairs

- A list's detachment is a **wrong pair** when its army is covered, the detachment isn't in that
  army's BSData list, it isn't linked to such a detachment, and the pair isn't kept (below).
- **Meta** counts a player whose detachments include a wrong pair under "Detachment unknown or
  not in English".
- **Settings** gets a section "Not in this faction": per (faction, detachment) with lists count
  and "BSData has it for: …" (other factions with that detachment, or "no faction"), and a
  **Keep anyway** button that stores the pair as kept (it then counts normally), with a way to
  undo.
- Top lists, event pages and list views still show the detachment as written.

### Status

Settings gets a **BSData** card: last successful check, number of factions covered and
detachments, uncovered factions, per-file errors, and a Refresh button.

## 4. Architecture

- **Shared:** `parseBsdataCatalogue(json): { catalogueName, faction: string | null,
detachments: { name, factions: string[] }[] }` and `matchDetachment(name, candidates)`; pure.
- **API:**
  - `BsdataClient` interface (`tree()`, `file(path, sha)`) with an HTTP implementation and a
    fixture implementation for tests (no network in tests).
  - `syncBsdata(db, client, now)` repo function; schema for the two tables and a kept-pairs table
    `detachment_keeps (faction, name_key)`.
  - Routes: `GET /api/bsdata` (status), `POST /api/bsdata/refresh` (admin when accounts are on),
    `POST /api/detachment-keeps` / `DELETE` (keep / undo).
  - The detachment vocabulary and tidy use BSData names; `wrongPairCheck(db)` next to
    `foreignDetachmentCheck`; Meta uses both.
- **Web:** BSData card and "Not in this faction" section in Settings; known chips and link picker
  from the updated detachment-names response.

## 5. Testing

- Parser on trimmed real catalogues: Necrons (12 detachments), World Eaters, Space Marines with
  chapter conditions (Rage-Cursed Onslaught → Blood Angels; Gladius → Space Marines and every
  chapter), Genestealer Cults (none: uncovered).
- Matcher: exact, loose, typo within 2 with a unique best, ambiguous typo → null, short names no
  typo matching.
- Sync with a fake client: first run stores, unchanged sha skips the download, a failing file
  keeps old data and records the error, an empty parse keeps the old list.
- Tidy: auto-match to BSData spelling; hand link wins; uncovered army matches against all.
- Wrong pairs: flagged pair counts as unknown in Meta; kept pair counts normally; uncovered
  faction never flagged.
- Web: BSData card (status, Refresh), "Not in this faction" with Keep anyway, chips from BSData.

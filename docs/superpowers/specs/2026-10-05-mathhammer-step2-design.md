# Mathhammer Step 2 — Units from 39k.pro and from Lists — Design Spec

- **Date:** 2026-10-05
- **Status:** Approved design, pending spec review
- **Builds on:** `2026-10-05-mathhammer-design.md` (step 1 is built on branch `mathhammer`, not
  merged). Where this spec differs from that one's §3, §5 and §6, this spec wins.

## 1. Goals

1. Fill either side of the Mathhammer page by **picking a unit** instead of typing it:
   - **Any unit:** a faction, then a unit, from 39k.pro's datasheets.
   - **From a list:** a pasted GW-app list, or a stored BCP list found by player or event; only
     that list's units are offered, with the list's model counts and weapons.
2. Keywords switch themselves on; leaders and support characters attach; weapons with several
   profiles offer **Best**; any filled value stays editable.

### Non-goals

- Ability-text highlighting, pinning and comparison (step 3).
- Saving setups; sharing links.
- Changing the engine's rules (step 1's engine is used as is).

## 2. Choosing units (page)

Each side, Attacker and Defender, has a **source** at its top:

- **Any unit:** faction → unit (A→Z, Legends marked).
- **From a list:** "Paste" (a text box) or "Pick from BCP" (search box: player or event, newest
  first). The unit picker then lists that list's units as written ("Intercessor Squad ×5",
  "Captain").

Picking a unit fills the side:

- **Attacker:**
  - From a list: one weapon row per weapon the unit takes, with the counts from the list (4 bolt
    rifles, 1 plasma incinerator), keywords ticked from the datasheet.
  - Any unit: the datasheet's default loadout, for its smallest size; counts editable.
  - A weapon with several profiles (e.g. standard / supercharge) gets a **Profile** choice:
    each profile by name, or **Best** (the profile with more expected models slain after
    overkill against the current target; ties: wounds dealt).
- **Defender:** one model row per model kind (name, count, T, Sv, InSv, W, FNP), keywords,
  Stealth, Damaged X; counts from the list or the smallest size.
- **Leader / support:**
  - From a list: characters attached to the unit ("Attached as: Leader", "Attached as:
    Support") come with it (attacker: their weapons are added; defender: CHARACTER rows).
  - Any unit: an "Attach" picker offering only characters 39k.pro says can lead or support
    it, with "show all characters" to lift the limit.
- **Per-weapon overrides** (step 1 deferred them): a weapon row can be expanded to set its own
  hit/wound/damage switches, which win over the unit's for that weapon.
- **What was filled:** a small "from datasheet: <name>" line per side; editing keeps the values
  and the line.
- **Couldn't read:** list units or weapons not found in the data are listed under the picker
  ("Couldn't read: Twin dakkagun"), to be typed by hand.

## 3. Data (server)

- **The 39k.pro reader** (rebuilt from the discarded Matchup prep work, same safety): fetch
  `https://39k.pro/`, find `/assets/index-<hash>.js`, read the data object **as text** (never
  executed), English only, Combat Patrol left out; only 39k.pro addresses, no redirects, a byte
  limit while reading; one stored JSON row replaced whole on success; failures keep the last
  good copy and are recorded; read daily (hourly check) and on Refresh; an extraction-format
  number forces a re-read when the extraction changes.
- **Kept per datasheet:** name, factions, legends, keywords (all models); model kinds with M, T,
  Sv, InSv, W, Ld, OC and min–max counts; Damaged X; core abilities with numbers (Feel No Pain
  X+, Stealth); other abilities' texts (for step 3); weapons with every profile (name, type,
  range, A, BS/WS, S, AP, D) and its keyword names; the default loadout; **leader and support
  links** (which units it can lead or support).
- **Settings → Rules data** card: last read, counts, error, Refresh (admin when logins are on).

## 4. Weapon keywords

Read from the profile's keyword names, case and spacing ignored:

- Lethal Hits, Sustained Hits X (number or dice), Devastating Wounds, Twin-linked, Torrent,
  Heavy, Lance, Ignores Cover, Precision, Indirect Fire, Rapid Fire X, Blast (X; plain Blast is
  1), Cleave X, Melta X, Anti-KEYWORD Y+ (also "Anti-MONSTER/VEHICLE 3+": either keyword).
- **Conditional forms** ("SUSTAINED HITS 2: MONSTER/VEHICLE", "LETHAL HITS: non-MONSTER/VEHICLE",
  "DEVASTATING WOUNDS: INFANTRY"): the effect applies only when the target has (or, with "non-",
  lacks) one of the keywords; re-checked whenever the target changes.
- Ignored (no effect on the maths): Hazardous, One Shot, Pistol, Assault, Close-quarters,
  Extra Attacks, Psychic, Conversion, Linked Fire and other named weapon abilities.

## 5. Lists

- **The full-list reader** (rebuilt): units with points, model counts (model lines vs wargear
  lines by indentation), wargear with counts, enhancement, warlord, and **attachments**: in an
  "Attached Unit" block, the units marked "Attached as: Leader/Support" are attached to the one
  marked "Bodyguard".
- **Matching to datasheets:** the army's family first (the army, its parent and its chapters),
  typos forgiven only there; then any faction exactly or loosely (allies); non-Legends first;
  wargear matched to the datasheet's weapons (also joined names, "A and B"), else counted as
  unread.

## 6. API (behind login)

- `GET /api/rules`, `POST /api/rules/refresh` (admin when logins are on).
- `GET /api/mathhammer/factions` → factions with unit counts.
- `GET /api/mathhammer/units?faction=` → that faction's datasheets (cached by the page).
- `POST /api/mathhammer/list` `{ text }` → the list read and matched (units with datasheet ids,
  counts, attachments, unread).
- `GET /api/mathhammer/lists?search=` → stored lists (player, event, faction, date), 20 newest;
  `GET /api/mathhammer/lists/:id` → that list read and matched.
- Without rules data yet, the data routes answer 404 with "refresh it in Settings"; the page
  says so and typing by hand still works.

## 7. Delivery

- **2a:** reader, Settings card, data API, "Any unit" pickers, keywords, leader/support attach,
  Best, per-weapon overrides.
- **2b:** list reader and matching, list API, "From a list" (paste and BCP search).

Both on branch `mathhammer`; nothing is merged until the owner says so.

## 8. Testing

- Reader against a small sample bundle in 39k.pro's shape (no network): datasheets, profiles,
  keyword names, loadouts, leader/support links, sizes, FNP, Stealth; failure keeps old data.
- Keyword reading incl. conditional forms and Anti with two keywords.
- List reader on real formats incl. Leader and Support attachments; matching incl. Legends,
  allies, typos.
- API routes (status, refresh, factions, units, list read, list search).
- Page: picking fills the form; list loadout counts; attached character becomes a leader row
  or extra weapons; Best picks the stronger profile; unread names shown; no rules data message.

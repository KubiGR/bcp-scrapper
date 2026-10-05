# Mathhammer — Design Spec

- **Date:** 2026-10-05
- **Status:** Approved design, pending spec review
- **Builds on:** the app's pages, Settings cards and daily background reads (BSData). The 39k.pro
  reader from the discarded Matchup prep branch is rebuilt here (it was never merged).

## 1. Goals

A **Mathhammer** page, like UnitCrunch, for Warhammer 40,000 **11th edition**:

1. Pick an attacking unit (with an optional attached leader) and a defending unit (with an
   optional attached leader) from 39k.pro's datasheets.
2. Set the situation and modifiers; weapon keywords apply by themselves.
3. See **exact chances**: models slain, wounds dealt, wiping the unit, killing the leader, wasted
   (overkill) damage, and averages, recomputed instantly.
4. Pin results to compare setups side by side.

### Non-goals

- AI anything. No Claude, no reading ability text into modifiers.
- Saving or sharing setups by link; loading units from stored BCP lists.
- Fight-back, multi-phase or multi-unit sequences (one attacking unit, one target, one
  activation).
- Hazardous rolls, One Shot tracking, charges, movement.
- Making 39k.pro data public: the page and API sit behind login like every page.

## 2. 11th-edition rules the engine follows

Checked against 39k.pro's core rules text on 2026-10-05.

- **Hit roll:** unmodified 1 fails; unmodified 6 is a critical hit; otherwise hits on ≥ BS/WS.
  - BS/WS is a characteristic: **cover worsens BS by 1** (ranged attacks; not with Ignores Cover),
    **plunging fire improves BS by 1**; BS/WS stays between 2+ and 6+.
  - Hit roll modifiers (+1/−1 from switches, Heavy, Damaged −1) are summed and **capped at ±1**.
  - **Heavy:** +1 to hit in the Shooting phase unless the unit moved more than 3".
  - **Damaged:** a unit whose datasheet has Damaged X and is ticked Damaged has −1 to hit.
  - **Torrent:** auto-hits (no hit roll, no critical hits).
  - **Snap shooting:** only an unmodified 6 hits, those hits are not critical, no hit re-rolls.
  - **Indirect shooting:** target has the benefit of cover; no hit re-rolls; an unmodified 1–5
    fails (1–3 if "stayed still and target visible to a friendly unit" is ticked).
  - **Sustained Hits X:** a critical hit scores X extra hits. **Lethal Hits:** a critical hit
    automatically wounds (not a critical wound).
- **Wound roll:** unmodified 1 fails; unmodified 6 is a critical wound; otherwise by S vs T
  (2+ when S ≥ 2T, 3+ when S > T, 4+ when equal, 5+ when S < T, 6+ when S ≤ T/2).
  - Modifiers capped at ±1. **Lance:** +1 when "charged" is ticked. **Twin-linked:** re-roll the
    wound roll. **Anti-X Y+:** an unmodified Y+ is a critical wound when the target has keyword X.
  - **Attached units:** use the highest T among bodyguard models.
  - **Devastating Wounds:** a critical wound ends the attack and inflicts mortal wounds equal to
    D, **after** the weapon's normal damage; each critical wound's mortal wounds can damage at
    most **one model** (excess lost).
- **Saves and allocation (05.03–05.04):**
  - Groups: one per CHARACTER model; one for all other models with the same W, Sv and InSv.
  - Order: wounded non-CHARACTER group first; no CHARACTER group before a non-CHARACTER group.
    The defender declares the rest of the order.
  - All save rolls are made together and resolved **lowest result first**. Each roll is checked
    against the current group: unmodified 1 inflicts damage; ≥ InSv fails (saved); after AP,
    ≥ Sv fails; otherwise inflicts damage. A wounded model in the group is picked first.
  - The attack's D is lost by the model; excess damage is lost (**overkill**). Feel No Pain X+ is
    rolled for each wound that would be lost.
  - **Precision:** the attacker may put a CHARACTER group first.
- **Mortal wounds:** one at a time, to a wounded non-CHARACTER model, else any non-CHARACTER,
  else a wounded CHARACTER, else any CHARACTER. Normal damage before mortal wounds.
- **Attacks:** dice in A are rolled (D3, D6, 2D6, D6+3, …). **Rapid Fire X** adds X at half
  range; **Blast (X)** adds 1 (or X) per 5 target models; **Cleave X** adds X per 5 target models
  (single target); **Melta X** adds X to D at half range.
- **Characteristics:** A ≥ 1, S ≥ 1, D ≥ 1, AP never worse than 0.

## 3. What the owner sees

A **Mathhammer** page (header link, after Top lists).

### Attacker

- Faction, unit, model count (default: the unit's smallest size; any size the datasheet allows).
- **Leader** (optional): only characters 39k.pro says can lead that unit; "Show all characters"
  lifts the limit when a link is missing.
- **Weapons:** each of the unit's and leader's weapons with a count of models carrying it (0 =
  not used). Multi-profile weapons get a profile choice, including **Best** (§4.6).
- **Weapon order:** drag to reorder; weapons resolve in that order.
- **Abilities:** the unit's and leader's ability texts, for reference.

### Defender

- Faction, unit, model count, optional leader (same rules as the attacker).
- Shown: T (attached: bodyguard's highest), Sv, InSv, W per group, keywords.
- Applied automatically from the datasheet: invulnerable saves; core abilities **Feel No Pain X+**
  and **Stealth** (benefit of cover against ranged attacks).
- **Abilities:** texts for reference.

### Situation (whole calculation)

| Attacker                                             | Target                              |
| ---------------------------------------------------- | ----------------------------------- |
| Moved more than 3" (Heavy off)                       | Cover                               |
| Half range (Rapid Fire, Melta)                       | Armour of Contempt (worsen AP by 1) |
| Charged (Lance)                                      | Battle-shocked                      |
| Plunging fire (+1 BS)                                | Damaged                             |
| Snap shooting                                        | On an objective                     |
| Indirect shooting (+ "stayed still, target visible") |                                     |
| Damaged                                              |                                     |
| On an objective                                      |                                     |
| Closest eligible target                              |                                     |

Checks that are conditions in ability text (closest eligible, on an objective, battle-shocked,
target damaged) change no numbers: ticking one **highlights the ability texts that mention it**
on both sides, so the owner knows which switches to set.

### Switches

Set for the whole attacking unit, with **per-weapon overrides** (expand a weapon row). Weapon
keywords switch their own on; anything set by hand wins.

- **Hit:** re-roll all / failures / 1s / one die; +1 / −1; ignore penalties; critical hit on X+;
  Sustained Hits X; Lethal Hits; Torrent; Ignores Cover.
- **Wound:** re-roll all / failures / 1s / one die; +1 / −1; ignore penalties; Anti-X Y+
  (automatic when the target has keyword X); critical wound improves AP by X; critical wound adds
  X damage; Devastating Wounds.
- **Damage:** re-roll / re-roll one die; +X / −X; Melta X; ignore damage reduction.
- **Other:** flat mortal wounds per unit activation (fixed or dice); Rapid Fire X; Blast (X);
  Cleave X.

Defender switches: −1 to hit; −1 to wound; −X damage (min 1) or halve damage; Feel No Pain X+
(overrides the datasheet's); invulnerable save override; **save penalties ignored** (the save
roll ignores modifiers that make it worse, other than the attack's own AP).

### Result

- Averages: wounds dealt, models slain, wasted (overkill) damage.
- Chances: models slain "at least N" (bar chart and table), wounds dealt, wiping the unit, the
  leader slain (attached units).
- The allocation order used ("Nob group last").
- **Pin** keeps a result card (with a one-line description of its setup) to compare; pins last
  while the page is open.

## 4. The engine (`packages/shared/src/mathhammer`)

Pure functions, no I/O, run in the browser.

1. **Dice:** distributions as probability arrays; parse `D3`, `D6`, `2D6`, `D6+3`, `3`, …;
   add, convolve, re-roll.
2. **One attack** (per weapon profile, after situation and switches): a categorical outcome —
   miss; hit not yet wound-rolled; and after wounding: normal wound, critical wound (with its own
   AP/D), Devastating mortal wounds. Sustained hits and Lethal Hits handled per attack.
3. **A weapon's pool:** the number of attacks (dice, Rapid Fire, Blast, Cleave) and the
   per-attack outcomes combined into the exact joint count of each wound kind. "Re-roll one die"
   applies to the pool (one failed die re-rolled if any failed).
4. **Allocation:** state = groups' remaining models and wounds on the current model. For each
   weapon, in order:
   - the defender's group order is chosen by trying every allowed order and keeping the one with
     the **lowest expected models slain** (ties: lowest expected wounds lost) for that weapon;
   - save rolls are processed **as sorted dice**: faces 1 to 6 in turn, the number of rolls
     showing each face drawn conditionally (binomial on the rolls left), each roll checked against
     the current group, so later groups face higher rolls;
   - damage per inflicted roll (dice, re-roll, Melta, ±X, min 1, halving), Feel No Pain per
     wound, overkill lost and counted as wasted;
   - then Devastating mortal wounds (one model each) and, after the last weapon, flat mortal
     wounds, by the mortal wound order.
5. **Output:** distributions of models slain (per group and total), wounds dealt, wasted damage;
   wipe and leader-slain chances; averages; the group order used.
6. **Best profile:** for a weapon with several profiles, the profile giving the highest expected
   models slain after overkill (ties: wounds dealt).
7. **Speed:** typical setups well under 50 ms; a large case (several 2D6 Blast weapons into 20
   models) under 300 ms, checked by a test.

A **simulator** (test-only) rolls the same rules with dice to check the engine.

## 5. Data from 39k.pro

- The reader: fetch `https://39k.pro/`, find `/assets/index-<hash>.js`, read the data object
  **as text** (literal reader, never executed), keep English only, skip Combat Patrol. Refuses
  redirects and non-39k.pro addresses; stops reading past 64 MB.
- Stored as one JSON row, replaced whole on a successful read; failures keep the old copy and
  are shown. Read daily with the hourly check; an extraction-format bump reads again at once.
- Per datasheet: name, factions, keywords (all models), legends flag; models with M, T, Sv, InSv,
  W, Ld, OC; unit sizes (min–max per model type); Damaged X; core abilities with numbers
  (Feel No Pain X+, Stealth, Damaged X); other ability texts; weapons and profiles (type, range,
  A, BS/WS, S, AP, D, keywords); which units it can lead (bodyguard links).
- **Settings → Rules data** card: last read, counts, error, Refresh (admin when logins are on).
- API: `GET /api/rules` (status), `POST /api/rules/refresh`, `GET /api/mathhammer/factions`,
  `GET /api/mathhammer/units?faction=` (that faction's datasheets, cached by the page).

## 6. Delivery in three steps

1. **The engine** and a page where profiles are typed by hand (attacker weapon rows, defender
   stats, groups), with situation, switches and results.
2. **39k.pro data:** reader, Settings card, API, unit and leader pickers, keywords applied
   automatically.
3. **Ability highlighting** for condition checks, pinning and comparison.

## 7. Testing

- **Engine, each rule against hand-worked numbers:** e.g. 10 attacks BS 3+ S4 AP−1 D1 into T4
  Sv3+ → 1.67 average wounds; ±1 caps; BS 2+–6+; cover worsening BS and Ignores Cover; plunging
  fire; Heavy and moved; snap shooting; indirect shooting both ways; Torrent; Sustained; Lethal;
  Anti-X; Twin-linked; Lance; critical AP/damage; Devastating Wounds limited to one model each;
  re-rolls including one die; Rapid Fire, Blast, Cleave, Melta; FNP; damage reduction; overkill
  and wasted damage; mortal wound order.
- **Allocation:** sorted saves against an attached unit with a better leader save; best group
  order; Precision; wounded group first.
- **Simulator cross-check:** ~30 mixed scenarios, 200,000 rolls each, agreement within 0.5
  percentage points on every "at least N" chance.
- **Speed test** for the large case.
- **Reader and API** with a small sample bundle in 39k.pro's shape; no network in tests.
- **Page:** picking units, switches changing results, Best, pinning, highlighting.

## 8. Open point for review

- "Save penalties ignored" (from the owner's sheet, _Saves: No Penalties_) is read here as: the
  save roll ignores modifiers that make it worse, other than the attack's AP. Confirm or correct.

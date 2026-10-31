# MiMMa rescoring experiment, 2026-10-31

Status: research only. No score in the app changed. The owner's v1 snapshot stays authoritative.

The 10 catalog games were scored three more ways and compared with the owner's v1 scores:

1. **Claude**: Claude scored each game from `docs/MIMMA_RUBRIC.md`.
2. **Tags**: Steam user tags, weighted by player votes, turned into scores through reference games
   with known labels.
3. **Reviews**: how often each game's 300 most helpful English Steam reviews mention each axis's
   concepts, turned into scores the same way.

The surnex column is the coarse third-party label from `data/surnex-dataset.csv` (high 80, med 50,
low 20) where the dataset covers the game. For Monster Hunter Wilds it is the dataset's "Monster
Hunter" franchise row.

The scripts are in `scripts/research/`. "Reproducing" below lists the commands.

## Results

"Low confidence" marks tag estimates where one of the game's five most-voted tags appears on fewer
than 3 reference games (see "Tags" under "Methods"). The review range is an 80% bootstrap range.

### Micro

| Game                 | Owner v1 | Claude | Tags                | Reviews (80% range) | surnex |
| -------------------- | -------- | ------ | ------------------- | ------------------- | ------ |
| Counter-Strike 2     | 100      | 100    | 80                  | 70 (70 to 80)       | 80     |
| Palworld             | 40       | 30     | 50 (low confidence) | 50 (40 to 50)       | none   |
| Marvel Rivals        | 80       | 70     | 80                  | 60 (50 to 60)       | 80     |
| Apex Legends         | 80       | 90     | 80                  | 60 (60 to 60)       | 80     |
| Rainbow Six Siege    | 80       | 80     | 80                  | 70 (60 to 70)       | 80     |
| Baldur's Gate 3      | 20       | 0      | 60 (low confidence) | 40 (40 to 50)       | none   |
| Destiny 2            | none     | 60     | 80 (low confidence) | 50 (50 to 50)       | none   |
| Monster Hunter Wilds | 80       | 80     | 70 (low confidence) | 70 (60 to 70)       | 80     |
| Elden Ring           | 80       | 80     | 70                  | 60 (60 to 70)       | none   |
| BeamNG.drive         | none     | 50     | 50 (low confidence) | 40 (40 to 40)       | none   |

### Meso

| Game                 | Owner v1 | Claude | Tags                | Reviews (80% range) | surnex |
| -------------------- | -------- | ------ | ------------------- | ------------------- | ------ |
| Counter-Strike 2     | 65       | 80     | 70                  | 50 (40 to 50)       | 80     |
| Palworld             | 20       | 30     | 40 (low confidence) | 40 (40 to 40)       | none   |
| Marvel Rivals        | 60       | 60     | 80                  | 50 (50 to 60)       | 80     |
| Apex Legends         | 80       | 80     | 90                  | 50 (40 to 50)       | 80     |
| Rainbow Six Siege    | 60       | 90     | 80                  | 50 (40 to 50)       | 80     |
| Baldur's Gate 3      | 20       | 50     | 50 (low confidence) | 50 (40 to 50)       | none   |
| Destiny 2            | none     | 30     | 80 (low confidence) | 50 (50 to 60)       | none   |
| Monster Hunter Wilds | 40       | 50     | 60 (low confidence) | 50 (40 to 50)       | 20     |
| Elden Ring           | 100      | 60     | 50                  | 50 (50 to 60)       | none   |
| BeamNG.drive         | none     | 20     | 30 (low confidence) | 30 (30 to 40)       | none   |

### Macro

| Game                 | Owner v1 | Claude | Tags                | Reviews (80% range) | surnex |
| -------------------- | -------- | ------ | ------------------- | ------------------- | ------ |
| Counter-Strike 2     | 80       | 70     | 60                  | 60 (50 to 60)       | 50     |
| Palworld             | 70       | 80     | 80 (low confidence) | 80 (80 to 90)       | none   |
| Marvel Rivals        | 80       | 70     | 60                  | 60 (50 to 60)       | 80     |
| Apex Legends         | 100      | 70     | 70                  | 50 (50 to 60)       | 80     |
| Rainbow Six Siege    | 80       | 80     | 60                  | 70 (70 to 80)       | 80     |
| Baldur's Gate 3      | 100      | 100    | 70 (low confidence) | 70 (60 to 70)       | none   |
| Destiny 2            | none     | 80     | 70 (low confidence) | 70 (60 to 70)       | none   |
| Monster Hunter Wilds | 60       | 70     | 60 (low confidence) | 60 (50 to 60)       | 80     |
| Elden Ring           | 40       | 70     | 60                  | 60 (60 to 70)       | none   |
| BeamNG.drive         | none     | 20     | 60 (low confidence) | 40 (40 to 40)       | none   |

### Agreement with the owner's v1 scores

Over the 8 games the owner scored. Each cell is the rank correlation (1 is the same order, 0 is no
relation), then the mean absolute difference in points.

| Method  | Micro     | Meso      | Macro      |
| ------- | --------- | --------- | ---------- |
| Claude  | 0.89 / 6  | 0.67 / 17 | 0.33 / 13  |
| Tags    | 0.78 / 11 | 0.48 / 22 | 0.38 / 19  |
| Reviews | 0.83 / 18 | 0.50 / 22 | -0.10 / 20 |

With 8 games, one swapped pair moves a rank correlation by about 0.1, so read these as rough.

## What the comparison shows

Both community passes are fitted to reference labels of 20, 50, and 80, so they seldom report
above 80 or below 20. A community 80 can mean High or Defining. Compare a v1 value of 100 with
Claude's score, and only count a community value against it when it sits well below 80.

**Micro is stable.** Every method orders the games close to v1, with rank correlations of 0.78 to
0.89. The tag pass reads Counter-Strike 2 at 80 because of the 80 ceiling. The review pass reads
the shooters 10 to 30 points under v1. More than half of the usable reviews for Counter-Strike 2
(53%) and Apex Legends (55%) mention cheating, servers, monetization, or performance, which leaves
fewer reviews about play itself.

**Meso is where v1 differs most from every other source.** Two games cause most of it:

- Elden Ring: v1 has 100. Claude has 60, tags 50, and reviews 50 (50 to 60). No source supports 100. The tag pass learned that "Souls-like" and "Difficult" games sit low on Meso, which is also
  how the surnex labels treat the genre.
- Rainbow Six Siege: v1 has 60. Claude has 90, tags 80, and surnex 80. The review pass reads 50,
  but it reads 9 of the 10 games at 40 or 50 on this axis, so it cannot separate them (see
  "Reviews" under "Methods").

Counter-Strike 2 (v1 65) leans the same way as Siege: Claude 80, tags 70, surnex 80.

**Macro has three values every other source disputes:**

- Apex Legends: v1 has 100. Claude and tags have 70, reviews 50 (50 to 60), and surnex 80. Claude
  could have given 100 and did not, and the tag and review values sit below the 80 ceiling.
- Elden Ring: v1 has 40. Claude has 70, tags 60, and reviews 60 (60 to 70). Every source is
  higher.
- Counter-Strike 2: v1 has 80. Claude has 70, tags 60, reviews 60 (50 to 60), and surnex 50.
  Every source is lower.

Baldur's Gate 3 at Macro 100 matches Claude. The tag and review passes read 70, and the tag
estimate is low confidence.

**Marvel Rivals and Rainbow Six Siege**, identical in v1 (80, 60, 80), separate in two passes.
Claude puts Siege above Rivals on Meso (90 against 60) and Macro (80 against 70). The reviews put
Siege above Rivals on Micro (70 against 60) and Macro (70 against 60). The tag pass cannot separate
them.

### Answers to the rubric's open calibration questions

- Low anchors: BeamNG.drive Meso (20 to 30 in all three passes) and Baldur's Gate 3 Micro (0 from
  Claude, 20 in v1) are the most consistent candidates for anchors below 30.
- Elden Ring Meso 100: unsupported. Either lower it to 50 or 60, or add a sentence to the Meso
  definition saying that reading a designed opponent counts as much as reading a human one.
- Apex Legends Macro 100: unsupported. The other sources give 50 to 80: Claude and tags 70,
  reviews 50, and surnex 80.
- Marvel Rivals and Rainbow Six Siege: two passes put Siege higher on Macro, and Claude also puts
  it higher on Meso.

### Destiny 2 and BeamNG.drive (unscored in v1)

- Destiny 2: Macro agrees at 70 to 80 (Claude 80, tags and reviews 70). Micro (50 to 80) and Meso
  (30 to 80) do not. The tag estimate is low confidence because "MMORPG" has too little reference
  support, and its Meso 80 comes from PvP-shooter tags. Claude rated the PvE mode, which is the
  main one.
- BeamNG.drive: Micro 40 to 50 and Meso 20 to 30 agree across sources. Macro splits between 20
  (Claude), 40 (reviews), and 60 (low-confidence tags).

## Methods

### Claude

Claude applied the rubric's questions and label rows to each game's main mode, for a competent
player, in steps of 10. The scores were recorded before any community data was analyzed. They are
not blind to v1: the owner's scores were known, and the rubric's anchors are those scores. The
scores and reasons are in `data/research/claude-mimma-2026-10-31.json` and the appendix.

### Tags

- Data: each game's user tags from Steam's store API, collected on 2026-10-31.
  `IStoreBrowseService/GetItems` with `include_tag_count: 20` gives the weights, and
  `IStoreService/GetTagList` gives the names. Neither needs a key. The weights follow player
  votes: for Baldur's Gate 3, their shares match the vote counts on the store page to within 0.1
  points. A tag's share is its weight divided by the game's total.
- Reference games: the surnex rows with a Steam page, matched by exact title (77 rows) or by hand
  for franchise and renamed rows (15), in `data/research/surnex-steam-apps.json`. The five rows that
  are catalog games (Counter-Strike 2, Marvel Rivals, Apex Legends, Rainbow Six Siege, and the
  Monster Hunter franchise row) are left out, which leaves 87 games. The tag pass uses the 86 with
  at least 5 tags. Labels are high 80, med 50, low 20.
- Estimate: for each tag carried by at least 3 reference games, the vote-weighted average label of
  those games. A game's raw estimate is the vote-weighted average over its supported tags. A
  straight line fitted on the reference games maps raw estimates to the 0 to 100 scale.
- Low confidence: one of the game's five most-voted tags appears on fewer than 3 reference games.
  The flagged tags are Creature Collector (Palworld), Turn-Based Combat (Baldur's Gate 3), MMORPG
  (Destiny 2), Hunting (Monster Hunter Wilds), and Driving and Destruction (BeamNG.drive).
- Validation: each reference game was predicted with itself left out.

| Axis  | Rank correlation with labels | High above low | Mean error |
| ----- | ---------------------------- | -------------- | ---------- |
| Micro | 0.80                         | 97%            | 11 points  |
| Meso  | 0.76                         | 94%            | 14 points  |
| Macro | 0.69                         | 91%            | 18 points  |

"High above low" is the share of (high, low) reference game pairs where the high game gets the
higher estimate.

Known biases:

- The pass reproduces how surnex labels genres. Surnex labels nearly every multiplayer shooter
  high on all three axes, and precision platformers and similar games low on Meso. The tags learn
  those patterns.
- Genres the reference set lacks fall back on generic tags. Baldur's Gate 3's most specific tags
  (CRPG, Romance, Turn-Based Combat) have zero or one reference game, so its estimate rests on
  "RPG", "Story Rich", and "Adventure", which the reference set mostly attaches to action games.
  BeamNG.drive ("Driving") and Destiny 2 ("MMORPG") have the same gap.

### Reviews

- Data: Steam's review API, `IUserReviewsService/GetAppReviews`, collected on 2026-10-31. It needs
  no key. The request asks for the Helpful sort (`filter: 0`) over all time (`day_range: 0`),
  English reviews, every purchase type (`purchase_type: 1`), and Steam's default filter for
  off-topic review bombs. It returns 100 reviews per page with cursor paging. Each game gets 300
  reviews. After BBCode markup is removed and reviews under 20 words are dropped, 250 to 286
  remain per catalog game.
- Endpoint: Valve's documentation marks the older `store.steampowered.com/appreviews/<appid>?json=1`
  endpoint as deprecated in favor of `GetAppReviews`, and it now redirects to the store home page.
- Signal: for each axis, the share of reviews that use at least one term from that axis's word
  list (appendix). The game's own title is removed first, so names like "Liar's Dice" do not count.
- Calibration: a straight line fitted from mention share to label over the 84 reference games
  with at least 15 usable reviews.
- Range: 2,000 bootstrap resamples of each game's reviews. It shows sampling error only, not the
  calibration error below.

| Axis  | Rank correlation with labels | High above low | Mean error | Mention share (low / high) |
| ----- | ---------------------------- | -------------- | ---------- | -------------------------- |
| Micro | 0.71                         | 92%            | 21 points  | 4% / 16%                   |
| Meso  | 0.49                         | 79%            | 24 points  | 6% / 11%                   |
| Macro | 0.64                         | 88%            | 21 points  | 8% / 22%                   |

Known biases:

- Reviews about problems leave less room for gameplay terms. The share of usable reviews that
  mention cheating, servers, monetization, or performance is 70% for Monster Hunter Wilds, 55% for
  Apex Legends, and 53% for Counter-Strike 2, against 17% for Elden Ring and 19% for Baldur's Gate 3. The pass tends to read the first group low.
- The Meso word list separates high from low reference games only weakly (79%), and it reads 9 of
  the 10 catalog games at 40 or 50. Treat the Meso column as weak evidence.
- The calibration line has a mean error of 21 to 24 points, about one label row. A single review
  value is good to roughly that, even where its bootstrap range is narrow.

## Reproducing

```sh
# Only when data/surnex-dataset.csv changes. Check the manual rows before committing the output.
node scripts/research/resolve-surnex-steam-apps.mts --write

# Downloads tag weights and reviews to .cache/community-mimma/, which git ignores.
# Existing files are kept; add --refresh to download everything again.
node scripts/research/fetch-community-signals.mts --reviews 300

# Prints the tables in this report and writes .cache/community-mimma/results.json.
node scripts/research/analyze-community-mimma.mts
```

Steam's tags and reviews change over time, so a later run will not reproduce these numbers
exactly.

## Appendix: Claude's reasons

| Game                 | Micro                                                                          | Meso                                                                                   | Macro                                                                           |
| -------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Counter-Strike 2     | 100: built around aim, counter-strafing, and spray control                     | 80: rounds turn on unseen positions, footsteps, fakes, and guessing the enemy's buy    | 70: economy and pre-round plans matter, but gunfights decide more               |
| Palworld             | 30: shooting and dodging matter in boss fights; most play forgives rough input | 30: capture odds, passive rolls, and raids add chance that matters sometimes           | 80: the main loop is base layout, work assignments, automation, and breeding    |
| Marvel Rivals        | 70: aim and ability timing decide most fights; some kits need little aim       | 60: tracking ultimates and cooldowns, flanks, and baits; most information is on screen | 70: composition, counter-picks, team-ups, and ultimate economy                  |
| Apex Legends         | 90: recoil, long tracking fights, and movement tech                            | 80: random loot and ring, unknown squads, and third parties                            | 70: rotations, zone reading, composition, and when to fight                     |
| Rainbow Six Siege    | 80: one-headshot kills, peeks, and recoil                                      | 90: built around information from drones, cameras, roamers, and sound through walls    | 80: operator picks, site setup, and the attack plan are fixed before contact    |
| Baldur's Gate 3      | 0: turn-based, never asks for fast or precise input                            | 50: every action is a d20 roll, with hidden traps and unknown outcomes                 | 100: builds, spell slots and rests, turn-by-turn tactics, and long-term choices |
| Destiny 2            | 60: precision gunplay matters often; most PvE forgives misses                  | 30: mostly predictable enemies and scripted encounters                                 | 80: subclass, mods, exotics, and perks decide encounters early                  |
| Monster Hunter Wilds | 80: combos, positioning, and dodge, guard, and counter timing                  | 50: reading tells in the moment; rage, turf wars, and weather vary learnable patterns  | 70: skill builds, decorations, prep, and crafting                               |
| Elden Ring           | 80: dodge and parry timing, spacing, and stamina; builds can lower the demand  | 60: delayed boss attacks punish early reactions; retries make patterns learnable       | 70: stats, weapon and spell builds, talismans, and routing shape every fight    |
| BeamNG.drive         | 50: car control is the core interaction; free roam has no fail state           | 20: traffic and crash physics add some unpredictability                                | 20: parts and tuning; few long-term decisions in a sandbox                      |

## Appendix: review word lists

Matched as whole words or phrases, case-insensitive, after BBCode markup is removed. The source of
truth is `REVIEW_LEXICON` in `scripts/research/community-mimma.mts`.

- Micro: aim, reflexes, reaction time, precise, precision, timing, recoil, spray, flick, headshot,
  dodge, parry, i-frames, combo, execution, fast-paced, twitchy, twitch shooter, movement tech,
  bunny hop, bhop, strafe, skill ceiling, skill gap, mechanical skill, mechanically, hand-eye,
  muscle memory, hitbox, hit reg, inputs, input lag, input delay, input buffer.
- Meso: mind games, outsmart, outthink, outwit, outguess, outplay, bluff, bait, deceit, deceive,
  deception, predict, predictable, unpredictable, guessing, hidden information, hidden roles,
  hidden identity, hidden traitor, intel, info gathering, information denial, randomness,
  randomized, RNG, luck, lucky, unlucky, deduce, deduction, suspicion, suspicious, sus, unknown,
  uncertain, uncertainty, ambush, flank, footsteps, sound cues, audio cues, read the opponent, read
  the enemy, fog of war, adapt, adaptation, adaptive.
- Macro: strategy, strategic, tactics, tactical, planning, plan ahead, game plan, long-term,
  economy, resources, management, managing, micromanage, builds, build variety, build diversity,
  buildcrafting, theorycrafting, min-max, loadout, team composition, comps, synergy, rotate,
  rotation, crafting, automation, base building, decision, decision-making, skill tree, tech tree,
  counter-pick, coordinate, coordination.

"Optimization" is left out because reviews use it for game performance.

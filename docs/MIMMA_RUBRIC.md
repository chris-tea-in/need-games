# MiMMa scoring rubric

Status: draft for owner approval. The anchors below are the owner's approved v1 scores
(`data/authoritative-records/owner-authoritative-mimma-v1.json`). Nothing in this file changes a
score. A new score or a changed score still needs a new snapshot version.

This file defines what a MiMMa number means, so that two raters who follow it land near the same
score. It also defines how several raters' scores combine into one published score, and how the
app uses scores to find similar games.

## The scale

Each axis is scored on its own from 0 to 100. The axes are independent intensities, not shares of
a whole: a game can be 100 Micro and 80 Macro at once.

Score in steps of 10. Finer numbers suggest a precision that one person's judgment does not have.
A one-decimal value is fine when it is the median of several raters (see "Combining raters").

The app shows each value with a label (`src/shared/mimma.ts`):

| Value  | Label    | Meaning                                              |
| ------ | -------- | ---------------------------------------------------- |
| 0      | Absent   | The game never asks for this.                        |
| 1-29   | Slight   | It shows up, but a player can ignore it.             |
| 30-49  | Low      | It matters sometimes. Doing it badly costs a little. |
| 50-69  | Moderate | It matters often. Doing it badly costs a lot.        |
| 70-89  | High     | It is a main reason players win or lose.             |
| 90-100 | Defining | The game is built around it.                         |

## The axes

Ask the question for each axis, then pick the label row that fits, then pick a value inside that
row by comparing with the anchors.

**Micro: execution, reflexes, timing, and precision.**
How much does success depend on your hands doing what you meant, fast and accurately?
Score high for aiming, dodging on reaction, frame-tight inputs, and fast, accurate movement.
Score low when the game waits for you, or when inputs only need to be roughly right.

**Meso: uncertainty, hidden information, and mind games.**
How often do you act without knowing what will happen, or by reading another mind?
Score high for bluffing, guessing an opponent's next move, fog of war, and hidden
information. Unpredictable enemy patterns you must read in the moment also count.
Score low when the full state is visible and outcomes follow plainly from your inputs.

**Macro: strategy, systems, optimization, and resource management.**
How much do decisions made well before the result decide the result?
Score high for build planning, economy, team composition, long-horizon plans, and deep system
mastery. Score low when each moment stands alone and planning ahead changes little.

## Rating rules

- Rate the main way most players play the game. For a game with a PvP and a PvE mode, rate the mode
  the game is known for, and note the other one.
- Rate for a competent player, not a beginner and not a top professional.
- Rate what the game asks of the player, not how hard the game is overall. A hard game can be low
  on an axis it never tests.
- Score each axis without looking at the other two, and without looking at other raters' scores.

## Anchors

These are the owner's v1 scores, grouped by value. Compare your game with the anchors nearest your
first guess, then adjust.

| Value | Micro                                                                            | Meso                                                    | Macro                                                        |
| ----- | -------------------------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------ |
| 100   | Counter-Strike 2, Valorant                                                       | Elden Ring                                              | Apex Legends, Baldur's Gate 3, League of Legends             |
| 80    | Apex Legends, Elden Ring, Marvel Rivals, Monster Hunter Wilds, Rainbow Six Siege | Apex Legends                                            | Counter-Strike 2, Marvel Rivals, Rainbow Six Siege, Valorant |
| 70    | League of Legends (68.6)                                                         | Valorant (73.3), League of Legends (77.1)               | Palworld                                                     |
| 60    |                                                                                  | Counter-Strike 2 (65), Marvel Rivals, Rainbow Six Siege | Monster Hunter Wilds                                         |
| 40    | Palworld                                                                         | Monster Hunter Wilds                                    | Elden Ring                                                   |
| 20    | Baldur's Gate 3                                                                  | Baldur's Gate 3, Palworld                               |                                                              |
| 0     | (none yet)                                                                       | (none yet)                                              | (none yet)                                                   |

The League of Legends and Valorant values have decimals, which suggests they are averages of
several judgments. How they were produced is not recorded.

### Open calibration questions for the owner

`docs/MIMMA_RESCORING_2026-10-31.md` compares the v1 scores with three independent scorings and
answers each question below with that evidence.

- No anchor sits below 20 on any axis. Each axis needs a 0 or 10 anchor. `data/surnex-dataset.csv`
  lists games rated high on one axis and low on the others (for example Beat Saber: high Micro, low
  Meso, low Macro). Those are good candidates to score as low anchors.
- Elden Ring is the only Meso 100, above every PvP game in the set. If Meso 100 should mean "reading
  another player", Elden Ring's Meso may need to come down, or the Meso definition above needs a
  sentence that says designed unpredictability counts as much as a human opponent.
- Apex Legends shares Macro 100 with Baldur's Gate 3 and League of Legends. Confirm that a battle
  royale's rotation and loadout planning is meant to equal a turn-based RPG's build planning.
- Marvel Rivals and Rainbow Six Siege have identical scores (80, 60, 80). If they should differ, the
  rubric should say on which axis.

## Combining raters

This is the rule for community scores (backlog M5). Nothing implements it yet. When M5 adds the
schema, store what this section lists.

- Keep every rater's integer score for each axis. Never overwrite a rater's score with the
  combined value.
- The published value for an axis is the median of the raters' scores, kept to one decimal and
  rounded half up to an integer for display. This matches the rounding mode the owner snapshot
  already uses (`half-up-to-integer-v1`). The median is used because one extreme rater cannot move
  it far.
- Store the rater count and the lowest and highest rater score for each axis. The UI can then say
  "5 raters, 60 to 80" next to a value.
- Mark a community score "provisional" until at least 5 raters have scored the game.
- Mark an axis "disputed" when its highest and lowest rater scores differ by more than 40, which is
  two label rows. A disputed axis is a prompt to review the game, not an error.
- The owner snapshot stays separate from community scores. How the two appear side by side is
  decision D8.

The owner snapshot v1 has no rater data. Its scores count as one rater each.

## How the app uses scores

`src/shared/similarity.ts` ranks similar games for a scored game:

1. It measures the straight-line (Euclidean) distance between the two scores on the three axes. The
   largest possible distance is about 173.
2. It drops every game farther than 40. A game within 40 can differ by 20 on every axis (about
   35), or by 40 on one axis, but not by 40 on one axis and 20 on another (about 45).
3. It orders the rest by distance plus a tag penalty. The penalty is 20 points when the two games
   share no Steam tags, and it shrinks to 0 as their tag overlap (shared tags divided by all
   distinct tags) reaches 1. Tags can reorder games that are within 20 points of each other, but
   never outrank the MiMMa profile.
4. It shows at most 5 games. Remaining ties break by title, then Steam app ID.

The API returns the raw MiMMa distance and the shared tags for each match. A game with no match
within 40 gets an empty list, and its page says no scored game plays close enough yet.

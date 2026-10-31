---
name: need-games
description: A dark shelf of upright game boxes; each game page is the back of its box, with a ruled spec panel in three process inks.
colors:
  ground: '#0e0e0f'
  panel: '#161617'
  panel-raised: '#1e1e20'
  text: '#f3f2ee'
  text-2: '#b4b3ad'
  text-3: '#8b8a85'
  ink-micro: '#00a0e3'
  ink-meso: '#ec008c'
  ink-macro: '#ffe100'
  spot: '#ff5b14'
  danger: '#ff7a6b'
typography:
  display:
    fontFamily: 'Archivo Variable, system-ui, sans-serif'
    fontSize: 'clamp(2.5rem, 6vw, 5.5rem)'
    fontWeight: 850
    lineHeight: 0.93
    letterSpacing: '-0.02em'
  headline:
    fontFamily: 'Archivo Variable, system-ui, sans-serif'
    fontSize: 'clamp(1.75rem, 3.4vw, 2.75rem)'
    fontWeight: 850
    lineHeight: 1
    letterSpacing: '-0.02em'
  title:
    fontFamily: 'Archivo Variable, system-ui, sans-serif'
    fontSize: '1.0625rem'
    fontWeight: 720
    lineHeight: 1.2
  body:
    fontFamily: 'Archivo Variable, system-ui, sans-serif'
    fontSize: '1.1875rem'
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: 'Archivo Variable, system-ui, sans-serif'
    fontSize: '0.75rem'
    fontWeight: 700
    letterSpacing: '0.09em'
rounded:
  box: '3px'
  stamp: '2px'
spacing:
  gutter: 'clamp(1rem, 4vw, 3rem)'
  shelf-gap: 'clamp(1.25rem, 2.4vw, 2rem)'
  row-gap: 'clamp(2.5rem, 5vw, 3.75rem)'
  page-max: '86rem'
components:
  input:
    backgroundColor: '{colors.panel}'
    textColor: '{colors.text}'
    rounded: '{rounded.box}'
    height: '3.25rem'
  input-focus:
    backgroundColor: '{colors.panel-raised}'
  button-ghost:
    backgroundColor: 'transparent'
    textColor: '{colors.text}'
    typography: '{typography.label}'
    rounded: '{rounded.box}'
    height: '2.75rem'
  button-ghost-hover:
    backgroundColor: '{colors.text}'
    textColor: '{colors.ground}'
  button-solid:
    backgroundColor: '{colors.text}'
    textColor: '{colors.ground}'
    typography: '{typography.label}'
    rounded: '{rounded.box}'
    height: '3.25rem'
  stamp:
    textColor: '{colors.text-2}'
    typography: '{typography.label}'
    rounded: '{rounded.stamp}'
    padding: '0.3rem 0.55rem 0.25rem'
  box-art:
    backgroundColor: '{colors.panel-raised}'
    rounded: '{rounded.box}'
  rank-badge:
    backgroundColor: '{colors.text}'
    textColor: '{colors.ground}'
    rounded: '{rounded.stamp}'
---

# Design System: need-games

## Overview

**Creative North Star: "The Big Box"**

Games are upright boxes standing on a dark shelf. A game page is the back of its box: art behind, the box in front, and a ruled spec panel that reads like the system requirements block printed on retail packaging. The catalog is a shelf, the detail page is a box back, and similar games are a second, shorter shelf below.

The palette is black laminate plus ink. Three process inks (cyan, magenta, yellow) are meant for the three MiMMa axes (Micro, Meso, Macro). One fluorescent orange marks the game you are on. Everything else is greys, ruled hairlines and white. States that other designs hide (unscored, offline, not found) are printed onto the page as ruled condensed caps labels called stamps.

Type is one family, Archivo Variable, at two widths: extended heavy for titles, condensed caps for panel heads and labels. Density is airy at the shelf and tight inside the spec panel.

**Key characteristics:**

- Dark ground only (`color-scheme: dark`).
- Portrait 2:3 box art with a 3D turn on hover and a shelf ledge underneath.
- Hairline rules and a 3px white top rule define panels; there are no filled cards.
- Corners are nearly square (3px).
- States are stamped, not hidden.

## Colors

A black ground with off-white text, three process inks that mean axes, and one spot orange that means "this game".

### Primary

- **Micro Cyan** (`ink-micro`, #00a0e3): the Micro axis bar, key row and strip.
- **Meso Magenta** (`ink-meso`, #ec008c): the Meso axis.
- **Macro Yellow** (`ink-macro`, #ffe100): the Macro axis.

### Secondary

- **Spot Orange** (`spot`, #ff5b14): the current game only. It lights the box spine when a box is picked up (hover, focus, or the detail-page box) and is the reference tick on similar-game strips (the 3px marker and the `reference-mark` bar).

### Neutral

- **Shelf Black** (`ground`, #0e0e0f): page ground, and text on white fills.
- **Panel** (`panel`, #161617) and **Panel Raised** (`panel-raised`, #1e1e20): inputs, empty art, menus, modals. The only tonal layering.
- **Ledge greys** (#4a4a4f top face, #26262a front edge): the shelf plank only.
- **Laminate White** (`text`, #f3f2ee): primary text, heavy top rules, solid buttons, rank badges, focus rings, the text caret, text selection, and the verified-account check tile.
- **Text 2** (`text-2`, #b4b3ad) and **Text 3** (`text-3`, #8b8a85): secondary and tertiary copy. Text 3 is the floor for readable text.
- **Rule** (white at 12%) and **Rule Strong** (white at 26%): hairlines and control borders.
- **Danger** (`danger`, #ff7a6b): error text and the top edge of the sign-in failure notice.

### Named rules

**The Axis Ink Rule.** Cyan, magenta and yellow mean Micro, Meso and Macro. A surface that is not an axis (or the three-ink strip standing for the three axes) does not get an ink.

**The One Orange Rule.** Spot orange appears only on the current game: the picked-up spine and the reference tick. Never on buttons, links or hover states.

## Typography

**Display font:** Archivo Variable (system-ui, sans-serif fallback), self-hosted via @fontsource-variable/archivo.
**Body font:** the same family at normal width.
**Label font:** the same family, condensed.

**Character:** One family, two voices. The extended heavy cut is loud and packaging-like. The condensed caps cut is the fine print on a box back. Width, not a second typeface, carries the contrast.

### Hierarchy

- **Display** (850, `font-stretch: 118%`, clamp 2.5 to 5.5rem, line-height 0.93, -0.02em): the game name on the detail page. The catalog headline uses the same voice at clamp 2.6 to 4.75rem, line-height 0.92, max 13ch.
- **Headline** (850, 118%, clamp 1.75 to 2.75rem, line-height 1): the similar-games heading. The sign-in modal title is the same voice at 1.75rem.
- **Title** (720, 1.0625rem, line-height 1.2): game name under a shelf box. Axis names use 800 at 108% stretch, 1.125rem.
- **Body** (400, 1.1875rem detail description, 1.125rem intro, line-height 1.55, max 62ch description and 34rem intro): running copy. Secondary copy drops to 0.8125 to 0.9375rem in Text 2 or Text 3.
- **Label** (700, `font-stretch: 76%`, uppercase, 0.09em tracking, 0.75 to 0.8125rem): panel heads, field labels, back link, store link, sign-in trigger, fine-print terms, axis band labels. Stamps use the same voice at 0.14em tracking.
- **Numerals:** scores, counts and dates use `tabular-nums`. Axis values are display voice at 1.75rem.

### Named rules

**The Two Widths Rule.** Titles go extended heavy, panel heads and labels go condensed caps. No second family and no middle width for headings.

## Layout

One page column, `min(100% - 2 * gutter, 86rem)`, centered and shared by header, catalog, detail, similar games, fine print and footer. The gutter is `clamp(1rem, 4vw, 3rem)`.

The catalog intro is a 7/5 split from 64rem (headline and copy left, ink key right) and stacks below. Controls (search, sort, result count) become one row from 48rem: `1fr 15rem auto`. The shelf is auto-fill columns at a 12.5rem minimum, `clamp(1.25rem, 2.4vw, 2rem)` between boxes and `clamp(2.5rem, 5vw, 3.75rem)` between shelves. Under 30rem it is two columns.

The detail page overlaps: hero art (height clamp 15 to 30rem) sits behind and the layout pulls up over it with a negative top margin. From 64rem it is two columns: box and store link (15 to 21rem) left, identity and spec panel right, the right column pushed down to clear the art. Below 64rem the box shrinks to a 7.5 to 11rem column beside the store link (8rem under 30rem). Similar games are five columns on desktop, auto-fill at 10.5rem below, two columns under 30rem.

Vertical rhythm is generous between sections (`clamp(4rem, 8vw, 7rem)` before the footer) and tight inside spec panels (0.7 to 1.25rem row padding). Only the sign-in menu, modal and failure notice leave the column.

## Elevation & Depth

Depth is physical, not tonal. Boxes cast shadows and stand on a ledge; panels do not. At rest a box is turned 7deg on Y. On hover or focus it lifts 0.6rem and turns 24deg, the spine lights, and a laminate highlight sweeps the front over 720ms. The detail-page box is permanently picked up (14deg, deeper shadow, spine lit). Touch devices (`hover: none`) do not turn on hover. Reduced motion swaps the turn for a small lift.

### Shadow vocabulary

- **Box at rest** (`0 18px 22px -14px rgb(0 0 0 / 85%), 0 2px 4px rgb(0 0 0 / 50%)`): a box on the shelf.
- **Box picked up** (`-10px 26px 30px -16px rgb(0 0 0 / 90%), 0 2px 4px rgb(0 0 0 / 50%)`): hover or focus.
- **Ledge** (inset top highlight, inset bottom shade, `0 18px 24px -10px rgb(0 0 0 / 90%)`): a plank under each box, extending half a gap either side so a row reads as one plank.
- **Floating UI** (`0 18px 40px -12px rgb(0 0 0 / 80%)` menu and failure notice, `0 30px 60px -20px rgb(0 0 0 / 90%)` modal): the only shadows on non-box elements.
- **Beta sticker** (`0 6px 14px -6px rgb(0 0 0 / 80%)`): the white sticker on the intro.

### Named rules

**The Shadows Belong To Objects Rule.** Only boxes, the ledge, the sticker and floating layers throw shadows. Spec panels, inputs and stamps are flat and defined by rules.

## Shapes

Almost square. Boxes, inputs and buttons share a 3px radius; stamps, rank badges and the sticker use 2px. Axis tracks, ink bars, the color bar and key bars are hard-edged rectangles. No pills, no circles.

Structure is drawn with rules rather than containers: a 3px white top rule opens each panel (ink key, spec panel, sign-in modal), 1px hairlines divide rows, and the offline notice has a 1px dashed border. The fallback box and the empty hero carry a three-ink strip across the top, like print registration marks.

## Components

### Box (game card)

Portrait 2:3 Steam library capsule, 3px radius, rotated on Y, ledge underneath, spine on the left (dark grey at rest, spot orange gradient when picked up). Below it: title, review count, a tag list with 4px square bullets, then a profile strip. One link per box, with a hit area covering box and label. If the image fails, a printed title card (panel-raised, three-ink strip on top, uppercase display-voice title) replaces it so the shelf never has a hole.

### Profile strip

Three 5px hairline axis tracks stacked with a 3px gap, each filled in its axis ink to the score. On similar-game boxes a 3px spot-orange marker with a ground-colored halo shows where the reference game sits.

### Spec panel

The box-back block. 3px white top rule, condensed caps header with a Text 3 side note, one row per MiMMa axis, then a footnote under a hairline. Each axis row is a grid: name and description, a 0.875rem track with 10% ticks and an ink bar that animates in over 1100ms (110ms stagger), the score in display voice, and a condensed caps band label. Rows go to two lines below 36rem container width.

### Stamp

Condensed caps in a 1px currentColor border, 2px radius, Text 2. Used for "Not yet scored" (on the shelf, and at 1.125rem in an unscored spec panel), "Not on the shelf" (not found) and "Saved data" (inside the dashed offline notice, in full-strength text). A state is printed here instead of removing the element.

### Ink key

The catalog intro legend: 3px white top rule, condensed caps head, one row per axis with a 0.5rem ink bar, the axis name and a one-line description.

### Inputs and selects

Panel-filled, 1px Rule Strong border, 3px radius, 3.25rem tall. Hover brightens the border. Focus turns it white and lifts the fill to panel-raised. Selects carry a custom chevron. Labels are condensed caps in Text 3 above the field.

### Buttons

Square-cornered and caps. **Ghost** (sign-in trigger, store link): 1px Rule Strong border, transparent, inverts to a white fill with ground text on hover. **Solid** (Steam continue in the modal): white fill, ground text, 3.25rem tall, pure white on hover. Disabled is 60% opacity with a wait cursor. The focus ring is a 2px white outline at 3px offset plus a 6px ground halo. On box links the ring is drawn around the whole box.

### Sign-in

Ghost trigger in the header. Signed in, it switches to normal-width mixed case with a small cyan check tile. The account menu is a panel-raised dropdown. The modal has a 3px white top rule, a blurred desaturated backdrop and a 320ms rise-in. The failure notice is a fixed top banner with a 3px danger top edge.

### Site chrome

Header: extended caps wordmark with a four-chip color bar (cyan, magenta, yellow, then an outlined empty "key" chip), hairline below. Footer: hairline above, Text 3. Fine print: auto-fit columns of condensed caps terms over tabular values.

### Beta sticker and rank badge

Two pasted-on white tiles with ground text. The sticker sits in the intro with a drop shadow. The rank badge holds an extended-heavy numeral and overhangs the top-left corner of a similar-game box.

## Do's and Don'ts

### Do:

- **Do** print states as stamps (condensed caps, 1px border, 2px radius). Unscored, offline and not-found keep their place on the page.
- **Do** use cyan, magenta and yellow for Micro, Meso and Macro, in that order.
- **Do** open panels with a 3px white top rule and divide rows with 1px hairlines, on the shared page column.
- **Do** keep corners at 3px (2px for stamps and badges) and shapes rectangular.
- **Do** use `tabular-nums` for scores, counts and dates.
- **Do** keep a visible focus ring on every interactive element.
- **Do** turn boxes on hover only where hover exists, and fall back to a small lift under reduced motion.

### Don't:

- **Don't** use spot orange for anything but the current game.
- **Don't** spend an axis ink on a status or brand role.
- **Don't** wrap games in rounded dark cards with pill badges. The box is the object.
- **Don't** hide a missing score, an offline dataset or a missing image. Print the state.
- **Don't** add a second typeface or a middle width for headings.
- **Don't** put shadows on panels, inputs or stamps.
- **Don't** dim readable text below Text 3 (#8b8a85).

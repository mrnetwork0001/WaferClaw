# WaferClaw design system: "fab instrument"

The interface is styled as a piece of semiconductor test equipment rather than a web dashboard. It should be recognisable in a single video frame.

## Principles
- **One signature object.** Speed is shown on a wafer die map: a disc of square dies with an orientation flat, lit from the centre outwards in proportion to tokens per second (full wafer = 2,500 tok/s). No arc gauges.
- **Two inks and one accent.** Warm carbon background, bone text, one hot orange. Lime and red appear only as pass/fail marks.
- **Instrument panels, not cards.** Square corners, 1px hairlines, orange registration marks at two corners, numbered silkscreen labels (`01 DECODE SPEED`).
- **The receipt is paper.** Run results print on an inverted bone "ticket" with a perforated edge.
- **No emoji, no stock icons.** The only mark is the WaferClaw logo: a wafer disc raked by three claw cuts (`components/Logo.tsx`, `app/icon.svg`).
- **Every number says where it came from.** Measured, modelled and estimated values are labelled as such.

## Tokens (tailwind `wc-*`)
| Token | Hex | Use |
| --- | --- | --- |
| `bg` | `#0A0908` | Page, with a faint 18px die-dot grid |
| `panel` | `#100F0D` | Panels |
| `card` | `#171512` | Unlit dies |
| `border` / `border-hi` | `#2A2722` / `#4A443C` | Hairlines / control outlines |
| `bone` (`fg`) | `#ECE5D5` | Primary text, ticket paper |
| `fg-2` / `fg-3` | `#A39B8B` / `#6B6458` | Secondary / metadata |
| `hot` | `#FF5A1F` | The accent: lit dies, primary action, indices |
| `ok` / `bad` | `#C6F26D` / `#FF4133` | Verified / failed marks only |

## Type
- **Barlow Condensed 700–800**: numerals, wordmark, tabs, primary buttons (uppercase).
- **Archivo**: product names and prose.
- **Martian Mono**: labels, log, metadata (uppercase, wide tracking, tabular numerals).

## Layout
Single viewport at 1440×900: header 52px; left 5/12 (decode panel with race, harness log); right 7/12 (active mode). Collapses to one column below `lg`.

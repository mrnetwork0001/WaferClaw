# WaferClaw design system: "fab instrument"

The interface is styled as a piece of semiconductor test equipment rather than a web dashboard. It should be recognisable in a single video frame.

## Principles
- **One signature object.** Speed is shown on a wafer die map: a disc of square dies with an orientation flat, lit from the centre outwards in proportion to tokens per second (full wafer = 2,500 tok/s). No arc gauges.
- **Two inks and one accent.** Warm carbon background, bone text, one hot orange. Lime and red appear only as pass/fail marks.
- **Instrument panels, not cards.** Square corners, 1px hairlines, orange registration marks at two corners, numbered silkscreen labels (`01 DECODE SPEED`).
- **The receipt is paper.** Run results print on an inverted bone "ticket" with a perforated edge.
- **No emoji, no stock icons.** The only mark is the WaferClaw logo: a wafer disc raked by three claw cuts (`components/Logo.tsx`, `app/icon.svg`).
- **Every number says where it came from.** Measured, modelled and estimated values are labelled as such.


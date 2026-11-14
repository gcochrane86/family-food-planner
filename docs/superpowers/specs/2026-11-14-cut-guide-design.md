# Cut guide: tap an ingredient to see the cut, life size

Date: 14 Nov 2026. Approach chosen by the owner ("credit card sounds very logical"); approved ("Yes build as designed").

## Why
Cards say "3cm chunks" or "2mm rings", but what a chunk looks like and how big 3cm really is are guesses at the
board. The owner wants to tap a card and see, full screen, the cut drawn clearly and a ruler showing the real size.

## What it does
- **Tap** an ingredient card (Today's hour steps and chopping list, cook mode) that says how it's cut or gives a size:
  a full-screen view opens. Holding a card still opens its options as now. Close (×) goes back.
- **The picture:** the chopping picture for that ingredient and cut (`prep_photos`, key from `prepKey`), large. If it
  isn't made yet, a **Make the picture** button (the existing chopping-photo function).
- **In plain words:** the instruction (`chopInstruction`: "Cut the carrot into 3cm chunks") and what the cut means,
  from a fixed list, e.g. chunks: "rough cubes, all about the same size so they cook evenly; they needn't be neat";
  strips, diced, finely diced, sliced, thinly sliced, rings, half-moons, discs, matchsticks, wedges, halved, quartered,
  crushed, grated.
- **The ruler:** along the screen's long edge, true to size, in cm with mm ticks, with a marker and label at each size
  the card gives: sizes in the note ("2mm discs") and a length amount ("3 cm" of ginger: the piece to cut off).
  For chunks and dice, a life-size square of the piece too, to hold a piece against.
- No size on the card ("peeled", "halved"): the picture and the words, no ruler.

## The ruler is set once per device
A web app can't know the screen's physical size. The first time the ruler is needed, a **Set the ruler** screen:
lay any bank card on the screen and drag (or use − / +) until the outline matches its width (85.6mm). Saved on that
device (browser storage); **Set the ruler again** is a link in the view. Until it's set, the view shows the picture
and words and asks to set it.

## Approaches considered
1. Set once with a bank card (chosen): accurate to about a millimetre, one minute per device.
2. Guess from the screen size: no setup, but 10–15% out on some iPhones and iPads.

## My calls
- The chopping list rows open the same view as the cards.
- Sizes under 5mm get no zoom: the ruler stays true to size (mm ticks are clear on these screens).
- No migration: everything uses tables and functions that exist.

## Non-goals
Measuring with the camera; weights or volumes; changing how cuts are worded in recipes.

# Tablet Responsive Layout Report: Fabric Showcase

## 1. Root Cause Identified
The carousel was originally using `sm:w-[45vw]` combined with a `max-w-[100vw]` wrapper. Because the application's core `<main>` viewport is bounded by `max-w-7xl` and has its own horizontal padding (`px-6`), relying on viewport width (`vw`) for the child cards resulted in two cards (plus their `gap-6` spacing) exceeding the actual inner bounds of the carousel track. Additionally, the `max-w-[100vw]` CSS class failed to account for browser scrollbars, causing the wrapper to bleed outside the document body and clip the right-most edge via `overflow-hidden`.

## 2. Responsive Changes Made
- **Bounded Sizing**: Replaced the absolute viewport unit sizing (`sm:w-[45vw]`) with a relative calc expression (`sm:w-[calc(50%-12px)]`). 
- **Wrapper Boundary Correction**: Replaced `max-w-[100vw]` with `max-w-full` on the carousel's relative overflow wrapper.

## 3. Carousel Sizing Adjustments
- **Exact Two-Card Fit**: The container now relies on `calc(50% - 12px)`. Since the flex track gap is `gap-6` (24px), two cards will occupy exactly `(50% - 12px) + 24px + (50% - 12px) = 100%` of the visible container width.
- Exactly two full fabric cards will now neatly fill the viewport on standard tablet screens without arbitrary clipping.

## 4. Scroll Behaviour Verification
- The final fabric card in the carousel track is no longer clipped upon reaching the end.
- Standard scroll padding constraints have been preserved so that the rightmost card sits perfectly flush with the inner padding of the track, mirroring the leftmost card.
- `snap-x snap-mandatory` works natively with `50%` fractional layouts, causing the carousel to align neatly upon touch or drag interactions.

## 5. Layout Integrity Confirmation
- The `lg:w-[280px]` desktop layout remains explicitly unaffected.
- The `w-[75vw]` mobile layout remains intentionally unaffected (preserving the "peek" UX where the next card is partially visible to encourage swiping on mobile).
- No Firestore queries, filtering logic, design specs, or functionality were modified.

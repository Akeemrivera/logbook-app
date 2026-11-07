# MOCKUP · SYNTHETIC · NOT DEVICE PROOF

These are browser screenshots of the revision 7 web UI plus one hint-text change. They are not an iPhone, not an iPad, and not TestFlight. No upload is authorized. User review is still required before any TestFlight, and device QA is still required after that.

The black strip at the top of each image is a caption, not a phone frame.

## What the pictures are

| File | What it shows |
|---|---|
| MOCKUP-SYNTHETIC-NOT-DEVICE-iphone-tree-sample-visible.png | iPhone-width Chrome, 390 CSS px. Family tree of Synthetic Mother. Synthetic Sample is still on the page because hideIds is empty. |
| MOCKUP-SYNTHETIC-NOT-DEVICE-iphone-tree-sample-absent-VARIANT-A-existing-heading-parents.png | Same tree after the view projection hides only the synthetic id `syn-sample`. Synthetic Sample is gone. Synthetic Father and the kept cross stay. Heading is the existing "Family tree". The Parents label is the existing one. This is variant A. It is not an approval of that wording. |
| MOCKUP-SYNTHETIC-NOT-DEVICE-iphone-tree-VARIANT-B-preview-heading-parents-hidden-NOT-APPROVAL.png | Same pixels as variant A, with a preview stylesheet that hides `h2.b18-h1` and `.b60-gen[data-gen="1"] > .b57-lab` only. Mother's line, Father's line, and Grandparents stay. This is not approved and is not in the app source. |
| MOCKUP-SYNTHETIC-NOT-DEVICE-iphone-retired-active-counts.png | Mothers & Fathers. Counts read Mothers · 2 and Fathers · 2. Synthetic Retired is not in the list. Synthetic Sample is not in the list. |
| MOCKUP-SYNTHETIC-NOT-DEVICE-iphone-fathers-active-list.png | Fathers tab. Synthetic Father and Synthetic Grandfather are listed. Synthetic Retired and Synthetic Sample are not. |
| MOCKUP-SYNTHETIC-NOT-DEVICE-iphone-compliance-tag-wrap.png | Compliance dashboard. Tag cards use the existing `.tag-top .m-t` rule. Measured `word-break: normal` and `overflow-wrap: break-word` on "SyntheticLongName AlphaBeta". |
| MOCKUP-SYNTHETIC-NOT-DEVICE-iphone-inspection-table.png | Inspection tab. Existing narrow reflow. Synthetic rows only. |
| MOCKUP-SYNTHETIC-NOT-DEVICE-ipad-tree-sidebar-248-sample-absent.png | Chrome at 1440 CSS px so the existing wide rule applies. Computed sidebar width 248px, `data-weff` empty, body padding-left 248px. Default wide text size still zooms the page 1.28×, so the painted box is about 317px. That zoom is build 40, already in the app. Synthetic Sample is absent. |
| MOCKUP-SYNTHETIC-NOT-DEVICE-ipad-retired-active-counts-sidebar-248.png | Same 1440px window. Sidebar CSS width still 248px. Counts Mothers · 2 and Fathers · 2. Retired and the hidden synthetic id are absent. |

At 1024 CSS px the same app sets `data-weff` from build 40 because default wide zoom is 1.28, and the existing stylesheet then draws the sidebar at 216px. The 248px pictures use a wider window so that existing 248px rule is the one on screen. No sidebar CSS was rewritten for these pictures.

## Synthetic records only

Ids used: `syn-mother`, `syn-father`, `syn-sample`, `syn-retired`, `syn-gran`, `syn-granf`, `syn-cross`, `syn-kept`, `syn-grow-long`, `syn-grow-short`. None of these are production ids. Hiding `syn-sample` is a fixture for the projection. It does not mean a saved plant was removed. A real saved record still has no stable sample id in the source, so it was not deleted and is not claimed gone.

## Sources checked before any capture

No new art was drawn. The screens use the files the app already loads.

- `index.html` tab-bar SVG icons and the page itself
- `assets/logo-crop.png` (sidebar mark), `assets/logo.png`, `assets/boriken-logo.jpg`, `assets/boriken-mark.jpg`, `assets/boriken-favicon.jpg`
- `assets/icons/icon-192.png`, `icon-512.png`, `apple-touch-icon.png`, `app-icon-1024.png`
- `assets/looks/pr01.jpg` through `pr24.jpg` (profile looks; not composited into these shots)
- `mascots/` cartoon, dark, light, variants, and `coqui-flag-icon.png` / `coqui-flag-hero.png`
- `wide.css` sidebar 248px rule and the build 40 effective-width override
- `build57.js` heading text "Family tree"
- `build60.js` generation label "Parents"
- `build63.css` card min-height 110px and slot min-height 60px
- `styles.css` `.tag-top .m-t` word-break
- `build4.js` plant tag cards
- `build41.js` Mothers · N / Fathers · N

## Not device proof

Chrome on this machine. No iOS wrapper. No TestFlight. No upload.

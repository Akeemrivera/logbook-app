# MOCKUP · SYNTHETIC · NOT DEVICE PROOF

These are Chrome renders of the full application after the revision 9 layout and cache changes. They are not an iPhone, not an iPad, and not TestFlight. No upload is authorized. User review is still required before any TestFlight, and device QA is still required after that.

The black strip at the top of each image is a caption, not a phone frame. Variant A keeps the existing "Family tree" heading and the Parents label. Variant B hides those two labels in the picture only. That preview is not approved and is not in the app.

## What changed in these pictures

The previous iPad pictures were taken at 1440 CSS px so the zoom rule would leave the sidebar at 248px. Those files are not in this set. These pictures use 390, 768, 1024, and 1366 CSS px windows.

At 390 and 768 the tree cards in one half stack, so "Synthetic Gran" and "Synthetic Grandfather" stay whole words. "1 generation recorded" is the full string. The two halves stay equal. Card min-height stays 110px. The page does not scroll sideways.

The subtitle "Synthetic Gran × Synthetic Grandfather" is the opened record. That record is Synthetic Mother. Her saved parents are Synthetic Gran (`mf:syn-gran`) and Synthetic Grandfather (`mf:syn-granf`). Synthetic Father is the partner on the lower row, not a parent in that subtitle.

At 1024 and 1366 the default wide text size is still 1.28. The effective-width flag is still set. The sidebar's computed width is 248px. Below 1024 there is no wide sidebar. Text size was not changed.

## Files

| File | Window |
|---|---|
| MOCKUP-SYNTHETIC-NOT-DEVICE-iphone-tree-sample-visible.png | 390×1200. Synthetic Sample is still on the tree. |
| MOCKUP-SYNTHETIC-NOT-DEVICE-iphone-tree-sample-absent-VARIANT-A-existing-heading-parents.png | 390×1200. Only the synthetic id `syn-sample` is hidden. Variant A. Not an approval. |
| MOCKUP-SYNTHETIC-NOT-DEVICE-iphone-tree-VARIANT-B-preview-heading-parents-hidden-NOT-APPROVAL.png | Same page with a preview stylesheet. Not approved. |
| MOCKUP-SYNTHETIC-NOT-DEVICE-iphone-retired-active-counts.png | 390. Retired and the hidden id are absent. Counts Mothers · 2 and Fathers · 2. |
| MOCKUP-SYNTHETIC-NOT-DEVICE-iphone-fathers-active-list.png | Fathers tab. |
| MOCKUP-SYNTHETIC-NOT-DEVICE-iphone-compliance-tag-wrap.png | Tag cards. An unspaced cultivar token still breaks only when it is wider than the card. The fixture name was not shortened. |
| MOCKUP-SYNTHETIC-NOT-DEVICE-iphone-inspection-table.png | Inspection table. |
| MOCKUP-SYNTHETIC-NOT-DEVICE-768x1024-portrait-tree.png | 768×1024. Phone layout. No sidebar. |
| MOCKUP-SYNTHETIC-NOT-DEVICE-1024x768-landscape-tree-sidebar-248.png | 1024×768. Sidebar CSS 248px. Zoom 1.28. |
| MOCKUP-SYNTHETIC-NOT-DEVICE-1024x1366-portrait-tree-sidebar-248.png | 1024×1366. Sidebar CSS 248px. Zoom 1.28. |
| MOCKUP-SYNTHETIC-NOT-DEVICE-1366x1024-landscape-tree-sidebar-248.png | 1366×1024. Sidebar CSS 248px. Zoom 1.28. |
| MOCKUP-SYNTHETIC-NOT-DEVICE-1366x1024-landscape-retired-counts-sidebar-248.png | Same window. Retired and the hidden id are absent. |

## Synthetic records only

Ids: `syn-mother`, `syn-father`, `syn-sample`, `syn-retired`, `syn-gran`, `syn-granf`, `syn-cross`, `syn-kept`, `syn-grow-long`, `syn-grow-short`. None of these are production ids. Hiding `syn-sample` does not delete a saved row. There is still no stable production sample id, so a saved row was not removed. The three-photo backup abort is unchanged. This is not a photo recovery.

## Not device proof

Chrome on this machine. No iOS wrapper. No TestFlight. No upload.

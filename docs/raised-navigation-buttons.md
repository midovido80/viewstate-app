# Raised bottom-navigation buttons

Approved selection B: Properties 4 (dimensional building), People 1 (outline pair), Matching 2 (blue/cyan puzzle), Home 5 (house with four windows).

Base: `1ccf594122821da88162bb58593e3ef6720dd651`. Branch: `work/raised-navigation-buttons`.

Four equal Pressable tabs, 6px gaps, 8px minimum outer gutters, rounded borders and a small raised lower edge/shadow. The selected tab uses a pale blue surface and stronger border. Press feedback lowers the button 1px without changing its allocated layout. No animation loop or new dependency. All four icons are local React Native SVG vectors; no icon font, raster download or image-generation runtime.

The bar stays in normal navigator layout, above the existing shared bottom safe inset. Left/right cutouts are retained. RTL explicitly places Home at the right; English places it at the left. The visible order is Home, Matching, People, Properties in reading direction; screen registration names and the hidden More route stay intact. The gear remains the existing Settings entry.

Tab press, preventDefault, params, long-press and repeated selected-tab events retain React Navigation semantics. Screen-reader labels and selected state are localized. Targets are at least 72px high with a one-line adaptive label. Data, capture forms, sharing, sound and matching calculations are unchanged.

## Validation

Existing mobile tests and workspace TypeScript checks are required. The two existing source checks are updated for the taller safe-area reservation and the replacement of the old target glyph. Android/iOS JavaScript export checks vector bundling; it is not a native compilation.

Browser QA exercised all four destinations, repeated presses and Enter activation; widths 320, 390, 430 and 768px; English and Arabic RTL; and Home scrolling while the bar stayed visible. Measured equal button widths: 71.5px at 320, 89px at 390, 99px at 430, and 183.5px at 768. The 390px Preview retained its 32px bottom safe spacing with the bar bottom at viewport 844px.

The local HTTP QA environment already blocks secure storage; saved-record/attachment journeys were not used as acceptance evidence. No records were created or cleared. Physical Android/iOS, large OS text settings, gesture navigation and landscape cutouts remain native-device acceptance work. No APK, deployment or main/Pilot movement is included.

Rollback is the preserved base commit; this package has no dependency or data migration.

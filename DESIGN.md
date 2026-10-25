# Kept — design direction

## Brief

Kept is a private, browser-saved record of the things someone owns, buys again, uses, and maintains. A product link can add the shop's current listed price and photo to an item record; purchase entries separately keep what the owner actually paid. Its main job is to make time and spending easier to remember without making record-keeping feel like work. There are no provided personal items or photographs; the first view should welcome a blank shelf rather than invent a user's history.

## Concept card

Idea: A personal time-index, where each possession is a line in an evolving record and its dated events become a quiet timeline.

Metaphor: A well-used field ledger, organized by the lives of objects rather than by receipts.

Signature: Opening an item draws a short vertical rail through its purchase, service, and use notes.

Emotion: Calm, useful, and a little reflective.

Motion verb: Settle. Panels and rows move a few pixels into place; the event line draws in gently.

Screenshot: The library heading and a selected item’s purchase/service timeline, with the item's age visible beside its name.

## Concept exploration

| Territory | Idea | Anchor | Signature | Originality / fit / feasibility / portability |
|---|---|---|---|---|
| Process | A field ledger makes an object's ownership and upkeep legible as dated notes | The request centers on remembering purchases, use, and service over time | Opening an item reveals its connected event line | 4 / 5 / 5 / 2 |
| Material | The interface uses the quiet logic of clothing care labels: short facts, useful symbols, and dates | Clothes, glasses, a watch, and a bike all need different kinds of care | A compact care label expands into the item's full history | 3 / 4 / 4 / 3 |
| Formal | Every item is one index row; its age and repeat count form a second, smaller column | The user wants to quickly notice how long things have lasted or repeated | Rows reorder by age without hiding their key facts | 3 / 4 / 5 / 4 |

Selected: the field ledger, because it naturally joins purchases, service, use, and reflection while staying readable with sparse or incomplete data.

## Visual system

- **Palette:** Day ledger paper `#F4F5EF`, ink `#17241E`, readable muted ink `#60695F`, rule `#D9DED5`, signal leaf `#A6C86A`, and pale sage `#E8EDE2`. Night mode uses deep evergreen paper `#101713`, raised moss panels `#1A241E`, warm ledger text `#E7EADF`, quiet sage rules `#303D34`, and a light-catching leaf `#C3DF91`. Category seals and feelings keep distinct, softened hues in both modes.
- **Type:** Manrope variable for interface and expressive headings; DM Mono for dates, counts, and small factual labels. Use tabular numerals for time and totals.
- **Grid:** 12 columns on desktop with broad margins; a 4-column composition on phones. Keep a clear left edge for index labels and align event dates on a separate rail.
- **Shape:** 4 px control corners, 8 px panels, and circular event markers. Avoid pill-shaped everything.
- **Motion:** The interface is still at rest by choice. Opening a record draws its event rail and settles the panel into place; primary targets lift slightly on hover. Transitions stay under 220 ms. No scroll hijacking, loader, WebGL, or pointer tricks. Under reduced motion, all content is immediately visible.
- **Theme:** Start with the operating system's appearance, let the person switch between day and night, and remember that choice in this browser. A small pre-paint theme bootstrap prevents the page flashing bright before the night palette is applied.
- **Composition:** Compact introduction; a quiet facts row that appears only when real counts or prices exist; indexed library with search and category filters; selected item detail with a vertical event timeline. The empty view keeps one clear invitation and avoids a redundant empty detail panel.

## Content and data integrity

- Do not seed example items or inferred prices, dates, use patterns, or satisfaction scores.
- The item name is the only required user field. Unknown dates and prices remain unknown, and the interface does not calculate from them.
- A linked shop price is a current listing snapshot, refreshed when that item detail is opened. It is never substituted for a purchase amount; discounts, card offers, bundles, and what the owner paid belong in the purchase event.
- A product can have named size, color, or other variants with separate current prices. Shops that do not expose variant pricing can still be recorded manually.
- Each purchase entry records a total paid, optional quantity, and optional variant. Per-unit paid price is derived from that entry; repeat purchase counts remain order-based.
- Product previews read public product metadata from the linked HTTPS page. A shop may omit that data or block automatic reading; manual history entry remains available.
- All visible sample states are clearly identified as empty-state guidance, never as user records.

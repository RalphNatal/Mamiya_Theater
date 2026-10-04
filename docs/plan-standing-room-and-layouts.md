# Plan: Standing Room (item 4) + reusable seat-map layouts (item 5)

Status: **proposal, not built**. Nothing in this file is implemented yet.
Branch: `stakeholder-batch-1`. Written 2026-10-04.

## Where the code stands today

- **One global seat map.** `public.venue_seats` has 503 rows. `seat_identifier` is globally UNIQUE and `zone` is one of `premium | general | limited_view` (a CHECK constraint). `src/config/theaterLayout.ts` must produce *byte-identical* identifiers. A count assertion runs on both sides.
- **Prices are per showtime per zone.** `showtime_seat_prices(showtime_id, zone)` uses the same 3-zone CHECK. `seat_face_prices()` (20261004120000) is the single pricing rule.
- **Every ticket is a `booking_seats` row.** It has a `UNIQUE (showtime_id, seat_number)` constraint, a per-seat `ticket_token` (the QR), and per-seat `checked_in_at`. The check-in, QR tickets, emails, manifest, occupancy overlays and `showtime_availability` all read `booking_seats`.
- **Row P** has `P-01..P-30` (limited_view) plus the 4 wheelchair spaces `P-WC1..P-WC4` at its ends.
- **Capacity** is `productions.total_tickets_capacity` (default 500) minus booked `booking_seats` rows (the `showtime_availability` view).

## Recommended order

1. **5a: layouts schema.** A default layout equal to today's map. Every existing showtime points at it, so nothing visible changes.
2. **4: Standing Room** as a capacity zone of a new layout (or of the default, if the stakeholder wants it everywhere).
3. **5b: admin layout editor + picker** in the showtime editor.

Building item 4 first on the hard-coded 3-zone model means building it twice, because zones need to become data for item 5 anyway.

---

## 5a. Layouts schema (data model)

The physical chairs don't move, so a **layout is a zoning of the same physical seats, plus optional standing areas**. It is not a separate building.

```
seat_layouts      (id, name, description, is_default bool, archived bool, created_at)
layout_zones      (layout_id, zone_key text, label, color, kind 'seated'|'standing',
                   capacity int NULL  -- standing only
                   sort_order, PRIMARY KEY (layout_id, zone_key))
layout_seat_zones (layout_id, seat_identifier → venue_seats, zone_key, sellable bool,
                   PRIMARY KEY (layout_id, seat_identifier))
showtimes.layout_id uuid NOT NULL DEFAULT <default layout>  -- FK
```

- **Migration seeds the default layout:** layout "Mamiya standard", zones premium / general / limited_view with today's labels and colors, and one `layout_seat_zones` row per current `venue_seats` row. It then sets every showtime's `layout_id` to it. **All existing showtimes keep their current map.**
- `venue_seats` keeps the physical facts: identifier, row, col, accessible, and venue-level `status` (broken/blocked). `venue_seats.zone` stays as the default layout's copy until 5b ships, then is deprecated.
- `showtime_seat_prices.zone` drops its 3-value CHECK and gains a FK to `layout_zones (layout_id, zone_key)` through the showtime's layout.
- `seat_face_prices()` joins `layout_seat_zones` on the showtime's layout instead of reading `venue_seats.zone`. That one function change carries through to `create_pending_booking`, `create_box_office_booking` and fees.
- **Client:** a new RPC `get_showtime_layout(showtime_id)` returns zones and seat-to-zone mappings. `theaterLayout.ts` stays as the geometry (rows/cols) and the offline fallback for the default layout. `seatZoneById` and `ZONE_META` become per-layout values passed down instead of module constants. Touches: SeatSelectionScreen, CheckoutScreen, SeatGrid, BoxOffice, SeatMapSection.

## 4. Standing Room (replaces Row P, capacity 40)

**Model.** A layout zone with `kind = 'standing'` and `capacity = 40`. It's drawn as one rectangle where Row P was, labelled "Standing Room · N left". Tapping it adds one standing ticket (+/− stepper), and it shows **Full** at 40.

**How a standing ticket is stored (recommended).** The booking RPC allocates the next free *internal* slot `SR-01..SR-40` as a `booking_seats` row, under the existing showtime row lock. The buyer never picks or sees a number; every UI shows "Standing".
- **Why this instead of a separate counter column:** capacity can't drift or oversell. The unique `(showtime_id, seat_number)` constraint and the fixed 40 slot ids enforce it, and a cancelled or expired hold frees its slot automatically through the existing cascade delete.
- **What still works unchanged:** per-ticket QR, check-in, emails, manifest ("Standing" column), occupancy, `showtime_availability` and the promo-code ticket counts.
- **Buyer-facing behaviour** is exactly "a count of 40 decrements".

**RPC changes.** `create_pending_booking` and `create_box_office_booking` take `p_standing int DEFAULT 0` next to `p_seats`. They:
- check `p_standing ≤ capacity − taken`
- add the standing zone's price per ticket to `seat_face_prices` (so promo discount → fees → snapshot all apply)
- count standing tickets in `num_tickets`, the per-order cap and promo `used_tickets`.

**Migration.**
- Retire `P-01..P-30`: mark them `sellable = false` in the new layout. Rows aren't deleted, because historical tickets and QR codes print seat labels.
- **Refuse to apply** if any paid/reserved booking for a *future* showtime holds a Row P seat, and list those bookings so the box office can reseat them first.

**UI.**
- SeatGrid gets a `StandingArea` rectangle (zone color, remaining/Full, stepper).
- The seat-map availability overlay shows remaining-of-40.
- Checkout lines read "2 × Standing Room".
- BoxOffice walk-up gets a standing stepper.
- The manifest already prints "Standing" for seatless tickets (`src/lib/manifest.ts`).

## 5b. Admin: layouts editor + showtime picker

- **Seat Map → Layouts tab.** List and duplicate layouts. Edit one by painting zones onto the physical grid (pick a zone, click or drag seats), mark seats not sellable, and add/resize a standing area with its capacity. Templates: Premium / General / Standing Room.
- **Showtime editor:** a "Layout" select, which defaults to the production's last-used layout. Zone price inputs are generated from the selected layout's zones, not the fixed three.
- **Changing a showtime's layout after sales start is blocked** if any sold seat would change zone or become unsellable. The editor lists those seats.

## Tests (planned)

- **PGlite:**
  - The default layout reproduces today's prices to the cent.
  - Standing: 40 sold → the 41st is refused, and concurrent holds can't oversell.
  - A cancelled hold frees a slot.
  - Fees and promo codes apply to standing tickets.
  - The migration refuses when a future Row P booking exists.
- **Jest:** layout-driven SeatGrid (zones from data), the standing stepper / Full state, the manifest "Standing" column, and the showtime layout picker.

## ⚠ Questions for the stakeholder (needed before coding)

1. **Row P wheelchair spaces (P-WC1..4).** Keep them as accessible spaces beside the standing area? (Recommended. Removing them may affect accessibility obligations.)
2. **Standing price.** Its own per-showtime price, like the other zones? Do standing tickets carry the per-ticket fees? (Under the current rule, yes if priced > $0.)
3. **Total capacity.** Retiring 30 seats and adding 40 standing gives 473 seats + 40 standing = 513, but `total_tickets_capacity` defaults to 500. Is the house cap 513, or 500?
4. **Standing everywhere?** Is Standing Room part of every show (default layout), or only shows that pick a layout with it?
5. **Layouts scope.** Do layouts only re-zone the fixed chairs and add standing areas (this plan), or must they also add or remove physical seats (e.g. a thrust stage)? The second is a bigger change to `venue_seats`.

Estimated size: 5a ≈ 1 migration + 1 RPC + client refactor of 5 screens. 4 ≈ 1 migration + 2 RPC changes + SeatGrid/BoxOffice UI. 5b ≈ 1 admin screen + showtime editor changes.

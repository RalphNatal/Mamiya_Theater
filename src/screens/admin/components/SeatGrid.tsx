import React, { useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, Platform, Pressable } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { createStyles } from '../../../theme';
import { useResponsive } from '../../../theme/useResponsive';
import { ZONE_META, theaterSeatGrid, type Zone } from '../../../config/theaterLayout';
import { B } from '../shared/brand';
import PinchZoomStage from '../../../components/PinchZoomStage';

// ── Seat-map track width ─────────────────────────────────────────────────────
// The map column is given this as an EXPLICIT width, which is the whole reason
// it both centers and scrolls. A fixed-width block is independent of the
// viewport: in portrait it stays 1232px wide so the scroller has real overflow
// to pan, and on a wide screen justifyContent centers the block. Sizing the
// column with flexGrow / stretch instead makes react-native-web resolve its
// width against the viewport, which clamps the map and leaves nothing to
// scroll. Widest row (35) sets the track; alignItems:'center' on the column
// centers the shorter rows within it, which is what draws the trapezoid.
// These constants MUST stay in lock-step with the styles at the bottom.
const SEAT_W = 28;       // sg.seat.width
const SEAT_GAP = 6;      // sg.rowSeats.gap
const ROW_LABEL_W = 14;  // sg.rowLabel.width (one at each end)
const ROW_GAP = 10;      // sg.row.gap (label↔seats, on both sides)
// From the rendered grid, not ROW_SPECS: row P is 30 seats PLUS 4 wheelchair
// spaces, so seats.length is the only count that matches what's on screen.
const WIDEST_ROW_SEATS = Math.max(...theaterSeatGrid.map(r => r.seats.length));
const MAP_W =
  ROW_LABEL_W * 2 + ROW_GAP * 2 + WIDEST_ROW_SEATS * SEAT_W + (WIDEST_ROW_SEATS - 1) * SEAT_GAP;

// ── Web-only touch guard ─────────────────────────────────────────────────────
// The grid sits inside the admin shell's vertical scroller. On a touch device
// the browser can hand a horizontal drag to that ancestor, stealing the pan.
// touchAction:'pan-x' claims horizontal drags for THIS scroller (vertical ones
// still fall through, so the page keeps scrolling); overscrollBehaviorX stops a
// pan that hits either end becoming a browser back-swipe. Web-only so the
// native RN builds are untouched.
const WEB_HSCROLL: any = Platform.OS === 'web'
  ? { touchAction: 'pan-x', overscrollBehaviorX: 'contain', WebkitOverflowScrolling: 'touch' }
  : null;

export type AdminShowtime = {
  id: string;
  production_id: string;
  start_time: string;
  price: number;
  available_seats: number;
  productions: { title: string } | null;
};

export type VenueSeat = {
  seat_identifier: string;
  row_label: string;
  col_number: number;
  is_accessible: boolean;
  status: 'available' | 'blocked' | 'broken';
  zone: Zone;
};

export type SeatTone = 'available' | 'selected' | 'booked' | 'blocked' | 'broken';

// Per-showtime dynamic state, keyed by seat_identifier. The seat GEOMETRY (row,
// number, zone, wheelchair) comes from theaterSeatGrid; this overlays only what
// changes per performance. A seat with no overlay entry is a plain available seat.
export type SeatOverlay = { tone: SeatTone; selectable: boolean; isAccessible: boolean };

export const SEAT_TONE_STYLE: Record<SeatTone, { bg: string; border: string; fg: string }> = {
  available: { bg: B.white,   border: B.border, fg: B.txt2  },
  selected:  { bg: B.red,     border: B.red,    fg: B.white },
  booked:    { bg: B.txtMu,   border: B.txt2,   fg: B.white },
  blocked:   { bg: B.amberBg, border: B.amber,  fg: B.amber },
  broken:    { bg: B.roseBg,  border: B.rose,   fg: B.rose  },
};

export const SeatGrid = ({ overlay, selected, onPaint }: {
  overlay: Map<string, SeatOverlay>;   // per-showtime state, keyed by seat_identifier
  selected: Set<string>;               // currently painted seats, by seat_identifier
  onPaint: (identifier: string, nextSelected: boolean) => void;
}) => {
  const draggingRef = useRef(false);
  const paintModeRef = useRef(true);
  const [scrollW, setScrollW] = useState(0);
  const suppressPressRef = useRef(false);
  // Phone band swaps the horizontal scroller for a fit-to-width pinch-zoom
  // canvas. Mouse drag-paint is desktop-only either way; on mobile a one-finger
  // drag pans and per-seat tapping is the selection model.
  const { isMobile } = useResponsive();

  useEffect(() => {
    const stop = () => { draggingRef.current = false; };
    const w = (globalThis as any).window;
    w?.addEventListener?.('mouseup', stop);
    return () => w?.removeEventListener?.('mouseup', stop);
  }, []);

  const handleDown = (id: string, selectable: boolean, isSelected: boolean) => {
    if (!selectable) return;
    draggingRef.current = true;
    paintModeRef.current = !isSelected;
    suppressPressRef.current = true;
    onPaint(id, paintModeRef.current);
  };
  const handleEnter = (id: string, selectable: boolean) => {
    if (!draggingRef.current || !selectable) return;
    onPaint(id, paintModeRef.current);
  };

  const handlePress = (id: string, selectable: boolean, isSelected: boolean) => {
    if (suppressPressRef.current) { suppressPressRef.current = false; return; }
    if (!selectable) return;
    onPaint(id, !isSelected);
  };

  // Same fixed-width MAP_W block either way; only the frame differs. Desktop
  // keeps the horizontal scroller the drag-paint is built around; mobile gets
  // the pinch-zoom canvas, which opens fit-to-width so the whole map is visible
  // and no ancestor scroller can steal the gesture.
  const frameGrid = (grid: React.ReactNode) =>
    isMobile ? (
      <PinchZoomStage contentWidth={MAP_W}>{grid}</PinchZoomStage>
    ) : (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator
        onLayout={e => setScrollW(e.nativeEvent.layout.width)}
        style={[sg.scroller, WEB_HSCROLL]}
        contentContainerStyle={sg.scrollContent}
      >
        {grid}
      </ScrollView>
    );

  return (
    <View>
      <View style={sg.screenBar}><Text style={sg.screenBarText}>STAGE</Text></View>
      {frameGrid(
        <View style={[sg.grid, { width: MAP_W }] as any}>
          {theaterSeatGrid.map(row => (
            <View key={row.rowId} style={sg.row}>
              <Text style={sg.rowLabel}>{row.rowId}</Text>
              <View style={sg.rowSeats}>
                {row.seats.map(seat => {
                  const o = overlay.get(seat.id) ?? { tone: 'available' as SeatTone, selectable: true, isAccessible: false };
                  const isAccessible = seat.isAccessible || o.isAccessible;
                  const isSelected = selected.has(seat.id);
                  const tone = isSelected ? 'selected' : o.tone;
                  const c = SEAT_TONE_STYLE[tone];

                  const zoneTint = !isSelected && o.tone === 'available' ? ZONE_META[seat.zone] : null;
                  const bg = zoneTint ? zoneTint.color : c.bg;
                  const border = zoneTint ? zoneTint.color : c.border;
                  const fg = zoneTint ? zoneTint.textColor : c.fg;

                  const zoneLabel = ZONE_META[seat.zone].label;
                  const a11yLabel = seat.id.includes('WC')
                    ? `Wheelchair space, ${zoneLabel}, ${tone}`
                    : `Seat ${seat.row}${seat.seatNumber}, ${zoneLabel}${isAccessible ? ', wheelchair accessible' : ''}, ${tone}`;
                  return (
                    <Pressable
                      key={seat.id}
                      style={[sg.seat, { backgroundColor: bg, borderColor: border }, { cursor: o.selectable ? 'pointer' : 'default' } as any]}
                      accessibilityRole="button"
                      accessibilityLabel={a11yLabel}
                      accessibilityState={{ selected: isSelected, disabled: !o.selectable }}
                      onPress={() => handlePress(seat.id, o.selectable, isSelected)}
                      {...(isMobile ? {} : ({ onMouseDown: () => handleDown(seat.id, o.selectable, isSelected), onMouseEnter: () => handleEnter(seat.id, o.selectable) } as any))}
                    >
                      {isAccessible ? (
                        <Icon name="accessibility" size={12} color={fg} accessible={false} />
                      ) : (
                        <Text style={[sg.seatText, { color: fg }]}>{seat.seatNumber}</Text>
                      )}
                    </Pressable>
                  );
                })}
              </View>
              <Text style={sg.rowLabel}>{row.rowId}</Text>
            </View>
          ))}
        </View>
      )}
      {/* Desktop-only overflow hint — the mobile canvas opens fit-to-width and
          carries its own pinch/drag hint. */}
      {!isMobile && scrollW > 0 && MAP_W > scrollW && <Text style={sg.swipeHint}>Swipe to see more seats →</Text>}
    </View>
  );
};

export const SeatLegend = ({ items }: { items: { color: string; border: string; label: string; icon?: boolean }[] }) => (
  <View style={sg.legendRow}>
    {items.map(it => (
      <View key={it.label} style={sg.legendItem}>
        <View style={[sg.legendSwatch, { backgroundColor: it.color, borderColor: it.border }]}>
          {it.icon && <Icon name="accessibility" size={9} color={it.border} />}
        </View>
        <Text style={sg.legendText}>{it.label}</Text>
      </View>
    ))}
  </View>
);

export const sg = createStyles({
  screenBar: {
    alignSelf: 'center', backgroundColor: B.bg, borderRadius: 4,
    paddingVertical: 5, paddingHorizontal: 56, marginBottom: 18, borderWidth: 1, borderColor: B.border,
  },
  screenBarText: { color: B.txtMu, fontSize: 10, fontWeight: '800', letterSpacing: 2 },
  scroller: { width: '100%', maxWidth: '100%', alignSelf: 'stretch' },
  scrollContent: { flexGrow: 1, justifyContent: 'center', paddingBottom: 6 },
  grid: { gap: 7, paddingBottom: 6, userSelect: 'none', alignItems: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  rowLabel: { width: 14, color: B.txtMu, fontSize: 11, fontWeight: '700', textAlign: 'center' },
  rowSeats: { flexDirection: 'row', gap: 6 },
  seat: {
    width: 28, height: 28, borderRadius: 6, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  seatText: { fontSize: 10, fontWeight: '700' },
  swipeHint: { color: B.txtMu, fontSize: 11, fontWeight: '600', textAlign: 'center', marginTop: 2 },
  legendRow: { flexDirection: 'row', gap: 18, marginTop: 18, flexWrap: 'wrap' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  legendSwatch: { width: 14, height: 14, borderRadius: 4, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  legendText: { fontSize: 12, color: B.txt2 },
});

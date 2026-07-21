import React, { useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { createStyles } from '../../../theme';
import { ZONE_META, theaterSeatGrid, type Zone } from '../../../config/theaterLayout';
import { B } from '../shared/brand';

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
  const paintModeRef = useRef(true); // true = selecting, false = deselecting

  // Grid-fit check. justifyContent:'center' on a horizontal scroller's content
  // container pins overflowing content and kills panning on RNW, so we only
  // center once we've measured that the grid actually fits the viewport.
  const [scrollW, setScrollW] = useState(0);
  const [gridW, setGridW] = useState(0);
  const gridFits = gridW > 0 && scrollW > 0 && gridW <= scrollW;

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
    onPaint(id, paintModeRef.current);
  };
  const handleEnter = (id: string, selectable: boolean) => {
    if (!draggingRef.current || !selectable) return;
    onPaint(id, paintModeRef.current);
  };

  return (
    <View>
      <View style={sg.screenBar}><Text style={sg.screenBarText}>STAGE</Text></View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator
        onLayout={e => setScrollW(e.nativeEvent.layout.width)}
        contentContainerStyle={[sg.scrollBase, gridFits && sg.scrollCenter]}
      >
        <View style={sg.grid as any} onLayout={e => setGridW(e.nativeEvent.layout.width)}>
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
                  // An AVAILABLE seat is tinted by its price zone; every other
                  // state (selected / booked / blocked / broken) keeps its tone
                  // colour so those stay unmistakable.
                  const zoneTint = !isSelected && o.tone === 'available' ? ZONE_META[seat.zone] : null;
                  const bg = zoneTint ? zoneTint.color : c.bg;
                  const border = zoneTint ? zoneTint.color : c.border;
                  const fg = zoneTint ? zoneTint.textColor : c.fg;
                  // Spell each seat's identity + state for screen readers, mirroring
                  // the public picker's a11yLabel (here `tone` is the admin state).
                  const zoneLabel = ZONE_META[seat.zone].label;
                  const a11yLabel = seat.id.includes('WC')
                    ? `Wheelchair space, ${zoneLabel}, ${tone}`
                    : `Seat ${seat.row}${seat.seatNumber}, ${zoneLabel}${isAccessible ? ', wheelchair accessible' : ''}, ${tone}`;
                  return (
                    <View
                      key={seat.id}
                      style={[sg.seat, { backgroundColor: bg, borderColor: border }, { cursor: o.selectable ? 'pointer' : 'default' } as any]}
                      accessibilityRole="button"
                      accessibilityLabel={a11yLabel}
                      accessibilityState={{ selected: isSelected, disabled: !o.selectable }}
                      {...({ onMouseDown: () => handleDown(seat.id, o.selectable, isSelected), onMouseEnter: () => handleEnter(seat.id, o.selectable) } as any)}
                    >
                      {isAccessible ? (
                        <Icon name="accessibility" size={12} color={fg} accessible={false} />
                      ) : (
                        <Text style={[sg.seatText, { color: fg }]}>{seat.seatNumber}</Text>
                      )}
                    </View>
                  );
                })}
              </View>
              <Text style={sg.rowLabel}>{row.rowId}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
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
  // Center the whole trapezoid when it fits, pan when it doesn't (mirrors the
  // public picker's horizontal scroller).
  scrollBase: { flexGrow: 1 },
  scrollCenter: { justifyContent: 'center' },
  grid: { gap: 7, paddingBottom: 6, userSelect: 'none', alignItems: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  rowLabel: { width: 14, color: B.txtMu, fontSize: 11, fontWeight: '700', textAlign: 'center' },
  rowSeats: { flexDirection: 'row', gap: 6 },
  seat: {
    width: 28, height: 28, borderRadius: 6, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  seatText: { fontSize: 10, fontWeight: '700' },
  legendRow: { flexDirection: 'row', gap: 18, marginTop: 18, flexWrap: 'wrap' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  legendSwatch: { width: 14, height: 14, borderRadius: 4, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  legendText: { fontSize: 12, color: B.txt2 },
});

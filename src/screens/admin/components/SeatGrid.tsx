import React, { useEffect, useRef } from 'react';
import { View, Text, ScrollView } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { createStyles } from '../../../theme';
import { B } from '../shared/brand';

export const SEAT_ROW_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];

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
};

export type SeatTone = 'available' | 'selected' | 'booked' | 'blocked' | 'broken';

export type SeatCell = {
  identifier: string;
  rowLabel: string;
  colNumber: number;
  isAccessible: boolean;
  tone: SeatTone;     // base colour; ignored while selected
  selected: boolean;
  selectable: boolean;
};

export const SEAT_TONE_STYLE: Record<SeatTone, { bg: string; border: string; fg: string }> = {
  available: { bg: B.white,   border: B.border, fg: B.txt2  },
  selected:  { bg: B.red,     border: B.red,    fg: B.white },
  booked:    { bg: B.txtMu,   border: B.txt2,   fg: B.white },
  blocked:   { bg: B.amberBg, border: B.amber,  fg: B.amber },
  broken:    { bg: B.roseBg,  border: B.rose,   fg: B.rose  },
};

export const SeatGrid = ({ seats, onPaint }: {
  seats: SeatCell[];
  onPaint: (identifier: string, nextSelected: boolean) => void;
}) => {
  const draggingRef = useRef(false);
  const paintModeRef = useRef(true); // true = selecting, false = deselecting

  useEffect(() => {
    const stop = () => { draggingRef.current = false; };
    const w = (globalThis as any).window;
    w?.addEventListener?.('mouseup', stop);
    return () => w?.removeEventListener?.('mouseup', stop);
  }, []);

  const rows = SEAT_ROW_LABELS
    .map(rl => ({ rowLabel: rl, cells: seats.filter(c => c.rowLabel === rl).sort((a, b) => a.colNumber - b.colNumber) }))
    .filter(r => r.cells.length > 0);

  const handleDown = (cell: SeatCell) => {
    if (!cell.selectable) return;
    draggingRef.current = true;
    paintModeRef.current = !cell.selected;
    onPaint(cell.identifier, paintModeRef.current);
  };
  const handleEnter = (cell: SeatCell) => {
    if (!draggingRef.current || !cell.selectable) return;
    onPaint(cell.identifier, paintModeRef.current);
  };

  return (
    <View>
      <View style={sg.screenBar}><Text style={sg.screenBarText}>STAGE</Text></View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={sg.grid as any}>
          {rows.map(row => (
            <View key={row.rowLabel} style={sg.row}>
              <Text style={sg.rowLabel}>{row.rowLabel}</Text>
              <View style={sg.rowSeats}>
                {row.cells.map(cell => {
                  const tone = cell.selected ? 'selected' : cell.tone;
                  const c = SEAT_TONE_STYLE[tone];
                  return (
                    <View
                      key={cell.identifier}
                      style={[sg.seat, { backgroundColor: c.bg, borderColor: c.border }, { cursor: cell.selectable ? 'pointer' : 'default' } as any]}
                      {...({ onMouseDown: () => handleDown(cell), onMouseEnter: () => handleEnter(cell) } as any)}
                    >
                      {cell.isAccessible ? (
                        <Icon name="accessibility" size={12} color={c.fg} />
                      ) : (
                        <Text style={[sg.seatText, { color: c.fg }]}>{cell.colNumber}</Text>
                      )}
                    </View>
                  );
                })}
              </View>
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
  grid: { gap: 7, paddingBottom: 6, userSelect: 'none' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
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

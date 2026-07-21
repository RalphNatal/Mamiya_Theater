import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, Platform, useWindowDimensions } from 'react-native';
import { createStyles } from '../theme';

// The RN tsconfig has no `dom` lib, so the browser's PointerEvent/HTMLElement
// globals aren't in scope (and RN's own `PointerEvent` type is a different
// shape). Describe just the surface we touch; the DOM node itself stays `any`.
type PtrEvt = {
  pointerId: number;
  clientX: number;
  clientY: number;
  preventDefault: () => void;
};
type Pt = { x: number; y: number };

type Props = {
  /** Unscaled pixel width of the content (the fixed MAP_W block). */
  contentWidth: number;
  children: React.ReactNode;
  /** Largest zoom-in factor relative to natural size. */
  maxScale?: number;
};

/**
 * Mobile/web pinch-zoom + pan canvas that opens scaled to fit `contentWidth`
 * to the viewport width, so the whole map is visible on load. We own all
 * pointer input inside a `touch-action: none` box, so no ancestor scroller can
 * steal the gesture — which is why this works where a nested horizontal
 * ScrollView did not. Taps fall through to the children (we never preventDefault
 * a stationary press), so seat selection/booking is unchanged at any zoom/pan.
 *
 * Transform model is translate-then-scale with transform-origin: top left, so a
 * content point (px,py) lands at screen (x + px*scale, y + py*scale). The pan
 * and pinch anchor math below assumes exactly that order.
 *
 * Caller should only mount this on mobile web; on desktop keep the ScrollView.
 */
export default function PinchZoomStage({ contentWidth, children, maxScale = 1.5 }: Props) {
  const { height: winH } = useWindowDimensions();
  const viewportH = Math.max(320, Math.min(560, Math.round(winH * 0.6)));

  const clipRef = useRef<any>(null);                  // underlying DOM node on web
  const [vp, setVp] = useState({ w: 0, h: viewportH });
  const [content, setContent] = useState({ w: contentWidth, h: 0 });
  const [t, setT] = useState({ x: 0, y: 0, scale: 1 });
  const tRef = useRef(t); tRef.current = t;
  const fitRef = useRef(1);                           // current min (fit-to-width) scale

  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  const lastPan = useRef<{ x: number; y: number } | null>(null);
  const lastDist = useRef(0);
  const lastMid = useRef({ x: 0, y: 0 });

  // Keep content-width in sync if the prop changes.
  useEffect(() => { setContent(c => ({ ...c, w: contentWidth })); }, [contentWidth]);

  const clamp = useCallback((nx: number, ny: number, scale: number) => {
    const sw = content.w * scale;
    const sh = content.h * scale;
    let x = nx, y = ny;
    if (sw <= vp.w) x = (vp.w - sw) / 2;               // center-lock if narrower than viewport
    else x = Math.min(0, Math.max(vp.w - sw, nx));     // otherwise keep edges within view
    if (sh <= vp.h) y = (vp.h - sh) / 2;
    else y = Math.min(0, Math.max(vp.h - sh, ny));
    return { x, y };
  }, [content.w, content.h, vp.w, vp.h]);

  const fitToView = useCallback(() => {
    if (!vp.w || !content.w) return;
    const scale = vp.w / content.w;                    // fill width
    fitRef.current = scale;
    const scaledH = content.h * scale;
    setT({ x: 0, y: Math.max(0, (vp.h - scaledH) / 2), scale });
  }, [vp.w, vp.h, content.w, content.h]);

  useEffect(() => { fitToView(); }, [fitToView]);

  const zoomAbout = useCallback((factor: number, mx: number, my: number) => {
    const cur = tRef.current;
    const next = Math.max(fitRef.current, Math.min(maxScale, cur.scale * factor));
    const cx = (mx - cur.x) / cur.scale;
    const cy = (my - cur.y) / cur.scale;
    const { x, y } = clamp(mx - cx * next, my - cy * next, next);
    setT({ x, y, scale: next });
  }, [clamp, maxScale]);

  const zoomButton = (factor: number) => zoomAbout(factor, vp.w / 2, vp.h / 2);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const el: any = clipRef.current;
    if (!el || !el.addEventListener) return;
    el.style.touchAction = 'none';

    const rel = (e: PtrEvt): Pt => {
      const r = el.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
    const mid = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    let lastTapT = 0;

    const onDown = (e: PtrEvt) => {
      pointers.current.set(e.pointerId, rel(e));
      if (pointers.current.size === 1) {
        lastPan.current = rel(e);
      } else if (pointers.current.size === 2) {
        const [p1, p2] = [...pointers.current.values()];
        lastDist.current = dist(p1, p2);
        lastMid.current = mid(p1, p2);
        try { el.setPointerCapture(e.pointerId); } catch {}
      }
    };

    const onMove = (e: PtrEvt) => {
      if (!pointers.current.has(e.pointerId)) return;
      const p = rel(e);
      pointers.current.set(e.pointerId, p);
      const cur = tRef.current;

      if (pointers.current.size === 1 && lastPan.current) {
        const dx = p.x - lastPan.current.x;
        const dy = p.y - lastPan.current.y;
        if (Math.abs(dx) + Math.abs(dy) > 4) {         // it's a drag, not a tap
          e.preventDefault();
          try { el.setPointerCapture(e.pointerId); } catch {}
          const { x, y } = clamp(cur.x + dx, cur.y + dy, cur.scale);
          setT({ x, y, scale: cur.scale });
          lastPan.current = p;
        }
      } else if (pointers.current.size >= 2) {
        e.preventDefault();
        const [p1, p2] = [...pointers.current.values()];
        const d = dist(p1, p2);
        const m = mid(p1, p2);
        if (lastDist.current > 0) {
          const next = Math.max(fitRef.current, Math.min(maxScale, cur.scale * (d / lastDist.current)));
          const cx = (lastMid.current.x - cur.x) / cur.scale;
          const cy = (lastMid.current.y - cur.y) / cur.scale;
          const { x, y } = clamp(m.x - cx * next, m.y - cy * next, next);
          setT({ x, y, scale: next });
        }
        lastDist.current = d;
        lastMid.current = m;
      }
    };

    const onUp = (e: PtrEvt) => {
      const had = pointers.current.size;
      pointers.current.delete(e.pointerId);
      try { el.releasePointerCapture(e.pointerId); } catch {}
      if (pointers.current.size < 2) lastDist.current = 0;
      lastPan.current = pointers.current.size === 1 ? [...pointers.current.values()][0] : null;

      // Double-tap to toggle zoom (fit <-> ~1x), single finger only.
      if (had === 1) {
        const now = Date.now();
        if (now - lastTapT < 300) {
          const p = rel(e);
          const nearFit = tRef.current.scale <= fitRef.current * 1.05;
          zoomAbout(nearFit ? (1 / fitRef.current) : (fitRef.current / tRef.current.scale), p.x, p.y);
          lastTapT = 0;
        } else {
          lastTapT = now;
        }
      }
      // A stationary single tap was never preventDefault'd, so the browser
      // dispatches click to the seat under the finger → onPress fires normally.
    };

    el.addEventListener('pointerdown', onDown, { passive: false });
    el.addEventListener('pointermove', onMove, { passive: false });
    el.addEventListener('pointerup', onUp, { passive: false });
    el.addEventListener('pointercancel', onUp, { passive: false });
    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
    };
  }, [clamp, zoomAbout, maxScale]);

  return (
    <View style={pz.wrap}>
      <View
        ref={clipRef}
        onLayout={e => setVp(v => ({ ...v, w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height }))}
        style={[pz.clip, { height: viewportH }]}
      >
        <View
          onLayout={e => setContent(c => ({ ...c, h: e.nativeEvent.layout.height || c.h }))}
          style={{
            position: 'absolute', left: 0, top: 0, width: content.w,
            transformOrigin: 'top left',
            transform: [{ translateX: t.x }, { translateY: t.y }, { scale: t.scale }],
          } as any}
        >
          {children}
        </View>
      </View>

      <View style={pz.controls} pointerEvents="box-none">
        <Pressable onPress={() => zoomButton(1.3)} style={pz.btn} accessibilityRole="button" accessibilityLabel="Zoom in">
          <Text style={pz.btnTxt}>＋</Text>
        </Pressable>
        <Pressable onPress={() => zoomButton(1 / 1.3)} style={pz.btn} accessibilityRole="button" accessibilityLabel="Zoom out">
          <Text style={pz.btnTxt}>－</Text>
        </Pressable>
        <Pressable onPress={fitToView} style={pz.btn} accessibilityRole="button" accessibilityLabel="Fit whole map to screen">
          <Text style={pz.btnTxtSm}>Fit</Text>
        </Pressable>
      </View>

      <Text style={pz.hint}>Pinch to zoom · drag to pan · tap a seat to select</Text>
    </View>
  );
}

const pz = createStyles({
  wrap: { position: 'relative', width: '100%' },
  clip: {
    width: '100%', overflow: 'hidden', position: 'relative',
    borderRadius: 8, backgroundColor: 'transparent',
  },
  controls: { position: 'absolute', right: 8, top: 8, flexDirection: 'row', gap: 6 },
  btn: {
    width: 34, height: 34, borderRadius: 8, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(20,20,20,0.82)', borderWidth: 1, borderColor: '#3a3a3a',
  },
  btnTxt: { color: '#fff', fontSize: 18, fontWeight: '800', lineHeight: 20 },
  btnTxtSm: { color: '#fff', fontSize: 12, fontWeight: '700' },
  hint: { color: '#666', fontSize: 11, fontWeight: '600', textAlign: 'center', marginTop: 6 },
});

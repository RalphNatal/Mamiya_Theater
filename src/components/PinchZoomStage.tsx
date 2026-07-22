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
// Per-pointer state: `x`/`y` are element-relative (used by the pinch math);
// `cx`/`cy` are client/screen coords (used by the one-finger drag routing, so
// scrolling the page under the finger can't feed back into the delta).
type PtrState = { x: number; y: number; cx: number; cy: number };

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
 * One-finger drags are routed by intent so the page never stalls under the map:
 * we pan the map by the finger's vertical travel, then spill whatever the map
 * can't absorb (because it's center-locked at fit scale, or clamped at an edge
 * when zoomed) into the nearest scrollable ancestor via `scrollTop`. Because
 * `touch-action: none` also suppresses the browser's own scrolling, driving
 * that scroll ourselves is the only way the page moves while the finger is on
 * the map. Two-finger pinch is unchanged.
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

  const pointers = useRef<Map<number, PtrState>>(new Map());
  const lastPan = useRef<{ x: number; y: number } | null>(null);       // element-rel sentinel
  const lastPanClient = useRef<{ x: number; y: number } | null>(null); // client-coord anchor
  const lastDist = useRef(0);
  const lastMid = useRef({ x: 0, y: 0 });
  const dragging = useRef(false);                     // threshold exceeded this touch?
  const draggedSinceDown = useRef(false);             // did a real drag happen? (click guard)
  const scrollParent = useRef<any>(null);             // resolved page scroller for spill

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

    const doc: any = el.ownerDocument || (typeof document !== 'undefined' ? document : null);
    const win: any = doc && doc.defaultView;

    // Nearest ancestor whose computed overflow-y actually scrolls; else the
    // document scroller. This is where one-finger vertical spill goes.
    const findScrollParent = (node: any): any => {
      let n = node && node.parentElement;
      while (n && win) {
        const oy = win.getComputedStyle(n).overflowY;
        if ((oy === 'auto' || oy === 'scroll') && n.scrollHeight > n.clientHeight) return n;
        n = n.parentElement;
      }
      return doc && doc.scrollingElement ? doc.scrollingElement : null;
    };

    const rel = (e: PtrEvt): Pt => {
      const r = el.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
    const mid = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    let lastTapT = 0;

    const onDown = (e: PtrEvt) => {
      const r = rel(e);
      pointers.current.set(e.pointerId, { x: r.x, y: r.y, cx: e.clientX, cy: e.clientY });
      if (pointers.current.size === 1) {
        lastPan.current = r;
        lastPanClient.current = { x: e.clientX, y: e.clientY };
        dragging.current = false;
        draggedSinceDown.current = false;
        scrollParent.current = findScrollParent(el);
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
      pointers.current.set(e.pointerId, { x: p.x, y: p.y, cx: e.clientX, cy: e.clientY });
      const cur = tRef.current;

      if (pointers.current.size === 1 && lastPanClient.current) {
        // Measure in client coords so scrolling the page (which slides the clip
        // under the finger) can't feed back into the delta.
        const dx = e.clientX - lastPanClient.current.x;
        const dy = e.clientY - lastPanClient.current.y;
        if (!dragging.current && Math.abs(dx) + Math.abs(dy) <= 4) return; // still a candidate tap
        if (!dragging.current) {
          dragging.current = true;
          draggedSinceDown.current = true;
          try { el.setPointerCapture(e.pointerId); } catch {}
        }
        e.preventDefault();
        // Pan the map by the finger delta (clamped), then spill the vertical the
        // map couldn't absorb into the page scroller. At fit scale the map is
        // center-locked, so it absorbs nothing and the whole delta scrolls the
        // page; zoomed in, it pans until an edge and then spills.
        const target = clamp(cur.x + dx, cur.y + dy, cur.scale);
        if (target.x !== cur.x || target.y !== cur.y) {
          setT({ x: target.x, y: target.y, scale: cur.scale });
        }
        const spillY = dy - (target.y - cur.y);
        if (spillY !== 0 && scrollParent.current) {
          scrollParent.current.scrollTop -= spillY;   // finger down → page scrolls up
        }
        lastPan.current = p;
        lastPanClient.current = { x: e.clientX, y: e.clientY };
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
      if (pointers.current.size === 1) {
        // Dropping to one finger (pinch → drag): re-anchor to the survivor so the
        // next move computes a clean delta, and start a fresh drag phase.
        const rem = [...pointers.current.values()][0];
        lastPan.current = { x: rem.x, y: rem.y };
        lastPanClient.current = { x: rem.cx, y: rem.cy };
        dragging.current = false;
      } else {
        lastPan.current = null;
        lastPanClient.current = null;
      }

      // Double-tap to toggle zoom (fit <-> ~1x), single finger, stationary only.
      if (had === 1 && !draggedSinceDown.current) {
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
      // A drag's trailing click is swallowed by onClickCapture below.
    };

    // Swallow the click that fires after a real drag so a pan/page-scroll can
    // never select a seat by accident. Stationary taps leave the flag false.
    const onClickCapture = (ev: any) => {
      if (draggedSinceDown.current) {
        ev.preventDefault();
        ev.stopPropagation();
        draggedSinceDown.current = false;
      }
    };

    el.addEventListener('pointerdown', onDown, { passive: false });
    el.addEventListener('pointermove', onMove, { passive: false });
    el.addEventListener('pointerup', onUp, { passive: false });
    el.addEventListener('pointercancel', onUp, { passive: false });
    el.addEventListener('click', onClickCapture, true);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
      el.removeEventListener('click', onClickCapture, true);
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

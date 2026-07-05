import { StyleSheet, TextStyle, ViewStyle, ImageStyle } from 'react-native';

// ─────────────────────────────────────────────────────────
// CENTRAL THEME — single source of truth for typography and
// page layout across the whole app. Every screen/component
// imports from here so text and spacing stay consistent.
// ─────────────────────────────────────────────────────────

// One font family everywhere. Urbanist is loaded globally in
// public/index.html (Google Fonts, weights 400–900); the stack
// falls back to the system UI font while it loads.
export const FONT_FAMILY =
  "Urbanist, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

// Explicit weight scale (Urbanist ships 400/500/600/700/800/900).
export const WEIGHT = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
  extrabold: '800',
  black: '900',
} as const;

// Type scale — a ~1.33 modular ratio off the 14px body size:
//   caption 12 → body 14 → heading2 20 → heading1 28.
// Line heights are 1.3–1.5× the font size.
export const typography = StyleSheet.create({
  /** Heading1 — page / hero titles */
  heading1: {
    fontFamily: FONT_FAMILY,
    fontSize: 28,
    fontWeight: WEIGHT.extrabold,
    lineHeight: 36,
    letterSpacing: -0.5,
  },
  /** Heading2 — section & card titles */
  heading2: {
    fontFamily: FONT_FAMILY,
    fontSize: 20,
    fontWeight: WEIGHT.bold,
    lineHeight: 27,
    letterSpacing: -0.2,
  },
  /** BodyText — default copy, labels, inputs */
  body: {
    fontFamily: FONT_FAMILY,
    fontSize: 14,
    fontWeight: WEIGHT.regular,
    lineHeight: 21,
  },
  /** Caption / Subtext — hints, metadata, footnotes */
  caption: {
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    fontWeight: WEIGHT.medium,
    lineHeight: 17,
  },
});

// ─────────────────────────────────────────────────────────
// LAYOUT — fluid page containers instead of rigid widths.
// Content spans the full window up to a max, then centers,
// so large monitors get balanced margins instead of one
// giant dead zone on the right.
// ─────────────────────────────────────────────────────────
export const layout = {
  /** Max readable width for full pages (hero sections, dashboards). */
  maxContent: 1440,
  /** Max width for focused flows (checkout, seat map, forms). */
  maxFlow: 1280,

  /** Spread into any page-level container: fluid width, centered. */
  page: {
    width: '100%',
    maxWidth: 1440,
    alignSelf: 'center',
  } as ViewStyle,

  /** Narrower centered container for transactional flows. */
  flow: {
    width: '100%',
    maxWidth: 1280,
    alignSelf: 'center',
  } as ViewStyle,
} as const;

// ─────────────────────────────────────────────────────────
// COLOR TOKENS — accessible grays for text on DARK surfaces.
//
// Every gray here is verified to clear WCAG AA (4.5:1 for normal text) against
// the app's dark backgrounds (#0a0a0a scroll, #0f0f0f inputs/panels, #161616
// cards, #12122a chrome) — it lands at 5.2–5.7:1. It replaces the previous
// sub-AA low-grays (#555 ≈ 2.4:1, #666 ≈ 3.1:1, #777 ≈ 4.0:1). Brand red
// (#C8102E) and all layout are unchanged.
// ─────────────────────────────────────────────────────────
export const colors = {
  /** Brand red — unchanged; listed for reference only, do not alter. */
  brand: '#C8102E',
  /** Muted secondary / caption / small print AND input placeholders on DARK
   *  surfaces. DARK-ONLY: #8a8a8a does NOT meet AA on light backgrounds, so
   *  light screens keep their own darker grays (e.g. #333/#666 on white). */
  textMutedOnDark: '#8a8a8a',
} as const;

// Spacing scale (4px base) for proportional padding/gaps.
export const space = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

// ─────────────────────────────────────────────────────────
// createStyles — drop-in replacement for StyleSheet.create
// that injects FONT_FAMILY into every style that sets a text
// property, so no Text in the app can silently fall back to
// the platform default font. Styles that already declare a
// fontFamily (e.g. 'inherit' for raw DOM inputs) keep theirs.
// ─────────────────────────────────────────────────────────
type AnyStyle = ViewStyle | TextStyle | ImageStyle;
type NamedStyles<T> = { [P in keyof T]: AnyStyle };

const TEXT_KEYS: (keyof TextStyle)[] = [
  'fontSize', 'fontWeight', 'fontStyle', 'lineHeight',
  'letterSpacing', 'textTransform', 'textDecorationLine',
];

export function createStyles<T extends NamedStyles<T>>(styles: T): T {
  const themed = {} as Record<string, AnyStyle>;
  for (const key of Object.keys(styles) as (keyof T & string)[]) {
    const style = styles[key] as TextStyle;
    const isTextStyle = TEXT_KEYS.some(k => style[k] !== undefined);
    themed[key] = isTextStyle && style.fontFamily === undefined
      ? { fontFamily: FONT_FAMILY, ...style }
      : style;
  }
  return StyleSheet.create(themed as T);
}

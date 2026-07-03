import type { Screen } from '../types/navigation';

// ─────────────────────────────────────────────────────────────────────────────
// Dependency-free History-API router.
//
// The app has no routing library. This module is the single source of truth for
// the screen <-> URL path mapping so the hand-rolled switch in App.tsx can keep
// driving rendering while the browser URL, back/forward buttons, and deep links
// stay in sync. It is web-only by design: every caller in App.tsx guards
// `globalThis.history` / `globalThis.location` first, so on native (no window)
// none of this runs and the in-memory screen state behaves exactly as before.
//
// Route map (see App.tsx switch for the screen union):
//   /                                     home
//   /shows                                allshows
//   /shows/:productionId                  showdetails
//   /shows/:productionId/seats/:showtimeId  seatselection
//   /checkout                             checkout
//   /confirmation                         bookingconfirmation
//   /login                                login
//   /signup                               signup
//   /about                                about
//   /contact                              contact
//   /profile                              profile
//   /admin                                admin
//   /admin/login                          adminlogin
//
// The selected-seats array is intentionally NOT encoded in the URL — it stays in
// React state (per the routing brief). Only the ids that identify a page live in
// the path.
// ─────────────────────────────────────────────────────────────────────────────

export type RouteState = {
  screen: Screen;
  // `movieId` is the production id (kept named movieId to match the existing
  // OnNavigate signature and screen props). Null when the path carries no id.
  movieId: string | null;
  showtimeId: string | null;
};

// Parse the browser path into a screen + its path params. Anything we don't
// recognize (or a malformed parameterized path) falls back to Home / its nearest
// listing page so a bad URL can never render a broken screen.
export function pathToRoute(pathname: string): RouteState {
  const clean = (pathname || '/').replace(/\/+$/, '') || '/';
  const parts = clean.split('/').filter(Boolean); // '/shows/12/seats/3' -> ['shows','12','seats','3']
  const dec = (p: string) => {
    try {
      return decodeURIComponent(p);
    } catch {
      return p;
    }
  };
  const plain = (screen: Screen): RouteState => ({ screen, movieId: null, showtimeId: null });

  if (clean === '/') return plain('home');

  switch (parts[0]) {
    case 'shows':
      if (parts.length === 1) return plain('allshows');
      if (parts.length === 2) return { screen: 'showdetails', movieId: dec(parts[1]), showtimeId: null };
      if (parts.length === 4 && parts[2] === 'seats') {
        return { screen: 'seatselection', movieId: dec(parts[1]), showtimeId: dec(parts[3]) };
      }
      return plain('allshows');
    case 'checkout':
      return plain('checkout');
    case 'confirmation':
      return plain('bookingconfirmation');
    case 'login':
      return plain('login');
    case 'signup':
      return plain('signup');
    case 'about':
      return plain('about');
    case 'contact':
      return plain('contact');
    case 'profile':
      return plain('profile');
    case 'admin':
      return plain(parts[1] === 'login' ? 'adminlogin' : 'admin');
    default:
      return plain('home');
  }
}

// Inverse of pathToRoute: the canonical path for a screen. Screens that live
// under a parameterized path fall back to their nearest listing page when the
// required id is missing, so we never push a dead `/shows/undefined` URL.
export function routeToPath(
  screen: Screen,
  movieId?: string | null,
  showtimeId?: string | null,
): string {
  switch (screen) {
    case 'home':
      return '/';
    case 'allshows':
      return '/shows';
    case 'showdetails':
      return movieId ? `/shows/${encodeURIComponent(movieId)}` : '/shows';
    case 'seatselection':
      if (movieId && showtimeId) {
        return `/shows/${encodeURIComponent(movieId)}/seats/${encodeURIComponent(showtimeId)}`;
      }
      return movieId ? `/shows/${encodeURIComponent(movieId)}` : '/shows';
    case 'checkout':
      return '/checkout';
    case 'bookingconfirmation':
      return '/confirmation';
    case 'login':
      return '/login';
    case 'signup':
      return '/signup';
    case 'about':
      return '/about';
    case 'contact':
      return '/contact';
    case 'profile':
      return '/profile';
    case 'admin':
      return '/admin';
    case 'adminlogin':
      return '/admin/login';
    default:
      return '/';
  }
}

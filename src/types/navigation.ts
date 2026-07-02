export type Screen =
  | 'home'
  | 'login'
  | 'signup'
  | 'about'
  | 'profile'
  | 'contact'
  | 'admin'
  | 'adminlogin'
  | 'allshows'
  | 'showdetails'
  | 'seatselection'
  | 'checkout'
  | 'bookingconfirmation';

// `seats` carries the selected seat list from the seat picker to checkout;
// other screens ignore it.
export type OnNavigate = (
  screen: Screen,
  movieId?: string,
  showtimeId?: string,
  seats?: string[],
) => void;

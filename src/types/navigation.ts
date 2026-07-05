export type Screen =
  | 'home'
  | 'login'
  | 'signup'
  | 'about'
  | 'profile'
  | 'contact'
  | 'terms'
  | 'privacy'
  | 'admin'
  | 'adminlogin'
  | 'allshows'
  | 'showdetails'
  | 'seatselection'
  | 'checkout'
  | 'bookingconfirmation'
  | 'bookinglookup'
  | 'ticket';

export type OnNavigate = (
  screen: Screen,
  movieId?: string,
  showtimeId?: string,
  seats?: string[],
) => void;

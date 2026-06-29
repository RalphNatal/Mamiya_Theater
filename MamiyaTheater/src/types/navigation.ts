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
  | 'seatselection';

export type OnNavigate = (screen: Screen, movieId?: string, showtimeId?: string) => void;

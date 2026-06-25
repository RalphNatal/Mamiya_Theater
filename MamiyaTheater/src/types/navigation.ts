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
  | 'showdetails';

export type OnNavigate = (screen: Screen, movieId?: string) => void;

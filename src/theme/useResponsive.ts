import { useWindowDimensions } from 'react-native';
import { breakpoints } from './index';

// Shared responsive hook — reads the live window width and derives the app's
// three device bands off the central `breakpoints` token so screens don't each
// re-hardcode a cut-off. `isMobile` is the phone band (< md) that most of the
// mobile overrides key off of.
export const useResponsive = () => {
  const { width } = useWindowDimensions();
  return {
    width,
    isMobile: width < breakpoints.md,
    isTablet: width >= breakpoints.md && width < breakpoints.lg,
    isDesktop: width >= breakpoints.lg,
  };
};

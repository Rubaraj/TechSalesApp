import type { ColorTheme } from '../context/ThemeContext';

const DEFAULT_LOGO = 'https://www.exlservice.com/themes/exl_service/exl_logo_rgb_orange_pos_94.png';
// Public-folder placeholder logos. Vite serves these at the root path.
const CARRIER1_LOGO = '/carrier1-logo.svg';
const CARRIER2_LOGO = '/carrier2-logo.svg';

/**
 * Returns the logo URL based on the current color theme.
 * Falls back to the default logo when the theme has no branded asset.
 *
 * @param colorTheme - The current color theme ('default', 'carrier1', or 'carrier2')
 * @returns The URL or path to the logo image
 */
export function getLogoByTheme(colorTheme: ColorTheme): string {
  switch (colorTheme) {
    case 'carrier1':
      return CARRIER1_LOGO;
    case 'carrier2':
      return CARRIER2_LOGO;
    case 'default':
    default:
      return DEFAULT_LOGO;
  }
}

import type { ColorTheme } from '../context/ThemeContext';
import aetnaLogo from '../assets/aetna-logo.svg';
import humanaLogo from '../assets/humana-logo.svg';

const DEFAULT_LOGO = 'https://www.exlservice.com/themes/exl_service/exl_logo_rgb_orange_pos_94.png';

/**
 * Returns the logo URL based on the current color theme
 * @param colorTheme - The current color theme ('default', 'aetna', or 'humana')
 * @returns The URL or path to the logo image
 */
export function getLogoByTheme(colorTheme: ColorTheme): string {
  switch (colorTheme) {
    case 'aetna':
      return aetnaLogo;
    case 'humana':
      return humanaLogo;
    case 'default':
    default:
      return DEFAULT_LOGO;
  }
}

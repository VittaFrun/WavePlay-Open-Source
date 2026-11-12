import { createContext, useContext } from 'react';
import { accents, defaultAppearance, type Appearance } from './utils/appearance';
export const colors = {
  canvas: '#13131A', accentSoft: 'rgba(251,171,255,0.12)', accentBorder: 'rgba(251,171,255,0.35)',
  background: '#13131A', surface: '#13131A', surfaceLowest: '#0E0E15', surface2: '#1B1B22', surface3: '#1F1F26', surfaceHigh: '#2A2931', surfaceHighest: '#34343C', border: 'rgba(214,192,211,0.12)',
  text: '#E4E1EC', muted: '#D6C0D3', outline: '#9F8B9D', purple: '#FBABFF', purpleStrong: '#BE70C8', pink: '#FBABFF', pinkStrong: '#BE70C8', cyan: '#82CFC8', lime: '#FBABFF', success: '#82CFC8', danger: '#FFB4AB',
};

export const gradients = { brand: ['#BE70C8', '#FBABFF'] as const, neon: ['#BE70C8','#FBABFF','#82CFC8'] as const, dark: ['#1F1F26', '#13131A'] as const, aurora: ['#13131A', '#13131A', '#13131A'] as const };
export const fonts={regular:'PlusJakartaSans_400Regular',semiBold:'PlusJakartaSans_600SemiBold',bold:'PlusJakartaSans_700Bold',extraBold:'PlusJakartaSans_800ExtraBold'};

export const spacing = { xxs: 4, xs: 8, sm: 12, md: 16, lg: 24, xl: 32, xxl: 40 } as const;
export const radii = { sm: 8, md: 8, lg: 8, xl: 24, pill: 999 } as const;
export const motion = { fast: 160, normal: 220 } as const;

export function buildTheme(appearance: Appearance) {
  const accent = accents.find(item => item.id === appearance.accent) || accents[0];
  const image = appearance.background !== 'solid';
  const rgb = [1,3,5].map(offset => parseInt(accent.color.slice(offset,offset+2),16)).join(',');
  const palette = { ...colors, canvas: image ? 'transparent' : colors.background, accentSoft: `rgba(${rgb},0.12)`, accentBorder: `rgba(${rgb},0.35)`,
    surface2: image ? 'rgba(27,27,34,0.48)' : colors.surface2,
    surface3: image ? 'rgba(31,31,38,0.48)' : colors.surface3,
    surfaceHigh: image ? 'rgba(42,41,49,0.48)' : colors.surfaceHigh,
    purple: accent.color, pink: accent.color, lime: accent.color, purpleStrong: accent.strong, pinkStrong: accent.strong };
  return { colors: palette, gradients: { ...gradients, brand: [accent.strong, accent.color] as const,
    neon: [accent.strong, accent.color, colors.cyan] as const, aurora: image ? ['transparent', 'transparent', 'transparent'] as const : gradients.aurora }, appearance };
}
export const ThemeContext = createContext(buildTheme(defaultAppearance));
export const useTheme = () => useContext(ThemeContext);

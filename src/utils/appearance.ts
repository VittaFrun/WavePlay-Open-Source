export const accents = [
  { id: 'original', name: 'Original', color: '#FBABFF', strong: '#BE70C8' },
  { id: 'rose', name: 'Rosa neón', color: '#FFACC9', strong: '#CC608B' },
  { id: 'mint', name: 'Menta', color: '#82E0CD', strong: '#399B89' },
  { id: 'ice', name: 'Azul hielo', color: '#A8DFFF', strong: '#508EBC' },
  { id: 'mono', name: 'Monocromo', color: '#E7E7ED', strong: '#93939F' },
  { id: 'amber', name: 'Ámbar', color: '#FFD28A', strong: '#C58936' },
  { id: 'lavender', name: 'Lavanda', color: '#C5B6FF', strong: '#8871CC' },
  { id: 'coral', name: 'Coral', color: '#FFA99B', strong: '#C76555' },
  { id: 'lime', name: 'Lima', color: '#C5E98B', strong: '#718F35' },
  { id: 'turquoise', name: 'Turquesa', color: '#72DCE8', strong: '#258A99' },
  { id: 'peach', name: 'Durazno', color: '#FFC69C', strong: '#B97845' },
  { id: 'periwinkle', name: 'Azul violeta', color: '#AAB9FF', strong: '#6176BD' },
] as const;
export type Appearance = { accent: string; background: 'solid' | 'anime' | 'custom'; imageUri: string | null; dim: number; blur: number; gradient: number; imageFit: 'cover' | 'contain'; panelBlur: number; playlistView: 'grid' | 'list'; imageCoverage: number; gradientInverted: boolean };
export const defaultAppearance: Appearance = { accent: 'mono', background: 'anime', imageUri: null, dim: 0.65, blur: 0, gradient: 0, imageFit: 'cover', panelBlur: 45, playlistView: 'grid', imageCoverage: 1, gradientInverted: false };
export function normalizeAppearance(value: unknown): Appearance {
  const v = value && typeof value === 'object' ? value as Partial<Appearance> : {};
  return {
    accent: accents.some(a => a.id === v.accent) ? v.accent! : defaultAppearance.accent,
    background: v.background === 'anime' || v.background === 'custom' || v.background === 'solid' ? v.background : defaultAppearance.background,
    imageUri: typeof v.imageUri === 'string' && v.imageUri.startsWith('file://') ? v.imageUri : null,
    dim: typeof v.dim === 'number' && Number.isFinite(v.dim) ? Math.min(0.9, Math.max(0, v.dim)) : 0.65,
    blur: typeof v.blur === 'number' && Number.isFinite(v.blur) ? Math.min(20, Math.max(0, v.blur)) : 0,
    gradient: typeof v.gradient === 'number' && Number.isFinite(v.gradient) ? Math.min(1, Math.max(0, v.gradient)) : 0,
    imageFit: v.imageFit === 'contain' ? 'contain' : 'cover',
    panelBlur: typeof v.panelBlur === 'number' && Number.isFinite(v.panelBlur) ? Math.min(100, Math.max(0, v.panelBlur)) : 45,
    playlistView: v.playlistView === 'list' ? 'list' : 'grid',
    imageCoverage: typeof v.imageCoverage === 'number' && Number.isFinite(v.imageCoverage) ? Math.min(1, Math.max(0, v.imageCoverage)) : 1,
    gradientInverted: v.gradientInverted === true,
  };
}
export function backgroundStops(value: Appearance): readonly [string, string, string] {
  const {dim,gradient}=normalizeAppearance(value);
  return [dim*(1-gradient),dim*(1-gradient*.55),dim].map(alpha=>`rgba(10,10,16,${alpha})`) as [string,string,string];
}

export function backgroundGradient(appearance: Appearance) {
  const { imageCoverage, gradientInverted } = normalizeAppearance(appearance);
  const clear = 'rgba(19,19,26,0)';
  const solid = '#13131A';
  const colors: readonly [string,string,string,string] = imageCoverage === 0
    ? [solid,solid,solid,solid]
    : imageCoverage === 1 ? [clear,clear,clear,clear] : [clear,clear,solid,solid];
  const locations: readonly [number,number,number,number] = imageCoverage === 0 || imageCoverage === 1
    ? [0,.3,.7,1] : [0,Math.max(0,imageCoverage-.14),imageCoverage,1];
  return {colors,locations,start:{x:0,y:gradientInverted?1:0},end:{x:0,y:gradientInverted?0:1}};
}

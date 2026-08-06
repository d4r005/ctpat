// ─────────────────────────────────────────────────────────────
// Design tokens — NAF · SRIUC
// Enterprise / corporate visual language: deep navy + gold accent,
// generous whitespace, soft elevation, rounded corporate corners.
// ─────────────────────────────────────────────────────────────

export const colors = {
  // Neutral surfaces
  surface: '#F4F6F9',
  onSurface: '#0F1B2D',
  surfaceSecondary: '#FFFFFF',
  onSurfaceSecondary: '#0F1B2D',
  surfaceTertiary: '#E9EDF3',
  onSurfaceTertiary: '#1C2B3A',
  surfaceInverse: '#0A2540',
  onSurfaceInverse: '#FFFFFF',

  // Brand — deep navy with gold accent (matches NAF/SRIUC identity)
  brand: '#0A2540',
  brandPrimary: '#0A2540',
  brandPrimaryDark: '#081B30',
  brandPrimaryLight: '#123456',
  onBrandPrimary: '#FFFFFF',
  brandSecondary: '#C9962C',
  brandSecondaryLight: '#F0C36B',
  onBrandSecondary: '#0F1B2D',
  brandTertiary: '#E8EEF7',
  onBrandTertiary: '#0A2540',

  // Semantic
  success: '#178A4C',
  successSurface: '#E6F5EC',
  onSuccess: '#FFFFFF',
  warning: '#C9821A',
  warningSurface: '#FBF0DD',
  onWarning: '#FFFFFF',
  error: '#C22E2E',
  errorSurface: '#FBE9E9',
  onError: '#FFFFFF',
  info: '#1D6FB8',
  infoSurface: '#E7F1FB',
  onInfo: '#FFFFFF',

  // Structure
  border: '#DDE3EC',
  borderStrong: '#C4CDDA',
  divider: '#E9EDF3',
  muted: '#65758B',
  mutedLight: '#94A3B8',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
};

// Softer, more premium corner radii for a corporate SaaS feel.
export const radius = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 18,
  xl: 24,
  pill: 999,
  input: 10,
};

export const typography = {
  display: 'Space Grotesk',
  text: 'IBM Plex Sans',
  sizes: {
    sm: 12,
    base: 14,
    lg: 16,
    xl: 20,
    xxl: 24,
    xxxl: 32,
  },
};

// Reusable soft elevation presets (cross-platform: RN native + web via boxShadow)
export const shadows = {
  sm: {
    shadowColor: '#0A2540',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
    boxShadow: '0 2px 6px rgba(10, 37, 64, 0.06)',
  },
  md: {
    shadowColor: '#0A2540',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
    boxShadow: '0 6px 16px rgba(10, 37, 64, 0.08)',
  },
  lg: {
    shadowColor: '#0A2540',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.12,
    shadowRadius: 28,
    elevation: 8,
    boxShadow: '0 14px 28px rgba(10, 37, 64, 0.12)',
  },
};

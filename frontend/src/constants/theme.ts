// ─────────────────────────────────────────────────────────────
// Design tokens — NAF · SRIUC v2
// Enterprise SaaS visual language: deep navy + gold accent,
// generous whitespace, layered elevation, refined typography.
// ─────────────────────────────────────────────────────────────

export const colors = {
  // Neutral surfaces — layered grays for depth
  surface: '#F0F2F5',          // page background (slightly cooler)
  onSurface: '#0F172A',
  surfaceSecondary: '#FFFFFF',  // cards, panels
  onSurfaceSecondary: '#0F172A',
  surfaceTertiary: '#F8FAFC',   // subtle hover/alt rows
  onSurfaceTertiary: '#334155',
  surfaceInverse: '#0A2540',
  onSurfaceInverse: '#FFFFFF',

  // Brand — deep navy with gold accent
  brand: '#0A2540',
  brandPrimary: '#0A2540',
  brandPrimaryDark: '#061A2E',
  brandPrimaryLight: '#123456',
  brandPrimaryHover: '#0E2F50',
  onBrandPrimary: '#FFFFFF',
  brandSecondary: '#C9962C',
  brandSecondaryLight: '#F0C36B',
  onBrandSecondary: '#0F1B2D',
  brandTertiary: '#E8EEF7',
  onBrandTertiary: '#0A2540',

  // Semantic — slightly softer for better contrast on white
  success: '#15803D',
  successSurface: '#DCFCE7',
  onSuccess: '#FFFFFF',
  warning: '#B45309',
  warningSurface: '#FEF3C7',
  onWarning: '#FFFFFF',
  error: '#DC2626',
  errorSurface: '#FEE2E2',
  onError: '#FFFFFF',
  info: '#2563EB',
  infoSurface: '#DBEAFE',
  onInfo: '#FFFFFF',

  // Structure
  border: '#E2E8F0',
  borderStrong: '#CBD5E1',
  divider: '#F1F5F9',
  muted: '#64748B',
  mutedLight: '#94A3B8',
  mutedDark: '#475569',

  // Sidebar-specific tones
  sidebarBg: '#0A2540',
  sidebarHover: 'rgba(255,255,255,0.06)',
  sidebarActive: 'rgba(255,255,255,0.10)',
  sidebarActiveBar: '#C9962C',
  sidebarText: 'rgba(255,255,255,0.55)',
  sidebarTextActive: '#FFFFFF',
  sidebarBorder: 'rgba(255,255,255,0.08)',
  sidebarSectionLabel: 'rgba(255,255,255,0.35)',
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

// Premium corner radii
export const radius = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 999,
  input: 10,
};

export const typography = {
  display: 'Space Grotesk',
  text: 'IBM Plex Sans',
  sizes: {
    xs: 10,
    sm: 12,
    base: 14,
    lg: 16,
    xl: 20,
    xxl: 24,
    xxxl: 32,
  },
};

// Layered elevation — premium soft shadows
export const shadows = {
  xs: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
    boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)',
  },
  sm: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
    boxShadow: '0 1px 6px rgba(15, 23, 42, 0.05)',
  },
  md: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.07,
    shadowRadius: 12,
    elevation: 4,
    boxShadow: '0 4px 12px rgba(15, 23, 42, 0.07)',
  },
  lg: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.10,
    shadowRadius: 24,
    elevation: 8,
    boxShadow: '0 8px 24px rgba(15, 23, 42, 0.10)',
  },
  xl: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.14,
    shadowRadius: 32,
    elevation: 12,
    boxShadow: '0 12px 32px rgba(15, 23, 42, 0.14)',
  },
};

// ─────────────────────────────────────────────────────────────
// Design tokens — NAF · SRIUC v2
// Enterprise SaaS visual language: deep navy + gold accent,
// generous whitespace, layered elevation, refined typography.
// ─────────────────────────────────────────────────────────────

export const colors = {
  // Neutral surfaces — Modern Slate scale
  surface: '#F8FAFC',          // bg-slate-50
  onSurface: '#0F172A',        // text-slate-900
  surfaceSecondary: '#FFFFFF',  // Pure White for cards
  onSurfaceSecondary: '#1E293B',// text-slate-800
  surfaceTertiary: '#F1F5F9',   // bg-slate-100 (subtle hover)
  onSurfaceTertiary: '#475569', // text-slate-600
  surfaceInverse: '#0F172A',
  onSurfaceInverse: '#FFFFFF',

  // Brand — Professional Midnight Navy + Gold
  brand: '#0F172A',
  brandPrimary: '#0F172A',
  brandPrimaryDark: '#020617',
  brandPrimaryLight: '#1E293B',
  brandPrimaryHover: '#1E293B',
  onBrandPrimary: '#FFFFFF',
  brandSecondary: '#F59E0B',    // Amber 500 (Gold)
  brandSecondaryLight: '#FBBF24',
  onBrandSecondary: '#0F172A',
  brandTertiary: '#E2E8F0',
  onBrandTertiary: '#0F172A',

  // Semantic — Refined high-contrast tones
  success: '#10B981',           // Emerald 500
  successSurface: '#D1FAE5',
  onSuccess: '#065F46',
  warning: '#F59E0B',           // Amber 500
  warningSurface: '#FEF3C7',
  onWarning: '#92400E',
  error: '#EF4444',              // Red 500
  errorSurface: '#FEE2E2',
  onError: '#991B1B',
  info: '#3B82F6',               // Blue 500
  infoSurface: '#DBEAFE',
  onInfo: '#1E40AF',

  // Structure
  border: '#E2E8F0',            // Slate 200
  borderStrong: '#CBD5E1',      // Slate 300
  divider: '#F1F5F9',           // Slate 100
  muted: '#64748B',             // Slate 500
  mutedLight: '#94A3B8',        // Slate 400
  mutedDark: '#334155',         // Slate 700

  // Sidebar-specific tones (Midnight theme)
  sidebarBg: '#0F172A',
  sidebarHover: 'rgba(255,255,255,0.04)',
  sidebarActive: 'rgba(255,255,255,0.08)',
  sidebarActiveBar: '#F59E0B',
  sidebarText: '#94A3B8',
  sidebarTextActive: '#FFFFFF',
  sidebarBorder: 'rgba(255,255,255,0.06)',
  sidebarSectionLabel: '#475569',
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

// Layered elevation — high-end diffuse shadows
export const shadows = {
  xs: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
    boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)',
  },
  sm: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)',
  },
  md: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.06,
    shadowRadius: 15,
    elevation: 4,
    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1)',
  },
  lg: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.08,
    shadowRadius: 25,
    elevation: 8,
    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
  },
};

import type { WorkshopPaletteKey } from '@mop/shared';

export interface PaletteDefinition {
  readonly key: WorkshopPaletteKey;
  readonly name: string;
  readonly category: string;
  readonly primary: string;
  readonly primaryDeep: string;
  readonly primaryText: string;
  readonly primaryMuted: string;
  readonly accent: string;
  readonly accentHover: string;
  readonly accentMuted: string;
  readonly focusRing: string;
  readonly previewColor: string;
  readonly description: string;
}

export const APP_PALETTES: readonly PaletteDefinition[] = [
  {
    key: 'crimson',
    name: 'Crimson Turbo',
    category: 'Motorsport & Performance',
    primary: '#d41717',
    primaryDeep: '#8e1010',
    primaryText: '#ef4444',
    primaryMuted: '#2b1414',
    accent: '#d41717',
    accentHover: '#ee2020',
    accentMuted: '#2b1414',
    focusRing: '#ff4b3e',
    previewColor: '#d41717',
    description: 'Classic high-energy performance red with charcoal accents.',
  },
  {
    key: 'cobalt',
    name: 'Cyber Cobalt',
    category: 'High-Tech Diagnostics',
    primary: '#2563eb',
    primaryDeep: '#1e3a8a',
    primaryText: '#60a5fa',
    primaryMuted: '#172554',
    accent: '#2563eb',
    accentHover: '#3b82f6',
    accentMuted: '#172554',
    focusRing: '#60a5fa',
    previewColor: '#2563eb',
    description: 'Vibrant diagnostic blue engineered for modern tech-forward shops.',
  },
  {
    key: 'emerald',
    name: 'Emerald Performance',
    category: 'Precision & EV',
    primary: '#059669',
    primaryDeep: '#064e3b',
    primaryText: '#34d399',
    primaryMuted: '#022c22',
    accent: '#059669',
    accentHover: '#10b981',
    accentMuted: '#022c22',
    focusRing: '#34d399',
    previewColor: '#059669',
    description: 'Crisp racing green conveying precision craftsmanship and EV readiness.',
  },
  {
    key: 'amber',
    name: 'Electric Amber',
    category: 'Heavy Duty & Speed',
    primary: '#d97706',
    primaryDeep: '#78350f',
    primaryText: '#fbbf24',
    primaryMuted: '#451a03',
    accent: '#d97706',
    accentHover: '#f59e0b',
    accentMuted: '#451a03',
    focusRing: '#fbbf24',
    previewColor: '#d97706',
    description: 'Bold gold-amber built for fleet logistics and speed mechanics.',
  },
  {
    key: 'violet',
    name: 'Royal Violet',
    category: 'Exotic & Luxury GT',
    primary: '#7c3aed',
    primaryDeep: '#4c1d95',
    primaryText: '#a78bfa',
    primaryMuted: '#2e1065',
    accent: '#7c3aed',
    accentHover: '#8b5cf6',
    accentMuted: '#2e1065',
    focusRing: '#a78bfa',
    previewColor: '#7c3aed',
    description: 'Deep luxury violet tailored for prestige, tuning, and bespoke vehicles.',
  },
  {
    key: 'titanium',
    name: 'Midnight Titanium',
    category: 'Industrial Precision',
    primary: '#475569',
    primaryDeep: '#1e293b',
    primaryText: '#94a3b8',
    primaryMuted: '#0f172a',
    accent: '#64748b',
    accentHover: '#94a3b8',
    accentMuted: '#1e293b',
    focusRing: '#94a3b8',
    previewColor: '#64748b',
    description: 'Understated stealth titanium engineered for clean corporate precision.',
  },
];

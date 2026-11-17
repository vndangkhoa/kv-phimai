// KV-Cinema Sovereign / Noir IMAX Screening Room, mapped onto Astryx tokens.
//
// Built on top of the Neutral theme (for component structure and icons) and
// re-pointed at the locked KV-Cinema palette from DESIGN.md:
//   obsidian #0d0e14 · slate #161822 · slate-raised #1e2130
//   tungsten gold #ffd875 · cinema crimson #e50914 · ivory #f4f4f6
// The theme is dark-only: every token is a single value and the root <Theme>
// is mounted with mode="dark".
import { defineTheme } from '@astryxdesign/core/theme';
import { neutralTheme } from '@astryxdesign/theme-neutral/built';

const CINEMA = {
  obsidian: '#0d0e14',
  slate: '#161822',
  slateRaised: '#1e2130',
  gold: '#ffd875',
  amber: '#e6b949',
  crimson: '#e50914',
  crimsonSoft: '#ff6b72',
  emerald: '#10b981',
  ivory: '#f4f4f6',
  textSecondary: '#c4c8d9',
  textMuted: '#989fb8',
} as const;

export const cinemaNoirTheme = defineTheme({
  extends: neutralTheme,
  name: 'cinema-noir',
  typography: {
    // DESIGN.md body is 15px; keep Neutral's 1.2 ratio for the heading steps.
    scale: { base: 15, ratio: 1.2 },
    body: {
      family: 'Be Vietnam Pro',
      fallbacks: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    },
    heading: {
      family: 'Big Shoulders Display',
      fallbacks: '"Be Vietnam Pro", system-ui, sans-serif',
    },
    code: {
      family: 'JetBrains Mono',
      fallbacks: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    },
  },
  tokens: {
    // Surfaces: body → surface → card → popover
    '--color-background-body': CINEMA.obsidian,
    '--color-background-surface': CINEMA.slate,
    '--color-background-card': CINEMA.slate,
    '--color-background-popover': CINEMA.slateRaised,
    '--color-background-muted': 'rgba(13, 14, 20, 0.6)',
    '--color-background-inverted': CINEMA.ivory,
    '--color-overlay': 'rgba(4, 5, 10, 0.78)',
    '--color-overlay-hover': 'rgba(244, 244, 246, 0.06)',
    '--color-overlay-pressed': 'rgba(244, 244, 246, 0.11)',
    '--color-tint-hover': 'rgba(255, 216, 117, 0.08)',
    '--color-neutral': 'rgba(244, 244, 246, 0.08)',
    '--color-skeleton': CINEMA.slateRaised,
    '--color-shadow': 'rgba(4, 5, 10, 0.72)',

    // Accent = tungsten projection gold
    '--color-accent': CINEMA.gold,
    '--color-accent-muted': 'rgba(255, 216, 117, 0.16)',
    '--color-on-accent': CINEMA.obsidian,
    '--color-text-accent': CINEMA.gold,
    '--color-icon-accent': CINEMA.gold,

    // Text & icons
    '--color-text-primary': CINEMA.ivory,
    '--color-text-secondary': CINEMA.textSecondary,
    '--color-text-disabled': '#6b7189',
    '--color-icon-primary': CINEMA.ivory,
    '--color-icon-secondary': CINEMA.textSecondary,
    '--color-icon-disabled': '#6b7189',
    '--color-on-dark': CINEMA.ivory,
    '--color-on-light': CINEMA.obsidian,

    // Borders
    '--color-border': 'rgba(244, 244, 246, 0.11)',
    '--color-border-emphasized': 'rgba(244, 244, 246, 0.24)',

    // Status: crimson is the cinema error / destructive colour
    '--color-error': CINEMA.crimson,
    '--color-on-error': '#ffffff',
    '--color-error-muted': 'rgba(229, 9, 20, 0.18)',
    '--color-on-error-muted': '#ffc2c5',
    '--color-text-error': CINEMA.crimsonSoft,
    '--color-icon-error': CINEMA.crimsonSoft,
    '--color-border-error': CINEMA.crimsonSoft,
    '--color-background-error-inverted': CINEMA.crimson,
    '--color-success': CINEMA.emerald,
    '--color-on-success': CINEMA.obsidian,
    '--color-success-muted': 'rgba(16, 185, 129, 0.18)',
    '--color-on-success-muted': '#a7f3d0',
    '--color-text-success': '#34d399',
    '--color-warning': CINEMA.amber,
    '--color-on-warning': CINEMA.obsidian,
    '--color-warning-muted': 'rgba(230, 185, 73, 0.18)',
    '--color-on-warning-muted': '#ffe7a8',
    '--color-text-warning': CINEMA.gold,
    '--color-info': '#3b82f6',
    '--color-on-info': '#ffffff',

    // Shape (DESIGN.md rounded scale)
    '--radius-inner': '6px',
    '--radius-element': '8px',
    '--radius-container': '12px',
    '--radius-page': '16px',

    // Depth: offset + soft blur, never a zero-offset halo
    '--shadow-low': '0 4px 12px -4px rgba(4, 5, 10, 0.6)',
    '--shadow-med': '0 14px 34px -10px rgba(4, 5, 10, 0.72)',
    '--shadow-high': '0 24px 64px -16px rgba(0, 0, 0, 0.85)',
  },
});

import { Injectable, effect, signal } from '@angular/core';
import { type WorkshopPaletteKey, WORKSHOP_PALETTES, getWorkshopPalette } from '@mop/shared';

import { APP_PALETTES, type PaletteDefinition } from './palettes';

export { APP_PALETTES, type PaletteDefinition };
export type PaletteItem = PaletteDefinition;

const THEME_STORAGE_KEY = 'mop_theme_mode';
const PALETTE_STORAGE_KEY = 'mop_theme_palette';

export type ThemeMode = 'dark' | 'light';

@Injectable({
  providedIn: 'root',
})
export class ThemeService {
  readonly mode = signal<ThemeMode>(this.getInitialMode());
  readonly palette = signal<WorkshopPaletteKey>(this.getInitialPalette());

  get availablePalettes(): readonly PaletteDefinition[] {
    return APP_PALETTES;
  }

  constructor() {
    // Synchronize DOM attributes whenever mode or palette signal changes
    effect(() => {
      const currentMode = this.mode();
      const currentPalette = this.palette();

      if (typeof document !== 'undefined') {
        const root = document.documentElement;
        root.setAttribute('data-theme', currentMode);
        root.setAttribute('data-palette', currentPalette);
        localStorage.setItem(THEME_STORAGE_KEY, currentMode);
        localStorage.setItem(PALETTE_STORAGE_KEY, currentPalette);
      }
    });
  }

  toggleTheme(): void {
    this.mode.update((current) => (current === 'dark' ? 'light' : 'dark'));
  }

  setTheme(mode: ThemeMode): void {
    this.mode.set(mode);
  }

  setPalette(palette: WorkshopPaletteKey): void {
    this.palette.set(palette);
  }

  get currentPaletteDefinition(): PaletteItem {
    const list = this.availablePalettes;
    const found = list.find((p) => p.key === this.palette());
    return found ?? list[0];
  }

  private getInitialMode(): ThemeMode {
    if (typeof window === 'undefined') return 'dark';
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === 'dark' || stored === 'light') return stored;
    return 'dark'; // Dark is default MOP theme
  }

  private getInitialPalette(): WorkshopPaletteKey {
    if (typeof window === 'undefined') return 'crimson';
    const stored = localStorage.getItem(PALETTE_STORAGE_KEY) as WorkshopPaletteKey;
    const valid: readonly string[] = ['crimson', 'cobalt', 'emerald', 'amber', 'violet', 'titanium'];
    if (stored && valid.includes(stored)) return stored;
    return 'crimson';
  }
}

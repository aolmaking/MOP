import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import {
  type WorkshopPaletteKey,
  type NavigationLayoutType,
  type WorkshopDensity,
  type WorkshopThemeMode,
  getWorkshopPalette,
} from '@mop/shared';
import { ThemeService } from './theme.service';

const BRANDING_STORAGE_KEY = 'mop_active_workshop_branding';

export interface WorkshopBranding {
  id: string;
  name: string;
  code: string;
  logoUrl: string | null;
  palette: WorkshopPaletteKey;
  navigationLayout?: NavigationLayoutType;
  city?: string | null;
  address?: string | null;
  /** ISO code, e.g. 'EGP'. Never a symbol -- see ui/money.ts. */
  currency?: string | null;
  /**
   * What this workshop's staff see when they first sign in, and how tightly
   * its screens are packed. Both are set on the Appearance stage when the
   * workshop is created and both are applied here, to the running product:
   * the mode seeds `data-theme` for anyone who has not chosen their own, and
   * the density becomes `data-density`, which the shells read for row height,
   * control size and spacing.
   */
  themeMode?: WorkshopThemeMode | null;
  density?: WorkshopDensity | null;
}

const DEFAULT_BRANDING: WorkshopBranding = {
  id: 'default',
  name: 'Precision Motors Service Center',
  code: 'DFED5C5C92',
  logoUrl: null,
  palette: 'crimson',
  navigationLayout: 'SIDEBAR',
  city: 'Cairo',
  address: 'Main Operations Hub',
  currency: 'EGP',
  themeMode: 'DARK',
  density: 'COMFORTABLE',
};

@Injectable({
  providedIn: 'root',
})
export class WorkshopBrandingService {
  private readonly http = inject(HttpClient);
  private readonly theme = inject(ThemeService);

  readonly activeWorkshop = signal<WorkshopBranding>(this.loadPersistedBranding());

  constructor() {
    // Synchronize initial palette with theme
    this.theme.setPalette(this.activeWorkshop().palette);
    this.applyPresentation(this.activeWorkshop());
  }

  /**
   * The workshop's own appearance, put onto the document.
   *
   * Layout and density are attributes the stylesheets read directly. The mode
   * is different: it is the workshop's *starting point*, not an override, so a
   * member of staff who has already chosen light or dark on this device keeps
   * their choice. `SYSTEM` hands the decision to the device.
   */
  private applyPresentation(branding: WorkshopBranding): void {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    root.setAttribute('data-layout', branding.navigationLayout || 'SIDEBAR');
    root.setAttribute('data-density', (branding.density || 'COMFORTABLE').toLowerCase());

    const chosenByThisPerson = (() => {
      try {
        return localStorage.getItem('mop_theme_mode');
      } catch {
        return null;
      }
    })();
    if (chosenByThisPerson) return;

    const mode = branding.themeMode ?? 'DARK';
    if (mode === 'SYSTEM') {
      const prefersDark =
        typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches;
      this.theme.setTheme(prefersDark ? 'dark' : 'light');
      return;
    }
    this.theme.setTheme(mode === 'LIGHT' ? 'light' : 'dark');
  }

  setBranding(branding: Partial<WorkshopBranding> & { name: string; code: string }): void {
    const updated: WorkshopBranding = {
      ...this.activeWorkshop(),
      ...branding,
      palette: branding.palette || this.activeWorkshop().palette || 'crimson',
      navigationLayout: branding.navigationLayout || this.activeWorkshop().navigationLayout || 'SIDEBAR',
    };
    this.activeWorkshop.set(updated);
    this.theme.setPalette(updated.palette);
    this.applyPresentation(updated);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(BRANDING_STORAGE_KEY, JSON.stringify(updated));
    }
  }

  setLayout(layout: NavigationLayoutType): void {
    this.setBranding({ ...this.activeWorkshop(), navigationLayout: layout });
  }

  async resolveWorkshop(codeOrSlug: string): Promise<WorkshopBranding> {
    const cleanCode = codeOrSlug.trim();
    try {
      const res = await firstValueFrom(
        this.http.get<WorkshopBranding>(`/api/v1/workshops/branding/${encodeURIComponent(cleanCode)}`)
      );
      this.setBranding(res);
      return res;
    } catch {
      // Fallback lookup or mock simulation if server endpoint is resolving
      const fallback: WorkshopBranding = {
        id: 'w-' + cleanCode,
        name: cleanCode.toUpperCase() === 'DFED5C5C92' ? 'Precision Motors Service Center' : `Workshop (${cleanCode.toUpperCase()})`,
        code: cleanCode.toUpperCase(),
        logoUrl: null,
        palette: this.activeWorkshop().palette || 'crimson',
        city: 'Operations Center',
      };
      this.setBranding(fallback);
      return fallback;
    }
  }

  get paletteDefinition() {
    return this.theme.currentPaletteDefinition;
  }

  private loadPersistedBranding(): WorkshopBranding {
    if (typeof window === 'undefined') return DEFAULT_BRANDING;
    try {
      const raw = localStorage.getItem(BRANDING_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.name && parsed?.code) return parsed;
      }
    } catch {
      // ignore
    }
    return DEFAULT_BRANDING;
  }
}

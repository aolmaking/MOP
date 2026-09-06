import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { type WorkshopPaletteKey, getWorkshopPalette } from '@mop/shared';
import { ThemeService } from './theme.service';

const BRANDING_STORAGE_KEY = 'mop_active_workshop_branding';

export interface WorkshopBranding {
  id: string;
  name: string;
  code: string;
  logoUrl: string | null;
  palette: WorkshopPaletteKey;
  city?: string | null;
  address?: string | null;
}

const DEFAULT_BRANDING: WorkshopBranding = {
  id: 'default',
  name: 'Precision Motors Service Center',
  code: 'DFED5C5C92',
  logoUrl: null,
  palette: 'crimson',
  city: 'Cairo',
  address: 'Main Operations Hub',
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
  }

  setBranding(branding: Partial<WorkshopBranding> & { name: string; code: string }): void {
    const updated: WorkshopBranding = {
      ...this.activeWorkshop(),
      ...branding,
      palette: branding.palette || this.activeWorkshop().palette || 'crimson',
    };
    this.activeWorkshop.set(updated);
    this.theme.setPalette(updated.palette);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(BRANDING_STORAGE_KEY, JSON.stringify(updated));
    }
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

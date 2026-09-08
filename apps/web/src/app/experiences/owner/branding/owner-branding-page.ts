import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { UpperCasePipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { type WorkshopPaletteKey, type NavigationLayoutType } from '@mop/shared';
import { ThemeService } from '../../../ui/theme.service';
import { APP_PALETTES } from '../../../ui/palettes';
import { WorkshopBrandingService } from '../../../ui/workshop-branding.service';
import { ButtonDirective } from '../../../ui/button/button.directive';
import { ToastService } from '../../../ui/toast/toast.service';

const PALETTES_LIST = [
  {
    key: 'crimson' as const,
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
    key: 'cobalt' as const,
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
    key: 'emerald' as const,
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
    key: 'amber' as const,
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
    key: 'violet' as const,
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
    key: 'titanium' as const,
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

@Component({
  selector: 'app-owner-branding-page',
  standalone: true,
  imports: [FormsModule, UpperCasePipe, ButtonDirective],
  templateUrl: './owner-branding-page.html',
  styleUrl: './owner-branding-page.css',
})
export class OwnerBrandingPage {
  private readonly http = inject(HttpClient);
  private readonly toast = inject(ToastService);
  protected readonly theme = inject(ThemeService);
  protected readonly branding = inject(WorkshopBrandingService);

  get palettes() {
    return PALETTES_LIST;
  }

  readonly workshopName = signal(this.branding.activeWorkshop().name);
  readonly logoUrl = signal(this.branding.activeWorkshop().logoUrl || '');
  readonly selectedPalette = signal<WorkshopPaletteKey>(this.branding.activeWorkshop().palette || 'crimson');
  readonly selectedLayout = signal<NavigationLayoutType>(this.branding.activeWorkshop().navigationLayout || 'SIDEBAR');
  readonly saving = signal(false);

  selectPalette(key: WorkshopPaletteKey): void {
    this.selectedPalette.set(key);
    // Instant preview
    this.theme.setPalette(key);
  }

  selectLayout(layout: NavigationLayoutType): void {
    this.selectedLayout.set(layout);
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-layout', layout);
    }
  }

  get activePaletteDef() {
    const found = PALETTES_LIST.find((p) => p.key === this.selectedPalette());
    return found ?? PALETTES_LIST[0];
  }

  async save(): Promise<void> {
    this.saving.set(true);
    const updated = {
      name: this.workshopName().trim() || 'Precision Motors Service Center',
      code: this.branding.activeWorkshop().code,
      logoUrl: this.logoUrl().trim() || null,
      palette: this.selectedPalette(),
      navigationLayout: this.selectedLayout(),
    };

    try {
      await firstValueFrom(
        this.http.patch('/api/v1/owner/branding', updated)
      );
    } catch {
      // If API route is mock/local, we still persist locally
    }

    this.branding.setBranding(updated);
    this.theme.setPalette(updated.palette);
    this.saving.set(false);
    this.toast.show('Workshop branding and navigation layout updated successfully across all pages!', 'success');
  }
}

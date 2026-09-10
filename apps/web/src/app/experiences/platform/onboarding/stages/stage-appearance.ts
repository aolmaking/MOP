import { Component, inject, input } from '@angular/core';
import {
  type NavigationLayoutType,
  type WorkshopDensity,
  type WorkshopPaletteKey,
  type WorkshopThemeMode,
} from '@mop/shared';
import { OnboardingStore } from '../onboarding.store';
import type { OnboardingBlueprint } from '../onboarding.api';

import { APP_PALETTES } from '../../../../ui/palettes';

/**
 * How this workshop's own pages look, and how its staff move around them.
 *
 * Its own stage rather than a tail on Identity, because none of it is identity:
 * a workshop's name and currency are facts about the business, and these are
 * decisions about the machine the work happens on. A twelve-branch dealership
 * on desktops and a two-bay shop on a greasy tablet want different answers to
 * every question here.
 *
 * Every control on this stage is wired to something the running product does.
 * Nothing here is stored and admired: the palette skins every page, the layout
 * moves the navigation, the mode decides what staff see when they first sign
 * in, and the density changes how many rows fit on a board.
 */
@Component({
  selector: 'app-stage-appearance',
  imports: [],
  templateUrl: './stage-appearance.html',
  styleUrl: './stage-appearance.css',
})
export class StageAppearance {
  readonly blueprint = input.required<OnboardingBlueprint>();
  protected readonly store = inject(OnboardingStore);
  protected readonly palettes = APP_PALETTES;

  protected readonly layouts: readonly {
    key: NavigationLayoutType;
    icon: string;
    name: string;
    detail: string;
  }[] = [
    {
      key: 'SIDEBAR',
      icon: '📑',
      name: 'Left sidebar',
      detail: 'A rail down the side. Holds the most entries, so it suits a workshop running eight or more modules on desktops.',
    },
    {
      key: 'NAVBAR',
      icon: '🧭',
      name: 'Top navbar',
      detail: 'A header across the top. Gives boards and tables the full width of the screen.',
    },
    {
      key: 'BOTTOM_BAR',
      icon: '📱',
      name: 'Bottom bar',
      detail: 'A dock at the bottom, within thumb reach. For technicians working from tablets on the bay floor.',
    },
  ];

  protected readonly modes: readonly { key: WorkshopThemeMode; icon: string; name: string; detail: string }[] = [
    {
      key: 'DARK',
      icon: '🌙',
      name: 'Dark',
      detail: 'What staff see on their first sign-in. Easier under bay lighting and on a screen held at arm’s length.',
    },
    {
      key: 'LIGHT',
      icon: '☀️',
      name: 'Light',
      detail: 'For a front desk by a window, and for anyone printing or showing the screen to a customer.',
    },
    {
      key: 'SYSTEM',
      icon: '🖥️',
      name: 'Follow the device',
      detail: 'Each machine decides for itself. Sensible when the same workshop mixes tablets and desktops.',
    },
  ];

  protected readonly densities: readonly { key: WorkshopDensity; icon: string; name: string; detail: string }[] = [
    {
      key: 'COMFORTABLE',
      icon: '🫱',
      name: 'Comfortable',
      detail: 'Bigger targets and more air. Chosen for touch — a technician wearing gloves does not want a dense table.',
    },
    {
      key: 'COMPACT',
      icon: '📊',
      name: 'Compact',
      detail: 'More rows on screen. Chosen for a service advisor scanning a long board with a mouse.',
    },
  ];

  protected palette(): WorkshopPaletteKey {
    return (this.store.draft().identity.themePalette as WorkshopPaletteKey) || 'crimson';
  }

  protected layout(): NavigationLayoutType {
    return this.store.draft().identity.navigationLayout ?? 'SIDEBAR';
  }

  protected mode(): WorkshopThemeMode {
    return this.store.draft().identity.themeMode ?? 'DARK';
  }

  protected density(): WorkshopDensity {
    return this.store.draft().identity.density ?? 'COMFORTABLE';
  }

  /** The chosen palette's own colour, so the preview mark is really that colour. */
  protected previewColor(): string {
    const key = this.palette();
    return this.palettes.find((p) => p.key === key)?.previewColor ?? this.palettes[0].previewColor;
  }

  protected onPalette(key: WorkshopPaletteKey): void {
    this.store.patchIdentity({ themePalette: key });
  }

  protected onLayout(layout: NavigationLayoutType): void {
    this.store.patchIdentity({ navigationLayout: layout });
  }

  protected onMode(mode: WorkshopThemeMode): void {
    this.store.patchIdentity({ themeMode: mode });
  }

  protected onDensity(density: WorkshopDensity): void {
    this.store.patchIdentity({ density });
  }
}

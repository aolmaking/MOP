import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { UpperCasePipe } from '@angular/common';
import { isValidPhoneNumber, normalizePhoneNumber, type WorkshopPaletteKey } from '@mop/shared';
import { ThemeToggle } from '../../../ui/theme-toggle/theme-toggle';
import { WorkshopBrandingService } from '../../../ui/workshop-branding.service';
import type { PresentedError } from '../../../runtime/http/error.interceptor';

export type RegisterStage = 'workshop' | 'identity' | 'vehicle_security' | 'done';

interface WorkshopResolved {
  readonly tenantId: string;
  readonly tenantName: string;
  readonly code: string;
  readonly slug?: string;
  readonly city?: string | null;
  readonly logoUrl?: string | null;
  readonly palette?: WorkshopPaletteKey;
}

@Component({
  selector: 'app-register-page',
  standalone: true,
  imports: [RouterLink, FormsModule, UpperCasePipe, ThemeToggle],
  templateUrl: './register-page.html',
  styleUrl: './register-page.css',
})
export class RegisterPage {
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly branding = inject(WorkshopBrandingService);

  // 4-stage animated progression
  protected readonly currentStage = signal<RegisterStage>('workshop');
  protected readonly transitionDirection = signal<'next' | 'prev'>('next');

  protected readonly workshop = signal<WorkshopResolved | null>(null);
  protected readonly workshopCode = signal('DFED5C5C92');
  protected readonly resolving = signal(false);
  protected readonly codeError = signal<string | null>(null);

  // Identity inputs
  protected readonly fullName = signal('');
  protected readonly phone = signal('');
  protected readonly email = signal('');

  // Vehicle & Security inputs
  protected readonly plateNumber = signal('');
  protected readonly password = signal('');

  protected readonly submitting = signal(false);
  protected readonly formError = signal<string | null>(null);

  // Duplicate car modal
  protected readonly differentCarModal = signal(false);
  protected readonly existingPlates = signal<string[]>([]);

  // Computed validations
  protected readonly normalizedPhone = computed(() => normalizePhoneNumber(this.phone()));
  protected readonly isPhoneValid = computed(() => isValidPhoneNumber(this.phone()));
  protected readonly isNameValid = computed(() => this.fullName().trim().length >= 2);
  protected readonly isPlateValid = computed(() => this.plateNumber().trim().length >= 2);
  protected readonly isPasswordValid = computed(() => this.password().length >= 8);

  // Password strength meter
  protected readonly passwordStrength = computed(() => {
    const p = this.password();
    if (!p) return 0;
    let score = 0;
    if (p.length >= 8) score += 30;
    if (p.length >= 12) score += 30;
    if (/[0-9]/.test(p)) score += 20;
    if (/[^A-Za-z0-9]/.test(p)) score += 20;
    return Math.min(100, score);
  });

  constructor() {
    const prefilled = this.route.snapshot.queryParamMap.get('workshop') ?? this.route.snapshot.queryParamMap.get('code');
    if (prefilled) {
      this.workshopCode.set(prefilled);
      this.resolveWorkshop(true);
    } else {
      this.resolveWorkshop(false);
    }
  }

  // --- Stage Navigation ---
  goToStage(stage: RegisterStage, direction: 'next' | 'prev' = 'next'): void {
    this.transitionDirection.set(direction);
    this.currentStage.set(stage);
    this.formError.set(null);
  }

  proceedToIdentity(): void {
    if (!this.workshop()) {
      this.resolveWorkshop(true);
      return;
    }
    this.goToStage('identity', 'next');
  }

  proceedToVehicle(): void {
    if (!this.isNameValid()) {
      this.formError.set('Please enter your full name (at least 2 characters).');
      return;
    }
    if (!this.isPhoneValid()) {
      this.formError.set('Please enter a valid mobile number with WhatsApp active.');
      return;
    }
    this.formError.set(null);
    this.goToStage('vehicle_security', 'next');
  }

  resolveWorkshop(advanceOnSuccess = false): void {
    const code = this.workshopCode().trim();
    if (!code) {
      this.codeError.set('Please enter a workshop code.');
      return;
    }

    this.resolving.set(true);
    this.codeError.set(null);

    this.http.get<WorkshopResolved>('/api/v1/public/register/workshop', { params: { code } }).subscribe({
      next: (found) => {
        this.resolving.set(false);
        this.workshop.set(found);
        this.branding.setBranding({
          id: found.tenantId,
          name: found.tenantName,
          code: found.code,
          logoUrl: found.logoUrl ?? null,
          palette: found.palette || 'crimson',
          city: found.city ?? null,
        });
        if (advanceOnSuccess) {
          this.goToStage('identity', 'next');
        }
      },
      error: (err: PresentedError) => {
        this.resolving.set(false);
        this.codeError.set(err.message ?? "We couldn't verify a workshop with that code.");
      },
    });
  }

  submit(confirmNewCar = false): void {
    if (!this.isNameValid() || !this.isPhoneValid() || !this.isPlateValid() || !this.isPasswordValid()) {
      this.formError.set('Please complete all required fields properly.');
      return;
    }

    this.submitting.set(true);
    this.formError.set(null);

    const payload = {
      workshopCode: this.workshop()?.code || this.workshopCode().trim(),
      fullName: this.fullName().trim(),
      phone: this.normalizedPhone(),
      plateNumber: this.plateNumber().trim(),
      carPlateNumber: this.plateNumber().trim(),
      email: this.email().trim() || undefined,
      password: this.password(),
      confirmNewCar,
    };

    this.http.post<{ customerId: string; tenantName: string }>('/api/v1/public/register', payload).subscribe({
      next: () => {
        this.submitting.set(false);
        this.differentCarModal.set(false);
        this.goToStage('done', 'next');
      },
      error: (err: any) => {
        this.submitting.set(false);
        if (err?.status === 409 && err?.error?.code === 'phone_registered_different_car') {
          this.existingPlates.set(err?.error?.existingPlates ?? []);
          this.differentCarModal.set(true);
          return;
        }
        this.formError.set(err?.error?.message ?? err?.message ?? 'Registration could not be completed.');
      },
    });
  }

  confirmAddCar(): void {
    this.submit(true);
  }

  cancelAddCar(): void {
    this.differentCarModal.set(false);
  }
}

import { Component, OnInit, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import {
  BUSINESS_TYPES,
  INITIAL_STATUSES,
  INITIAL_STATUS_HELP,
  STARTER_BUILDER_TEMPLATES,
  STARTER_BUILDER_TEMPLATE_LABELS,
} from '@mop/shared';
import { PlatformWorkshopsApi, type PlanOption } from '../workshops/platform-workshops.api';
import { ToastService } from '../../../ui/toast/toast.service';
import { ErrorBanner } from '../../../ui/error-banner/error-banner';
import { FormField } from '../../../ui/form-field/form-field';
import { ButtonDirective } from '../../../ui/button/button.directive';
import type { PresentedError } from '../../../runtime/http/error.interceptor';
import { uniquenessValidator } from './uniqueness.validator';
import { OPERATING_CATEGORIES as CATEGORIES } from '@mop/shared';

function deriveSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 50);
}

/**
 * "Add Workshop Owner" -- the only way a tenant is ever created (no public
 * signup). Full spec: docs/detailed-specs/platform-super-admin.md.
 */
@Component({
  selector: 'app-add-workshop-page',
  imports: [ReactiveFormsModule, ErrorBanner, FormField, ButtonDirective, RouterLink],
  templateUrl: './add-workshop-page.html',
  styleUrl: './add-workshop-page.css',
})
export class AddWorkshopPage implements OnInit {
  private readonly api = inject(PlatformWorkshopsApi);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly categories = CATEGORIES;
  protected readonly businessTypes = BUSINESS_TYPES;
  protected readonly starterTemplates = STARTER_BUILDER_TEMPLATES;
  protected readonly starterTemplateLabels = STARTER_BUILDER_TEMPLATE_LABELS;
  protected readonly initialStatuses = INITIAL_STATUSES;
  protected readonly initialStatusHelp = INITIAL_STATUS_HELP;
  protected readonly timezones = this.listTimezones();

  protected readonly plans = signal<PlanOption[]>([]);
  // A plain signal, set explicitly on planId changes below -- NOT a
  // computed() over `plans` reading `form.controls.planId.value` inline:
  // that value is a plain property, not a signal, so computed() would
  // never see it change and this would silently go stale the moment the
  // user picked a different plan.
  protected readonly selectedPlan = signal<PlanOption | null>(null);
  protected readonly slugManuallyEdited = signal(false);
  protected readonly submitting = signal(false);
  protected readonly submitError = signal<PresentedError | null>(null);

  protected readonly form = this.fb.group({
    // Not updateOn: 'blur' -- name's valueChanges has to stay live
    // per-keystroke, since the slug auto-derivation below depends on it
    // ("the moment Name is typed," per spec). The "debounced on blur"
    // feel of the uniqueness check instead falls out of two things
    // already true here: uniquenessValidator's own delay(500), plus
    // Angular's built-in behavior of canceling a still-pending async
    // validator run the moment the control's value changes again -- so
    // rapid typing keeps canceling and rescheduling, and only the value
    // that survives 500ms of no further changes actually triggers check().
    name: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(120)], [uniquenessValidator((v) => this.api.checkNameAvailability(v))]],
    slug: [
      '',
      [Validators.required, Validators.pattern(/^[a-z0-9-]{3,50}$/)],
      [uniquenessValidator((v) => this.api.checkSlugAvailability(v))],
    ],
    country: ['', Validators.required],
    city: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(80)]],
    businessType: ['' as (typeof BUSINESS_TYPES)[number], Validators.required],
    businessTypeOther: [''],
    primaryCategory: ['' as (typeof CATEGORIES)[number]['value'], Validators.required],
    currency: ['', [Validators.required, Validators.pattern(/^[A-Z]{3}$/)]],
    timezone: ['', Validators.required],
    ownerFullName: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(100)]],
    ownerEmail: ['', [Validators.required, Validators.email], [uniquenessValidator((v) => this.api.checkOwnerEmailAvailability(v))]],
    ownerPhone: ['', [Validators.required, Validators.pattern(/^\+[1-9]\d{1,14}$/)]],
    planId: ['', Validators.required],
    allowedBranchesStart: [1, [Validators.required, Validators.min(1)]],
    allowedUsersStart: [1, [Validators.required, Validators.min(1)]],
    allowedWarehousesStart: [0, [Validators.required, Validators.min(0)]],
    starterBuilderTemplate: ['' as (typeof STARTER_BUILDER_TEMPLATES)[number], Validators.required],
    enableDemoData: [false],
    initialStatus: ['TRIAL' as (typeof INITIAL_STATUSES)[number], Validators.required],
  });

  async ngOnInit(): Promise<void> {
    this.form.controls.name.valueChanges.subscribe((name) => {
      if (!this.slugManuallyEdited()) {
        this.form.controls.slug.setValue(deriveSlug(name), { emitEvent: false });
      }
    });

    this.form.controls.businessType.valueChanges.subscribe((type) => {
      const otherControl = this.form.controls.businessTypeOther;
      if (type === 'Other') {
        otherControl.setValidators([Validators.required, Validators.minLength(2), Validators.maxLength(60)]);
      } else {
        otherControl.setValidators([]);
        otherControl.setValue('');
      }
      otherControl.updateValueAndValidity();
    });

    this.form.controls.planId.valueChanges.subscribe(() => this.applyPlanBounds());

    try {
      const plans = await firstValueFrom(this.api.listPlans());
      this.plans.set(plans);
    } catch {
      this.toast.show('Could not load plans. Refresh to try again.', 'danger', 0);
    }
  }

  protected editSlugManually(): void {
    this.slugManuallyEdited.set(true);
  }

  private applyPlanBounds(): void {
    const plan = this.plans().find((p) => p.id === this.form.controls.planId.value) ?? null;
    this.selectedPlan.set(plan);
    if (!plan) return;

    this.form.controls.allowedBranchesStart.setValidators([Validators.required, Validators.min(1), Validators.max(plan.maxBranches)]);
    this.form.controls.allowedUsersStart.setValidators([Validators.required, Validators.min(1), Validators.max(plan.maxUsers)]);
    this.form.controls.allowedWarehousesStart.setValidators([Validators.required, Validators.min(0), Validators.max(plan.maxWarehouses)]);
    this.form.controls.allowedBranchesStart.updateValueAndValidity();
    this.form.controls.allowedUsersStart.updateValueAndValidity();
    this.form.controls.allowedWarehousesStart.updateValueAndValidity();
  }

  private listTimezones(): string[] {
    // Intl.supportedValuesOf is a real, native, zero-dependency source for
    // every IANA timezone the runtime supports -- no hardcoded list to
    // fall out of date, no library needed (see the Phase 2 design-system
    // decision: native Intl covers every timezone/relative-time need).
    const supportedValuesOf = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf;
    return supportedValuesOf ? supportedValuesOf('timeZone') : ['UTC'];
  }

  async submit(): Promise<void> {
    if (this.form.invalid || this.form.pending || this.submitting()) {
      this.form.markAllAsTouched();
      return;
    }

    this.submitError.set(null);
    this.submitting.set(true);
    const value = this.form.getRawValue();

    try {
      const result = await firstValueFrom(
        this.api.createWorkshop({
          ...value,
          businessTypeOther: value.businessType === 'Other' ? value.businessTypeOther : undefined,
        }),
      );
      this.toast.show(`${result.tenant.name} created. Invite link ready to share.`, 'success');
      await this.router.navigate(['/platform/workshops']);
    } catch (err) {
      this.submitError.set(err as PresentedError);
    } finally {
      this.submitting.set(false);
    }
  }
}

import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subject, debounceTime, distinctUntilChanged, switchMap } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ButtonDirective } from '../../../ui/button/button.directive';
import { Identifier } from '../../../ui/identifier/identifier';
import { ErrorBanner } from '../../../ui/error-banner/error-banner';
import type { PresentedError } from '../../../runtime/http/error.interceptor';
import {
  IntakeApi,
  type BranchOption,
  type CustomerMatch,
  type IntakeLookupResult,
  type VehicleMatch,
} from './intake.api';
import { clearDraft, emptyDraft, loadDraft, saveDraft, type IntakeDraft } from './intake-draft';

type SearchState = 'idle' | 'searching' | 'results' | 'no-results' | 'error';

/**
 * Book a vehicle in.
 *
 * Structure and the reasoning behind it are in docs/phases/PHASE_5.md
 * (5.C). In short: this is deliberately NOT a wizard. Intake is a
 * conversation, the information arrives in whatever order the customer
 * says it, and most intakes are a returning customer with a vehicle
 * already on file. So the page opens as one search field and expands to
 * exactly what is missing.
 */
@Component({
  selector: 'app-intake-page',
  imports: [FormsModule, ButtonDirective, Identifier, ErrorBanner],
  templateUrl: './intake-page.html',
  styleUrl: './intake-page.css',
})
export class IntakePage {
  private readonly api = inject(IntakeApi);

  protected readonly query = signal('');
  protected readonly searchState = signal<SearchState>('idle');
  protected readonly results = signal<IntakeLookupResult>({ customers: [], vehicles: [] });

  protected readonly draft = signal<IntakeDraft>(emptyDraft());
  /** A restored draft always announces itself -- see PHASE_5.md 5.C. */
  protected readonly restored = signal(false);

  protected readonly branches = signal<readonly BranchOption[]>([]);
  protected readonly submitting = signal(false);
  protected readonly error = signal<PresentedError | null>(null);
  protected readonly forbidden = signal(false);

  /**
   * Raised when the chosen vehicle belongs to someone else. Held as its
   * own state rather than shown as an error, because it is a decision
   * only the advisor can make: a genuine sale, or a typo in the plate.
   */
  protected readonly ownershipConflict = signal<{ from: string; to: string } | null>(null);

  /** Set once the vehicle is booked in. The page's success state. */
  protected readonly booked = signal<{ workOrderId: string; ownershipTransferred: boolean } | null>(null);

  private readonly queries = new Subject<string>();

  constructor() {
    const restored = loadDraft();
    if (restored) {
      this.draft.set(restored);
      this.restored.set(true);
    }

    this.api.branches().subscribe({
      next: ({ branches }) => {
        this.branches.set(branches);
        // Pre-selected when there is nothing to choose. A single-branch
        // workshop should never be asked which branch.
        if (branches.length === 1 && !this.draft().branchId) this.patch({ branchId: branches[0].id });
        if (branches.length > 1 && !this.draft().branchId) this.patch({ branchId: branches[0].id });
      },
      error: (err: PresentedError) => {
        if (err.httpStatus === 403) this.forbidden.set(true);
      },
    });

    this.queries
      .pipe(
        debounceTime(200),
        distinctUntilChanged(),
        switchMap((q) => this.api.search(q)),
        takeUntilDestroyed(),
      )
      .subscribe({
        next: (result) => {
          this.results.set(result);
          const empty = result.customers.length === 0 && result.vehicles.length === 0;
          this.searchState.set(empty ? 'no-results' : 'results');
        },
        error: () => this.searchState.set('error'),
      });
  }

  protected onQuery(value: string): void {
    this.query.set(value);
    if (value.trim().length < 2) {
      this.searchState.set('idle');
      return;
    }
    this.searchState.set('searching');
    this.queries.next(value.trim());
  }

  // --- choosing ----------------------------------------------------

  protected chooseCustomer(customer: CustomerMatch): void {
    this.patch({ customer, newCustomer: null });
    // A customer with exactly one vehicle is not asked which one.
    if (customer.vehicles.length === 1) this.patch({ vehicle: customer.vehicles[0], newVehicle: null });
    this.resetSearch();
  }

  protected chooseVehicle(vehicle: VehicleMatch): void {
    this.patch({ vehicle, newVehicle: null });
    this.ownershipConflict.set(null);
    this.resetSearch();
  }

  /** Picking a vehicle found by plate also identifies its owner. */
  protected chooseVehicleWithOwner(vehicle: VehicleMatch): void {
    if (vehicle.ownerCustomerId && vehicle.ownerName) {
      this.patch({
        customer: { id: vehicle.ownerCustomerId, fullName: vehicle.ownerName, phone: '', vehicles: [vehicle] },
      });
    }
    this.chooseVehicle(vehicle);
  }

  protected startNewCustomer(): void {
    this.patch({ customer: null, newCustomer: { fullName: this.query().trim(), phone: '', email: '' } });
    this.resetSearch();
  }

  protected startNewVehicle(): void {
    this.patch({ vehicle: null, newVehicle: { category: 'CARS', plateNumber: '', vinOrChassisNumber: '' } });
  }

  protected clearCustomer(): void {
    this.patch({ customer: null, newCustomer: null, vehicle: null, newVehicle: null });
    this.ownershipConflict.set(null);
  }

  protected clearVehicle(): void {
    this.patch({ vehicle: null, newVehicle: null });
    this.ownershipConflict.set(null);
  }

  // --- draft -------------------------------------------------------

  protected patch(change: Partial<IntakeDraft>): void {
    const next = { ...this.draft(), ...change } as IntakeDraft;
    this.draft.set(next);
    saveDraft(next);
  }

  protected discardDraft(): void {
    clearDraft();
    this.draft.set(emptyDraft());
    this.restored.set(false);
    this.ownershipConflict.set(null);
    const branches = this.branches();
    if (branches.length > 0) this.patch({ branchId: branches[0].id });
  }

  protected dismissRestoredNotice(): void {
    this.restored.set(false);
  }

  // --- readiness ---------------------------------------------------

  protected readonly customerLabel = computed(() => {
    const d = this.draft();
    return d.customer?.fullName ?? d.newCustomer?.fullName ?? '';
  });

  protected readonly vehicleLabel = computed(() => {
    const d = this.draft();
    return d.vehicle?.identifier ?? d.newVehicle?.plateNumber ?? '';
  });

  /**
   * Stated as what is still missing, never as "step 2 of 4". A step count
   * describes the form; the advisor needs to know whether they can finish.
   */
  protected readonly missing = computed<readonly string[]>(() => {
    const d = this.draft();
    const missing: string[] = [];

    if (!d.customer && !d.newCustomer?.fullName?.trim()) missing.push('who the customer is');
    else if (!d.customer && !d.newCustomer?.phone?.trim()) missing.push('a phone number');

    if (!d.vehicle && !d.newVehicle?.plateNumber?.trim()) missing.push('which vehicle');
    if (!d.branchId) missing.push('a branch');

    return missing;
  });

  protected readonly canSubmit = computed(() => this.missing().length === 0 && !this.submitting());

  // --- submit ------------------------------------------------------

  protected submit(confirmOwnershipTransfer = false): void {
    if (!this.canSubmit() && !confirmOwnershipTransfer) return;

    const d = this.draft();
    this.submitting.set(true);
    this.error.set(null);

    this.api
      .create({
        branchId: d.branchId,
        customer: d.customer
          ? { existingCustomerId: d.customer.id }
          : {
              fullName: d.newCustomer?.fullName?.trim(),
              phone: d.newCustomer?.phone?.trim(),
              email: d.newCustomer?.email?.trim() || undefined,
            },
        asset: d.vehicle
          ? { existingAssetId: d.vehicle.id }
          : {
              category: d.newVehicle?.category,
              plateNumber: d.newVehicle?.plateNumber?.trim(),
              vinOrChassisNumber: d.newVehicle?.vinOrChassisNumber?.trim() || undefined,
            },
        complaint: d.complaint.trim() || undefined,
        inspectionDeclined: d.inspectionDeclined,
        confirmOwnershipTransfer,
      })
      .subscribe({
        next: (result) => {
          clearDraft();
          // Confirmation stays on this page rather than navigating to the
          // Work Order Workspace, which is 5.D and does not exist yet --
          // routing to it would drop the advisor on a 404 redirect the
          // moment they finish. It is also the better ending: the advisor
          // reads the job number back to the customer, and the next car is
          // usually right behind them.
          this.booked.set({ workOrderId: result.workOrderId, ownershipTransferred: result.ownershipTransferred });
          this.submitting.set(false);
          this.ownershipConflict.set(null);
        },
        error: (err: PresentedError) => {
          this.submitting.set(false);
          if (err.code === 'ownership_transfer_required') {
            this.ownershipConflict.set({
              from: this.draft().vehicle?.ownerName ?? 'another customer',
              to: this.customerLabel(),
            });
            return;
          }
          this.error.set(err);
        },
      });
  }

  /** Clears the whole form for the next customer at the counter. */
  protected bookAnother(): void {
    this.booked.set(null);
    this.error.set(null);
    this.discardDraft();
  }

  protected cancelOwnershipTransfer(): void {
    this.ownershipConflict.set(null);
    this.clearVehicle();
  }

  private resetSearch(): void {
    this.query.set('');
    this.searchState.set('idle');
    this.results.set({ customers: [], vehicles: [] });
  }
}

import { Component, DestroyRef, inject, signal, computed } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AuthStore } from '../../identity/auth.store';
import { AccessApi } from '../../identity/access.api';
import { WorkshopBrandingService } from '../../ui/workshop-branding.service';
import { formatMoney } from '../../ui/money';
import { AnimatedPartIconComponent } from '../../shared/components/animated-part/animated-part-icon.component';
import { CAR_SUBSYSTEMS, type CarSubsystemConfig } from '../../shared/components/car-3d/car-subsystems';
import { VehicleMark } from '../../ui/vehicle-mark/vehicle-mark';
import { findVehicleMake, makesForCategory, modelsForMake, type OperatingCategory } from '@mop/shared';
import {
  OperatorApi,
  type OperatorInspectionFinding,
  type OperatorInspectionPart,
  type OperatorInspectionReportDetail,
  type OperatorInspectionReportItem,
  type OperatorInspectionService,
  type OperatorVehicle,
  type RegisterCustomerVehiclePayload,
} from './operator.api';

type State = 'loading' | 'ready' | 'forbidden' | 'error';

/**
 * Long enough that a plate typed at speed is one request, short enough that
 * the list has answered before the operator has looked up from the keyboard.
 */
const SEARCH_DEBOUNCE_MS = 300;

@Component({
  selector: 'app-operator-home',
  imports: [RouterLink, FormsModule, AnimatedPartIconComponent, VehicleMark],
  templateUrl: './operator-home.html',
  styleUrl: './operator-home.css',
})
export class OperatorHome {
  private readonly api = inject(OperatorApi);
  private readonly access = inject(AccessApi);
  private readonly authStore = inject(AuthStore);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly branding = inject(WorkshopBrandingService);

  /**
   * A money value printed in the workshop's currency.
   *
   * Every price on this page was written as `${{ value }}` -- a literal
   * dollar sign -- so an Egyptian workshop quoted its customers in dollars at
   * the counter and on the quote builder.
   */
  protected money(amount: string | number | null | undefined): string {
    return formatMoney(amount == null ? null : String(amount), this.branding.activeWorkshop().currency);
  }

  /**
   * A line's total, computed once here rather than in the template.
   *
   * The template multiplied `unitPrice * quantity` inline. Arithmetic on
   * money in a view is the same defect `lint-money` refuses on the server --
   * and it cannot be linted at all inside an HTML expression, which is why it
   * survived here. Kept as a string in and a string out, so the value that
   * reaches the screen has been through exactly one conversion.
   */
  protected lineTotal(unitPrice: string | number | null | undefined, quantity: number | null | undefined): string {
    const unit = Number(unitPrice ?? 0);
    const count = Math.max(1, Number(quantity ?? 1));
    if (!Number.isFinite(unit) || !Number.isFinite(count)) return '';
    return (unit * count).toFixed(2);
  }


  /**
   * The picture for a vehicle category.
   *
   * Every row on this page carries an icon as well as a word, because the
   * counter is not always staffed by someone who reads the English label.
   * The icon has to carry the meaning on its own.
   */
  protected categoryIcon(category: string | null | undefined): string {
    switch ((category ?? '').toUpperCase()) {
      case 'MOTORCYCLES':
        return '\u{1F3CD}\uFE0F';
      case 'HEAVY_EQUIPMENT':
        return '\u{1F69A}';
      default:
        return '\u{1F697}';
    }
  }

  /**
   * What the vehicle is, in as many real words as were recorded.
   *
   * Falls back to the category rather than inventing a marque: an
   * operator confirming they have the right car must not be shown one.
   */
  protected vehicleWords(vehicle: OperatorVehicle): string {
    const make = findVehicleMake(vehicle.make);
    const words = [make?.label, vehicle.model?.trim() || null].filter((word): word is string => !!word);
    return words.length > 0 ? words.join(' ') : this.categoryWord(vehicle.category);
  }

  /** The same thing in one plain word, for whoever does read. */
  protected categoryWord(category: string | null | undefined): string {
    switch ((category ?? '').toUpperCase()) {
      case 'MOTORCYCLES':
        return 'Motorcycle';
      case 'HEAVY_EQUIPMENT':
        return 'Heavy';
      default:
        return 'Car';
    }
  }

  /** Severity, as a shape rather than only a colour -- colour alone excludes. */
  protected severityIcon(severity: string | null | undefined): string {
    switch ((severity ?? 'MEDIUM').toUpperCase()) {
      case 'CRITICAL':
        return '\u{1F6D1}';
      case 'HIGH':
        return '\u26A0\uFE0F';
      case 'LOW':
        return '\u{1F535}';
      default:
        return '\u{1F7E1}';
    }
  }

  /**
   * What one finding costs, so the approval table can show a figure per row.
   *
   * The operator ticks a finding and the total moves; without a per-row
   * figure they cannot see by how much until they have ticked it.
   */
  protected findingTotal(f: OperatorInspectionFinding): string {
    const parts = this.partsForFinding(f).reduce(
      (acc, p) => acc + (Number(p.unitPrice) || 0) * (Number(p.quantity) || 1),
      0,
    );
    const labour = this.servicesForFinding(f).reduce((acc, s) => acc + (Number(s.laborPrice) || 0), 0);
    return (parts + labour).toFixed(2);
  }

  protected readonly session = this.authStore.session;
  protected readonly state = signal<State>('loading');
  protected readonly errorMessage = signal<string | null>(null);

  // Active top-level tab: Reception intake vs Technician inspection reports
  protected readonly activeTab = signal<'reception' | 'inspection-reports'>('reception');

  // Overview data
  protected readonly vehicles = signal<OperatorVehicle[]>([]);
  protected readonly searchQuery = signal<string>('');
  protected readonly isSearching = signal<boolean>(false);
  private searchTimer: number | null = null;

  // Success toast
  protected readonly successNotification = signal<string | null>(null);

  // Pre-selected vehicle intake modal state
  protected readonly isIntakeModalOpen = signal<boolean>(false);
  protected readonly selectedVehicle = signal<OperatorVehicle | null>(null);
  protected readonly allSubsystems = signal<readonly CarSubsystemConfig[]>(CAR_SUBSYSTEMS);
  /**
   * Nothing is ticked until somebody ticks it.
   *
   * This opened with cooling and brakes already selected, so a vehicle
   * booked in for a flat battery arrived at the technician with a
   * cooling-system and brake inspection requested that nobody asked for
   * -- and the operator had to notice two pre-made choices and undo them
   * before making their own.
   */
  protected readonly selectedSubsystemKeys = signal<string[]>([]);
  protected readonly complaint = signal<string>('');
  /**
   * How much of the car the technician is asked to look at.
   *
   * False -- only the ticked systems -- is the default because that is
   * what the front desk mostly hears: somebody came in about one thing.
   * It used to be the other way round, behind a checkbox worded as a
   * negative, so the whole car was inspected unless the operator noticed
   * the sentence and ticked it.
   *
   * True sends no requested parts at all, and the work card then offers
   * every checkpoint the vehicle's category has -- see
   * `technician-work-view.service.ts`, which falls back to the whole
   * catalogue when nothing was requested.
   */
  protected readonly fullInspection = signal<boolean>(false);

  /**
   * What the operator is typing against one subsystem, before they add it.
   *
   * Keyed by subsystem so two half-typed notes cannot overwrite each
   * other while the customer is still talking.
   */
  protected readonly ownSymptom = signal<Record<string, string>>({});

  protected setOwnSymptom(subsystemId: string, value: string): void {
    this.ownSymptom.update((current) => ({ ...current, [subsystemId]: value }));
  }

  /**
   * Adds what the customer actually said to the complaint.
   *
   * Prefixed with the system it belongs to, because the complaint is one
   * line of text by the time it reaches the technician and "it whistles"
   * against the turbo means something different from "it whistles"
   * against the brakes.
   */
  protected addOwnSymptom(subsystem: CarSubsystemConfig): void {
    const typed = (this.ownSymptom()[subsystem.id] ?? '').trim();
    if (!typed) return;

    const text = `${subsystem.nameEn}: ${typed}`;
    const previous = this.complaint().trim();
    if (!previous.includes(text)) {
      this.complaint.set(previous ? `${previous} • ${text}` : text);
    }
    this.setOwnSymptom(subsystem.id, '');
  }

  protected readonly inspectionDeclined = signal<boolean>(false);
  protected readonly isSubmittingIntake = signal<boolean>(false);
  protected readonly intakeError = signal<string | null>(null);

  // Register Walk-in Customer & Vehicle modal state
  protected readonly isRegisterModalOpen = signal<boolean>(false);
  protected readonly regFullName = signal<string>('');
  protected readonly regPhone = signal<string>('');
  protected readonly regEmail = signal<string>('');
  protected readonly regPlate = signal<string>('');
  protected readonly regCategory = signal<'CARS' | 'MOTORCYCLES' | 'HEAVY_EQUIPMENT'>('CARS');
  protected readonly regVin = signal<string>('');
  protected readonly regMake = signal<string>('');
  protected readonly regModel = signal<string>('');
  protected readonly makeSearch = signal<string>('');
  protected readonly modelSearch = signal<string>('');
  /** True once the operator says the model is not in the list. */
  protected readonly modelIsOther = signal<boolean>(false);

  /**
   * The marques worth offering for the kind of vehicle being registered.
   *
   * Narrowed by category because a motorcycle is not a Mercedes and a
   * list that says otherwise wastes the operator's time -- and because
   * the make is the key the parts catalogue matches on, so a wrong one
   * is not cosmetic.
   */
  protected readonly availableMakes = computed(() =>
    makesForCategory(this.regCategory() as OperatingCategory),
  );

  /**
   * The makes the operator can currently see.
   *
   * Ordered by how often this market meets them, never alphabetically:
   * the counter reaches for Toyota far more often than for Porsche, and
   * an A-to-Z list puts Audi first for no reason anybody at a desk cares
   * about. The search box exists for the long tail.
   */
  protected readonly visibleMakes = computed(() => {
    const needle = this.makeSearch().trim().toLowerCase();
    const makes = this.availableMakes();
    if (!needle) return makes;
    return makes.filter(
      (make) => make.label.toLowerCase().includes(needle) || make.id.includes(needle),
    );
  });

  /** The models of the chosen make, most common first, narrowed by its own search. */
  protected readonly visibleModels = computed(() => {
    const models = modelsForMake(this.regMake());
    const needle = this.modelSearch().trim().toLowerCase();
    if (!needle) return models;
    return models.filter((model) => model.toLowerCase().includes(needle));
  });

  /** Choosing a make throws away a model that belonged to the previous one. */
  protected chooseMake(makeId: string): void {
    this.regMake.set(makeId);
    this.regModel.set('');
    this.modelSearch.set('');
    this.modelIsOther.set(false);
  }

  /** The chosen make's name, for the row that replaces the picker. */
  protected readonly chosenMakeLabel = computed(() => findVehicleMake(this.regMake())?.label ?? '');

  protected chooseModel(model: string): void {
    this.regModel.set(model);
    this.modelIsOther.set(false);
  }

  /** Clearing the make when the category changes: a KTM is not a truck. */
  protected setRegCategory(category: 'CARS' | 'MOTORCYCLES' | 'HEAVY_EQUIPMENT'): void {
    this.regCategory.set(category);
    this.makeSearch.set('');
    if (!this.availableMakes().some((make) => make.id === this.regMake())) this.chooseMake('');
  }
  protected readonly isRegistering = signal<boolean>(false);
  protected readonly registerError = signal<string | null>(null);

  // ════════════════════════════════════════════════════════════════════
  // ── INSPECTION REPORTS & QUOTE WORKSPACE STATE ───────────────────────
  // ════════════════════════════════════════════════════════════════════
  protected readonly inspectionReports = signal<OperatorInspectionReportItem[]>([]);

  /**
   * The approvals queue, narrowed by the same box that searches the vehicles.
   *
   * One search box serves both lists because the operator has one question --
   * "where is this customer's car?" -- and should not have to know which of
   * the two lists currently holds the answer. Matched against everything the
   * counter might be handed: a name, a plate, a phone number, a VIN, or the
   * job number off a printed slip.
   */
  protected readonly visibleReports = computed(() => {
    const q = this.searchQuery().trim().toLowerCase();
    const all = this.inspectionReports();
    if (!q) return all;
    return all.filter((r) =>
      [
        r.vehicle.plateNumber,
        r.vehicle.model,
        r.vehicle.vin,
        r.customer.name,
        r.customer.phone,
        r.workOrderId,
      ].some((field) => (field ?? '').toLowerCase().includes(q)),
    );
  });
  protected readonly isLoadingReports = signal<boolean>(false);
  protected readonly selectedReportDetail = signal<OperatorInspectionReportDetail | null>(null);
  protected readonly isReportModalOpen = signal<boolean>(false);
  protected readonly isLoadingReportDetail = signal<boolean>(false);
  protected readonly quoteError = signal<string | null>(null);
  protected readonly isSavingQuote = signal<boolean>(false);
  protected readonly isDispatchingRepair = signal<boolean>(false);

  /**
   * Whether this person may edit a quote and dispatch the repair.
   *
   * The two buttons used to be unconditional, because the server gated them on
   * a hardcoded list of role names in the controller and there was nothing for
   * the page to ask about. They are a real permission now
   * (workorders.branch.dispatch_repair), so a workshop that has not delegated
   * it to this person gets a read-only report rather than two buttons that
   * answer 403.
   */
  protected readonly canDispatchRepair = signal<boolean>(false);

  // Editable quote state
  protected readonly editableFindings = signal<OperatorInspectionFinding[]>([]);
  protected readonly editableParts = signal<OperatorInspectionPart[]>([]);
  protected readonly editableServices = signal<OperatorInspectionService[]>([]);
  protected readonly quoteNote = signal<string>('');

  // Approval selection & expansion state (Image 2)
  protected readonly approvedFindingIndices = signal<Set<number>>(new Set());

  // Computed Totals & Severity Counts matching Image 2
  protected readonly criticalCount = computed(() =>
    this.editableFindings().filter((f) => f.severity === 'CRITICAL').length,
  );
  protected readonly highCount = computed(() =>
    this.editableFindings().filter((f) => f.severity === 'HIGH').length,
  );
  protected readonly mediumCount = computed(() =>
    this.editableFindings().filter((f) => f.severity === 'MEDIUM').length,
  );
  protected readonly lowCount = computed(() =>
    this.editableFindings().filter((f) => f.severity === 'LOW' || !f.severity).length,
  );
  protected readonly approvedFindingsCount = computed(() => this.approvedFindingIndices().size);

  /**
   * What the customer is being asked for, given what is ticked.
   *
   * The totals used to sum the whole report however much of it was approved,
   * so the operator read one figure to the customer and the job was dispatched
   * for another.
   */
  protected readonly quotePartsTotal = computed(() =>
    this.approvedParts().reduce((acc, p) => acc + (Number(p.unitPrice) || 0) * (Number(p.quantity) || 1), 0),
  );
  protected readonly quoteLaborTotal = computed(() =>
    this.approvedServices().reduce((acc, s) => acc + (Number(s.laborPrice) || 0), 0),
  );
  protected readonly quoteGrandTotal = computed(() =>
    this.quotePartsTotal() + this.quoteLaborTotal(),
  );

  constructor() {
    this.access
      .can('workorders.branch.dispatch_repair')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((allowed) => this.canDispatchRepair.set(allowed));
    this.loadOverview();
    this.loadInspectionReports();

    this.destroyRef.onDestroy(() => {
      if (this.searchTimer !== null) clearTimeout(this.searchTimer);
    });
  }

  protected loadOverview(): void {
    this.state.set('loading');
    this.errorMessage.set(null);

    this.api
      .overview()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (data) => {
          this.vehicles.set(data.vehicles);
          this.state.set('ready');
        },
        error: (err) => {
          this.errorMessage.set(err.message ?? 'Failed to load reception overview.');
          this.state.set('error');
        },
      });
  }

  /**
   * The counter types; the list answers.
   *
   * Someone standing at the desk reading a plate off a windscreen does not
   * press Enter, so the search runs as they type. It is debounced because
   * the vehicles list is a server query -- the list on screen holds only the
   * hundred most recent vehicles, and the customer in front of them may not
   * be among those hundred.
   */
  protected onSearchInput(value: string): void {
    this.searchQuery.set(value ?? '');
    if (this.activeTab() !== 'reception') {
      // The approvals queue is loaded whole, so `visibleReports` filters it
      // in place and there is nothing to ask the server for.
      return;
    }
    if (this.searchTimer !== null) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.runSearch(), SEARCH_DEBOUNCE_MS) as unknown as number;
  }

  protected runSearch(): void {
    if (this.searchTimer !== null) {
      clearTimeout(this.searchTimer);
      this.searchTimer = null;
    }
    if (this.activeTab() !== 'reception') return;

    const q = this.searchQuery().trim();
    if (!q) {
      this.loadOverview();
      return;
    }

    this.isSearching.set(true);
    this.api
      .search(q)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (results) => {
          this.vehicles.set(results);
          this.isSearching.set(false);
        },
        error: () => {
          this.isSearching.set(false);
        },
      });
  }

  protected clearSearch(): void {
    this.searchQuery.set('');
    if (this.searchTimer !== null) {
      clearTimeout(this.searchTimer);
      this.searchTimer = null;
    }
    if (this.activeTab() === 'reception') this.loadOverview();
  }

  /* ------------------------------------------------------------------ *
   * Pre-Selected Vehicle Intake Flow (No vehicle selector in modal!)
   * ------------------------------------------------------------------ */
  protected openIntakeForVehicle(vehicle: OperatorVehicle): void {
    this.selectedVehicle.set(vehicle);
    this.intakeError.set(null);
    this.selectedSubsystemKeys.set([]);
    this.complaint.set('');
    this.inspectionDeclined.set(false);
    this.fullInspection.set(false);
    this.ownSymptom.set({});
    this.isIntakeModalOpen.set(true);
  }

  protected closeIntakeModal(): void {
    if (this.isSubmittingIntake()) return;
    this.isIntakeModalOpen.set(false);
    this.selectedVehicle.set(null);
  }

  protected toggleSubsystem(key: string): void {
    const current = this.selectedSubsystemKeys();
    if (current.includes(key)) {
      this.selectedSubsystemKeys.set(current.filter((k) => k !== key));
    } else {
      this.selectedSubsystemKeys.set([...current, key]);
    }
  }

  protected getSubsystem(key: string): CarSubsystemConfig | undefined {
    return CAR_SUBSYSTEMS.find((s) => s.id === key);
  }

  protected isSymptomAdded(symptom: { en: string; ar: string }): boolean {
    return this.complaint().includes(symptom.en);
  }

  protected toggleSymptomInComplaint(symptom: { en: string; ar: string }): void {
    const text = symptom.en;
    const prev = this.complaint().trim();
    if (!prev) {
      this.complaint.set(text);
    } else if (prev.includes(text)) {
      const filtered = prev
        .split(' • ')
        .map((s) => s.trim())
        .filter((s) => s && s !== text);
      this.complaint.set(filtered.join(' • '));
    } else {
      this.complaint.set(`${prev} • ${text}`);
    }
  }

  protected submitIntake(): void {
    const vehicle = this.selectedVehicle();
    if (!vehicle) return;

    const selectedKeys = this.selectedSubsystemKeys();
    let text = this.complaint().trim();
    if (!text && selectedKeys.length > 0) {
      const names = selectedKeys
        .map((k) => {
          const cfg = CAR_SUBSYSTEMS.find((s) => s.id === k);
          return cfg ? cfg.nameEn : k;
        })
        .join(', ');
      text = `Inspection requested for: ${names}`;
    } else if (!text && this.fullInspection()) {
      // A full inspection is a complete instruction on its own: nothing is
      // wrong that the customer can name, look at everything.
      text = 'Full inspection requested.';
    } else if (!text) {
      this.intakeError.set('Tick where the problem is, or write what the customer said.');
      return;
    }

    this.isSubmittingIntake.set(true);
    this.intakeError.set(null);

    this.api
      .createIntake({
        assetId: vehicle.id,
        complaint: text,
        inspectionDeclined: this.inspectionDeclined(),
        // A full inspection is the ABSENCE of a requested list: the work
        // card offers every checkpoint the category has when nothing was
        // asked for specifically. Sending all twenty-eight ids would say
        // the same thing in a way the card would have to undo.
        inspectionParts: this.fullInspection() || selectedKeys.length === 0 ? undefined : selectedKeys,
        fullInspection: this.fullInspection() ? true : undefined,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.isSubmittingIntake.set(false);
          this.isIntakeModalOpen.set(false);
          this.showSuccessNotification(
            `Service registered for ${vehicle.plateNumber || 'Vehicle'} (Job #${result.workOrderId.slice(-6).toUpperCase()})!`,
          );
          this.loadOverview();
        },
        error: (err) => {
          this.isSubmittingIntake.set(false);
          this.intakeError.set(err.message ?? 'Failed to register intake. Please try again.');
        },
      });
  }

  /* ------------------------------------------------------------------ *
   * Register Walk-in Customer & Vehicle Flow
   * ------------------------------------------------------------------ */
  protected openRegisterModal(): void {
    this.regFullName.set('');
    this.regPhone.set('');
    this.regEmail.set('');
    this.regPlate.set('');
    this.regCategory.set('CARS');
    this.regVin.set('');
    this.regMake.set('');
    this.regModel.set('');
    this.makeSearch.set('');
    this.modelSearch.set('');
    this.modelIsOther.set(false);
    this.registerError.set(null);
    this.isRegisterModalOpen.set(true);
  }

  protected closeRegisterModal(): void {
    if (this.isRegistering()) return;
    this.isRegisterModalOpen.set(false);
  }

  protected submitRegister(): void {
    const fullName = this.regFullName().trim();
    const phone = this.regPhone().trim();
    const plateNumber = this.regPlate().trim().toUpperCase();

    if (!fullName || !phone || !plateNumber) {
      this.registerError.set('Customer Name, Phone number, and Vehicle Plate are required.');
      return;
    }

    this.isRegistering.set(true);
    this.registerError.set(null);

    const payload: RegisterCustomerVehiclePayload = {
      fullName,
      phone,
      email: this.regEmail().trim() || undefined,
      plateNumber,
      category: this.regCategory(),
      vinOrChassisNumber: this.regVin().trim() || undefined,
      make: this.regMake() || undefined,
      model: this.regModel().trim() || undefined,
    };

    this.api
      .registerCustomerVehicle(payload)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (createdVehicle) => {
          this.isRegistering.set(false);
          this.isRegisterModalOpen.set(false);
          this.showSuccessNotification(
            `Vehicle ${createdVehicle.plateNumber} and customer ${createdVehicle.ownerName} registered successfully!`,
          );
          this.loadOverview();
        },
        error: (err) => {
          this.isRegistering.set(false);
          this.registerError.set(err.message ?? 'Failed to register vehicle.');
        },
      });
  }

  protected showSuccessNotification(message: string): void {
    this.successNotification.set(message);
    setTimeout(() => this.successNotification.set(null), 6000);
  }

  /* ------------------------------------------------------------------ *
   * Inspection Reports & Quote Building Workspace Flow
   * ------------------------------------------------------------------ */
  protected switchTab(tab: 'reception' | 'inspection-reports'): void {
    this.activeTab.set(tab);
    if (tab === 'inspection-reports') {
      this.loadInspectionReports();
    } else if (this.searchQuery().trim()) {
      // The box is shared, so the query the operator typed against one list
      // has to be honoured by the other rather than silently dropped.
      this.runSearch();
    } else {
      this.loadOverview();
    }
  }

  protected loadInspectionReports(): void {
    this.isLoadingReports.set(true);
    this.api
      .getInspectionReports()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (reports: any[]) => {
          const normalized: OperatorInspectionReportItem[] = (reports || []).map((r) => ({
            workOrderId: r.workOrderId,
            vehicle: {
              id: r.vehicle?.id ?? 'asset',
              plateNumber: r.vehicle?.plateNumber ?? r.identifier ?? 'Vehicle',
              model: r.vehicle?.model ?? r.vehicleModel ?? 'Vehicle',
              vin: r.vehicle?.vin ?? r.vin ?? '—',
            },
            customer: {
              id: r.customer?.id ?? 'cust',
              name: r.customer?.name ?? r.customerName ?? 'Customer',
              phone: r.customer?.phone ?? r.customerPhone ?? '',
            },
            submittedAt: r.submittedAt,
            status: r.status,
            findingsCount: r.findingsCount ?? (r.findings ? r.findings.length : 0),
            partsCount: r.partsCount ?? (r.parts ? r.parts.length : 0),
            servicesCount: r.servicesCount ?? (r.services ? r.services.length : 0),
            totalEstimate: Number(r.totalEstimate ?? r.pricing?.grandTotal ?? 0),
          }));
          this.inspectionReports.set(normalized);
          this.isLoadingReports.set(false);
        },
        error: (err) => {
          this.isLoadingReports.set(false);
          this.errorMessage.set(err.message ?? 'Failed to load inspection reports.');
        },
      });
  }

  protected openReportDetail(report: OperatorInspectionReportItem | { workOrderId: string }): void {
    this.isLoadingReportDetail.set(true);
    this.quoteError.set(null);
    this.isReportModalOpen.set(true);

    this.api
      .getInspectionReportDetail(report.workOrderId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (detail: any) => {
          const plate = detail.vehicle?.plateNumber ?? detail.identifier ?? 'Vehicle';
          const model = detail.vehicle?.model ?? detail.vehicleModel ?? 'Vehicle';
          const vin = detail.vehicle?.vin ?? detail.vin ?? '—';
          const custName = detail.customer?.name ?? detail.customerName ?? 'Customer';
          const custPhone = detail.customer?.phone ?? detail.customerPhone ?? '';

          const findings = detail.inspection?.findings ?? detail.findings ?? [];
          const parts = detail.inspection?.parts ?? detail.parts ?? [];
          const services = detail.inspection?.services ?? detail.services ?? [];
          const note = detail.inspection?.note ?? detail.notes ?? '';

          const normalized: OperatorInspectionReportDetail = {
            workOrderId: detail.workOrderId,
            status: detail.status,
            vehicle: {
              id: detail.vehicle?.id ?? 'asset',
              plateNumber: plate,
              model,
              vin,
            },
            customer: {
              id: detail.customer?.id ?? 'cust',
              name: custName,
              phone: custPhone,
            },
            inspection: {
              id: detail.inspection?.id,
              submittedAt: detail.inspection?.submittedAt ?? detail.submittedAt,
              submittedBy: detail.inspection?.submittedBy,
              note,
              findings,
              parts,
              services,
              pricing: detail.inspection?.pricing ?? detail.pricing ?? {
                partsTotal: 0,
                laborTotal: 0,
                grandTotal: 0,
              },
            },
          };

          this.selectedReportDetail.set(normalized);
          this.isLoadingReportDetail.set(false);
          // Initialize editable state
          this.editableFindings.set([...findings]);
          this.editableParts.set([...parts]);
          this.editableServices.set([...services]);
          this.quoteNote.set(note);

          // Default all findings to approved
          const approved = new Set<number>();
          for (let i = 0; i < findings.length; i++) {
            approved.add(i);
          }
          this.approvedFindingIndices.set(approved);
        },
        error: (err) => {
          this.isLoadingReportDetail.set(false);
          this.quoteError.set(err.message ?? 'Failed to load report details.');
        },
      });
  }

  protected openReportForWorkOrderId(workOrderId: string): void {
    this.openReportDetail({ workOrderId });
  }

  protected closeReportModal(): void {
    if (this.isDispatchingRepair()) return;
    this.isReportModalOpen.set(false);
    this.selectedReportDetail.set(null);
  }

  // Findings Approval Selection (Image 2)
  protected isFindingApproved(index: number): boolean {
    return this.approvedFindingIndices().has(index);
  }

  protected toggleFindingApproval(index: number): void {
    const next = new Set(this.approvedFindingIndices());
    if (next.has(index)) {
      next.delete(index);
    } else {
      next.add(index);
    }
    this.approvedFindingIndices.set(next);
  }

  protected toggleAllFindings(approved: boolean): void {
    if (approved) {
      const all = new Set<number>();
      for (let i = 0; i < this.editableFindings().length; i++) {
        all.add(i);
      }
      this.approvedFindingIndices.set(all);
    } else {
      this.approvedFindingIndices.set(new Set());
    }
  }

  // Finding display
  protected getFindingTitle(f: OperatorInspectionFinding): string {
    return f.recommendedService || f.description || 'Inspection Finding';
  }

  /**
   * What the technician attached to this finding.
   *
   * Read-only on this screen, and grouped by the key the technician attached
   * it under. Before parts carried a `findingCode` the report reached the
   * front desk as one flat list, which made "approve this finding but not that
   * one" meaningless: the operator could approve a subset of the findings and
   * still dispatch — and charge for — every part on the job.
   */
  protected partsForFinding(f: OperatorInspectionFinding): readonly OperatorInspectionPart[] {
    const code = f.code;
    if (!code) return [];
    return this.editableParts().filter((p) => p.findingCode === code);
  }

  protected servicesForFinding(f: OperatorInspectionFinding): readonly OperatorInspectionService[] {
    const code = f.code;
    if (!code) return [];
    return this.editableServices().filter((s) => s.findingCode === code);
  }

  /** The codes this report's findings actually use. */
  private findingCodes(): ReadonlySet<string> {
    return new Set(this.editableFindings().map((f) => f.code).filter((c): c is string => !!c));
  }

  /**
   * Lines that name no finding, or name one this report does not contain.
   *
   * Shown rather than hidden: they are part of what is being approved, and an
   * approval screen that omits half the bill is worse than one that looks
   * untidy. Reports written before parts carried a finding key land here too.
   */
  protected unassignedParts(): readonly OperatorInspectionPart[] {
    const known = this.findingCodes();
    return this.editableParts().filter((p) => !p.findingCode || !known.has(p.findingCode));
  }

  protected unassignedServices(): readonly OperatorInspectionService[] {
    const known = this.findingCodes();
    return this.editableServices().filter((s) => !s.findingCode || !known.has(s.findingCode));
  }

  /**
   * The lines the operator is actually approving: everything attached to a
   * ticked finding, plus everything attached to no finding at all.
   */
  protected approvedParts(): readonly OperatorInspectionPart[] {
    const approved = new Set(
      this.editableFindings()
        .filter((_, i) => this.isFindingApproved(i))
        .map((f) => f.code)
        .filter((c): c is string => !!c),
    );
    return this.editableParts().filter(
      (p) => !p.findingCode || !this.findingCodes().has(p.findingCode) || approved.has(p.findingCode),
    );
  }

  protected approvedServices(): readonly OperatorInspectionService[] {
    const approved = new Set(
      this.editableFindings()
        .filter((_, i) => this.isFindingApproved(i))
        .map((f) => f.code)
        .filter((c): c is string => !!c),
    );
    return this.editableServices().filter(
      (s) => !s.findingCode || !this.findingCodes().has(s.findingCode) || approved.has(s.findingCode),
    );
  }
  // Dispatch to Repair (Technician stage 2)
  protected dispatchToRepair(): void {
    const detail = this.selectedReportDetail();
    if (!detail) return;

    this.isDispatchingRepair.set(true);
    this.quoteError.set(null);

    // Only dispatch approved findings, parts, and services
    const approvedFindings = this.editableFindings().filter((_, i) => this.isFindingApproved(i));
    const approvedFindingIds = this.editableFindings()
      .map((f, i) => (this.isFindingApproved(i) ? (f.id || f.code || String(i)) : null))
      .filter((id): id is string => id !== null);

    // Only what belongs to an approved finding.
    //
    // This said "Filter parts and services associated with approved findings"
    // and then sent `this.editableParts()` -- every part on the job. So an
    // operator who approved one finding out of twenty-four still dispatched,
    // reserved and charged for the whole report, and the checkbox beside each
    // finding decided nothing but the task list.
    const approvedParts = this.approvedParts();
    const approvedPartIds = approvedParts.map((p) => String(p.id || p.sku || p.name));

    const approvedServices = this.approvedServices();
    const approvedServiceIds = approvedServices.map((s) => String(s.id || s.serviceName));

    const tasks: Array<{ title: string; estimatedMinutes?: number }> = [];
    for (const s of approvedServices) {
      tasks.push({ title: s.serviceName, estimatedMinutes: 60 });
    }
    for (const f of approvedFindings) {
      const title = f.recommendedService ? `Repair: ${f.recommendedService} (${f.description})` : `Fix: ${f.description}`;
      if (!tasks.some((t) => t.title === title)) {
        tasks.push({ title, estimatedMinutes: 45 });
      }
    }

    if (tasks.length === 0) {
      tasks.push({ title: 'Standard Vehicle Maintenance & Quality Check', estimatedMinutes: 45 });
    }

    // Call approveRepair directly on the backend
    this.api
      .approveRepair(detail.workOrderId, {
        approvedFindingIds,
        approvedPartIds,
        approvedServiceIds,
        approvedFindings,
        approvedServices: [...approvedServices],
        operatorNote: this.quoteNote(),
        tasks,
        // `$${total}` -- a literal dollar sign in a note stored on the work
        // order, in a product whose workshops price in EGP and AED. The
        // template sweep in REC-040 could not see this one: it is in
        // TypeScript, not a template, so `lint-template-money` never read it.
        note: `Quote approved for ${this.money(this.quoteGrandTotal())} (${approvedFindings.length} findings approved). Dispatched to repair floor.`,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.isDispatchingRepair.set(false);
          this.closeReportModal();
          // The deposit, when the workshop asks for one, is the next thing
          // that happens at the counter -- so it is said here, on the screen
          // the operator is already looking at, and not left in a settings
          // page nobody reads at the moment the customer is standing there.
          const deposit = result?.depositDue
            ? ` Collect a ${this.money(result.depositDue)} deposit before work starts.`
            : '';
          this.showSuccessNotification(
            `Work order for ${detail.vehicle.plateNumber || 'vehicle'} approved & dispatched to repair!${deposit}`,
          );
          this.loadInspectionReports();
          this.loadOverview();
        },
        error: (err) => {
          this.isDispatchingRepair.set(false);
          this.quoteError.set(err.message ?? 'Failed to approve & dispatch work order.');
        },
      });
  }

  async logout(): Promise<void> {
    await this.authStore.logout();
    await this.router.navigate(['/login']);
  }
}

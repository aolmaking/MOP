import { Component, DestroyRef, inject, signal, computed } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ButtonDirective } from '../../ui/button/button.directive';
import { AuthStore } from '../../identity/auth.store';
import { AccessApi } from '../../identity/access.api';
import { WorkshopBrandingService } from '../../ui/workshop-branding.service';
import { formatMoney } from '../../ui/money';
import { AnimatedPartIconComponent } from '../../shared/components/animated-part/animated-part-icon.component';
import { CAR_SUBSYSTEMS, type CarSubsystemConfig } from '../../shared/components/car-3d/car-subsystems';
import {
  OperatorApi,
  type OperatorCatalogItem,
  type OperatorInspectionFinding,
  type OperatorInspectionPart,
  type OperatorInspectionReportDetail,
  type OperatorInspectionReportItem,
  type OperatorInspectionService,
  type OperatorOverview,
  type OperatorVehicle,
  type RegisterCustomerVehiclePayload,
} from './operator.api';

type State = 'loading' | 'ready' | 'forbidden' | 'error';

export const PRESET_SERVICES: ReadonlyArray<{ name: string; labor: number }> = [
  { name: 'Front Brake Pads Replacement', labor: 80 },
  { name: 'Rear Brake Pads Replacement', labor: 80 },
  { name: 'Engine Oil & Filter Service', labor: 45 },
  { name: 'Tire Mounting & Wheel Balancing', labor: 60 },
  { name: 'Wheel Alignment Inspection & Calibration', labor: 75 },
  { name: 'Car Battery Replacement & Terminal Clean', labor: 35 },
  { name: 'Cooling System Flush & Refill', labor: 90 },
  { name: 'Suspension Strut / Shock Absorber Service', labor: 120 },
  { name: 'Air & Cabin Filter Replacement', labor: 30 },
  { name: 'Comprehensive Multi-Point Safety Check', labor: 50 },
];

@Component({
  selector: 'app-operator-home',
  imports: [RouterLink, FormsModule, ButtonDirective, AnimatedPartIconComponent],
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


  protected readonly session = this.authStore.session;
  protected readonly state = signal<State>('loading');
  protected readonly errorMessage = signal<string | null>(null);

  // Active top-level tab: Reception intake vs Technician inspection reports
  protected readonly activeTab = signal<'reception' | 'inspection-reports'>('reception');

  // Overview data
  protected readonly overviewData = signal<OperatorOverview | null>(null);
  protected readonly vehicles = signal<OperatorVehicle[]>([]);
  protected readonly searchQuery = signal<string>('');
  protected readonly isSearching = signal<boolean>(false);

  // Success toast
  protected readonly successNotification = signal<string | null>(null);

  // Pre-selected vehicle intake modal state
  protected readonly isIntakeModalOpen = signal<boolean>(false);
  protected readonly selectedVehicle = signal<OperatorVehicle | null>(null);
  protected readonly allSubsystems = signal<readonly CarSubsystemConfig[]>(CAR_SUBSYSTEMS);
  protected readonly selectedSubsystemKeys = signal<string[]>(['cooling', 'brakes']);
  protected readonly complaint = signal<string>('');
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
  protected readonly isRegistering = signal<boolean>(false);
  protected readonly registerError = signal<string | null>(null);

  // ════════════════════════════════════════════════════════════════════
  // ── INSPECTION REPORTS & QUOTE WORKSPACE STATE ───────────────────────
  // ════════════════════════════════════════════════════════════════════
  protected readonly inspectionReports = signal<OperatorInspectionReportItem[]>([]);
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

  // POS Picker modal state
  protected readonly isPosPickerOpen = signal<boolean>(false);
  protected readonly posSearch = signal<string>('');
  protected readonly posCatalogItems = signal<readonly OperatorCatalogItem[]>([]);
  protected readonly isSearchingPos = signal<boolean>(false);
  protected readonly posSelectedQty = signal<number>(1);

  // Service Picker state
  protected readonly isServicePickerOpen = signal<boolean>(false);
  protected readonly presetServices = PRESET_SERVICES;
  protected readonly customServiceName = signal<string>('');
  protected readonly customServiceLabor = signal<number>(50);

  // Approval selection & expansion state (Image 2)
  protected readonly approvedFindingIndices = signal<Set<number>>(new Set());
  protected readonly expandedFindingIndices = signal<Set<number>>(new Set());
  protected readonly targetFindingIndex = signal<number | null>(null);

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
  }

  protected loadOverview(): void {
    this.state.set('loading');
    this.errorMessage.set(null);

    this.api
      .overview()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (data) => {
          this.overviewData.set(data);
          this.vehicles.set(data.vehicles);
          this.state.set('ready');
        },
        error: (err) => {
          this.errorMessage.set(err.message ?? 'Failed to load reception overview.');
          this.state.set('error');
        },
      });
  }

  protected onSearch(): void {
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
    this.loadOverview();
  }

  /* ------------------------------------------------------------------ *
   * Pre-Selected Vehicle Intake Flow (No vehicle selector in modal!)
   * ------------------------------------------------------------------ */
  protected openIntakeForVehicle(vehicle: OperatorVehicle): void {
    this.selectedVehicle.set(vehicle);
    this.intakeError.set(null);
    this.selectedSubsystemKeys.set(['cooling', 'brakes']);
    this.complaint.set('');
    this.inspectionDeclined.set(false);
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
    } else if (!text) {
      this.intakeError.set('Please select inspection parts or enter issue description.');
      return;
    }

    this.isSubmittingIntake.set(true);
    this.intakeError.set(null);

    this.api
      .createIntake({
        assetId: vehicle.id,
        complaint: text,
        inspectionDeclined: this.inspectionDeclined(),
        inspectionParts: selectedKeys.length > 0 ? selectedKeys : undefined,
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
          this.expandedFindingIndices.set(new Set());
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

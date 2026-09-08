import { Component, DestroyRef, inject, signal, computed } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ButtonDirective } from '../../ui/button/button.directive';
import { AuthStore } from '../../identity/auth.store';
import { WorkshopBrandingService } from '../../ui/workshop-branding.service';
import { AnimatedPartIconComponent } from '../../shared/components/animated-part/animated-part-icon.component';
import { CAR_SUBSYSTEMS, type CarSubsystemConfig } from '../../shared/components/car-3d/car-subsystems';
import {
  OperatorApi,
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
  private readonly authStore = inject(AuthStore);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly branding = inject(WorkshopBrandingService);

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

  // Editable quote state
  protected readonly editableFindings = signal<OperatorInspectionFinding[]>([]);
  protected readonly editableParts = signal<OperatorInspectionPart[]>([]);
  protected readonly editableServices = signal<OperatorInspectionService[]>([]);
  protected readonly quoteNote = signal<string>('');

  // POS Picker modal state
  protected readonly isPosPickerOpen = signal<boolean>(false);
  protected readonly posSearch = signal<string>('');
  protected readonly posCatalogItems = signal<any[]>([]);
  protected readonly isSearchingPos = signal<boolean>(false);
  protected readonly posSelectedQty = signal<number>(1);

  // Service Picker state
  protected readonly isServicePickerOpen = signal<boolean>(false);
  protected readonly presetServices = PRESET_SERVICES;
  protected readonly customServiceName = signal<string>('');
  protected readonly customServiceLabor = signal<number>(50);

  // Computed Totals
  protected readonly quotePartsTotal = computed(() =>
    this.editableParts().reduce((acc, p) => acc + (Number(p.unitPrice) || 0) * (Number(p.quantity) || 1), 0),
  );
  protected readonly quoteLaborTotal = computed(() =>
    this.editableServices().reduce((acc, s) => acc + (Number(s.laborPrice) || 0), 0),
  );
  protected readonly quoteGrandTotal = computed(() =>
    this.quotePartsTotal() + this.quoteLaborTotal(),
  );

  constructor() {
    this.loadOverview();
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
        next: (reports) => {
          this.inspectionReports.set(reports);
          this.isLoadingReports.set(false);
        },
        error: (err) => {
          this.isLoadingReports.set(false);
          this.errorMessage.set(err.message ?? 'Failed to load inspection reports.');
        },
      });
  }

  protected openReportDetail(report: OperatorInspectionReportItem): void {
    this.isLoadingReportDetail.set(true);
    this.quoteError.set(null);
    this.isReportModalOpen.set(true);

    this.api
      .getInspectionReportDetail(report.workOrderId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (detail) => {
          this.selectedReportDetail.set(detail);
          this.isLoadingReportDetail.set(false);
          // Initialize editable state
          this.editableFindings.set(detail.inspection?.findings ? [...detail.inspection.findings] : []);
          this.editableParts.set(detail.inspection?.parts ? [...detail.inspection.parts] : []);
          this.editableServices.set(detail.inspection?.services ? [...detail.inspection.services] : []);
          this.quoteNote.set(detail.inspection?.note ?? '');
        },
        error: (err) => {
          this.isLoadingReportDetail.set(false);
          this.quoteError.set(err.message ?? 'Failed to load report details.');
        },
      });
  }

  protected closeReportModal(): void {
    if (this.isSavingQuote() || this.isDispatchingRepair()) return;
    this.isReportModalOpen.set(false);
    this.selectedReportDetail.set(null);
    this.closePosPicker();
    this.closeServicePicker();
  }

  // Findings Severity & Editing
  protected updateFindingSeverity(index: number, severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'): void {
    const list = [...this.editableFindings()];
    if (list[index]) {
      list[index] = { ...list[index], severity };
      this.editableFindings.set(list);
    }
  }

  protected addFinding(): void {
    this.editableFindings.update((prev) => [
      ...prev,
      {
        description: 'New vehicle inspection finding',
        severity: 'MEDIUM',
        recommendedService: 'Inspection & Repair',
      },
    ]);
  }

  protected removeFinding(index: number): void {
    this.editableFindings.update((prev) => prev.filter((_, i) => i !== index));
  }

  // POS Parts
  protected openPosPicker(): void {
    this.isPosPickerOpen.set(true);
    this.posSearch.set('');
    this.posSelectedQty.set(1);
    this.searchPosCatalog();
  }

  protected closePosPicker(): void {
    this.isPosPickerOpen.set(false);
  }

  protected searchPosCatalog(): void {
    this.isSearchingPos.set(true);
    const q = this.posSearch().trim();
    this.api
      .posCatalog({ q: q || undefined, inStockOnly: false })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.isSearchingPos.set(false);
          const items = res?.items ?? res ?? [];
          this.posCatalogItems.set(items);
        },
        error: () => {
          this.isSearchingPos.set(false);
          this.posCatalogItems.set([]);
        },
      });
  }

  protected addPartFromPos(item: any): void {
    const sku = item.sku || item.partNumber || `SKU-${Date.now().toString().slice(-4)}`;
    const name = item.name || item.nameEn || item.description || 'Inventory Part';
    const unitPrice = Number(item.price || item.unitPrice || item.retailPrice || 50);
    const quantity = Math.max(1, Number(this.posSelectedQty()) || 1);

    // If already in list, increase quantity
    const existingIndex = this.editableParts().findIndex((p) => p.sku === sku);
    if (existingIndex >= 0) {
      const updated = [...this.editableParts()];
      updated[existingIndex] = {
        ...updated[existingIndex],
        quantity: updated[existingIndex].quantity + quantity,
      };
      this.editableParts.set(updated);
    } else {
      this.editableParts.update((prev) => [
        ...prev,
        { sku, name, quantity, unitPrice },
      ]);
    }

    this.closePosPicker();
  }

  protected removePart(index: number): void {
    this.editableParts.update((prev) => prev.filter((_, i) => i !== index));
  }

  protected updatePartQty(index: number, quantity: number): void {
    if (quantity < 1) return;
    const list = [...this.editableParts()];
    if (list[index]) {
      list[index] = { ...list[index], quantity };
      this.editableParts.set(list);
    }
  }

  // Services
  protected openServicePicker(): void {
    this.isServicePickerOpen.set(true);
    this.customServiceName.set('');
    this.customServiceLabor.set(50);
  }

  protected closeServicePicker(): void {
    this.isServicePickerOpen.set(false);
  }

  protected addPresetService(srv: { name: string; labor: number }): void {
    this.editableServices.update((prev) => [
      ...prev,
      { serviceName: srv.name, laborPrice: srv.labor },
    ]);
    this.closeServicePicker();
  }

  protected addCustomService(): void {
    const name = this.customServiceName().trim();
    if (!name) return;
    const labor = Number(this.customServiceLabor()) || 0;
    this.editableServices.update((prev) => [
      ...prev,
      { serviceName: name, laborPrice: labor },
    ]);
    this.closeServicePicker();
  }

  protected removeService(index: number): void {
    this.editableServices.update((prev) => prev.filter((_, i) => i !== index));
  }

  // Save Quote
  protected saveQuote(): void {
    const detail = this.selectedReportDetail();
    if (!detail) return;

    this.isSavingQuote.set(true);
    this.quoteError.set(null);

    this.api
      .updateQuote(detail.workOrderId, {
        findings: this.editableFindings(),
        parts: this.editableParts(),
        services: this.editableServices(),
        note: this.quoteNote(),
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.isSavingQuote.set(false);
          this.showSuccessNotification(`Quote updated successfully for ${detail.vehicle.plateNumber || 'work order'}!`);
          this.loadInspectionReports();
        },
        error: (err) => {
          this.isSavingQuote.set(false);
          this.quoteError.set(err.message ?? 'Failed to save quote.');
        },
      });
  }

  // Dispatch to Repair (Technician stage 2)
  protected dispatchToRepair(): void {
    const detail = this.selectedReportDetail();
    if (!detail) return;

    this.isDispatchingRepair.set(true);
    this.quoteError.set(null);

    // Generate tasks from services and critical/medium findings
    const tasks: Array<{ title: string; estimatedMinutes?: number }> = [];
    for (const s of this.editableServices()) {
      tasks.push({ title: s.serviceName, estimatedMinutes: 60 });
    }
    for (const f of this.editableFindings()) {
      if (f.severity === 'CRITICAL' || f.severity === 'HIGH') {
        const title = f.recommendedService ? `Repair: ${f.recommendedService} (${f.description})` : `Fix: ${f.description}`;
        if (!tasks.some((t) => t.title === title)) {
          tasks.push({ title, estimatedMinutes: 45 });
        }
      }
    }

    if (tasks.length === 0) {
      tasks.push({ title: 'Standard Vehicle Maintenance & Quality Check', estimatedMinutes: 45 });
    }

    // First save latest quote
    this.api
      .updateQuote(detail.workOrderId, {
        findings: this.editableFindings(),
        parts: this.editableParts(),
        services: this.editableServices(),
        note: this.quoteNote(),
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          // Then dispatch repair
          this.api
            .dispatchRepair(detail.workOrderId, {
              tasks,
              note: `Quote approved for $${this.quoteGrandTotal().toFixed(2)}. Dispatched to repair floor.`,
            })
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
              next: () => {
                this.isDispatchingRepair.set(false);
                this.closeReportModal();
                this.showSuccessNotification(
                  `Work order for ${detail.vehicle.plateNumber || 'vehicle'} approved & dispatched to repair! Technician can now start fixing.`,
                );
                this.loadInspectionReports();
              },
              error: (err) => {
                this.isDispatchingRepair.set(false);
                this.quoteError.set(err.message ?? 'Failed to dispatch work order to repair.');
              },
            });
        },
        error: (err) => {
          this.isDispatchingRepair.set(false);
          this.quoteError.set(err.message ?? 'Failed to save quote before dispatch.');
        },
      });
  }

  async logout(): Promise<void> {
    await this.authStore.logout();
    await this.router.navigate(['/login']);
  }
}

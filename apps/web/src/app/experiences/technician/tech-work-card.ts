import { Component, DestroyRef, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { WorkflowStrip, type JourneyAction } from '../../domain/journey/workflow-strip';
import { PartList, type PartClarification, type PartReturn } from './part-list';
import { TechVehicleHistory } from './tech-vehicle-history';
import { pollJourney, type JourneyFeed } from '../../domain/journey/journey-poller';
import type { PresentedError } from '../../runtime/http/error.interceptor';
import {
  TechnicianApi,
  type FindingDecisionStatus,
  type InspectionBoxItem,
  type PartCard,
  type RecordInspectionPayload,
  type TechnicianTask,
  type WorkCard,
  type WorkCardFinding,
  type WorkCardPart,
  type GroupedSuggestionsView,
  type RankedServiceItemView,
  type GeneratedRecommendationView,
  type RecommendationDecisionView,
  type ResolvedFitmentItemView,
  type GroupedFitmentResponseView,
} from './technician.api';
import { WorkshopBrandingService } from '../../ui/workshop-branding.service';
import { formatMoney } from '../../ui/money';
import { Car3dViewerComponent } from '../../shared/components/car-3d/car-3d-viewer.component';
import { AnimatedPartIconComponent } from '../../shared/components/animated-part/animated-part-icon.component';
import { MECHANIC_HERO_IMG } from '../../shared/components/car-3d/car-studio-assets';

type State = 'loading' | 'ready' | 'not-mine' | 'forbidden' | 'error';

const BLOCKER_REASONS = [
  { key: 'TOOL_MISSING', label: 'Missing a tool' },
  { key: 'NEED_TEAM_LEADER', label: 'Need the team leader' },
  { key: 'UNCLEAR_DIAGNOSIS', label: "Don't know what's wrong" },
  { key: 'SAFETY_ISSUE', label: 'Not safe to continue' },
  { key: 'WAITING_CUSTOMER', label: 'Need the customer' },
] as const;

@Component({
  selector: 'app-tech-work-card',
  imports: [
    RouterLink,
    WorkflowStrip,
    PartList,
    TechVehicleHistory,
    Car3dViewerComponent,
    AnimatedPartIconComponent,
  ],
  templateUrl: './tech-work-card.html',
  styleUrl: './tech-work-card.css',
})
export class TechWorkCard {
  private readonly api = inject(TechnicianApi);
  private readonly branding = inject(WorkshopBrandingService);

  /**
   * A money value printed in the workshop's currency.
   *
   * This card wrote a literal dollar sign in front of every part price,
   * labour price and quote total, so an Egyptian workshop showed its
   * technician a quote in dollars.
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

  private readonly destroyRef = inject(DestroyRef);

  readonly id = input.required<string>();

  protected readonly mechanicHeroImg = MECHANIC_HERO_IMG;
  protected readonly card = signal<WorkCard | null>(null);
  private feed: JourneyFeed | null = null;
  protected readonly journey = computed(() => this.feed?.journey() ?? null);
  protected readonly state = signal<State>('loading');
  protected readonly busy = signal<string | null>(null);
  protected readonly actionError = signal<string | null>(null);

  protected readonly panel = signal<'none' | 'blocker' | 'fault' | 'external'>('none');
  protected readonly faultText = signal('');
  protected readonly inspectionNote = signal('');
  protected readonly faultSeverity = signal('MEDIUM');
  protected readonly taskMinutes = signal<Record<string, string>>({});

  protected readonly missionFindingOpen = signal(false);
  protected readonly inspectionType = signal<'QUICK' | 'FULL'>('QUICK');
  protected readonly inspectionOdometer = signal('');
  protected readonly inspectionMinutes = signal('');

  protected readonly active3dPart = signal<string>('ac');
  protected readonly customerDetailModalBox = signal<InspectionBoxItem | null>(null);
  protected readonly togglingBox = signal<string | null>(null);

  protected readonly inspectionBoxes = computed(() => this.card()?.inspectionBoxes ?? []);
  protected readonly completedBoxesCount = computed(() => this.inspectionBoxes().filter((b) => b.isDone).length);
  protected readonly totalBoxesCount = computed(() => this.inspectionBoxes().length);
  protected readonly allBoxesDone = computed(
    () => this.totalBoxesCount() > 0 && this.completedBoxesCount() === this.totalBoxesCount(),
  );
  protected readonly highlighted3dParts = computed(() => this.inspectionBoxes().map((b) => b.partKey));

  protected readonly isInspectionState = computed(() => {
    const c = this.card();
    if (!c) return false;
    if (c.status === 'APPROVED_FOR_WORK' || c.status === 'IN_PROGRESS' || c.status === 'COMPLETED') {
      return false;
    }
    return c.status === 'UNDER_INSPECTION' || c.status === 'REGISTERED';
  });

  protected openCustomerDetailModal(box: InspectionBoxItem): void {
    this.customerDetailModalBox.set(box);
  }

  protected closeCustomerDetailModal(): void {
    this.customerDetailModalBox.set(null);
  }

  protected on3dPartSelected(partKey: string): void {
    this.active3dPart.set(partKey);
  }

  protected toggleBoxDone(box: InspectionBoxItem): void {
    const nextState = !box.isDone;
    this.togglingBox.set(box.partKey);

    const currentCard = this.card();
    if (currentCard && currentCard.inspectionBoxes) {
      const updatedBoxes = currentCard.inspectionBoxes.map((b) =>
        b.partKey === box.partKey ? { ...b, isDone: nextState, completedAt: nextState ? new Date().toISOString() : null } : b,
      );
      this.card.set({ ...currentCard, inspectionBoxes: updatedBoxes });
    }

    const slug = this.mapPartToSlug(box.partKey);

    this.api.markInspectionBoxDone(this.id(), box.partKey, nextState).subscribe({
      next: () => {
        this.togglingBox.set(null);
        // Sync delta to Domain Aggregate with OCC
        this.syncTargetToAggregate(
          box.partKey,
          slug,
          'FRONT',
          nextState ? 'INSPECTED' : 'NOT_ACCESSIBLE',
          nextState ? 'GOOD' : undefined,
        );
      },
      error: () => {
        this.togglingBox.set(null);
        if (currentCard) this.card.set(currentCard);
      },
    });
  }

  // Live View shrinkable / extendable header state for fixing stage
  protected readonly headerExpanded = signal<boolean>(false);
  protected readonly isSubmittingReport = signal<boolean>(false);
  protected readonly reportSubmittedSuccess = signal<string | null>(null);

  // Live tracking expandable drawer in Repair Stage
  protected readonly liveTrackingDetailsOpen = signal<boolean>(false);

  // Inspection Multi-Stage Workflow signals (Checkpoints -> Findings & POS Parts -> Awaiting Operator)
  protected readonly inspectionSubStep = signal<'checkpoints' | 'findings_and_parts' | 'awaiting_operator'>('checkpoints');

  // Findings list matching Photo 3
  protected readonly findings = signal<Array<{
    id: string;
    partKey: string;
    title: string;
    description: string;
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  }>>([]);

  // Phase A-E Domain Aggregate Signals
  protected readonly inspectionAggregate = signal<any | null>(null);
  protected readonly aggregateVersion = signal<number>(1);
  protected readonly generatedRecommendations = signal<GeneratedRecommendationView[]>([]);
  protected readonly recommendationDecisions = signal<RecommendationDecisionView[]>([]);
  protected readonly fitmentCatalog = signal<Record<string, GroupedFitmentResponseView>>({});
  protected readonly isFitmentLoading = signal<boolean>(false);
  protected readonly activeFitmentSlug = signal<string>('brake-pads-front');
  protected readonly dismissingRec = signal<GeneratedRecommendationView | null>(null);
  protected readonly dismissalReasonInput = signal<string>('');

  protected readonly isAddFindingOpen = signal<boolean>(false);
  protected readonly newFindingPart = signal<string>('tires');
  protected readonly newFindingTitle = signal<string>('');
  protected readonly newFindingDesc = signal<string>('');
  protected readonly newFindingSeverity = signal<'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'>('MEDIUM');

  // POS Parts Catalog & Selection (Real Workshop Stock with Fallback)
  protected readonly DEFAULT_POS_ITEMS = [
    { id: 'pos-1', sku: 'BRK-PAD-01', name: 'Ceramic Brake Pads (Front)', category: 'Brakes', unitPrice: 65, stock: 12 },
    { id: 'pos-2', sku: 'BRK-ROT-02', name: 'Slotted Disc Brake Rotors (Pair)', category: 'Brakes', unitPrice: 140, stock: 6 },
    { id: 'pos-3', sku: 'BAT-12V-60AH', name: 'AGM Heavy Duty Battery 12V 60Ah', category: 'Battery', unitPrice: 165, stock: 8 },
    { id: 'pos-4', sku: 'OIL-SYN-5W30', name: 'Full Synthetic Engine Oil 5W-30 (4L)', category: 'Fluids', unitPrice: 48, stock: 25 },
    { id: 'pos-5', sku: 'FLT-OIL-09', name: 'Spin-on Premium Oil Filter', category: 'Fluids', unitPrice: 15, stock: 30 },
    { id: 'pos-6', sku: 'FLT-CAB-03', name: 'Activated Carbon Cabin Air Filter', category: 'AC', unitPrice: 22, stock: 14 },
    { id: 'pos-7', sku: 'FLT-ENG-04', name: 'High-Flow Engine Air Filter', category: 'Engine', unitPrice: 25, stock: 18 },
    { id: 'pos-8', sku: 'SPK-PLG-IR4', name: 'Iridium Spark Plugs (Set of 4)', category: 'Ignition', unitPrice: 52, stock: 16 },
    { id: 'pos-9', sku: 'WPR-BLD-22', name: 'All-Weather Wiper Blades 22" (Pair)', category: 'Wipers', unitPrice: 30, stock: 20 },
    { id: 'pos-10', sku: 'CLN-5050-01', name: 'Long-Life Coolant Premix 50/50 (4L)', category: 'Cooling', unitPrice: 28, stock: 15 },
    { id: 'pos-11', sku: 'SUS-STR-01', name: 'Front Strut Shock Absorber Assembly', category: 'Suspension', unitPrice: 125, stock: 4 },
    { id: 'pos-12', sku: 'TIR-205-55-16', name: 'Michelin Primacy 205/55 R16 Tire', category: 'Tires', unitPrice: 110, stock: 8 },
  ];

  protected readonly workshopInventory = signal<
    Array<{ id: string; sku: string; name: string; category: string; unitPrice: number; stock: number }>
  >([]);
  protected readonly isInventoryLoading = signal<boolean>(false);

  // Two-Tier Context-Aware Smart Suggestions
  protected readonly smartSuggestions = signal<GroupedSuggestionsView | null>(null);
  protected readonly isSuggestionsLoading = signal<boolean>(false);

  protected readonly posModalOpen = signal<boolean>(false);
  protected readonly posSearchQuery = signal<string>('');
  protected readonly filteredPosCatalog = computed(() => {
    const q = this.posSearchQuery().toLowerCase().trim();
    const source = this.workshopInventory().length > 0 ? this.workshopInventory() : this.DEFAULT_POS_ITEMS;
    if (!q) return source;
    return source.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        item.sku.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q),
    );
  });

  protected readonly selectedPosParts = signal<
    Array<{ sku: string; name: string; quantity: number; unitPrice: number }>
  >([]);

  // Per-Box Attached POS Parts & Services for Large Inspection Cards
  protected readonly activeBoxPartKey = signal<string | null>(null);
  protected readonly openServicesBoxKey = signal<string | null>(null);
  protected readonly boxAttachedParts = signal<Record<string, Array<{ sku: string; name: string; quantity: number; unitPrice: number; stock?: number }>>>({});
  protected readonly boxAttachedServices = signal<Record<string, Array<{ serviceName: string; laborPrice: number }>>>({});

  // Subsystem Predefined Service Suggestions
  protected readonly COMPONENT_SERVICE_SUGGESTIONS: Record<string, Array<{ serviceName: string; laborPrice: number }>> = {
    brakes: [
      { serviceName: 'Front Brake Pads Replacement', laborPrice: 80 },
      { serviceName: 'Rear Brake Pads Replacement', laborPrice: 80 },
      { serviceName: 'Brake Disc Rotor Resurfacing / Replacement', laborPrice: 110 },
      { serviceName: 'Brake Fluid Bleed & Flush Service', laborPrice: 45 },
      { serviceName: 'Brake Caliper Servicing & Pin Lube', laborPrice: 55 },
    ],
    battery: [
      { serviceName: 'Car Battery Replacement & Terminal Clean', laborPrice: 35 },
      { serviceName: 'Alternator Charging Diagnostics & Test', laborPrice: 40 },
      { serviceName: 'Electrical Parasitic Draw Diagnostics', laborPrice: 65 },
      { serviceName: 'Battery Cable & Ground Wire Replacement', laborPrice: 45 },
    ],
    tires: [
      { serviceName: 'Tire Mounting & Wheel Balancing (Set of 4)', laborPrice: 60 },
      { serviceName: 'Computerized 4-Wheel Alignment Calibration', laborPrice: 75 },
      { serviceName: 'Tire Rotation & Pressure Sensor Reset (TPMS)', laborPrice: 30 },
      { serviceName: 'Tubeless Tire Puncture Patch Repair', laborPrice: 20 },
    ],
    fluids: [
      { serviceName: 'Full Synthetic Engine Oil & Filter Change', laborPrice: 45 },
      { serviceName: 'Automatic Transmission Fluid (ATF) Flush', laborPrice: 95 },
      { serviceName: 'Power Steering Fluid Replacement & Bleed', laborPrice: 40 },
      { serviceName: 'Differential Gear Oil Service', laborPrice: 50 },
    ],
    engine: [
      { serviceName: 'Engine Valve Cover Gasket Replacement', laborPrice: 110 },
      { serviceName: 'Serpentine Accessory Drive Belt Replacement', laborPrice: 50 },
      { serviceName: 'Engine Ignition Spark Plugs Replacement (Set of 4)', laborPrice: 60 },
      { serviceName: 'Engine Diagnostic Scan & Fault Code Erase', laborPrice: 45 },
    ],
    transmission: [
      { serviceName: 'Transmission Service & Fluid Pan Gasket', laborPrice: 120 },
      { serviceName: 'Gearbox Mount & Bushing Replacement', laborPrice: 85 },
      { serviceName: 'Clutch Disc & Pressure Plate Assembly Service', laborPrice: 220 },
    ],
    suspension: [
      { serviceName: 'Front Strut & Coil Spring Assembly Service', laborPrice: 120 },
      { serviceName: 'Front Lower Control Arm & Ball Joint Replacement', laborPrice: 95 },
      { serviceName: 'Sway Bar End Links & Bushings Replacement', laborPrice: 50 },
      { serviceName: 'Rear Shock Absorbers Replacement (Pair)', laborPrice: 90 },
    ],
    cooling: [
      { serviceName: 'Engine Coolant Flush & Premix Refill', laborPrice: 60 },
      { serviceName: 'Radiator Replacement & Hose Inspection', laborPrice: 110 },
      { serviceName: 'Cooling Water Pump & Thermostat Replacement', laborPrice: 130 },
    ],
    ac: [
      { serviceName: 'A/C Refrigerant Evacuate & Recharge (R134a)', laborPrice: 75 },
      { serviceName: 'Cabin Air Odor Treatment & Filter Replacement', laborPrice: 35 },
      { serviceName: 'A/C Compressor Clutch & Belt Servicing', laborPrice: 115 },
      { serviceName: 'Climate Control Blower Motor Replacement', laborPrice: 80 },
    ],
    steering: [
      { serviceName: 'Tie Rod Ends Inner & Outer Replacement', laborPrice: 75 },
      { serviceName: 'Power Steering Rack & Pinion Adjustment', laborPrice: 130 },
      { serviceName: 'Steering Column Clock Spring Replacement', laborPrice: 85 },
    ],
    exhaust: [
      { serviceName: 'Exhaust Muffler & Hanger Bushing Service', laborPrice: 65 },
      { serviceName: 'Exhaust Manifold Flange Gasket Replacement', laborPrice: 90 },
      { serviceName: 'Oxygen (O2) Sensor Replacement', laborPrice: 50 },
    ],
  };

  protected getPartsForFinding(partKey: string): Array<{ sku: string; name: string; quantity: number; unitPrice: number; stock?: number }> {
    return this.boxAttachedParts()[partKey] ?? [];
  }

  protected getServicesForFinding(partKey: string): Array<{ serviceName: string; laborPrice: number }> {
    return this.boxAttachedServices()[partKey] ?? [];
  }

  protected getComponentServiceSuggestions(partKey: string): Array<{ serviceName: string; laborPrice: number }> {
    const k = (partKey || '').toLowerCase();
    for (const key of Object.keys(this.COMPONENT_SERVICE_SUGGESTIONS)) {
      if (k.includes(key)) return this.COMPONENT_SERVICE_SUGGESTIONS[key];
    }
    return [
      { serviceName: 'Standard Diagnostic & Inspection Labor', laborPrice: 50 },
      { serviceName: 'Component Adjustment & Lubrication', laborPrice: 40 },
    ];
  }

  protected readonly totalEstimatedQuote = computed(() => {
    let partsSum = 0;
    for (const parts of Object.values(this.boxAttachedParts())) {
      for (const p of parts) {
        partsSum += p.unitPrice * p.quantity;
      }
    }
    for (const p of this.selectedPosParts()) {
      partsSum += p.unitPrice * p.quantity;
    }

    let laborSum = 0;
    for (const srvs of Object.values(this.boxAttachedServices())) {
      for (const s of srvs) {
        laborSum += s.laborPrice;
      }
    }
    for (const s of this.selectedServices()) {
      laborSum += s.laborPrice;
    }

    return { partsSum, laborSum, grandTotal: partsSum + laborSum };
  });

  // Services & Labor
  protected readonly COMMON_SERVICES = [
    { serviceName: 'Brake Pad & Rotor Replacement', laborPrice: 90 },
    { serviceName: 'Synthetic Oil & Filter Service', laborPrice: 45 },
    { serviceName: 'Battery Testing & Replacement Service', laborPrice: 30 },
    { serviceName: 'Tire Mounting, Balancing & Alignment', laborPrice: 65 },
    { serviceName: 'Comprehensive Multi-Point Diagnostics', laborPrice: 50 },
    { serviceName: 'Cabin & Air Filter Replacement', laborPrice: 25 },
    { serviceName: 'Spark Plug Replacement Service', laborPrice: 55 },
  ] as const;

  protected readonly isAddServiceOpen = signal<boolean>(false);
  protected readonly selectedServices = signal<Array<{ serviceName: string; laborPrice: number }>>([]);
  protected readonly customServiceName = signal<string>('');
  protected readonly customServicePrice = signal<string>('');

  // Pieces shelf drawings computation for Repair stage
  protected readonly repairPieces = computed(() => {
    const c = this.card();
    if (!c) return [];
    const set = new Map<string, { partKey: string; name: string; status: string; action: string }>();

    // From assigned tasks
    for (const t of c.tasks) {
      const lower = t.title.toLowerCase();
      let key = 'general';
      let name = t.title;
      if (lower.includes('gear') || lower.includes('trans')) { key = 'transmission'; name = 'Gearbox / Transmission'; }
      else if (lower.includes('brake')) { key = 'brakes'; name = 'Brake System'; }
      else if (lower.includes('oil') || lower.includes('fluid')) { key = 'fluids'; name = 'Engine Oil & Lubrication'; }
      else if (lower.includes('bat')) { key = 'battery'; name = 'Electrical Battery'; }
      else if (lower.includes('tire') || lower.includes('wheel')) { key = 'tires'; name = 'Wheels & Tires'; }
      else if (lower.includes('cool') || lower.includes('radiat')) { key = 'cooling'; name = 'Engine Cooling'; }
      else if (lower.includes('ac') || lower.includes('air')) { key = 'ac'; name = 'Climate & A/C'; }
      else if (lower.includes('susp')) { key = 'suspension'; name = 'Suspension & Struts'; }

      set.set(key, {
        partKey: key,
        name,
        status: t.status === 'DONE' ? 'Completed' : t.status === 'IN_PROGRESS' ? 'Active Repair' : 'Assigned',
        action: t.title,
      });
    }

    // From allocated parts
    for (const p of c.parts) {
      const lower = p.name.toLowerCase();
      let key = 'general';
      if (lower.includes('gear') || lower.includes('trans')) key = 'transmission';
      else if (lower.includes('brake')) key = 'brakes';
      else if (lower.includes('oil') || lower.includes('fluid')) key = 'fluids';
      else if (lower.includes('bat')) key = 'battery';
      else if (lower.includes('tire') || lower.includes('wheel')) key = 'tires';
      else if (lower.includes('cool')) key = 'cooling';
      else if (lower.includes('susp')) key = 'suspension';

      if (!set.has(key)) {
        set.set(key, {
          partKey: key,
          name: p.name,
          status: p.status === 'FITTED' ? 'Fitted' : p.status === 'RECEIVED' ? 'Ready to fit' : 'Allocated',
          action: `${p.quantity}x ${p.name}`,
        });
      }
    }

    // Default foundation pieces matching typical inspection cycle if nothing populated
    if (set.size === 0) {
      set.set('tires', { partKey: 'tires', name: 'Alloy Wheels & Tires', status: 'Inspected', action: 'Tread & Pressure Checked' });
      set.set('battery', { partKey: 'battery', name: '12V Battery Pack', status: 'Voltage Tested', action: 'Charging Diagnostics' });
      set.set('brakes', { partKey: 'brakes', name: 'Brake Disc & Calipers', status: 'Allocated', action: 'Pad Replacement Ready' });
      set.set('fluids', { partKey: 'fluids', name: 'Engine Oil & Lubrication', status: 'Pending Flush', action: 'Synthetic 5W-30' });
    }

    return Array.from(set.values());
  });

  protected toggleHeaderExpanded(): void {
    this.headerExpanded.update((expanded) => !expanded);
  }

  protected toggleLiveTrackingDetails(): void {
    this.liveTrackingDetailsOpen.update((open) => !open);
  }

  protected proceedToFindingsAndParts(): void {
    const boxes = this.inspectionBoxes();
    const list: Array<{
      id: string;
      partKey: string;
      title: string;
      description: string;
      severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    }> = [];

    for (const b of boxes) {
      const existing = this.findings().find((f) => f.partKey === b.partKey);
      const desc = b.symptoms && b.symptoms.length > 0
        ? b.symptoms.join(', ')
        : `Comprehensive inspection and standards check for ${b.nameEn}.`;
      list.push({
        id: existing ? existing.id : 'find-' + b.partKey,
        partKey: b.partKey,
        title: b.nameEn,
        description: existing ? existing.description : desc,
        severity: existing ? existing.severity : 'MEDIUM',
      });
    }

    if (list.length === 0) {
      list.push(
        { id: 'find-brakes', partKey: 'brakes', title: 'Brake System', description: 'Brake pads, rotors, caliper slide pins & brake fluid.', severity: 'CRITICAL' },
        { id: 'find-battery', partKey: 'battery', title: 'Battery & Electrical', description: '12V battery state of health, terminals & alternator test.', severity: 'MEDIUM' },
        { id: 'find-steering', partKey: 'steering', title: 'Steering & Mechanism', description: 'Rack, pinion, tie rod ends & power steering fluid.', severity: 'LOW' },
        { id: 'find-tires', partKey: 'tires', title: 'Tires & Wheels', description: 'Tread depth, sidewall condition, balancing & TPMS sensor.', severity: 'MEDIUM' },
      );
    }

    this.findings.set(list);
    this.inspectionSubStep.set('findings_and_parts');
    this.triggerSmartSuggestions();
  }

  protected backToCheckpoints(): void {
    this.inspectionSubStep.set('checkpoints');
  }

  protected openAddFinding(): void {
    this.isAddFindingOpen.set(true);
  }

  protected closeAddFinding(): void {
    this.isAddFindingOpen.set(false);
  }

  protected addFinding(): void {
    const title = this.newFindingTitle().trim();
    const desc = this.newFindingDesc().trim();
    if (!title) return;

    const part = this.newFindingPart();
    const sev = this.newFindingSeverity();
    const slug = this.mapPartToSlug(part);

    this.findings.update((list) => [
      ...list,
      {
        id: 'find-' + Date.now(),
        partKey: part,
        title,
        description: desc || 'Issue noted during technician inspection.',
        severity: sev,
      },
    ]);

    this.newFindingTitle.set('');
    this.newFindingDesc.set('');
    this.isAddFindingOpen.set(false);

    // Sync delta to Domain Aggregate with OCC (Phase A.2, C)
    this.syncTargetToAggregate(
      part,
      slug,
      'FRONT',
      'INSPECTED',
      sev === 'CRITICAL' ? 'CRITICAL' : sev === 'HIGH' ? 'ATTENTION' : 'GOOD',
      [{ findingKey: `CAR_${part.toUpperCase()}_WEAR`, technicianObservation: desc || title }],
    );

    // Auto-resolve compatible SKUs from Vehicle Fitment Engine (Phase D)
    this.loadFitmentForPart(slug, 'FRONT');

    this.triggerSmartSuggestions(slug, 'FRONT', sev, desc || title);
  }

  protected removeFinding(id: string): void {
    this.findings.update((list) => list.filter((f) => f.id !== id));
  }

  protected updateFindingSeverity(id: string, severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'): void {
    this.findings.update((list) => list.map((f) => (f.id === id ? { ...f, severity } : f)));
    this.triggerSmartSuggestions(undefined, undefined, severity);
  }

  // Two-Tier Context-Aware Smart Suggestions Trigger
  protected triggerSmartSuggestions(canonicalSlug?: string, position?: string, severity?: string, description?: string): void {
    const slug = canonicalSlug ?? this.resolveFindingSlug();
    this.isSuggestionsLoading.set(true);
    this.api
      .getSmartSuggestions({
        workOrderId: this.id(),
        context: {
          canonicalPartSlug: slug,
          position: (position ?? 'FRONT') as any,
          finding: {
            severity: (severity ?? (this.findings().length > 0 ? this.findings()[0].severity : 'CRITICAL')) as any,
            symptom: 'WEAR',
            description: description ?? (this.findings().length > 0 ? this.findings()[0].description : 'Wear detected'),
          },
          vehicle: {
            category: 'CARS',
          },
        },
      })
      .subscribe({
        next: (res) => {
          this.isSuggestionsLoading.set(false);
          this.smartSuggestions.set(res);
        },
        error: () => {
          this.isSuggestionsLoading.set(false);
        },
      });
  }

  protected resolveFindingSlug(): string {
    const f = this.findings()[0];
    if (!f) return 'brake-pads-front';
    return this.mapPartToSlug(f.partKey);
  }

  protected mapPartToSlug(partKey: string): string {
    const p = (partKey || '').toLowerCase();
    if (p.includes('brake')) return 'brake-pads-front';
    if (p.includes('battery')) return 'battery-12v';
    if (p.includes('tire') || p.includes('wheel')) return 'tires-radials';
    if (p.includes('fluid') || p.includes('oil')) return 'engine-oil';
    if (p.includes('susp')) return 'front-struts';
    if (p.includes('ac') || p.includes('air')) return 'cabin-air-filter';
    return 'brake-pads-front';
  }

  // Phase A-E Domain Aggregate and Fitment Integration Methods
  protected loadInspection(): void {
    this.api.getInspectionAggregate(this.id()).subscribe({
      next: (agg) => {
        if (agg) {
          this.inspectionAggregate.set(agg);
          this.aggregateVersion.set(agg.aggregateVersion ?? 1);
          this.generatedRecommendations.set(agg.recommendations || []);
          this.recommendationDecisions.set(agg.decisions || []);
        }
      },
      error: () => {
        // Uninitialized or legacy row
      },
    });
  }

  protected syncTargetToAggregate(
    targetKey: string,
    canonicalPartSlug: string,
    position: string = 'FRONT',
    status: 'INSPECTED' | 'NOT_ACCESSIBLE' | 'NOT_APPLICABLE' = 'INSPECTED',
    condition: 'GOOD' | 'ATTENTION' | 'CRITICAL' = 'GOOD',
    findings?: Array<{ findingKey: string; technicianObservation?: string }>,
  ): void {
    this.api
      .patchInspectionTarget(this.id(), targetKey, {
        canonicalPartSlug,
        position,
        status,
        condition,
        findings,
        expectedVersion: this.aggregateVersion(),
      })
      .subscribe({
        next: (res) => {
          if (res.aggregateVersion) {
            this.aggregateVersion.set(res.aggregateVersion);
          }
          if (res.newlyGeneratedRecommendations && res.newlyGeneratedRecommendations.length > 0) {
            this.generatedRecommendations.set(res.newlyGeneratedRecommendations);
          }
        },
        error: (err: PresentedError) => {
          if (err.httpStatus === 409) {
            this.actionError.set('⚠️ Concurrency conflict detected: Another device updated this inspection. Reloading latest state...');
            this.loadInspection();
          }
        },
      });
  }

  protected acceptRecommendation(rec: GeneratedRecommendationView): void {
    this.api
      .recordRecommendationDecision(this.id(), {
        recommendationId: rec.id,
        decision: 'ACCEPTED',
        expectedVersion: this.aggregateVersion(),
      })
      .subscribe({
        next: (res) => {
          this.aggregateVersion.set(res.aggregateVersion);
          this.recommendationDecisions.update((list) => [
            ...list.filter((d) => d.recommendationId !== rec.id),
            res.decision,
          ]);
          this.addService(rec.serviceDisplayName, 65);
        },
        error: (err: PresentedError) => {
          if (err.httpStatus === 409) {
            this.actionError.set('⚠️ Concurrency conflict detected. Reloading...');
            this.loadInspection();
          } else {
            this.actionError.set(err.message ?? 'Failed to accept recommendation');
          }
        },
      });
  }

  protected openDismissModal(rec: GeneratedRecommendationView): void {
    this.dismissingRec.set(rec);
    this.dismissalReasonInput.set('');
  }

  protected cancelDismissModal(): void {
    this.dismissingRec.set(null);
    this.dismissalReasonInput.set('');
  }

  protected confirmDismissRecommendation(): void {
    const rec = this.dismissingRec();
    const reason = this.dismissalReasonInput().trim();
    if (!rec) return;
    if (!reason) {
      this.actionError.set('A dismissal reason is mandatory to reject a recommendation (INV-5).');
      return;
    }

    this.api
      .recordRecommendationDecision(this.id(), {
        recommendationId: rec.id,
        decision: 'DISMISSED',
        dismissalReason: reason,
        expectedVersion: this.aggregateVersion(),
      })
      .subscribe({
        next: (res) => {
          this.aggregateVersion.set(res.aggregateVersion);
          this.recommendationDecisions.update((list) => [
            ...list.filter((d) => d.recommendationId !== rec.id),
            res.decision,
          ]);
          this.cancelDismissModal();
        },
        error: (err: PresentedError) => {
          if (err.httpStatus === 409) {
            this.actionError.set('⚠️ Concurrency conflict detected. Reloading...');
            this.loadInspection();
          } else {
            this.actionError.set(err.message ?? 'Failed to dismiss recommendation');
          }
        },
      });
  }

  protected getDecisionForRecommendation(recId: string): RecommendationDecisionView | null {
    return this.recommendationDecisions().find((d) => d.recommendationId === recId) ?? null;
  }

  protected loadFitmentForPart(canonicalPartSlug: string, position: string = 'FRONT'): void {
    this.isFitmentLoading.set(true);
    this.activeFitmentSlug.set(canonicalPartSlug);
    this.api.getFitmentParts(this.id(), canonicalPartSlug, position).subscribe({
      next: (res) => {
        this.isFitmentLoading.set(false);
        this.fitmentCatalog.update((cat) => ({ ...cat, [canonicalPartSlug]: res }));
      },
      error: () => {
        this.isFitmentLoading.set(false);
      },
    });
  }

  protected selectFitmentPart(part: ResolvedFitmentItemView): void {
    this.api.selectPartForWorkOrder(this.id(), { sku: part.sku, quantity: 1 }).subscribe({
      next: () => {
        this.selectedPosParts.update((list) => {
          const existing = list.find((p) => p.sku === part.sku);
          if (existing) {
            return list.map((p) => (p.sku === part.sku ? { ...p, quantity: p.quantity + 1 } : p));
          }
          return [...list, { sku: part.sku, name: part.partName, quantity: 1, unitPrice: part.sellingPrice }];
        });
      },
      error: (err: PresentedError) => {
        this.actionError.set(err.message ?? 'Failed to select fitment part');
      },
    });
  }

  protected isServiceSelected(serviceName: string): boolean {
    return this.selectedServices().some((s) => s.serviceName.toLowerCase() === serviceName.toLowerCase());
  }

  // POS Parts helpers (Live Workshop Inventory)
  protected openPosModal(): void {
    this.posModalOpen.set(true);
    if (this.workshopInventory().length === 0) {
      this.isInventoryLoading.set(true);
      this.api.getWorkshopInventory().subscribe({
        next: (res) => {
          this.isInventoryLoading.set(false);
          if (res && res.items && res.items.length > 0) {
            this.workshopInventory.set(
              res.items.map((i) => ({
                id: i.id,
                sku: i.sku,
                name: i.name,
                category: 'Workshop Stock',
                unitPrice: Number(i.sellingPrice) || 0,
                stock: i.availableStock ?? 8,
              })),
            );
          }
        },
        error: () => {
          this.isInventoryLoading.set(false);
        },
      });
    }
  }

  protected closePosModal(): void {
    this.posModalOpen.set(false);
    this.activeBoxPartKey.set(null);
  }

  protected openPosForFinding(finding: { partKey: string; title: string }): void {
    this.activeBoxPartKey.set(finding.partKey);
    this.posSearchQuery.set('');
    this.openPosModal();
  }

  protected toggleServicesForFinding(finding: { partKey: string; title: string }): void {
    const current = this.openServicesBoxKey();
    this.openServicesBoxKey.set(current === finding.partKey ? null : finding.partKey);
    if (this.openServicesBoxKey() === finding.partKey) {
      const slug = this.mapPartToSlug(finding.partKey);
      this.triggerSmartSuggestions(slug, 'FRONT');
    }
  }

  protected addPosPart(item: { sku: string; name: string; unitPrice: number; stock?: number }, quantity = 1): void {
    const boxKey = this.activeBoxPartKey();
    if (boxKey) {
      this.boxAttachedParts.update((map) => {
        const list = map[boxKey] ? [...map[boxKey]] : [];
        const idx = list.findIndex((p) => p.sku === item.sku);
        if (idx >= 0) {
          list[idx] = { ...list[idx], quantity: list[idx].quantity + quantity };
        } else {
          list.push({ sku: item.sku, name: item.name, quantity, unitPrice: item.unitPrice, stock: item.stock ?? 10 });
        }
        return { ...map, [boxKey]: list };
      });
    }

    this.selectedPosParts.update((list) => {
      const existing = list.find((p) => p.sku === item.sku);
      if (existing) {
        return list.map((p) => (p.sku === item.sku ? { ...p, quantity: p.quantity + quantity } : p));
      }
      return [...list, { sku: item.sku, name: item.name, quantity, unitPrice: item.unitPrice }];
    });
  }

  protected removePosPart(sku: string): void {
    this.selectedPosParts.update((list) => list.filter((p) => p.sku !== sku));
  }

  protected updatePosQuantity(sku: string, delta: number): void {
    this.selectedPosParts.update((list) =>
      list.map((p) => {
        if (p.sku !== sku) return p;
        const newQty = Math.max(1, p.quantity + delta);
        return { ...p, quantity: newQty };
      }),
    );
  }

  protected updateBoxPartQty(partKey: string, sku: string, delta: number): void {
    this.boxAttachedParts.update((map) => {
      const list = map[partKey] ? [...map[partKey]] : [];
      const updated = list.map((p) => {
        if (p.sku === sku) {
          return { ...p, quantity: Math.max(1, p.quantity + delta) };
        }
        return p;
      });
      return { ...map, [partKey]: updated };
    });
    this.updatePosQuantity(sku, delta);
  }

  protected removeBoxPart(partKey: string, sku: string): void {
    this.boxAttachedParts.update((map) => {
      const list = map[partKey] ? map[partKey].filter((p) => p.sku !== sku) : [];
      return { ...map, [partKey]: list };
    });
    this.removePosPart(sku);
  }

  protected addServiceToBox(partKey: string, name: string, price: number): void {
    this.boxAttachedServices.update((map) => {
      const list = map[partKey] ? [...map[partKey]] : [];
      if (!list.some((s) => s.serviceName.toLowerCase() === name.toLowerCase())) {
        list.push({ serviceName: name, laborPrice: price });
      }
      return { ...map, [partKey]: list };
    });
    this.addService(name, price);
  }

  protected removeBoxService(partKey: string, name: string): void {
    this.boxAttachedServices.update((map) => {
      const list = map[partKey] ? map[partKey].filter((s) => s.serviceName.toLowerCase() !== name.toLowerCase()) : [];
      return { ...map, [partKey]: list };
    });
    this.removeService(name);
  }

  protected isBoxServiceSelected(partKey: string, name: string): boolean {
    const list = this.boxAttachedServices()[partKey] ?? [];
    return list.some((s) => s.serviceName.toLowerCase() === name.toLowerCase());
  }

  // Services helpers
  protected openAddService(): void {
    this.isAddServiceOpen.set(true);
  }

  protected closeAddService(): void {
    this.isAddServiceOpen.set(false);
  }

  protected addService(name: string, price: number): void {
    this.selectedServices.update((list) => {
      if (list.some((s) => s.serviceName === name)) return list;
      return [...list, { serviceName: name, laborPrice: price }];
    });
  }

  protected addCustomService(): void {
    const name = this.customServiceName().trim();
    const price = Number(this.customServicePrice().trim()) || 45;
    if (!name) return;
    this.addService(name, price);
    this.customServiceName.set('');
    this.customServicePrice.set('');
    this.isAddServiceOpen.set(false);
  }

  protected removeService(name: string): void {
    this.selectedServices.update((list) => list.filter((s) => s.serviceName !== name));
  }

  /**
   * Complete inspection, attach POS parts and services, and submit report directly to Operator.
   */
  protected submitFindingsAndPartsReport(): void {
    const findingsList = this.findings().map((f) => ({
      description: `${f.title}: ${f.description}`,
      severity: f.severity,
      recommendedService: f.title,
      code: f.partKey,
    }));

    // Aggregate all parts from all boxes
    const allPartsMap = new Map<string, { sku: string; name: string; quantity: number; unitPrice: number }>();
    for (const [_, parts] of Object.entries(this.boxAttachedParts())) {
      for (const p of parts) {
        const exist = allPartsMap.get(p.sku);
        if (exist) exist.quantity += p.quantity;
        else allPartsMap.set(p.sku, { ...p });
      }
    }
    for (const p of this.selectedPosParts()) {
      if (!allPartsMap.has(p.sku)) {
        allPartsMap.set(p.sku, { ...p });
      }
    }
    const partsList = Array.from(allPartsMap.values());

    // Aggregate all services from all boxes
    const allServicesMap = new Map<string, { serviceName: string; laborPrice: number }>();
    for (const [_, srvs] of Object.entries(this.boxAttachedServices())) {
      for (const s of srvs) {
        allServicesMap.set(s.serviceName.toLowerCase(), { ...s });
      }
    }
    for (const s of this.selectedServices()) {
      if (!allServicesMap.has(s.serviceName.toLowerCase())) {
        allServicesMap.set(s.serviceName.toLowerCase(), { ...s });
      }
    }
    const servicesList = Array.from(allServicesMap.values());

    const payload = {
      findings:
        findingsList.length > 0
          ? findingsList
          : [
              {
                description: 'Comprehensive inspection completed at technician workstation',
                severity: 'LOW' as const,
                recommendedService: 'Routine Maintenance',
              },
            ],
      parts: partsList,
      services: servicesList,
      note:
        this.inspectionNote().trim() ||
        'Inspection findings, required POS parts, and labor services documented by technician. Awaiting operator approval & repair dispatch.',
    };

    this.isSubmittingReport.set(true);
    this.actionError.set(null);

    // Call submitInspectionReport directly to transition work order and create faults
    this.api.submitInspectionReport(this.id(), payload).subscribe({
      next: () => {
        // Also call aggregate submission if initialized
        this.api
          .submitInspectionAggregate(this.id(), {
            expectedVersion: this.aggregateVersion(),
            technicianNotes: payload.note,
          })
          .subscribe({
            next: () => {},
            error: () => {},
          });

        this.isSubmittingReport.set(false);
        this.inspectionSubStep.set('awaiting_operator');
        this.reportSubmittedSuccess.set(
          '✓ Inspection Report successfully sent to Operator Desk! Quotation awaiting review and dispatch.',
        );
        this.load();
      },
      error: (err: PresentedError) => {
        this.isSubmittingReport.set(false);
        this.actionError.set(err.message ?? 'Failed to submit inspection report.');
      },
    });
  }
  protected readonly askCustomer = signal(false);
  protected readonly faultPrice = signal('');
  protected readonly faultLaborPrice = signal('');
  private static readonly MONEY = /^\d+(\.\d{1,2})?$/;

  protected readonly reasons = BLOCKER_REASONS;

  /**
   * Only the parts still needing somebody -- settled ones are history.
   *
   * A part the technician could still send back counts as open even
   * when nobody is formally waiting on it: RECEIVED_BY_TECHNICIAN reads
   * as "yours to fit", and hiding the return door until something has
   * gone wrong is how a wrong part ends up fitted.
   */
  protected readonly openParts = computed(
    () => this.card()?.parts.filter((part) => part.waitingOn !== 'NOBODY' || part.returnable) ?? [],
  );

  /**
   * A move offered by the journey, performed.
   *
   * Routed by the server's own action KEY rather than by reading the
   * job's status here: which move is available from where is the
   * workflow graph's business, and re-deriving it on the tablet is how
   * the button and the endpoint come to disagree. An unrecognised key is
   * ignored rather than guessed at -- a new server-side action reaches
   * this client as nothing, never as the wrong request.
   */
  /**
   * Take the move the server offered.
   *
   * `workflow-journey.service.ts` decides which actions a technician is
   * offered at all -- it asks the graph AND the permission, and deliberately
   * withholds moves that belong to somebody else, because "a dead button
   * teaches people not to press buttons". So this handles exactly the keys it
   * can send, and says so out loud rather than returning quietly if that ever
   * stops being true: a button that does nothing is worse than one that is not
   * there.
   */
  protected runJourneyAction(action: JourneyAction): void {
    switch (action.key) {
      case 'start_inspection':
        this.run('primary', this.api.startInspection(this.id()));
        return;
      case 'start_work':
        this.run('primary', this.api.startWork(this.id()));
        return;
      default:
        this.actionError.set(`This page cannot perform "${action.label}" yet.`);
        return;
    }
  }

  protected receivePart(part: WorkCardPart): void {
    this.run(`part-${part.partRequestId}`, this.api.receivePart(part.partRequestId));
  }

  protected usePart(part: WorkCardPart): void {
    this.run(`part-${part.partRequestId}`, this.api.usePart(part.partRequestId));
  }

  protected returnPart(event: PartReturn): void {
    this.run(
      `return-${event.part.partRequestId}`,
      this.api.returnPart(event.part.partRequestId, event.quantity, event.reason),
    );
  }

  protected answerClarification(event: PartClarification): void {
    this.run(
      `clarify-${event.part.partRequestId}`,
      this.api.answerClarification(event.part.partRequestId, event.answer),
    );
  }

  /**
   * A part the workshop never held. Offered as its own door rather than
   * inside the picker, because the picker searches the workshop's own
   * catalogue and this part is by definition not in it.
   */
  protected readonly externalPartName = signal('');
  protected readonly externalProvenance = signal<'CUSTOMER_SUPPLIED' | 'EXTERNAL_PURCHASE'>('CUSTOMER_SUPPLIED');
  protected readonly externalQuantity = signal('1');
  protected readonly externalNameValid = computed(() => this.externalPartName().trim().length >= 1);

  protected addExternalPart(): void {
    if (!this.externalNameValid()) return;
    const quantity = Number(this.externalQuantity().trim());
    if (!Number.isInteger(quantity) || quantity < 1) {
      this.actionError.set('Say how many — a whole number, at least one.');
      return;
    }

    const name = this.externalPartName().trim();
    const provenance = this.externalProvenance();
    this.panel.set('none');
    this.externalPartName.set('');
    this.externalQuantity.set('1');
    this.run('external', this.api.addExternalPart(this.id(), name, provenance, quantity));
  }

  constructor() {
    // Keyed on the route id, not run once.
    //
    // Angular reuses this component when only the `:id` parameter
    // changes, so a one-shot load in the constructor left the previous
    // car's card, parts and history on screen after navigating from one
    // job to another. On a workshop tablet that is not a cosmetic bug:
    // it is a technician reading the wrong vehicle's parts and blockers
    // while holding a different car's key. The history panel below keys
    // itself off the same id for the same reason.
    effect(() => {
      const id = this.id();
      if (!id) return;
      untracked(() => this.reset());
      untracked(() => this.load());
    });
  }

  /** Everything that belongs to ONE job, cleared before another is loaded. */
  private reset(): void {
    this.card.set(null);
    this.state.set('loading');
    this.busy.set(null);
    this.actionError.set(null);
    this.panel.set('none');
    this.missionFindingOpen.set(false);
    this.inspectionType.set('QUICK');
    this.inspectionOdometer.set('');
    this.inspectionMinutes.set('');
    this.inspectionSubStep.set('checkpoints');
    this.findings.set([]);
    this.selectedPosParts.set([]);
    this.selectedServices.set([]);
    this.isAddFindingOpen.set(false);
    this.posModalOpen.set(false);
    this.isAddServiceOpen.set(false);
    this.liveTrackingDetailsOpen.set(false);
  }

  protected load(): void {
    this.state.set('loading');
    this.loadInspection();
    this.api.workCard(this.id()).subscribe({
      next: (card) => {
        this.card.set(card);
        this.state.set('ready');
        const isAwaitingOp =
          (card.inspectionReport || card.inspectionReportSubmitted) &&
          card.status !== 'APPROVED_FOR_WORK' &&
          card.status !== 'IN_PROGRESS' &&
          card.status !== 'COMPLETED';

        if (
          isAwaitingOp ||
          card.status === 'AWAITING_CUSTOMER_APPROVAL' ||
          card.status === 'WAITING_FOR_ESTIMATE' ||
          card.status === 'WAITING_APPROVAL'
        ) {
          this.inspectionSubStep.set('awaiting_operator');
        }
        // Started after the card resolves, so a technician never sees a
        // strip for a job the card then refuses to show them.
        this.feed ??= pollJourney(this.destroyRef, () => this.api.journey(this.id()));
      },
      error: (err: PresentedError) => {
        if (err.httpStatus === 404) this.state.set('not-mine');
        else if (err.httpStatus === 403) this.state.set('forbidden');
        else this.state.set('error');
      },
    });
  }

  protected readonly activeTask = computed(() =>
    this.card()?.tasks.find((task) => task.status === 'IN_PROGRESS') ?? null,
  );

  protected readonly nextTask = computed(
    () => this.card()?.tasks.find((task) => task.status === 'ASSIGNED' || task.status === 'RETURNED_FOR_REWORK') ?? null,
  );

  protected readonly blockedTask = computed(() => this.card()?.tasks.find((task) => task.blockedReason) ?? null);

  /**
   * The job's own next move, as opposed to a task's -- what "Start
   * inspection"/"Start work" mean on the card. Computed from the status
   * the server already sent rather than a second lookup: REGISTERED and
   * APPROVED_FOR_WORK are the only two states with a technician-pressed
   * move waiting, and the graph itself decides whether either applies.
   */

  protected startRepairWork(): void {
    this.run('start-work', this.api.startWork(this.id()));
  }

  protected start(task: TechnicianTask): void {
    this.run(`start-${task.id}`, this.api.startTask(task.id));
  }

  protected complete(task: TechnicianTask): void {
    const minutes = this.minutesForCompletion(task);
    if (minutes === false) {
      this.actionError.set('Enter whole minutes before marking this task done.');
      return;
    }
    this.run(`done-${task.id}`, this.api.completeTask(task.id, minutes));
  }

  protected setTaskMinutes(taskId: string, value: string): void {
    this.taskMinutes.update((current) => ({ ...current, [taskId]: value }));
  }

  protected canComplete(task: TechnicianTask): boolean {
    return this.minutesForCompletion(task) !== false;
  }

  private minutesForCompletion(task: TechnicianTask): number | undefined | false {
    const rule = this.card()?.timeTracking ?? 'OPTIONAL';
    if (rule === 'OFF') return undefined;

    const raw = this.taskMinutes()[task.id]?.trim() ?? '';
    if (raw === '') return rule === 'REQUIRED' ? false : undefined;

    const minutes = Number(raw);
    if (!Number.isInteger(minutes) || minutes < 0) return false;
    return minutes;
  }

  protected startInspection(): void {
    this.run('start-inspection', this.api.startInspection(this.id()));
  }


  /**
   * Complete inspection with full metadata support for the Active Inspection Workspace.
   * Sends the canonical RecordInspectionPayload object.
   */
  protected completeInspection(typeOverride?: 'QUICK' | 'FULL'): void {
    const type = typeOverride ?? this.inspectionType();
    const noteRaw = this.inspectionNote().trim();
    const odoRaw = this.inspectionOdometer().trim();
    const minsRaw = this.inspectionMinutes().trim();

    let odometerOrHours: number | undefined = undefined;
    if (odoRaw !== '') {
      const parsed = Number(odoRaw);
      if (isNaN(parsed) || parsed < 0) {
        this.actionError.set('Enter a valid odometer or engine hours number.');
        return;
      }
      odometerOrHours = parsed;
    }

    let actualMinutes: number | undefined = undefined;
    if (minsRaw !== '') {
      const parsed = Number(minsRaw);
      if (!Number.isInteger(parsed) || parsed < 0) {
        this.actionError.set('Enter whole diagnostic minutes.');
        return;
      }
      actualMinutes = parsed;
    }

    if (this.card()?.timeTracking === 'REQUIRED' && actualMinutes === undefined) {
      this.actionError.set('Diagnostic minutes are required.');
      return;
    }

    const payload: RecordInspectionPayload = {
      type,
      ...(odometerOrHours !== undefined ? { odometerOrHours } : {}),
      ...(actualMinutes !== undefined ? { actualMinutes } : {}),
      ...(noteRaw ? { note: noteRaw } : {}),
    };

    this.run('complete-inspection', this.api.recordInspection(this.id(), payload));
  }

  protected findingDecisionStatus(finding: WorkCardFinding): FindingDecisionStatus {
    return (finding.decisionStatus ?? (finding as any).customerDecisionStatus ?? 'NOT_REQUESTED') as FindingDecisionStatus;
  }

  protected findingDecisionLabel(status: FindingDecisionStatus): string {
    switch (status) {
      case 'NOT_REQUESTED':
        return 'Internal / No customer decision requested';
      case 'PENDING':
        return 'Pending customer';
      case 'APPROVED':
        return 'Approved';
      case 'REJECTED':
        return 'Rejected';
      default:
        return 'Internal / No customer decision requested';
    }
  }

  protected reportBlocker(reason: string): void {
    const task = this.activeTask() ?? this.nextTask();
    if (!task) return;
    this.panel.set('none');
    this.run('blocker', this.api.reportBlocker(task.id, reason));
  }

  protected finish(): void {
    this.run('finish', this.api.finishWorkOrder(this.id()));
  }

  protected readonly priceValid = computed(() => TechWorkCard.MONEY.test(this.faultPrice().trim()));

  protected logFault(): void {
    const text = this.faultText().trim();
    if (text.length < 3) return;
    if (this.askCustomer() && !this.priceValid()) return;

    this.panel.set('none');
    const description = text;
    const severity = this.faultSeverity();
    const askCustomer = this.askCustomer();
    const price = this.faultPrice().trim();
    const laborPrice = this.faultLaborPrice().trim();
    const inspectionId = this.card()?.inspection.id ?? undefined;

    this.busy.set('fault');
    this.actionError.set(null);

    this.api.createFault(this.id(), description, severity, inspectionId).subscribe({
      next: (fault) => {
        this.faultText.set('');
        this.missionFindingOpen.set(false);
        if (!askCustomer) {
          this.busy.set(null);
          this.load();
          return;
        }

        this.api
          .raiseDecision(this.id(), {
            name: description.slice(0, 200),
            explanation: description,
            importance: severity,
            price,
            laborPrice: laborPrice || undefined,
            faultId: fault.id,
          })
          .subscribe({
            next: () => {
              this.busy.set(null);
              this.askCustomer.set(false);
              this.faultPrice.set('');
              this.faultLaborPrice.set('');
              this.load();
            },
            error: (err: PresentedError) => {
              this.busy.set(null);
              // The fault is already logged -- only the ask failed.
              this.actionError.set(
                err.message
                  ? `Logged finding, but asking the customer did not go through: ${err.message}`
                  : 'Logged finding, but asking the customer did not go through.',
              );
              this.load();
            },
          });
      },
      error: (err: PresentedError) => {
        this.busy.set(null);
        this.actionError.set(err.message ?? 'That did not work.');
      },
    });
  }

  /**
   * Every write reloads the card afterwards rather than patching local
   * state. The server decides what a write did -- a completed task may
   * have moved the whole job -- and guessing here is how a tablet ends up
   * showing a job that finished only on the tablet.
   */
  private run(key: string, request: { subscribe(o: { next: () => void; error: (e: PresentedError) => void }): void }): void {
    this.busy.set(key);
    this.actionError.set(null);
    request.subscribe({
      next: () => {
        this.busy.set(null);
        this.load();
        // The write may well have moved the job -- ask the server rather
        // than advancing the strip locally.
        this.feed?.refresh();
      },
      error: (err: PresentedError) => {
        this.busy.set(null);
        // Shown on the page, never as a toast. A technician who put the
        // tablet down would miss a toast entirely, and would believe the
        // thing they pressed had worked.
        this.actionError.set(err.message ?? 'That did not work.');
      },
    });
  }

  protected label(value: string): string {
    return value.toLowerCase().replace(/_/g, ' ');
  }

}

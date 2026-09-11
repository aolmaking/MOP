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
import {
  clearFindingParts,
  readDraftFindings,
  readDraftServices,
  readFindingParts,
  writeDraftFindings,
  writeDraftServices,
  writeFindingParts,
  type AttachedFindingPart,
  type FindingParts,
} from './finding-parts.store';
import { formatMoney } from '../../ui/money';
import { Car3dViewerComponent } from '../../shared/components/car-3d/car-3d-viewer.component';
import { AnimatedPartIconComponent } from '../../shared/components/animated-part/animated-part-icon.component';
import { VehicleMark } from '../../ui/vehicle-mark/vehicle-mark';
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
    VehicleMark,
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

  /**
   * The workshop's own questions on the inspection form, and the answers so
   * far.
   *
   * Forms & Fields could define a field and no screen ever asked it, so a
   * required one was a requirement nobody could meet. The values start from
   * whatever this inspection already captured, so re-opening a part-finished
   * inspection shows what was already written rather than a blank form.
   */
  protected readonly customFields = computed(() => this.card()?.customInspectionFields ?? []);
  protected readonly customFieldValues = signal<Record<string, unknown>>({});

  /** The message to send the customer, once an ask has been raised. */
  protected readonly decisionMessage = signal<string | null>(null);

  protected dismissDecisionMessage(): void {
    this.decisionMessage.set(null);
  }

  protected setCustomField(fieldKey: string, value: unknown): void {
    this.customFieldValues.update((all) => ({ ...all, [fieldKey]: value }));
  }
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
  /**
   * `flagged` is the difference between "I looked at this" and "this is wrong".
   *
   * Every inspected subsystem gets a card here, but only a card the technician
   * actually gives a condition to is a finding. Without that distinction this
   * screen submitted all twenty-four subsystems at MEDIUM, each carrying the
   * checkpoint's prompt list as though the technician had observed it, and the
   * server wrote a Fault for every one -- twenty-three defects invented on a
   * car that had one.
   */
  /**
   * What to hand the Point of Sale about this car.
   *
   * The catalogue can only narrow itself to "fits this car" if it is told
   * what the car is, and the work card is the one screen that already
   * knows. Merged with whatever the caller adds -- a finding, a category
   * -- so every route into the shop carries the vehicle.
   */
  /** Severity as a shape, so it is not colour alone in a bay. */
  protected severityIcon(level: string): string {
    switch (level) {
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
   * Work found once the job was underway, sent to the front desk.
   *
   * Replaces "I'm blocked", which parked the job in a state only a
   * manager could clear and told nobody what the technician had actually
   * found. This is the same act an inspection report performs -- a
   * finding somebody has to approve before the customer is charged --
   * and it lands in the same queue.
   */
  protected sendExtraWork(): void {
    const text = this.faultText().trim();
    if (!text || this.busy() !== null) return;

    this.busy.set('fault');
    this.actionError.set(null);
    this.api
      .raiseExtraWork(this.id(), {
        description: text,
        severity: this.faultSeverity(),
        recommendedService: text.slice(0, 200),
      })
      .subscribe({
        next: () => {
          this.busy.set(null);
          this.panel.set('none');
          this.faultText.set('');
          this.faultSeverity.set('MEDIUM');
          this.load();
        },
        error: (err: PresentedError) => {
          this.busy.set(null);
          this.actionError.set(err.message ?? 'That could not be sent.');
        },
      });
  }

  protected posParams(extra: Record<string, string> = {}): Record<string, string> {
    const card = this.card();
    return {
      ...(card?.make ? { vehicleMake: card.make } : {}),
      ...(card?.category ? { vehicleCategory: card.category } : {}),
      ...(card?.vehicleModel ? { vehicleLabel: card.vehicleModel } : {}),
      ...extra,
    };
  }

  protected readonly findings = signal<Array<{
    id: string;
    partKey: string;
    title: string;
    description: string;
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    flagged: boolean;
  }>>([]);

  /** Only these reach the report. */
  protected readonly flaggedFindings = computed(() => this.findings().filter((f) => f.flagged));

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

  // Two-Tier Context-Aware Smart Suggestions
  protected readonly smartSuggestions = signal<GroupedSuggestionsView | null>(null);
  protected readonly isSuggestionsLoading = signal<boolean>(false);

  protected readonly selectedPosParts = signal<
    Array<{ sku: string; name: string; quantity: number; unitPrice: number | null }>
  >([]);

  // Per-Box Attached POS Parts & Services for Large Inspection Cards
  protected readonly openServicesBoxKey = signal<string | null>(null);
  /** One shape, defined once, shared with the POS page that writes it. */
  protected readonly boxAttachedParts = signal<FindingParts>({});
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

  protected getPartsForFinding(partKey: string): readonly AttachedFindingPart[] {
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

  /**
   * The parts and services this report will actually carry, deduplicated.
   *
   * `addServiceToBox` deliberately mirrors into `selectedServices` so the flat
   * list is the union of every subsystem's attachments -- but the estimate used
   * to add both collections, so attaching one 80 service quoted 160. The
   * submitted payload deduplicated and the screen did not, which meant the
   * number the technician read to the customer was never the number the
   * operator received. One aggregation now feeds both.
   */
  /**
   * `findingCode` rides along on every line.
   *
   * Without it the report reaches the operator as one flat list of parts and
   * one of services, so "approve this finding but not that one" cannot mean
   * anything about what gets ordered -- the front desk would be approving a
   * subset of the findings and the whole of the bill. The technician attached
   * each part to a subsystem; that is the fact, and it travels.
   */
  protected readonly aggregatedParts = computed(() => {
    const bySku = new Map<
      string,
      { sku: string; name: string; quantity: number; unitPrice: number | null; findingCode: string | null }
    >();
    for (const [findingCode, parts] of Object.entries(this.boxAttachedParts())) {
      for (const p of parts) {
        const existing = bySku.get(p.sku);
        if (existing) bySku.set(p.sku, { ...existing, quantity: existing.quantity + p.quantity });
        else
          bySku.set(p.sku, {
            sku: p.sku,
            name: p.name,
            quantity: p.quantity,
            unitPrice: p.unitPrice,
            findingCode,
          });
      }
    }
    for (const p of this.selectedPosParts()) {
      if (!bySku.has(p.sku)) bySku.set(p.sku, { ...p, findingCode: null });
    }
    return Array.from(bySku.values());
  });

  protected readonly aggregatedServices = computed(() => {
    const byName = new Map<string, { serviceName: string; laborPrice: number; findingCode: string | null }>();
    for (const [findingCode, services] of Object.entries(this.boxAttachedServices())) {
      for (const s of services) byName.set(s.serviceName.toLowerCase(), { ...s, findingCode });
    }
    for (const s of this.selectedServices()) {
      if (!byName.has(s.serviceName.toLowerCase()))
        byName.set(s.serviceName.toLowerCase(), { ...s, findingCode: null });
    }
    return Array.from(byName.values());
  });

  /**
   * `pricesKnown` is false when the workshop hides prices from technicians, and
   * the screen says so instead of printing a total built from zeros.
   */
  protected readonly totalEstimatedQuote = computed(() => {
    const parts = this.aggregatedParts();
    const pricesKnown = parts.every((p) => p.unitPrice != null);
    const partsSum = parts.reduce((sum, p) => sum + (p.unitPrice ?? 0) * p.quantity, 0);
    const laborSum = this.aggregatedServices().reduce((sum, s) => sum + s.laborPrice, 0);
    return { partsSum, laborSum, grandTotal: partsSum + laborSum, pricesKnown };
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
      flagged: boolean;
    }> = [];

    for (const b of boxes) {
      const existing = this.findings().find((f) => f.partKey === b.partKey);
      // The checkpoint's symptom prompts are what to look FOR, not what was
      // found. They seed the description only once the technician flags the
      // subsystem, so an unflagged card never carries them into the report.
      const desc = b.symptoms && b.symptoms.length > 0
        ? b.symptoms.join(', ')
        : `Comprehensive inspection and standards check for ${b.nameEn}.`;
      list.push({
        id: existing ? existing.id : 'find-' + b.partKey,
        partKey: b.partKey,
        title: b.nameEn,
        description: existing ? existing.description : desc,
        severity: existing ? existing.severity : 'MEDIUM',
        flagged: existing ? existing.flagged : false,
      });
    }

    // No invented fallback. Four hardcoded findings -- brakes CRITICAL,
    // battery MEDIUM, steering LOW, tires MEDIUM -- used to appear here for a
    // vehicle with no checkpoints, which is to say for a vehicle nobody had
    // looked at yet.

    this.findings.set(list);
    this.persistFindings();
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
        // Typed in by hand, so it is a finding by definition.
        flagged: true,
      },
    ]);

    this.persistFindings();
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
    this.persistFindings();
  }

  protected updateFindingSeverity(id: string, severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'): void {
    this.findings.update((list) => list.map((f) => (f.id === id ? { ...f, severity, flagged: true } : f)));
    this.persistFindings();
    this.triggerSmartSuggestions(undefined, undefined, severity);
  }

  /** "Nothing wrong here" -- the card stays on screen, out of the report. */
  protected clearFindingSeverity(id: string): void {
    this.findings.update((list) => list.map((f) => (f.id === id ? { ...f, flagged: false } : f)));
    this.persistFindings();
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
      next: (res) => {
        // The document is one level down. Reading the top level found
        // undefined and fell back to empty, which is why the panel showed no
        // recommendations on any job.
        const doc = res?.inspection;
        if (!doc) return;
        this.inspectionAggregate.set(doc);
        this.aggregateVersion.set(doc.aggregateVersion ?? res.aggregateVersion ?? 1);
        this.generatedRecommendations.set([...doc.recommendations]);
        this.recommendationDecisions.set([...doc.decisions]);
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
          // The server sends the aggregate's whole recommendation set, not a
          // delta, so this replaces rather than appends -- and a checkpoint
          // that generated none legitimately clears them.
          if (res.recommendations) {
            this.generatedRecommendations.set([...res.recommendations]);
          }
          if (res.decisions) {
            this.recommendationDecisions.set([...res.decisions]);
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

  /**
   * What was decided about one recommendation, if anything yet.
   *
   * A decision is kept on screen rather than removing the row: a dismissal
   * carries the reason it was dismissed for, and that reason is the record
   * INV-5 exists to force.
   */
  protected decisionFor(recommendationId: string): RecommendationDecisionView | undefined {
    return this.recommendationDecisions().find(
      (decision) => decision.recommendationId === recommendationId && decision.decision !== 'PENDING',
    );
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
          return [
            ...list,
            // Null, not 0, when the price is hidden -- see `openPosModal`.
            { sku: part.sku, name: part.partName, quantity: 1, unitPrice: part.sellingPrice == null ? null : Number(part.sellingPrice) },
          ];
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

  /**
   * Attaching a part means going to the workshop's real Point of Sale.
   *
   * There was briefly a stock picker here -- a searchable list with an Attach
   * button, living inside the card. It is gone. MOP already has a Point of
   * Sale page, with the inventory manager's own category tree, attribute
   * filters, search, stock levels and out-of-stock wording, and a second
   * thinner version of it inside the work card is a second answer to one
   * question. The finding's button routes to that page with
   * `?finding=<subsystem>`; what the technician attaches there is written to
   * `finding-parts.store` and read back by `restoreAttachedParts` below.
   */
  protected toggleServicesForFinding(finding: { partKey: string; title: string }): void {
    const current = this.openServicesBoxKey();
    this.openServicesBoxKey.set(current === finding.partKey ? null : finding.partKey);
    if (this.openServicesBoxKey() === finding.partKey) {
      const slug = this.mapPartToSlug(finding.partKey);
      this.triggerSmartSuggestions(slug, 'FRONT');
    }
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
    this.persistAttachedParts();
  }

  protected removeBoxPart(partKey: string, sku: string): void {
    this.boxAttachedParts.update((map) => {
      const list = map[partKey] ? map[partKey].filter((p) => p.sku !== sku) : [];
      return { ...map, [partKey]: list };
    });
    this.removePosPart(sku);
    this.persistAttachedParts();
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
    this.persistServices();
  }

  protected removeBoxService(partKey: string, name: string): void {
    this.boxAttachedServices.update((map) => {
      const list = map[partKey] ? map[partKey].filter((s) => s.serviceName.toLowerCase() !== name.toLowerCase()) : [];
      return { ...map, [partKey]: list };
    });
    this.removeService(name);
    this.persistServices();
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
    this.persistServices();
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
    this.persistServices();
  }

  /**
   * Complete inspection, attach POS parts and services, and submit report directly to Operator.
   */
  protected submitFindingsAndPartsReport(): void {
    const findingsList = this.flaggedFindings().map((f) => ({
      description: `${f.title}: ${f.description}`,
      severity: f.severity,
      recommendedService: f.title,
      code: f.partKey,
    }));

    // The same union the estimate on screen is computed from, so the customer
    // is quoted what the operator receives.
    const partsList = this.aggregatedParts();
    const servicesList = this.aggregatedServices();

    const payload = {
      // An inspection that found nothing sends nothing. The placeholder that
      // used to fill this in -- "Comprehensive inspection completed at
      // technician workstation", severity LOW -- became a Fault row, so a clean
      // vehicle acquired a defect. Where it belongs is the note.
      findings: findingsList,
      // Names and quantities only -- the server prices them from the
       // workshop's catalogue. See `submitInspectionReport` on the API side.
      parts: partsList.map((p) => ({
        sku: p.sku,
        name: p.name,
        quantity: p.quantity,
        findingCode: p.findingCode ?? undefined,
      })),
      services: servicesList.map((s) => ({
        serviceName: s.serviceName,
        laborPrice: s.laborPrice,
        findingCode: s.findingCode ?? undefined,
      })),
      note:
        this.inspectionNote().trim() ||
        (findingsList.length === 0
          ? 'Inspection completed. No subsystem was flagged as defective.'
          : 'Inspection findings, required POS parts, and labor services documented by technician. Awaiting operator approval & repair dispatch.'),
    };

    this.isSubmittingReport.set(true);
    this.actionError.set(null);

    // Call submitInspectionReport directly to transition work order and create faults
    this.api.submitInspectionReport(this.id(), payload).subscribe({
      next: (report) => {
        // No second submit call.
        //
        // This used to fire `POST .../inspection/submit` as well, with a
        // `technicianNotes` property the server rejects outright, subscribed
        // as `next: () => {}, error: () => {}`. It answered 400 for every
        // inspection ever submitted and nothing said so. Correcting the
        // property name only moved the failure: the report endpoint has
        // already tried to submit the aggregate by the time it answers, so the
        // second call raced its own write and answered
        // `409 expected aggregateVersion 3, but current is 2`.
        //
        // The report endpoint owns the submission. What it cannot do is close
        // an inspection whose checkpoints are not all inspected, and it now
        // says so instead of leaving a record at IN_PROGRESS behind a screen
        // reading "Sent to Operator Desk".
        this.aggregateVersion.set(report.aggregateVersion ?? this.aggregateVersion());
        if (report.aggregateSubmitRefusal) {
          this.actionError.set(
            'The findings reached the operator, but the inspection record could not be closed: ' +
              report.aggregateSubmitRefusal,
          );
        }

        this.isSubmittingReport.set(false);
        clearFindingParts(this.id());
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
    this.isAddServiceOpen.set(false);
    this.liveTrackingDetailsOpen.set(false);
  }

  /**
   * Parts attached on the Point of Sale page, brought back onto the card.
   *
   * The technician leaves this component to attach a part -- the finding's
   * button opens the workshop's real POS -- so the list has to survive the
   * round trip. `finding-parts.store` is the one place both pages write.
   */
  private restoreAttachedParts(): void {
    const stored = readFindingParts(this.id());
    if (Object.keys(stored).length > 0) this.boxAttachedParts.set(stored);

    // The severities too. Attaching a part means leaving this component for
    // the Point of Sale, and a technician who had marked the brakes CRITICAL
    // came back to a card that had forgotten -- so the finding list, and which
    // of them are flagged, travel with the parts.
    // Labour too. A technician who had added a service and then walked to the
    // Point of Sale for a part came back to a card quoting 0.00 for labour --
    // the service still ticked on screen, the estimate silently short.
    const services = readDraftServices(this.id());
    if (Object.keys(services.byFinding).length > 0) this.boxAttachedServices.set(services.byFinding);
    if (services.loose.length > 0) this.selectedServices.set([...services.loose]);

    const findings = readDraftFindings(this.id());
    if (findings.length > 0) {
      this.findings.set(findings.map((f) => ({ ...f })));
      this.inspectionSubStep.set('findings_and_parts');
    }
  }

  private persistFindings(): void {
    writeDraftFindings(this.id(), this.findings());
  }

  private persistServices(): void {
    writeDraftServices(this.id(), {
      byFinding: this.boxAttachedServices(),
      loose: this.selectedServices(),
    });
  }

  /** Kept in step with storage, so a trip to the POS and back never loses one. */
  private persistAttachedParts(): void {
    writeFindingParts(this.id(), this.boxAttachedParts());
  }

  protected load(): void {
    this.state.set('loading');
    this.restoreAttachedParts();
    this.loadInspection();
    this.api.workCard(this.id()).subscribe({
      next: (card) => {
        this.card.set(card);
        this.customFieldValues.set({ ...(card.customInspectionValues ?? {}) });
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

    // The workshop's own questions, answered on this screen.
    //
    // Checked here only to save a round trip; the server validates against the
    // definitions regardless, which is what makes a required field required.
    const missing = this.customFields().filter(
      (field) => field.required && !String(this.customFieldValues()[field.fieldKey] ?? '').trim(),
    );
    if (missing.length > 0) {
      this.actionError.set(`${missing[0].label} is required.`);
      return;
    }

    const payload: RecordInspectionPayload = {
      type,
      ...(odometerOrHours !== undefined ? { odometerOrHours } : {}),
      ...(actualMinutes !== undefined ? { actualMinutes } : {}),
      ...(noteRaw ? { note: noteRaw } : {}),
      ...(this.customFields().length > 0 ? { customFields: this.customFieldValues() } : {}),
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
            next: (raised) => {
              this.busy.set(null);
              this.askCustomer.set(false);
              this.faultPrice.set('');
              this.faultLaborPrice.set('');
              // The words to send, from the workshop's own template. Nothing
              // in the product sends the link, so whoever does needs them --
              // and an owner who edits the template changes what the customer
              // actually receives, which was not true before.
              this.decisionMessage.set(raised.message);
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

import { TestBed } from "@angular/core/testing";
import { of } from "rxjs";
import { DrillDownDrawer } from "./drill-down-drawer";
import { DrillDownApi } from "./drill-down.api";
import type { DrillDownResult } from "./drill-down.types";

function mockResult(overrides: Partial<DrillDownResult> = {}): DrillDownResult {
  return {
    metric: {
      key: "firstPassYield",
      label: "First Pass Yield (FPY)",
      value: 85.5,
      unit: "%",
      period: {
        from: "2026-03-01T00:00:00.000Z",
        to: "2026-03-31T23:59:59.999Z",
      },
    },
    activeFilters: {},
    nextCursor: undefined,
    dimensions: [
      {
        key: "branch",
        value: "branch-1",
        label: "Alpha Branch",
        count: 1,
      },
    ],
    integrity: {
      totalMatchingRecords: 1,
      returnedRecords: 1,
      historicalAttributionPreserved: true,
      financialAttributionComputable: false,
      dataHonestyDisclaimer: "Evaluations reflect first-pass QC state.",
      sampleSizeProtected: false,
    },
    records: [
      {
        entityId: "wo-101",
        entityType: "WORK_ORDER",
        label: "Brake Pad Replacement",
        occurredAt: "2026-03-15T10:00:00.000Z",
        status: "COMPLETED",
        branchName: "Alpha Branch",
        workOrderId: "wo-101",
        attributes: {
          qcPassed: true,
        },
        timeline: [
          {
            id: "evt-1",
            eventKey: "QC_EVALUATION",
            label: "QC Approved",
            timestamp: "2026-03-15T11:00:00.000Z",
          },
        ],
      },
    ],
    ...overrides,
  };
}

describe("DrillDownDrawer", () => {
  it("renders metric details, records, and evidence honesty banner", () => {
    const api = {
      drillDown: () => of(mockResult()),
      exportCsvUrl: () => "/api/drill-down/export",
    };

    TestBed.configureTestingModule({
      providers: [{ provide: DrillDownApi, useValue: api }],
    });

    const fixture = TestBed.createComponent(DrillDownDrawer);
    fixture.componentRef.setInput("metric", "firstPassYield");
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? "";
    expect(text).toContain("First Pass Yield (FPY)");
    expect(text).toContain("85.5");
    expect(text).toContain("Brake Pad Replacement");
    expect(text).toContain("Evaluations reflect first-pass QC state.");
  });

  it("emits openWorkOrderDossier when Open Dossier button is clicked", () => {
    const api = {
      drillDown: () => of(mockResult()),
      exportCsvUrl: () => "/api/drill-down/export",
    };

    TestBed.configureTestingModule({
      providers: [{ provide: DrillDownApi, useValue: api }],
    });

    const fixture = TestBed.createComponent(DrillDownDrawer);
    fixture.componentRef.setInput("metric", "firstPassYield");
    fixture.detectChanges();

    let emittedWoId: string | undefined;
    fixture.componentInstance.openWorkOrderDossier.subscribe((id) => {
      emittedWoId = id;
    });

    const dossierBtn = (fixture.nativeElement as HTMLElement).querySelector(".dossier-btn") as HTMLButtonElement;
    expect(dossierBtn).toBeTruthy();
    dossierBtn.click();

    expect(emittedWoId).toBe("wo-101");
  });
});

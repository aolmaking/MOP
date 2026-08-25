import { reportToCsv } from "./csv.util";

describe("reportToCsv", () => {
  it("renders scalar and nested-scalar fields as a Summary section", () => {
    const csv = reportToCsv({ approvalRate: 50, range: { from: "2026-01-01", to: "2026-01-31" } });

    expect(csv).toContain("Summary");
    expect(csv).toContain("field,value");
    expect(csv).toContain("approvalRate,50");
    expect(csv).toContain("range.from,2026-01-01");
    expect(csv).toContain("range.to,2026-01-31");
  });

  it("renders an array of objects as its own titled table with a header row per key", () => {
    const csv = reportToCsv({
      statusDistribution: [
        { status: "OPEN", count: 4 },
        { status: "CLOSED", count: 9 },
      ],
    });

    const lines = csv.split("\n");
    expect(lines).toContain("statusDistribution");
    expect(lines).toContain("status,count");
    expect(lines).toContain("OPEN,4");
    expect(lines).toContain("CLOSED,9");
  });

  it("recurses into a nested object, prefixing array sections with the parent key", () => {
    const csv = reportToCsv({
      operational: {
        windowDays: 30,
        usage: [{ itemId: "i1", issued: 3 }],
      },
    });

    expect(csv).toContain("operational.windowDays,30");
    expect(csv).toContain("operational.usage");
    expect(csv).toContain("itemId,issued");
    expect(csv).toContain("i1,3");
  });

  it("quotes a cell that contains a comma, quote, or newline", () => {
    const csv = reportToCsv({ blockers: [{ reason: 'needs "approval", now', count: 1 }] });

    expect(csv).toContain('"needs ""approval"", now",1');
  });

  it("renders null values as an empty cell, not the string 'null'", () => {
    const csv = reportToCsv({ averageResponseHours: null });

    expect(csv).toContain("averageResponseHours,");
    expect(csv).not.toContain("averageResponseHours,null");
  });

  it("handles an empty array without throwing, folding it into Summary as blank", () => {
    const csv = reportToCsv({ byImportance: [] });

    expect(csv).toContain("byImportance,");
  });
});

import {
  ZERO,
  add,
  compare,
  fromMinor,
  invoiceTotal,
  lineTotal,
  multiply,
  outstanding,
  overpaid,
  percentage,
  subtract,
  sum,
  toMinor,
} from "./money";

describe("parsing and formatting", () => {
  it("round-trips through minor units exactly", () => {
    for (const value of ["0.00", "0.01", "1.00", "1800.50", "-25.75", "99999999.99"]) {
      expect(fromMinor(toMinor(value))).toBe(value);
    }
  });

  it("normalises a value with fewer decimal places", () => {
    expect(fromMinor(toMinor("5"))).toBe("5.00");
    expect(fromMinor(toMinor("5.1"))).toBe("5.10");
  });

  it("refuses a value it cannot represent exactly", () => {
    // "1.005" is not a price -- somebody computed it and lost a fraction
    // on the way. Accepting it would bury that.
    expect(() => toMinor("1.005")).toThrow(/decimal places/);
  });

  it("refuses anything that is not a number", () => {
    for (const bad of ["", "abc", "1.2.3", "1,000.00", "NaN"]) {
      expect(() => toMinor(bad)).toThrow(/Not a money value/);
    }
  });
});

describe("the arithmetic a JS number gets wrong", () => {
  it("adds 0.1 and 0.2 to exactly 0.30", () => {
    // The canonical float failure. 0.1 + 0.2 === 0.30000000000000004.
    expect(add("0.10", "0.20")).toBe("0.30");
  });

  it("sums a long column without drift", () => {
    // 0.07 added a hundred times is 7.00, and is NOT in floating point.
    const values = Array.from({ length: 100 }, () => "0.07");
    expect(sum(values)).toBe("7.00");
  });

  it("subtracts without leaving a residue", () => {
    expect(subtract("1.00", "0.90")).toBe("0.10");
  });

  it("multiplies by a count exactly", () => {
    expect(multiply("0.07", 3)).toBe("0.21");
    expect(multiply("1800.50", 4)).toBe("7202.00");
  });

  it("refuses a fractional quantity", () => {
    expect(() => multiply("1.00", 1.5)).toThrow(/whole number/);
  });
});

describe("percentages round half-up, away from zero", () => {
  it("rounds a half up rather than to even", () => {
    // 5% of 1.50 is 0.075 -> 0.08. Banker's rounding would give 0.08 here
    // too, but 0.125 -> 0.13 rather than 0.12 is where they diverge.
    expect(percentage("2.50", 5)).toBe("0.13");
  });

  it("rounds a negative half away from zero", () => {
    expect(percentage("-2.50", 5)).toBe("-0.13");
  });

  it("handles a whole percentage exactly", () => {
    expect(percentage("100.00", 14)).toBe("14.00");
  });
});

describe("a line: discount first, then tax", () => {
  it("charges tax on what the customer actually pays", () => {
    // 100.00, 10% off, 14% tax. Tax is on 90.00 -> 12.60, not on 100.00.
    const line = lineTotal({ unitPrice: "100.00", quantity: 1, discountPercent: 10, taxPercent: 14 });

    expect(line.gross).toBe("100.00");
    expect(line.discount).toBe("10.00");
    expect(line.net).toBe("90.00");
    expect(line.tax).toBe("12.60");
    expect(line.total).toBe("102.60");
  });

  it("adds labour to the line before the discount", () => {
    // Labour is part of what the line costs, so a discount applies to it.
    const line = lineTotal({ unitPrice: "100.00", quantity: 2, labour: "50.00", discountPercent: 10 });

    expect(line.gross).toBe("250.00");
    expect(line.discount).toBe("25.00");
    expect(line.total).toBe("225.00");
  });

  it("handles a line with no discount and no tax", () => {
    const line = lineTotal({ unitPrice: "250.00", quantity: 3 });

    expect(line.total).toBe("750.00");
    expect(line.discount).toBe(ZERO);
    expect(line.tax).toBe(ZERO);
  });

  it("allows a zero-quantity line without dividing by anything", () => {
    expect(lineTotal({ unitPrice: "10.00", quantity: 0 }).total).toBe(ZERO);
  });
});

describe("an invoice adds up to what its lines say", () => {
  it("totals the ROUNDED lines, so the printed column sums to the printed total", () => {
    // The decision PHASE_8.md section 2 argues. Three lines that each
    // round up: summing exact values first would give a total a cent
    // below the sum of what is printed, and the customer adds the column
    // themselves.
    const invoice = invoiceTotal([
      { unitPrice: "3.33", quantity: 1, taxPercent: 14 },
      { unitPrice: "3.33", quantity: 1, taxPercent: 14 },
      { unitPrice: "3.33", quantity: 1, taxPercent: 14 },
    ]);

    const printedSum = sum(invoice.lines.map((line) => line.total));
    expect(invoice.total).toBe(printedSum);
  });

  it("keeps subtotal, discount and tax consistent with the total", () => {
    const invoice = invoiceTotal([
      { unitPrice: "100.00", quantity: 1, discountPercent: 10, taxPercent: 14 },
      { unitPrice: "50.00", quantity: 2, taxPercent: 14 },
    ]);

    // total == subtotal - discount + tax, exactly.
    expect(add(subtract(invoice.subtotal, invoice.discount), invoice.tax)).toBe(invoice.total);
  });

  it("totals an empty invoice to zero rather than throwing", () => {
    expect(invoiceTotal([]).total).toBe(ZERO);
  });
});

describe("balance never goes negative", () => {
  it("reports what is still owed", () => {
    expect(outstanding("100.00", "40.00")).toBe("60.00");
  });

  it("reports zero owed, not a negative balance, when overpaid", () => {
    // An over-payment is money the workshop is holding that belongs to
    // the customer. That is a refund, and a refund is its own record --
    // hiding it behind a minus sign on the balance loses it.
    expect(outstanding("100.00", "130.00")).toBe(ZERO);
    expect(overpaid("100.00", "130.00")).toBe("30.00");
  });

  it("reports nothing overpaid when the invoice is exactly settled", () => {
    expect(outstanding("100.00", "100.00")).toBe(ZERO);
    expect(overpaid("100.00", "100.00")).toBe(ZERO);
  });
});

describe("comparison", () => {
  it("orders values numerically, not as strings", () => {
    // "9.00" > "10.00" as strings. This is why compare exists.
    expect(compare("9.00", "10.00")).toBe(-1);
    expect(compare("10.00", "9.00")).toBe(1);
    expect(compare("10.00", "10.00")).toBe(0);
  });
});

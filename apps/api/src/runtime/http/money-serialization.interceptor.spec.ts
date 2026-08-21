import { Prisma } from "@mop/database";
import { serializeDecimals } from "./money-serialization.interceptor";

const decimal = (value: string) => new Prisma.Decimal(value);

describe("serializeDecimals", () => {
  it("converts a bare Decimal to a string", () => {
    expect(serializeDecimals(decimal("1234.50"))).toBe("1234.5");
  });

  it("preserves precision that a JS number would destroy", () => {
    // 12,2 allows values a float cannot represent exactly. This is the
    // whole reason the interceptor exists.
    const exact = "99999999.99";
    expect(serializeDecimals(decimal(exact))).toBe(exact);
    expect(Number(serializeDecimals(decimal("0.10")) as string) + 0).toBeCloseTo(0.1);
  });

  it("converts Decimals nested in objects", () => {
    const result = serializeDecimals({ invoice: { total: decimal("250.00"), reference: "INV-1" } });
    expect(result).toEqual({ invoice: { total: "250", reference: "INV-1" } });
  });

  it("converts Decimals inside arrays", () => {
    const result = serializeDecimals({ lines: [{ price: decimal("10.25") }, { price: decimal("3.00") }] });
    expect(result).toEqual({ lines: [{ price: "10.25" }, { price: "3" }] });
  });

  it("leaves primitives, null and undefined alone", () => {
    expect(serializeDecimals("text")).toBe("text");
    expect(serializeDecimals(42)).toBe(42);
    expect(serializeDecimals(null)).toBeNull();
    expect(serializeDecimals(undefined)).toBeUndefined();
  });

  it("does not walk into Dates", () => {
    const date = new Date("2026-08-08T00:00:00.000Z");
    expect(serializeDecimals({ issuedAt: date })).toEqual({ issuedAt: date });
  });

  it("survives a cyclic object instead of overflowing the stack", () => {
    const node: Record<string, unknown> = { total: decimal("5.00") };
    node.self = node;
    expect(() => serializeDecimals(node)).not.toThrow();
  });

  it("converts every Decimal in a realistic invoice payload", () => {
    const payload = {
      invoiceNumber: "INV-2026-001",
      subtotal: decimal("100.00"),
      tax: decimal("14.00"),
      total: decimal("114.00"),
      lines: [{ name: "Oil change", lockedUnitPrice: decimal("100.00"), quantity: 1 }],
    };

    const result = serializeDecimals(payload) as Record<string, unknown>;
    const json = JSON.stringify(result);

    // The real assertion: nothing anywhere in the serialized response is
    // a number where money is expected, and no decimal.js internals leak.
    expect(json).not.toContain('"s":');
    expect(json).not.toContain('"d":[');
    expect(result.total).toBe("114");
    expect(typeof result.subtotal).toBe("string");
  });
});

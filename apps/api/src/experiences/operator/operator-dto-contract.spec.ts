import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import {
  OperatorApproveRepairDto,
  OperatorIntakeDto,
  OperatorPosOrderDto,
  OperatorUpdateQuoteDto,
} from "./operator.dto";

/**
 * The payloads the Angular pages actually send, pushed through the actual
 * global pipe.
 *
 * Every service-level test of this flow passed while both write endpoints
 * returned 400 in a browser, because a service test constructs its own object
 * and never crosses the pipe. `main.ts` runs with `forbidNonWhitelisted`, so a
 * property the DTO does not declare is not ignored -- it is a rejected request.
 * That turned two field-name disagreements into a dead operator surface:
 *
 *   update-quote     the page sends `note`, the DTO declared `notes`
 *   approve-repair   the page sends `tasks`, the DTO declared `tasksToCreate`
 *
 * The bodies below are copied from apps/web/src/app/experiences/operator/
 * operator-home.ts. When that page changes shape, this fails -- which is the
 * point.
 */
describe("operator DTO contract (the real pipe, the real page payloads)", () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });

  const through = <T>(metatype: new () => T, value: unknown) =>
    pipe.transform(value, { type: "body", metatype });

  describe("POST /operator/work-orders/:id/update-quote", () => {
    // operator-home.ts saveQuote()
    const saveQuotePayload = {
      findings: [{ id: "f1", description: "Brake pads worn to the wear indicator", severity: "CRITICAL" }],
      parts: [{ sku: "BP-1", name: "Front brake pads", quantity: 2, unitPrice: 350 }],
      services: [{ serviceName: "Front brake service", laborPrice: 200 }],
      note: "Customer agreed at the counter",
    };

    it("accepts what the quote builder sends", async () => {
      const parsed = await through(OperatorUpdateQuoteDto, saveQuotePayload);
      expect(parsed).toMatchObject({ note: "Customer agreed at the counter" });
    });

    it("keeps the note the operator typed, rather than dropping it", async () => {
      const parsed = (await through(OperatorUpdateQuoteDto, saveQuotePayload)) as OperatorUpdateQuoteDto;
      expect(parsed.note).toBe("Customer agreed at the counter");
    });

    it("keeps a service's name under the key both pages read", async () => {
      const parsed = (await through(OperatorUpdateQuoteDto, saveQuotePayload)) as OperatorUpdateQuoteDto;
      expect(parsed.services?.[0]?.serviceName).toBe("Front brake service");
    });

    it("carries a HIGH finding through instead of quietly downgrading it", async () => {
      const parsed = (await through(OperatorUpdateQuoteDto, {
        findings: [{ description: "Rear discs scored", severity: "HIGH" }],
      })) as OperatorUpdateQuoteDto;
      expect(parsed.findings?.[0]?.severity).toBe("HIGH");
    });

    it("refuses a severity outside the scale the database stores", async () => {
      await expect(
        through(OperatorUpdateQuoteDto, { findings: [{ description: "x", severity: "URGENT" }] }),
      ).rejects.toMatchObject({ status: 400 });
    });

    it("refuses a service line with no name, rather than storing a nameless one", async () => {
      // This is what nested validation buys: the shape is a contract now, so a
      // line that would have become a task called "Perform Vehicle Repair" is
      // refused at the door instead.
      await expect(
        through(OperatorUpdateQuoteDto, { services: [{ laborPrice: 200 }] }),
      ).rejects.toMatchObject({ status: 400 });
    });
  });

  describe("POST /operator/work-orders/:id/approve-repair", () => {
    // operator-home.ts dispatchToRepair()
    const dispatchPayload = {
      approvedFindingIds: ["f1"],
      approvedPartIds: ["BP-1"],
      approvedServiceIds: ["Front brake service"],
      approvedFindings: [{ id: "f1", description: "Brake pads worn", severity: "CRITICAL" }],
      approvedServices: [{ serviceName: "Front brake service", laborPrice: 200 }],
      operatorNote: "Approved at the counter",
      tasks: [{ title: "Front brake service", estimatedMinutes: 60 }],
      note: "Quote approved for $550.00 (1 findings approved). Dispatched to repair floor.",
    };

    it("accepts what the dispatch button sends", async () => {
      const parsed = await through(OperatorApproveRepairDto, dispatchPayload);
      expect(parsed).toBeDefined();
    });

    it("keeps the tasks the operator composed, so they can be planned by name", async () => {
      const parsed = (await through(OperatorApproveRepairDto, dispatchPayload)) as OperatorApproveRepairDto;
      expect(parsed.tasks?.map((task) => task.title)).toEqual(["Front brake service"]);
    });

    it("refuses a task with no title", async () => {
      await expect(
        through(OperatorApproveRepairDto, { tasks: [{ estimatedMinutes: 30 }] }),
      ).rejects.toMatchObject({ status: 400 });
    });
  });

  describe("the surfaces that were already correct stay correct", () => {
    it("accepts an intake", async () => {
      await expect(
        through(OperatorIntakeDto, { assetId: "a1", complaint: "Grinding noise", inspectionDeclined: false }),
      ).resolves.toBeDefined();
    });

    /**
     * A full inspection is a recorded decision, not an empty list.
     *
     * The work card falls back to reading system names out of the
     * complaint when nothing was requested, so "Brake System: squeals when
     * cold" would have narrowed a full inspection to the brakes -- the
     * opposite of what the front desk chose.
     */
    it("carries an explicit full inspection through the intake", async () => {
      const parsed = (await through(OperatorIntakeDto, {
        assetId: "a1",
        complaint: "Brake System & ABS: squeals when cold",
        fullInspection: true,
      })) as OperatorIntakeDto;

      expect(parsed.fullInspection).toBe(true);
      expect(parsed.inspectionParts).toBeUndefined();
    });

    it("accepts a counter sale", async () => {
      await expect(
        through(OperatorPosOrderDto, { lines: [{ inventoryItemId: "i1", quantity: 2 }] }),
      ).resolves.toBeDefined();
    });

    it("still refuses a property no DTO declares", async () => {
      // The guarantee that made the two bugs above real: unknown properties are
      // rejected, not ignored. This asserts the pipe is still strict, so the
      // tests above mean something.
      await expect(
        through(OperatorUpdateQuoteDto, { note: "ok", somethingNobodyDeclared: true }),
      ).rejects.toMatchObject({ status: 400 });
    });
  });
});

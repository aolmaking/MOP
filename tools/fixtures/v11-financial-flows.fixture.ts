export const v11FinancialFlows = [
  { name: "approved price remains locked", given: "Customer approves a quote line", when: "Catalog price changes", then: "Approved snapshot remains unchanged" },
  { name: "unused part reverses", given: "Part is on running invoice", when: "Inventory accepts unused return", then: "Line no longer contributes to totals" },
  { name: "final invoice is immutable", given: "Final invoice is issued", when: "Correction is needed", then: "Credit note or refund is created" },
  { name: "payment unlocks delivery", given: "Invoice has a balance", when: "Confirmed payment clears it", then: "Delivery gate is recalculated" },
  { name: "platform lock wins", given: "Owner enables finance", when: "Platform disables it", then: "Server rejects financial writes" }
] as const;

export const teamLeaderReviewFixture = {
  teamLeaderName: "Team Leader Youssef",
  branchName: "Nasr City Branch",
  scopeMode: "assigned_technicians",
  awaitingReview: [
    { workOrderNumber: "WO-2026-0001", technicianName: "Technician Ahmed", state: "awaiting_review" },
    { workOrderNumber: "WO-2026-0007", technicianName: "Technician Sara", state: "ready_for_qc" }
  ],
  reworkRequired: [
    { workOrderNumber: "WO-2026-0003", reason: "Brake noise still present after test drive." }
  ]
};

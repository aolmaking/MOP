export const multiWarehouseFixture = {
  scenario: "branch_primary_backup_shared_warehouse_resolution",
  actors: ["branch_manager", "inventory_manager"],
  records: {
    branchId: "branch_nasr",
    primaryWarehouseId: "wh_nasr_quick",
    backupWarehouseId: "wh_nasr_main",
    sharedWarehouseId: "wh_central"
  },
  steps: [
    "branch request checks primary warehouse first",
    "backup warehouse can issue when primary is unavailable",
    "shared warehouse can support multiple branches",
    "transfer-only warehouse cannot directly issue"
  ],
  expectedRules: ["PRIMARY can issue", "BACKUP can issue", "SHARED can issue", "TRANSFER_ONLY requires transfer flow"]
};

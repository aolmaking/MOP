export const authFoundationScenarios = [
  { actor: "customer", tenant: "tenant_apex", expectedLanding: "customer", forbiddenRoutes: ["inventory-home", "builder-home", "branch-home"] },
  { actor: "technician", tenant: "tenant_apex", expectedLanding: "technician", forbiddenRoutes: ["inventory-home", "financial-dashboard", "builder-home"] },
  { actor: "inventory_manager", tenant: "tenant_apex", expectedLanding: "inventory-home", forbiddenRoutes: ["technician", "builder-home", "customer"] },
  { actor: "branch_manager", tenant: "tenant_apex", expectedLanding: "branch-home", forbiddenRoutes: ["platform", "builder-home"] },
  { actor: "team_leader", tenant: "tenant_apex", expectedLanding: "team-review", managedTechnicianIds: ["u_tech"] },
  { actor: "tenant_owner", tenant: "tenant_apex", expectedLanding: "builder-home" },
  { actor: "platform_super_admin", tenant: null, expectedLanding: "platform", liveViewMode: "read_only" }
] as const;

export const tenantIsolationFixtures = {
  apex: { tenantId: "tenant_apex", registrationCode: "APEX2026", technicianId: "u_tech", customerId: "cust_omar" },
  delta: { tenantId: "tenant_delta", registrationCode: "DELTA2026", technicianId: "u_delta_tech", customerId: "cust_delta" }
} as const;

import {
  applyCapabilityChange,
  applicablePolicies,
  capabilityConsequence,
  derivedFacts,
  emptyDraft,
  recommendedPolicyAnswers,
  strandedPolicyAnswers,
  type WorkshopDraft,
} from "./draft";
import { draftProgress } from "./progress";
import { applicableResponsibilities, grantsForResponsibilities, orphanedCapabilities } from "./responsibility";
import { validateDraft } from "./validator";
import { CAPABILITY_KEYS } from "../capabilities/types";
import { CAPABILITY_PRESENTATION } from "./presentation";
import { SPECIALIZATION_PACKS, canonicalSpecializationKey, definitionsSeededBy, packsForCategory, specializationPack } from "./specialization-packs";
import { workingDaysFor } from "../platform/countries";

/**
 * These tests exist to hold one promise: what the onboarding experience
 * shows a super admin is derived from the same registries the running
 * product uses, and changes when their answers change.
 *
 * A test here that passes against a hardcoded number would defeat the
 * point, so every expectation below is either a structural invariant or
 * a comparison between two configurations rather than an absolute count.
 */

function completeDraft(overrides: Partial<WorkshopDraft> = {}): WorkshopDraft {
  return {
    ...emptyDraft(),
    identity: {
      name: "Nafath Quick Service",
      slug: "nafath-quick",
      country: "EG",
      city: "Cairo",
      currency: "EGP",
      timezone: "Africa/Cairo",
      businessType: "Independent Garage",
      primaryCategory: "CARS",
    },
    owner: { ownerFullName: "Sara Hassan", ownerEmail: "sara@example.com", ownerPhone: "+201234567890" },
    plan: { planId: "plan-1", initialStatus: "TRIAL" },
    branches: [{ name: "Main", code: "MAIN", city: "Cairo" }],
    ...overrides,
  };
}

describe("capability consequences are derived, not authored", () => {
  it("every capability has presentation copy, so none renders as its own key", () => {
    for (const key of CAPABILITY_KEYS) {
      expect(CAPABILITY_PRESENTATION[key]).toBeDefined();
      expect(CAPABILITY_PRESENTATION[key].title.length).toBeGreaterThan(2);
      expect(CAPABILITY_PRESENTATION[key].withoutIt.length).toBeGreaterThan(20);
    }
  });

  it("reads the dependency graph in both directions from one declaration", () => {
    // INVENTORY declares no dependencies; PART_RETURNS and MULTI_WAREHOUSE
    // declare it. The reverse edge is computed, so it cannot drift.
    const inventory = capabilityConsequence("INVENTORY");
    expect(inventory.requires).toEqual([]);
    expect([...inventory.requiredBy].sort()).toEqual(["MULTI_WAREHOUSE", "PART_RETURNS"]);

    const returns = capabilityConsequence("PART_RETURNS");
    expect(returns.requires).toEqual(["INVENTORY"]);
  });

  it("names the gates a capability owns, from the gate registry", () => {
    expect(capabilityConsequence("QC").gates).toEqual(["qc.passed"]);
    expect(capabilityConsequence("INVENTORY").gates).toEqual(["parts.received_used_or_returned"]);
  });

  it("names the policy questions that stop being asked without it", () => {
    expect(capabilityConsequence("INVENTORY").policiesLostWithout).toContain("PARTS_SEPARATION_OF_DUTIES");
    expect(capabilityConsequence("QC").policiesLostWithout).toContain("QC_MANDATORY");
  });

  it("carries the customer-safe replacement wording where removal changes what a customer is told", () => {
    expect(capabilityConsequence("INVENTORY").customerSafeMessage).toContain("waiting for a required part");
  });
});

describe("a capability change resolves its own knock-on effects", () => {
  it("pulls dependencies up when something is turned on", () => {
    const draft = completeDraft({ capabilities: { INVENTORY: "DISABLED", PART_RETURNS: "DISABLED" } });
    const effect = applyCapabilityChange(draft, "PART_RETURNS", "ENABLED");

    expect(effect.cascadedOn).toEqual(["INVENTORY"]);
    expect(effect.draft.capabilities.INVENTORY).toBe("ENABLED");
  });

  it("pushes dependents down when something is turned off, transitively", () => {
    const effect = applyCapabilityChange(completeDraft(), "INVENTORY", "DISABLED");

    // MULTI_WAREHOUSE and PART_RETURNS both depend on INVENTORY. Leaving
    // either quietly on is exactly the invalid configuration the review
    // stage would otherwise discover at the very last press.
    expect([...effect.cascadedOff].sort()).toEqual(["MULTI_WAREHOUSE", "PART_RETURNS"]);
    expect(effect.draft.capabilities.PART_RETURNS).toBe("DISABLED");
  });

  it("drops answers to questions the change makes meaningless, and says which", () => {
    const draft = completeDraft({ policies: { PARTS_SEPARATION_OF_DUTIES: "DIFFERENT_PERSON", TIME_TRACKING: "REQUIRED" } });
    const effect = applyCapabilityChange(draft, "INVENTORY", "DISABLED");

    expect(effect.droppedPolicies).toContain("PARTS_SEPARATION_OF_DUTIES");
    expect(effect.draft.policies.PARTS_SEPARATION_OF_DUTIES).toBeUndefined();
    // A question that never depended on inventory keeps its answer.
    expect(effect.draft.policies.TIME_TRACKING).toBe("REQUIRED");
  });
});

describe("the question set is derived from the workshop's shape", () => {
  it("asks a full-shape workshop more questions than a minimal one", () => {
    const full = applicablePolicies(completeDraft());
    const minimal = applicablePolicies(
      completeDraft({
        capabilities: {
          INVENTORY: "DISABLED",
          PART_RETURNS: "DISABLED",
          MULTI_WAREHOUSE: "DISABLED",
          QC: "DISABLED",
          TEAMS: "DISABLED",
          TEAM_REVIEW: "DISABLED",
        },
      }),
    );

    expect(full.length).toBeGreaterThan(minimal.length);
    expect(minimal.map((policy) => policy.key)).not.toContain("PARTS_SEPARATION_OF_DUTIES");
    expect(minimal.map((policy) => policy.key)).not.toContain("QC_MANDATORY");
  });

  it("still asks the delivery-payment question under External Finance Mode", () => {
    // The bare-key reading would treat EXTERNAL as inactive and stop
    // asking. A workshop running its money outside MOP still hands cars
    // back, and MOP still decides whether a balance holds one.
    const external = applicablePolicies(completeDraft({ capabilities: { FINANCE_CORE: "EXTERNAL", BILLING: "EXTERNAL" } }));
    expect(external.map((policy) => policy.key)).toContain("DELIVERY_BLOCKED_UNTIL_PAID");
    // But a question that genuinely needs MOP to be doing the pricing
    // does stop being asked.
    expect(external.map((policy) => policy.key)).not.toContain("PARTIAL_PAYMENT");
  });

  it("recommends an answer for exactly the applicable questions and no others", () => {
    const draft = completeDraft({ capabilities: { INVENTORY: "DISABLED", PART_RETURNS: "DISABLED", MULTI_WAREHOUSE: "DISABLED" } });
    const recommended = recommendedPolicyAnswers(draft);

    expect(Object.keys(recommended).sort()).toEqual(applicablePolicies(draft).map((p) => p.key).sort());
    expect(recommended.PARTS_SEPARATION_OF_DUTIES).toBeUndefined();
    expect(recommended.TIME_TRACKING).toBe("OPTIONAL");
  });

  it("reports an answer left behind by a later capability change as stranded", () => {
    const stranded = strandedPolicyAnswers(
      completeDraft({ capabilities: { QC: "DISABLED" }, policies: { QC_MANDATORY: "MANDATORY_ALWAYS" } }),
    );
    expect(stranded).toEqual(["QC_MANDATORY"]);
  });
});

describe("what the workshop will actually contain", () => {
  it("counts fewer pages and roles for a smaller workshop", () => {
    const full = derivedFacts(completeDraft());
    const minimal = derivedFacts(
      completeDraft({
        capabilities: { INVENTORY: "DISABLED", PART_RETURNS: "DISABLED", MULTI_WAREHOUSE: "DISABLED", TEAMS: "DISABLED", TEAM_REVIEW: "DISABLED" },
      }),
    );

    expect(minimal.pageCount).toBeLessThan(full.pageCount);
    expect(minimal.activeRoles.length).toBeLessThan(full.activeRoles.length);
    expect(minimal.activeRoles).toContain("TENANT_OWNER");
  });

  it("drops the gate a removed capability owned, and keeps the core ones", () => {
    const facts = derivedFacts(completeDraft({ capabilities: { QC: "DISABLED" } }));
    expect(facts.liveGates).not.toContain("qc.passed");
    expect(facts.liveGates).toContain("inspection_completed");
  });

  it("counts only specialization definitions the seeder will really write", () => {
    const facts = derivedFacts(completeDraft({ specializationPacks: ["QUICK_SERVICE", "BRAKES_AND_SUSPENSION"] }));
    const expected = definitionsSeededBy(["QUICK_SERVICE", "BRAKES_AND_SUSPENSION"]);

    expect(facts.specializationDefinitionCount).toBe(expected.length);
    expect(facts.specializationDefinitionNames).toContain("Oil Change");
    expect(facts.specializationDefinitionNames).toContain("Brake Wear Measurement");
  });

  it("never counts the same card twice when two packs both want it", () => {
    // Diagnostics and Electrical are a realistic pair for an auto
    // electrician, and neither should give the workshop a duplicate card.
    const names = definitionsSeededBy(["DIAGNOSTICS", "ELECTRICAL"]).map((definition) => definition.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe("progress is derived from the decisions this draft actually has", () => {
  it("shrinks the denominator when a capability removes questions", () => {
    const full = draftProgress(completeDraft());
    const minimal = draftProgress(
      completeDraft({ capabilities: { INVENTORY: "DISABLED", PART_RETURNS: "DISABLED", MULTI_WAREHOUSE: "DISABLED", QC: "DISABLED" } }),
    );

    expect(minimal.applicable).toBeLessThan(full.applicable);
  });

  it("requires a store only when the workshop holds stock", () => {
    const withStock = draftProgress(completeDraft());
    // MULTI_BRANCH off as well: this fixture is a one-bay shop, and a
    // single-branch draft with multi-branch still on is genuinely
    // unfinished -- the engine says so, which is the behaviour under test
    // two cases below.
    const withoutStock = draftProgress(
      completeDraft({
        capabilities: { INVENTORY: "DISABLED", PART_RETURNS: "DISABLED", MULTI_WAREHOUSE: "DISABLED", MULTI_BRANCH: "DISABLED" },
      }),
    );

    const structure = (progress: ReturnType<typeof draftProgress>) =>
      progress.stages.find((stage) => stage.stage === "STRUCTURE")!;

    expect(structure(withStock).applicable).toBeGreaterThan(structure(withoutStock).applicable);
    expect(structure(withoutStock).complete).toBe(true);
  });

  it("reaches 100 only when every applicable decision is made", () => {
    const answered = completeDraft({
      capabilities: { INVENTORY: "DISABLED", PART_RETURNS: "DISABLED", MULTI_WAREHOUSE: "DISABLED", MULTI_BRANCH: "DISABLED" },
    });
    const complete = {
      ...answered,
      policies: recommendedPolicyAnswers(answered),
      // TEAMS is still on in this fixture, so "who supervises the
      // technicians?" is a real outstanding decision until it is answered.
      responsibilities: Object.fromEntries(
        applicableResponsibilities(answered.capabilities).map((question) => [question.capability, "DEDICATED" as const]),
      ),
    };

    expect(draftProgress(answered).percent).toBeLessThan(100);
    expect(draftProgress(complete).percent).toBe(100);
  });
});

describe("specialization packs", () => {
  it("only offers a pack that suits the workshop's category", () => {
    expect(packsForCategory("HEAVY_EQUIPMENT").map((pack) => pack.key)).toContain("FIELD_SERVICE");
    expect(packsForCategory("MOTORCYCLES").map((pack) => pack.key)).not.toContain("FIELD_SERVICE");
  });

  it("every pack declares at least one real definition with at least one field", () => {
    for (const pack of SPECIALIZATION_PACKS) {
      expect(pack.definitions.length).toBeGreaterThan(0);
      for (const definition of pack.definitions) {
        expect(definition.fields.length).toBeGreaterThan(0);
        expect(definition.name.length).toBeGreaterThan(2);
      }
    }
  });
});

describe("a draft is refused for reasons the person can act on", () => {
  it("refuses a workshop that holds stock with nowhere to hold it", () => {
    const result = validateDraft(completeDraft({ warehouses: [] }));
    const finding = result.findings.find((f) => f.code === "NO_WAREHOUSE");

    expect(result.publishable).toBe(false);
    expect(finding?.stage).toBe("STRUCTURE");
    expect(finding?.message).toContain("has to come out of somewhere");
  });

  it("refuses a store configured for a workshop that has no stock", () => {
    const result = validateDraft(
      completeDraft({
        capabilities: { INVENTORY: "DISABLED", PART_RETURNS: "DISABLED", MULTI_WAREHOUSE: "DISABLED" },
        warehouses: [{ name: "Main store", code: "WH1", branchCodes: [] }],
      }),
    );

    expect(result.findings.map((f) => f.code)).toContain("WAREHOUSE_WITHOUT_INVENTORY");
  });

  it("refuses a store granted to a branch that does not exist", () => {
    const result = validateDraft(
      completeDraft({ warehouses: [{ name: "Main store", code: "WH1", branchCodes: ["GHOST"] }] }),
    );
    expect(result.findings.map((f) => f.code)).toContain("WAREHOUSE_UNKNOWN_BRANCH");
  });

  it("refuses an answer to a question this workshop is never asked", () => {
    const result = validateDraft(
      completeDraft({
        capabilities: { QC: "DISABLED" },
        warehouses: [{ name: "Main store", code: "WH1", branchCodes: [] }],
        policies: { QC_MANDATORY: "MANDATORY_ALWAYS" },
      }),
    );
    expect(result.findings.map((f) => f.code)).toContain("POLICY_NOT_APPLICABLE");
  });

  it("lifts the reachability guarantee's own words rather than restating them", () => {
    // PART_RETURNS without INVENTORY is the dependency the capability
    // engine already refuses. The finding must carry that engine's
    // message, not a second opinion about it.
    const result = validateDraft(
      completeDraft({ capabilities: { INVENTORY: "DISABLED", PART_RETURNS: "ENABLED" } }),
    );
    const finding = result.findings.find((f) => f.code === "CAPABILITY_INVALID");

    expect(finding).toBeDefined();
    expect(finding?.stage).toBe("CAPABILITIES");
  });

  it("does not block on an unanswered policy — the registry default is a real answer", () => {
    const result = validateDraft(
      completeDraft({ warehouses: [{ name: "Main store", code: "WH1", branchCodes: [] }] }),
    );
    const unanswered = result.findings.filter((f) => f.code === "POLICY_NOT_ANSWERED");

    expect(unanswered.length).toBeGreaterThan(0);
    expect(unanswered.every((f) => f.severity === "WARNING")).toBe(true);
    expect(result.publishable).toBe(true);
  });

  it("refuses a draft that exceeds the plan it was given", () => {
    const result = validateDraft(
      completeDraft({
        branches: [
          { name: "Main", code: "MAIN" },
          { name: "Second", code: "SECOND" },
        ],
        warehouses: [{ name: "Main store", code: "WH1", branchCodes: [] }],
      }),
      { maxBranches: 1, maxUsers: 5, maxWarehouses: 1 },
    );

    expect(result.findings.map((f) => f.code)).toContain("BRANCH_EXCEEDS_PLAN");
  });

  it("refuses two branches sharing a code", () => {
    const result = validateDraft(
      completeDraft({
        branches: [
          { name: "Main", code: "MAIN" },
          { name: "Other", code: "MAIN" },
        ],
        warehouses: [{ name: "Main store", code: "WH1", branchCodes: [] }],
      }),
    );
    expect(result.findings.map((f) => f.code)).toContain("DUPLICATE_BRANCH_CODE");
  });

  it("passes a complete, coherent draft", () => {
    const draft = completeDraft({
      capabilities: { MULTI_BRANCH: "DISABLED", MULTI_WAREHOUSE: "DISABLED" },
      warehouses: [{ name: "Main store", code: "WH1", branchCodes: ["MAIN"] }],
      specializationPacks: ["QUICK_SERVICE"],
    });
    const result = validateDraft({ ...draft, policies: recommendedPolicyAnswers(draft) });

    expect(result.blockerCount).toBe(0);
    expect(result.publishable).toBe(true);
  });
});

describe("an enabled capability must have someone able to operate it", () => {
  it("asks who runs the store only when there is a store to run", () => {
    expect(applicableResponsibilities({}).map((q) => q.capability)).toContain("INVENTORY");
    expect(applicableResponsibilities({ INVENTORY: "DISABLED" }).map((q) => q.capability)).not.toContain("INVENTORY");
  });

  it("grants the covering role the permissions the dedicated one held", () => {
    // The real hole: TENANT_OWNER holds no inventory.* permission in the
    // platform's baseline map, so a workshop with Inventory on and no
    // storekeeper has part requests nobody may approve.
    const grants = grantsForResponsibilities({}, { INVENTORY: "TENANT_OWNER" });
    const keys = grants.filter((grant) => grant.role === "TENANT_OWNER").map((grant) => grant.permissionKey);

    expect(keys).toContain("inventory.request.approve");
    expect(keys).toContain("inventory.request.issue");
    expect(grants.every((grant) => grant.allowed)).toBe(true);
  });

  it("never launders an explicitly-denied permission through a delegation", () => {
    // inventory.cost.view is `false` for INVENTORY_MANAGER on purpose --
    // managing the catalogue does not imply seeing margin. Handing the
    // job to the owner must not quietly hand over the denial too.
    const grants = grantsForResponsibilities({}, { INVENTORY: "TENANT_OWNER" });
    expect(grants.map((grant) => grant.permissionKey)).not.toContain("inventory.cost.view");
  });

  it("grants nothing when the workshop will staff the dedicated role", () => {
    expect(grantsForResponsibilities({}, { INVENTORY: "DEDICATED" })).toEqual([]);
  });

  it("refuses a capability handed to a role that may not legitimately hold it", () => {
    // TECHNICIAN is not among INVENTORY's declared fallbacks, so this is
    // an orphan rather than a delegation -- and the API is where a
    // hand-built request like this arrives.
    expect(orphanedCapabilities({}, { INVENTORY: "TECHNICIAN" })).toEqual(["INVENTORY"]);
    expect(grantsForResponsibilities({}, { INVENTORY: "TECHNICIAN" })).toEqual([]);
  });

  it("blocks publication of a capability nobody can operate", () => {
    const result = validateDraft(
      completeDraft({
        warehouses: [{ name: "Main store", code: "WH1", branchCodes: [] }],
        responsibilities: { INVENTORY: "TECHNICIAN" },
      }),
    );
    expect(result.findings.map((f) => f.code)).toContain("CAPABILITY_HAS_NO_OPERATOR");
    expect(result.publishable).toBe(false);
  });
});

describe("country decides currency, timezone and the working week", () => {
  it("refuses a country the platform does not support", () => {
    const result = validateDraft(completeDraft({ identity: { ...completeDraft().identity, country: "ZZ" } }));
    expect(result.findings.map((f) => f.code)).toContain("UNKNOWN_COUNTRY");
  });

  it("warns, but does not refuse, a currency that is unusual for the country", () => {
    // A Cairo workshop invoicing fleet customers in USD is a real
    // business, not a typo -- but it looks exactly like one.
    const result = validateDraft(
      completeDraft({
        identity: { ...completeDraft().identity, currency: "USD" },
        capabilities: { MULTI_BRANCH: "DISABLED", MULTI_WAREHOUSE: "DISABLED" },
        warehouses: [{ name: "Main store", code: "WH1", branchCodes: [] }],
      }),
    );
    const finding = result.findings.find((f) => f.code === "CURRENCY_UNUSUAL_FOR_COUNTRY");
    expect(finding?.severity).toBe("WARNING");
  });

  it("gives a Gulf workshop a different working week from a European one", () => {
    // The bug policy P-15 was raised for: MOP's ageing arithmetic assumed
    // Monday-to-Friday everywhere.
    expect(workingDaysFor("SA")).toEqual([0, 1, 2, 3, 4]);
    expect(workingDaysFor("DE")).toEqual([1, 2, 3, 4, 5]);
  });
});

describe("services become real catalogue prices", () => {
  it("refuses a price that is not a whole number of minor units", () => {
    const result = validateDraft(
      completeDraft({
        capabilities: { MULTI_BRANCH: "DISABLED", MULTI_WAREHOUSE: "DISABLED" },
        warehouses: [{ name: "Main store", code: "WH1", branchCodes: [] }],
        services: [{ name: "Oil change", price: "450.00" }],
      }),
    );
    expect(result.findings.map((f) => f.code)).toContain("SERVICE_PRICE_INVALID");
  });

  it("refuses a priced catalogue for a workshop that does no pricing", () => {
    const result = validateDraft(
      completeDraft({
        capabilities: { FINANCE_CORE: "DISABLED", BILLING: "DISABLED", MULTI_BRANCH: "DISABLED", MULTI_WAREHOUSE: "DISABLED" },
        warehouses: [{ name: "Main store", code: "WH1", branchCodes: [] }],
        services: [{ name: "Oil change", price: "45000" }],
      }),
    );
    expect(result.findings.map((f) => f.code)).toContain("SERVICES_WITHOUT_FINANCE");
  });
});

describe("a workshop is never created with nowhere to take a job in", () => {
  it("warns rather than refuses when no branch is declared — one is created from the name", () => {
    const result = validateDraft(
      completeDraft({
        capabilities: { MULTI_BRANCH: "DISABLED", MULTI_WAREHOUSE: "DISABLED" },
        branches: [],
        warehouses: [{ name: "Main store", code: "WH1", branchCodes: [] }],
      }),
    );
    const finding = result.findings.find((f) => f.code === "NO_BRANCH");

    expect(finding?.severity).toBe("WARNING");
    expect(finding?.message).toContain("will be created");
  });
});

describe("plan capability entitlement validation", () => {
  it("capability consequence exposes semantic type, supported statuses, and governing module", () => {
    const inventory = capabilityConsequence("INVENTORY");
    expect(inventory.type).toBe("BOOLEAN");
    expect(inventory.governingModule).toBe("INVENTORY");
    expect(inventory.supportedStatuses).toContain("ENABLED");
    expect(inventory.supportedStatuses).toContain("DISABLED");
    expect(inventory.runtimeConsumers).toContain("PartRequestService");

    const finance = capabilityConsequence("FINANCE_CORE");
    expect(finance.type).toBe("MODE_BASED");
    expect(finance.governingModule).toBe("FINANCE");
    expect(finance.supportedStatuses).toContain("EXTERNAL");
  });

  it("refuses an active capability when the plan does not include its governing module", () => {
    // Draft enables INVENTORY, but plan only allows OPERATIONS, ORGANIZATION, AUDIT, REPORTS
    const draft = completeDraft({
      capabilities: { MULTI_BRANCH: "DISABLED", MULTI_WAREHOUSE: "DISABLED" },
      warehouses: [{ name: "Main store", code: "WH1", branchCodes: [] }],
      responsibilities: { INVENTORY: "TENANT_OWNER" },
    });

    const planLimits = {
      maxBranches: 2,
      maxUsers: 5,
      maxWarehouses: 2,
      allowedModules: ["ORGANIZATION", "OPERATIONS", "AUDIT", "REPORTS"],
    };

    const result = validateDraft(draft, planLimits);
    const finding = result.findings.find((f) => f.code === "CAPABILITY_NOT_PERMITTED_BY_PLAN");
    expect(finding).toBeDefined();
    expect(finding?.severity).toBe("BLOCKER");
    expect(finding?.subject).toBe("INVENTORY");
    expect(finding?.message).toContain("INVENTORY requires the INVENTORY module");
    expect(result.publishable).toBe(false);
  });

  it("passes when the capability is disabled even if the plan does not include its module", () => {
    const draft = completeDraft({
      capabilities: {
        INVENTORY: "DISABLED",
        PART_RETURNS: "DISABLED",
        MULTI_BRANCH: "DISABLED",
        MULTI_WAREHOUSE: "DISABLED",
      },
      warehouses: [],
    });

    // Plan includes everything EXCEPT INVENTORY
    const planLimits = {
      maxBranches: 2,
      maxUsers: 5,
      maxWarehouses: 2,
      allowedModules: ["ORGANIZATION", "OPERATIONS", "AUDIT", "REPORTS", "FINANCE", "TEAM_MANAGEMENT", "CUSTOMER_PORTAL"],
    };

    const result = validateDraft(draft, planLimits);
    const blockers = result.findings.filter((f) => f.code === "CAPABILITY_NOT_PERMITTED_BY_PLAN");
    expect(blockers).toHaveLength(0);
  });

  it("passes when the plan permits all active capabilities", () => {
    const draft = completeDraft({
      capabilities: { MULTI_BRANCH: "DISABLED", MULTI_WAREHOUSE: "DISABLED" },
      warehouses: [{ name: "Main store", code: "WH1", branchCodes: [] }],
      responsibilities: { INVENTORY: "TENANT_OWNER" },
    });

    const planLimits = {
      maxBranches: 2,
      maxUsers: 5,
      maxWarehouses: 2,
      allowedModules: ["ORGANIZATION", "OPERATIONS", "AUDIT", "REPORTS", "INVENTORY", "FINANCE", "TEAM_MANAGEMENT", "CUSTOMER_PORTAL"],
    };

    const result = validateDraft(draft, planLimits);
    const blockers = result.findings.filter((f) => f.code === "CAPABILITY_NOT_PERMITTED_BY_PLAN");
    expect(blockers).toHaveLength(0);
    expect(result.publishable).toBe(true);
  });
});

describe("specialization pack resolution and capability compatibility", () => {
  it("resolves TYRES alias to canonical TYRES_AND_WHEELS pack", () => {
    expect(canonicalSpecializationKey("TYRES")).toBe("TYRES_AND_WHEELS");
    const pack = specializationPack("TYRES");
    expect(pack).toBeDefined();
    expect(pack?.key).toBe("TYRES_AND_WHEELS");
    expect(pack?.title).toBe("Tyres & wheels");
  });

  it("flags SPECIALIZATION_CAPABILITY_INCOMPATIBLE when required capability is disabled", () => {
    const draft = completeDraft({
      capabilities: {
        QUICK_INSPECTION: "DISABLED",
      },
      specializationPacks: ["QUICK_SERVICE"],
    });

    const result = validateDraft(draft);
    const incompatible = result.findings.filter((f) => f.code === "SPECIALIZATION_CAPABILITY_INCOMPATIBLE");
    expect(incompatible).toHaveLength(1);
    expect(incompatible[0].severity).toBe("BLOCKER");
    expect(incompatible[0].subject).toBe("QUICK_SERVICE");
    expect(incompatible[0].message).toContain("QUICK_INSPECTION");
    expect(result.publishable).toBe(false);
  });

  it("passes specialization capability check when required capability is active", () => {
    const draft = completeDraft({
      capabilities: {
        QUICK_INSPECTION: "ENABLED",
        MULTI_BRANCH: "DISABLED",
        MULTI_WAREHOUSE: "DISABLED",
      },
      specializationPacks: ["QUICK_SERVICE"],
      warehouses: [{ name: "Main store", code: "WH1", branchCodes: [] }],
      responsibilities: { INVENTORY: "TENANT_OWNER" },
    });

    const result = validateDraft(draft);
    const incompatible = result.findings.filter((f) => f.code === "SPECIALIZATION_CAPABILITY_INCOMPATIBLE");
    expect(incompatible).toHaveLength(0);
  });
});


# MOP — Specialisations and Workshop Profiles

> **Document ID:** DOC-03
> **Purpose:** the two mechanisms that shape a workshop besides capabilities and policies — what kind of work it does (specialisation) and which shipped starting shape it was created from (profile).
> **Authority:** DESCRIPTIVE.
> **Scope:** specialisation definitions, entries, packs, position taxonomy, credentials, and the seven shipped capability profiles.
> **Last verified:** 2026-09-01 against commit `a8c8bb5`.
> **Source of truth:** `packages/shared/src/capabilities/profiles.ts`, `packages/shared/src/onboarding/specialization-packs.ts`, `packages/shared/src/onboarding/presentation.ts`, `apps/api/src/systems/people/specialization/`, `packages/database/prisma/schema.prisma` (`SpecializationDefinition`, `SpecializationEntry`, `PositionTaxonomyEntry`, `CredentialDefinition`, `StaffCredential`, `BlockerReasonDefinition`).
> **Related:** 02 (capabilities), 04 (policies), 32 (forms and custom fields), 05 (roles).

---

## 1. Four axes, not one

A workshop's behaviour is shaped along four independent axes. Confusing them is the single most common source of mis-designed features in this project, so they are stated together:

| Axis | Question it answers | Where it lives | Can it change reachability? |
|---|---|---|---|
| **Capability** | Does this step exist here at all? | `TenantCapability` (time-ranged) | **Yes** — that is its definition |
| **Policy** | What rule does an existing step run under? | `WorkshopPolicy` (time-ranged) | **Never** — proven in CI |
| **Specialisation** | What kind of work is this, and what shape of record does it produce? | `SpecializationDefinition` / `Entry` | No |
| **Permission** | Who may perform this action? | `RolePermission` / `UserPermissionOverride` | No |

A specialisation is **vocabulary and record shape**, not behaviour. A brake measurement and an oil change are not the same shape of record; a workshop forced to squeeze one into the other stops recording it. That is the entire problem specialisation solves.

**Historical caution.** In earlier passes, specialisation was closer to metadata than to runtime behaviour — a label with no consumer. Doc 37 tracks what still has no consuming surface. Anything below marked `[IMPLEMENTED]` but not `[INTEGRATED]` means the definition side is real and the *consuming* page is not built.

## 2. Operating categories

`[IMPLEMENTED]` — `CategoryCode` in the Prisma schema.

| Code | Meaning |
|---|---|
| `CARS` | Passenger vehicles |
| `MOTORCYCLES` | Two-wheelers |
| `HEAVY_EQUIPMENT` | Generators, excavators, plant — machines whose hour meter, not odometer, is the record |

The category is chosen at workshop creation and is upstream of everything else in this document: it decides which specialisation packs are offered, which position taxonomy applies, and what a "vehicle" even means. `Asset`, not `Vehicle`, is the entity name for exactly this reason.

## 3. Specialisation definitions and entries

### 3.1 The primitive

`[IMPLEMENTED]` — `SpecializationDefinition` + `SpecializationEntry`.

A **definition** is a workshop-authored *shape to fill in*: a named set of typed fields. A quick-service oil-change service card (viscosity: enum, litres: decimal) and a heavy-equipment hydraulic diagnostic form (six test points, each with a unit) are both rows in the same table, because they are the same underlying primitive wearing two labels.

```
SpecializationDefinition
  tenantId, category, kind, name, version, isActive
  fields: Json  →  [{ key, label, type, unit?, enumOptions?, required }]
```

| `kind` | Purpose |
|---|---|
| `SERVICE_CARD` | The record a technician fills in *doing* a named job |
| `MEASUREMENT_FORM` | The record a technician fills in *measuring* something |

`kind` exists only so a page can ask "show me this category's service cards" separately from "show me its diagnostic forms". It changes nothing about how a definition is stored or validated.

Field types: `TEXT` · `DECIMAL` · `ENUM` · `BOOLEAN`.

`fields` is deliberately `Json` rather than a child table: a field list is authored and read as one unit, never queried field-by-field across definitions.

### 3.2 Versioning — the invariant that makes old records honest

`SpecializationDefinition.version` is bumped whenever `fields` changes, and a `SpecializationEntry` **pins** the version it was filled against (`definitionVersion`). An entry is never silently reinterpreted against a newer shape.

This is the same pattern used by `TenantCapability` (historical resolution), `WorkshopPolicy`, `MessageTemplate` and `PriceCatalogEntry`. State it once, in general form:

> **Current configuration and historical record are different questions, and the record wins for anything that already happened.**

Validation happens at write time against the pinned definition, and is not re-run on read — the same trust boundary the rest of the schema uses.

### 3.3 Position taxonomy

`[IMPLEMENTED]` — `PositionTaxonomyEntry`.

Per-category "where on the asset" vocabulary: `FL/FR/RL/RR` for cars, cylinder number for generators. A row with `tenantId: null` is the **platform default** for that category; a workshop row with the same category overrides it for that tenant only.

Category defaults rather than fully free-form per workshop, deliberately: otherwise two workshops' position data becomes incomparable for no benefit.

### 3.4 Credentials

`[IMPLEMENTED]` — `CredentialDefinition` + `StaffCredential`. A workshop declares the credentials its work requires (e.g. an air-conditioning refrigerant handling certificate) and records which staff hold them, with validity.

### 3.5 Blocker reason definitions

`[IMPLEMENTED]` — `BlockerReasonDefinition` with a `BlockerBehavior`. A workshop's blocker vocabulary is specialisation-shaped too: "waiting for a crane" is a real blocker in field service and meaningless in a car bay.

## 4. Specialisation packs

`[IMPLEMENTED]` `[INTEGRATED]` — `packages/shared/src/onboarding/specialization-packs.ts`, consumed by the `SPECIALIZATION` stage of workshop creation.

A **pack** is a set of ready-made service cards and measurement forms a workshop starts with, so creation produces real records on day one rather than an empty authoring screen. A pack is offered only if its `categories` include the workshop's chosen category, so an irrelevant pack is never shown.

| Pack | Categories | What it is |
|---|---|---|
| `QUICK_SERVICE` | Cars, Motorcycles | Oil, filters, fluids — short jobs done many times a day, recorded the same way each time |
| `BRAKES_AND_SUSPENSION` | Cars, Motorcycles | Measured wear, per wheel — the readings that decide replace-or-pass |
| `DIAGNOSTICS` | Cars, Motorcycles, Heavy equipment | The workshop sells the answer, not only the repair — codes and readings are the deliverable |
| `ELECTRICAL` | Cars, Motorcycles, Heavy equipment | Charging, starting and parasitic-draw work, where readings are the evidence |
| `FIELD_SERVICE` | Heavy equipment | Work on the customer's site, on machines whose pressures and hours are the record |
| `TYRES_AND_WHEELS` | Cars, Motorcycles, Heavy equipment | Tread depth and pressure per wheel, comparable over time |
| `BODY_AND_PAINT` | Cars, Motorcycles | Panel work, where colour code and coat count are what a comeback is judged against |

Worked example — `QUICK_SERVICE` ships an *Oil change* service card with:

```
viscosity      ENUM     5W-30 | 5W-40 | 10W-40 | 20W-50   required
litres         DECIMAL  unit L                            required
filterType     TEXT
nextServiceKm  DECIMAL  unit km
```

`BRAKES_AND_SUSPENSION` ships a per-wheel pad measurement form (`pad_fl`, `pad_fr`, `pad_rl`, `pad_rr` in mm, plus a `disc_min_spec` boolean) — which is exactly the "same reading, four positions" case the position taxonomy exists for.

## 5. Shipped capability profiles

`[IMPLEMENTED]` `[VERIFIED]` — `packages/shared/src/capabilities/profiles.ts`. Every profile is validated in CI by `validator.spec.ts`, so a change to the lifecycle graph can never silently strand one of the standard shapes.

A profile is a **starting point**, not a type. Super Admin applies one at creation and adjusts afterwards; nothing in the runtime ever asks "which profile is this tenant". Capabilities not listed in a profile are `ENABLED` — a profile records deviations from the full product.

### 5.1 The seven

| Profile | Presented as | Deviations from full product |
|---|---|---|
| `MULTI_BRANCH_FULL_SERVICE` | *Multi-branch full service* | **none** — everything on. The twelve-branch dealership |
| `SINGLE_BAY_QUICK_SERVICE` | *Single-bay quick service* | `MULTI_BRANCH`, `MULTI_WAREHOUSE`, `INVENTORY`, `PART_RETURNS`, `TEAMS`, `TEAM_REVIEW`, `QC` all `DISABLED`; `EXTERNAL_PARTS` explicitly `ENABLED` |
| `DIAGNOSTICS_ONLY` | *Diagnostics only* | Same as above **plus** `EXTERNAL_PARTS: DISABLED` — sells the answer, not the repair. No parts at all, no fitting |
| `HEAVY_EQUIPMENT_FIELD_SERVICE` | *Field service* | `MULTI_BRANCH`, `TEAM_REVIEW`, `CUSTOMER_PORTAL` `DISABLED`. Stock is carried; supervision and the portal are not |
| `MOTORCYCLE_WORKSHOP` | *Motorcycle workshop* | `MULTI_WAREHOUSE`, `TEAMS`, `TEAM_REVIEW`, `QC` `DISABLED`. Two branches, one store, no formal QC step |
| `EXTERNAL_BILLING` | *Invoices issued elsewhere* | `BILLING: EXTERNAL` |
| `EXTERNAL_FINANCE` | *Money handled outside MOP* | `FINANCE_CORE: EXTERNAL`, `BILLING: EXTERNAL` |

### 5.2 The distinction the last two exist to prove

`EXTERNAL_BILLING` and `EXTERNAL_FINANCE` are the Finance/Billing bounded-system split earning its keep. `EXTERNAL`, not `DISABLED`:

- **External Billing** — MOP still owns pricing, payments and balances. Only the legal invoice document comes from accounting software, and MOP records its reference. `payment.settled_or_policy_allows` stays live; `invoice.issued` drops.
- **External Finance** — MOP runs the operation only. Money is entirely elsewhere. `PAYMENT_PENDING` becomes unenterable and finish routes straight to delivery readiness via the replacement edges the removal policy declares.

### 5.3 Seeded tenants

`[IMPLEMENTED]` — `packages/database/prisma/seed.ts`. The seed deliberately creates **two differently-shaped tenants**, because a single-tenant database makes isolation and shape bugs invisible.

| Tenant | Slug | Shape |
|---|---|---|
| **Apex Motors** | `apex-motors` | Multi-branch full service — branches *Nasr City* and *Giza*, warehouses *Central Warehouse* and *Giza Store*, inventory + teams + QC |
| **Delta Quick Service** | `delta-quick` | Single bay (*Main Bay*), no inventory, no teams, no QC |

> *"Delta is the shape that breaks naive code: no inventory means no part…"* — the seed's own comment. Any code that assumes an inventory, a team or a second branch fails against Delta before it reaches a customer.

## 6. The responsibility axis at creation

`[IMPLEMENTED]` `[INTEGRATED]` — `packages/shared/src/onboarding/responsibility.ts`, the `RESPONSIBILITY` stage of workshop creation.

This is not a specialisation, but it belongs beside it because it answers the question specialisation and capability together create: **who actually does the work a capability produces?**

The hole it closes is real and was silent. Turning on `INVENTORY` gives a workshop part requests, issuing, returns and stock — every one gated behind an `inventory.*` permission that, in the platform's baseline map, only `INVENTORY_MANAGER` holds. `TENANT_OWNER` holds none of them. So a one-bay workshop that enables Inventory and never hires a storekeeper gets a capability **nobody in the building can operate**: the technician raises a part request and there is no account on earth permitted to approve it. Nothing in the product refused that configuration, because nothing in the product asked the question.

The stage asks it, and the answer is a real permission grant — the missing `RolePermission` rows written at creation instead of discovered by hand after the first request stuck.

Two guard rails on that mechanism:

1. **It never invents a permission or a role.** Every key transferred is one the dedicated role already holds in `DEFAULT_ROLE_PERMISSIONS`, moved to a role the same map already treats as senior to it.
2. **One question stands regardless of its capability.** `BRANCH_MANAGER` work — booking a vehicle in, recording a decision on the customer's behalf, reassigning a technician, releasing a delivery — is not multi-branch work. It is what running the one branch every tenant has means, so the question is asked even when `MULTI_BRANCH` is off.

## 7. Workshop creation — the nine stages

`[IMPLEMENTED]` `[INTEGRATED]` `[VERIFIED]` — `/platform/workshops/new`, backed by `GET /platform/onboarding/blueprint` and `POST /platform/onboarding/validate`, with `POST /platform/workshops` performing creation as **one transaction**.

| # | Stage | What it decides | Why it is irreversible-ish |
|---|---|---|---|
| 1 | **Identity** | Name, country, currency, timezone | Currency and timezone can never change afterwards — every price and timestamp is recorded against them |
| 2 | **Plan & access** | Commercial plan, owner account, invite | The plan's ceilings bound branches, stores and people |
| 3 | **Capabilities** | Which parts of the operation this workshop runs | Decides which pages exist, which roles have work, which checks run, and which questions come next |
| 4 | **Specialisation** | Category and packs | Creates real service cards and measurement forms |
| 5 | **Policies** | The rule each enabled step runs under | Only questions this shape makes meaningful are asked |
| 6 | **Responsibility** | Who covers each capability's work | Grants the covering role the permissions it needs, at creation |
| 7 | **Structure** | Branches and stores, and which branch may draw from which store | Without at least one of each, the capabilities above have nowhere to happen |
| 8 | **Services** | Named jobs and their prices | Creates real `PriceCatalogEntry` rows the running invoice reads from the first job onward. Optional |
| 9 | **Review** | Everything above, before anything is created | Creation is a single transaction — the whole workshop or none of it |

**What creation actually writes**, in one transaction: `Tenant`, `TenantCapability` rows, `WorkshopPolicy` rows, `FinanceConfiguration`, branches and warehouses with their `BranchWarehouseAccess` grants, `PriceCatalogEntry` rows, `SpecializationDefinition` rows, `RolePermission` baseline plus responsibility transfers, the owner `Account` + `StaffUser` + invite token, and a version-1 `TenantConfigurationVersion` snapshot.

Every figure shown on screen is derived by `@mop/shared/onboarding` from the same registries the runtime uses, and the server refuses a draft with the same `validateDraft` the browser previews with — one validator, two callers, so the preview cannot promise what creation will refuse.

## 8. Implementation status

| Element | Status |
|---|---|
| `SpecializationDefinition` / `Entry`, versioned and pinned | ✅ `[IMPLEMENTED]` `[VERIFIED]` — `specialization.integration.spec.ts` |
| `PositionTaxonomyEntry` with platform defaults + tenant override | ✅ `[IMPLEMENTED]` |
| `CredentialDefinition` / `StaffCredential` | ✅ `[IMPLEMENTED]` |
| `BlockerReasonDefinition` with behaviour | ✅ `[IMPLEMENTED]` |
| Seven specialisation packs, category-filtered | ✅ `[INTEGRATED]` — creation stage 4 |
| Seven shipped capability profiles | ✅ `[VERIFIED]` — validated in CI |
| Responsibility questions and permission transfer | ✅ `[INTEGRATED]` — creation stage 6 |
| Nine-stage creation journey | ✅ `[INTEGRATED]` |
| **Specialisation-aware technician recording surface** | 🟡 — definitions and validation are real; see doc 37. The *authoring* half is complete, the *consuming* pages (inspection recording, intake custom-field capture) are not built |
| Phase 15–17 remainder (wizard UI beyond 17.A, 17.B–E) | 🔴 `[INTENDED]` — see `../PHASE_MAP.md` |

The last two rows are the honest edge of this subsystem: MOP can *define* the shape of a specialised record and *validate* values against it, and packs create real definitions at creation, but the day-to-day pages on which a technician fills those cards in are not all built. Doc 37 carries this as a named gap rather than leaving it implied.

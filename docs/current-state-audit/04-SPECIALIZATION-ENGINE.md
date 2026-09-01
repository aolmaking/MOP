# 04 — Specialization Engine Audit

**Question:** is Specialization a genuine behavioral configuration layer, or mostly architectural foundation / metadata?

**Answer: metadata-only today.** It is honest metadata with a real seeding path and zero runtime consumers.

## 1. What exists

| Piece | Where | Nature |
|---|---|---|
| 7 packs / 11 cards (QUICK_SERVICE, BRAKES_AND_SUSPENSION, DIAGNOSTICS, ELECTRICAL, FIELD_SERVICE, TYRES_AND_WHEELS, BODY_AND_PAINT) | `packages/shared/src/onboarding/specialization-packs.ts` | declarative seeding specs (`SERVICE_CARD | MEASUREMENT_FORM`, TEXT/DECIMAL/ENUM/BOOLEAN fields mirroring Prisma) |
| Category vocabulary CARS/MOTORCYCLES/HEAVY_EQUIPMENT | `operations/categories.ts` | mirrors Prisma `CategoryCode`; enforced at intake (`category_not_serviced` vs `Plan.allowedCategories`) |
| `SpecializationDefinition` + entries/credentials/position-taxonomy services | `apps/api/src/systems/people/specialization/*` | full CRUD engine w/ versioned revisions, typed `validateValues`, credential expiry — **no controllers** |
| Creation-time write | `PlatformService.attemptCreateWorkshop` step 10 → `defineCard` per pack entry | the only production writer |
| Relevance hook | `RelevanceContext.specializations` threaded through policy relevance (`isPolicyRelevant`) | wired **and tested** in shared — but every registered predicate is `() => true`, so nothing reacts |
| Legacy cohabitant | `platform/workshop-options.ts` still exports Phase-17.A `STARTER_SPECIALIZATION_PROFILES` alongside the pack system | two generations of starter-shape metadata |

## 2. The five audit questions

- **Selected how?** Wizard stage 4; category-filtered; multi-select.
- **Changes behavior?** No. No page, permission, workflow edge, price rule or role reads specialization state.
- **Affects pricing/services?** No — services stage writes `PriceCatalogEntry` rows independent of packs.
- **Affects roles/pages/capabilities/policies?** No for the first three; *structurally* ready to affect policies via `specializations` in `RelevanceContext`, unused by all 16 predicates.
- **Who reads values back?** Nobody in production. `fillEntry/entriesFor`, credentials, taxonomy: zero callers outside specs.

## 3. Verdict

**Architectural foundation + creation-time data seeding; not yet a behavioral layer.** The seam is real and cheap to activate (the relevance context already flows), but claiming workshops are "specialized" today would be generous — they are capability-shaped and policy-shaped, not specialization-shaped.

Maturity: schema Operational · seeding Operational · consumption Missing · behavioral effect None.

# MOP — Forms, Custom Fields and Configuration

> **Document ID:** DOC-32
> **Purpose:** the nine extensible forms, how a workshop adds a field, and the four distinct kinds of configuration MOP has.
> **Authority:** DESCRIPTIVE.
> **Scope:** `apps/api/src/systems/forms/`, `CustomFieldDefinition`, and the configuration taxonomy.
> **Last verified:** 2026-09-01 against commit `a8c8bb5`.
> **Related:** 02 (capabilities), 04 (policies), 03 (specialisation), 06 (entities).

---

## 1. The five kinds of configuration, and how to tell them apart

MOP has exactly five configuration axes. **A sixth ad-hoc one is drift**, and the discipline that keeps configurability from becoming *a second, worse programming language* is knowing which axis a new setting belongs to.

| Axis | Question | Store | Changes reachability? |
|---|---|---|---|
| **Capability** | Does this step exist here? | `TenantCapability` | **Yes** |
| **Policy** | What rule does an existing step run under? | `WorkshopPolicy` | **Never** |
| **Specialisation** | What kind of work, and what shape of record? | `SpecializationDefinition` | No |
| **Custom field** | What extra data does this form capture? | `CustomFieldDefinition` | No |
| **Configuration value** | A plain setting with no option set | `FinanceConfiguration`, `ControlSetting` | No |

The last row is the one that needs discipline: a default VAT rate is a **configuration value**, not a policy, because it has no enumerable option set and no behavioural branch. A policy always has 2..n named options and a consumer that switches over every one of them.

## 2. The nine forms

`FORM_KEYS`, `apps/api/src/systems/forms/form-registry.ts`. **Fixed by the spec, not configurable** — a workshop extends a form, it does not invent one.

| Form key | Label | Core fields (locked, shown for reference) |
|---|---|---|
| `CUSTOMER_INTAKE` | Customer Intake | Full name · Phone · Email |
| `ASSET_REGISTRATION` | Asset Registration | Category · Plate/Serial number · Make · Model · Year |
| `QUICK_INSPECTION` | Quick Inspection | Odometer/hours · Note |
| `FULL_INSPECTION` | Full Inspection | Odometer/hours · Note |
| `PART_REQUEST` | Part Request | Item · Quantity · Urgency |
| `RETURN_UNUSED` | Return Unused | Item · Quantity · Reason |
| `CUSTOMER_DECISION_REQUEST` | Customer Decision Request | Question · Options · Critical |
| `WORK_ORDER` | Work Order | Branch · Asset · Customer · Status |
| `INVOICE_NOTES` | Invoice Notes | Line items · Total |

**Core fields are locked** — never editable or deletable through this surface. They are the product's own contract; a workshop that could delete *Plate/Serial number* from Asset Registration would break intake search, the identifier primitive and vehicle history at once.

Note `ASSET_REGISTRATION`'s *Plate/Serial number* as a single core field: it is one concept whose rendering depends on `CategoryCode`, which is why the `identifier` UI primitive exists.

## 3. `CustomFieldDefinition`

```
tenantId · formKey · fieldKey · label · fieldType · options?
categoryScope[]  roleScope[]
customerVisible  reportable  required  order  isArchived
```

Unique on `(tenantId, formKey, fieldKey)`; indexed on `(tenantId, formKey, isArchived)`.

**Field types:** `TEXT` · `NUMBER` · `SELECT` · `CHECKBOX` · `DATE` · `TEXTAREA`.

### Four design decisions worth keeping

**`fieldKey` is deterministic.** `slugifyFieldKey("Battery Voltage") → "battery_voltage"`, so the same label always produces the same key. Two workshops adding *Battery Voltage* produce comparable data rather than two incomparable random ids.

**Empty scope means "all".** `categoryScope: []` means every category this workshop operates; `roleScope: []` means any role that can reach the form at all. Empty-as-universal rather than empty-as-nothing matches the capability model's *absent means enabled*, so the two configuration systems read the same way.

**Archived, never deleted.** Past records that captured a value under a definition keep showing it, tagged *(archived field)*. Restoring un-archives it back into the live form **at the same `order`**. This is the same immutability discipline as `PriceCatalogEntry` and `MessageTemplate`: deleting the definition would silently orphan every value ever captured under it.

**Three separate flags, not one.** `customerVisible`, `reportable` and `required` answer different questions — *may the customer see it*, *may it appear in a report*, *must it be filled*. `customerVisible` in particular is a privacy decision: it is the one place a workshop can put its own data on the customer's side of the boundary described in doc 11 §2.

## 4. `validateValues()` — the reusable link

The authoring half's payoff. `CustomFieldsService.validateValues()` checks:

- **Required-ness** — a required field with no value is refused.
- **`SELECT` option membership** — a value not in the declared options is refused, not coerced.
- **Category-scope filtering** — a field scoped to `CARS` is not required of a generator.

It is **proven against the spec's own worked example** (*Battery Voltage on Quick Inspection*) and is designed as the single function any future form-recording service calls, so validation cannot fork per page.

## 5. The authoring surface

`/owner/forms`, permission `organization.forms.manage`.

| Endpoint | Does |
|---|---|
| `GET /organization/forms` | All nine, with counts |
| `GET /organization/forms/:formKey` | Core fields plus this workshop's custom fields |
| `POST /organization/forms/:formKey` | Add a field. Audited: `custom_field.added` |
| `PATCH /organization/forms/fields/:id/archived` | Archive or restore |

## 6. ⚠️ The honest gap

> **No consuming UI exists for any of the nine forms' *values*.**

There is no inspection-recording page, no intake custom-field capture, no part-request custom fields. `CustomFieldDefinition` rows are real, validation is real and tested — **nothing captures a value.**

This is the **authoring half of the chain, ready the moment each consuming page is built**, and it is stated rather than implied because a reader who assumes the loop is closed will build the recording page against the wrong assumption.

Two visible consequences:
- Forms & Fields is 🟡 in `PAGE_INVENTORY.md`, for exactly this reason.
- Feature Adoption Analytics reports Custom Fields as **not trackable yet** rather than fabricating a usage count.

The same gap has a twin in specialisation (doc 03 §8): definitions, versions and validation are real; no page fills a card in. **Both close with the same missing surface** — a technician-side recording page — which is why they are worth fixing together. Gap G-FORM-01.

## 7. Configuration values

| Store | Holds | Written by |
|---|---|---|
| `FinanceConfiguration` | `allowUnpaidDelivery`, `customerInvoiceVisible`, `compliantBlocked`, tax and invoice settings | `PlatformService.writeFinanceConfiguration` (from policy answers at creation) and `/owner/pricing` |
| `ControlSetting` | Platform locks and owner delegation switches, scoped by `ControlSettingScope` | Governance Controls; owner delegation |
| `TenantConfiguration` | Per-tenant blob | Creation |

Two notes that matter:

**Three `FinanceConfiguration` columns are written from policy answers, not read from the policy at call time.** The configuration row is the hot-path read, and `writeFinanceConfiguration` is the single writer that keeps it in step. That is a deliberate denormalisation with one author — not the *write-only configuration* failure, which is a value with **no** reader.

⚠️ **`TenantConfiguration.workflowPolicy` is an empty, unread JSON placeholder.** Workflow Health names the one integrity check that would need it as **not computable** rather than faking a result. That honesty is the correct behaviour; the placeholder itself is a gap.

**`ControlSetting` is soft-deleted.** Hard-deleting one was a real bug (H10).

## 8. Implementation status

| Element | Status |
|---|---|
| 9 forms with locked core fields | ✅ `[IMPLEMENTED]` |
| `CustomFieldDefinition` with scope, flags, ordering, archival | ✅ `[IMPLEMENTED]` |
| Deterministic `fieldKey` slugs | ✅ |
| Archive / restore preserving order | ✅ |
| `validateValues()` — required, SELECT membership, category scope | ✅ `[VERIFIED]` |
| Owner authoring page, audited | ✅ `[INTEGRATED]` |
| **Any page that captures a custom-field value** | 🔴 `[INTENDED]` — G-FORM-01 |
| **Customer-visible custom fields reaching the portal** | 🔴 `[INTENDED]` — the flag exists; nothing renders it |
| **`reportable` fields reaching reports** | 🔴 `[INTENDED]` |
| **`TenantConfiguration.workflowPolicy`** | ⚠️ empty, unread placeholder |
| Configuration values with a single writer | ✅ |

# Launch handover — what this product does, and what it does not

> Acceptance criterion 8 of [`14-DAY-LAUNCH-SCOPE.md`](./14-DAY-LAUNCH-SCOPE.md):
> "Known-limitations handover doc lists every DEFERRED item with its plan
> reference (nothing silent)."
>
> Written 2026-09-02 against `develop`. Every claim below is either
> traceable to a passing test named here, or listed as not proven.
> If you find something this document does not mention, that is a defect
> in this document.

---

## 1. What a workshop can actually do today

Proven end to end over real HTTP against real Postgres, on the launch
capability profile, in `apps/api/src/testing/walkthrough.http.spec.ts`
(20 assertions) and `parts-loop.http.spec.ts` (14):

A Super Admin creates a workshop through the real creation path. The
owner redeems an invite link and signs in, and is **refused** intake —
deliberately, because that is not their job. They invite a branch
manager, who redeems their own link. The manager books a walk-in customer
and car in. A technician starts the inspection, records it, logs a fault
and prices it. The customer opens the link, is recorded as having seen
it, and approves. The job becomes approved for work; the technician
starts. The manager adds a task the customer mentioned at the desk. The
technician needs a part; the store approves and issues it off a real
shelf; a partial issue deliberately does not finish the request. The
technician receives it, sends the wrong one back, answers the store's
question, and the store accepts the return — restoring both the stock and
the bill. The job finishes only once every part is accounted for. The
owner issues the invoice, takes payment (a replayed idempotency key
records one payment, not two), and the manager releases the car. It
closes.

The same code, on a workshop with nothing switched off, routes FINISH
into team review and then QC before the money
(`walkthrough-contrast.http.spec.ts`). That is the capability engine
deciding, not a hardcoded path.

---

## 2. Deferred by the plan — nothing here is broken, all of it is switched off

Each row is deferred by [`14-DAY-LAUNCH-SCOPE.md`](./14-DAY-LAUNCH-SCOPE.md)
§DEFERRED. The pages, APIs and tests exist; the launch surface does not
offer them.

| Deferred | Plan reference | State of the code |
|---|---|---|
| Country billing adapters / legal e-invoices | §0 fact 2, T3 post-M5 | `ADAPTER_COVERED_COUNTRIES` is empty by design; launch runs `BILLING = EXTERNAL`, an officially designed capability state |
| Automatic customer notifications (WhatsApp/SMS/email) | T4 | No sender exists. Decision links and invites are delivered by hand |
| Policy setter UI / governance runtime | T5, M4 | Policies are set at creation and not editable after |
| Specialization-driven behavior | T6 | Packs are stored; nothing consumes them |
| Data Analyst role (7 pages, saved views, CSV export) | §Hidden | Complete and tested. Held back by `runtime/launch-surface.ts`; the role lands on Access Denied |
| Team Leader role (4 pages) | §Hidden | Complete. TEAMS/TEAM_REVIEW are off in the launch profile, so the capability layer denies it anyway |
| Multi-branch / multi-warehouse | §Hidden | Capabilities exist and validate; off at launch |
| Review / QC journeys | §Hidden | Proven working on the contrast profile; off at launch |
| Owner forms, messages, workflow-health, audit view, reports | §Hidden | Pages exist; rails do not offer them, and in-page links to them are gated by the same manifest |
| Platform reports sections 3-6, live view | §Hidden | Kept internal-only |
| Arabic string translation | §Hidden | Layout is RTL-ready and enforced by `lint-directional-css.mjs`; the strings are not translated |
| Attachments / photos | §DEFERRED | Not built |
| Transfers, supplier orders | INVENTORY-EXECUTION-MAP §B | States exist in the enum, dormant, reachable later without migration |
| Disputes, staff-restriction routes, realtime | §DEFERRED | Not built |

---

## 3. Known gaps found during the build — read this section before the pilot

These were found while proving the above, and none of them is fixed.

### 3.1 There is no way to put opening stock on a shelf (no plan reference — found in Wave 4)

Catalog deliberately does not set quantity, and no receiving, adjustment
or stock-take endpoint exists anywhere. The harness seeds
`WarehouseStockBalance` directly because it has no alternative. **A pilot
workshop hits this on its first morning**: they can create every part in
their catalogue and none of them will have a quantity.

Until it is built, opening stock has to be inserted into the database by
hand. That is a real operational dependency on you, not on them.

### 3.2 A part can be billed and off the shelf while the job closes

`board/reviews/F-007`. `parts.received_used_or_returned` counts requests
in ARRIVED and RECEIVED_BY_TECHNICIAN but not ISSUED — and issuing is the
transaction that both decrements stock and creates the billable line. In
the window between the counter handing a part over and the technician
confirming it, a job finishes, invoices and closes normally.

Not changed because gate-evaluator semantics are on the sprint's
FORBIDDEN list, and widening the gate without a "received on the
technician's behalf" path would strand jobs wherever technicians do not
reliably tap.

### 3.3 "The customer opened the link" is a state, not a time

`CustomerDecisionRequest` has no `viewedAt` column. A manager can see
*that* a decision was seen, never *when*. Noted in the walkthrough.

### 3.4 Nothing is pushed, so CI has never been observed green

The workflow is correct and merged (`a4371b4`) and runs on `main`,
`develop`, `track/**` and `infra/**`. Nothing has been pushed to GitHub
and there is no `gh` on this machine, so **M-12 cannot be closed**. The
full gate is green locally and that is all anyone can currently say.

### 3.5 No deployment target (blocker B-002)

No Docker, no administrator rights. What exists instead:
`tools/staging/` runs a real TLS edge over the LAN in front of a
production-mode API, and its smoke suite passes 12/12 including the
assertions that matter (`Secure; HttpOnly; SameSite=Lax` on a session
cookie after a real login through the proxy hop). What does not exist: a
VPS, public DNS, a real certificate, a process supervisor, automated
redeploy, edge rate limiting. **M-9 is not closed.**

Backups: `tools/staging/backup.sh` and `restore-drill.sh` work and the
drill has been executed — 78 tables, 2 tenants, 16 accounts, 20 work
orders, 31 migrations, restored in 2 seconds, with all three refusal
modes watched. There is no scheduling, rotation, encryption or offsite
copy. **M-10's drill is done; its automation is not.**

### 3.6 SHOULD items not shipped

S-1 Attention row actions (partially: the parts subset works), S-2
security TTL/refresh-cap pair, S-3 Owner Reports tab, S-4 decision expiry
sweeper, S-5 dossier polish. M-3's cancel endpoint plus read-computed
expiry covers the deadlock S-4 would otherwise address.

### 3.7 M-13 and M-14 are not engineering tasks and are not done

The pilot workshop has not been created through the wizard with its real
catalogue, staff and policies, and no administrator has been trained.
Both need the pilot.

---

## 4. What we will not claim

MOP does not produce a government-compliant tax invoice — the workshop's
existing tax process is unchanged, and MOP holds the money truth beside
it. It does not notify customers automatically. It does not offer QC,
team review, multiple branches or warehouses, analytics, photos,
post-creation policy editing, or an Arabic interface.

None of those are missing walls. They are switched-off rooms in a house
whose electricity works — every one of them is configuration or a
scheduled track, and the pages behind them already exist and are tested.

---

## 5. How to check any of this yourself

```bash
corepack pnpm lint          # 7 checks incl. audit boundary, money, dead links
corepack pnpm typecheck
corepack pnpm test          # shared + api + web
corepack pnpm build
```

The two files worth reading before trusting anything else:

- `apps/api/src/testing/walkthrough.http.spec.ts` — the golden journey,
  HTTP only, nothing pinned.
- `apps/api/src/testing/parts-loop.http.spec.ts` — the inventory loop,
  including what the customer is *not* allowed to see.

Board evidence lives in `E:\mop-fleet\board\` — `status/` for card
outcomes, `runs/` for gate and journey records, `reviews/` for findings,
`decisions.md` for anything that changed shape.

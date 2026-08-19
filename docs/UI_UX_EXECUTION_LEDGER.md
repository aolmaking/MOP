# UI/UX + Functional Execution Ledger

Live state for a multi-session execution run. Resume from the first item
that is not `VERIFIED`. Do not restart analysis; the investigation notes
below are the findings, not guesses.

States: `PENDING` -> `IN PROGRESS` -> `IMPLEMENTED` -> `TESTING` -> `VERIFIED` / `BLOCKED`

## Directive summary (owner's words, condensed)

1. Replace the side rail with a top nav bar, everywhere.
2. No sharp corners anywhere; reasonable curves.
3. Loosen the strict 3-colour palette; softer tones + shadows allowed.
4. Real animation, especially on buttons.
5. For every page ask "what should be on this page" and build what is
   missing, backend included.
6. Owner could not open branch operations.
7. Pricing/service must connect to technician + inventory as one system.
8. Reports need volume-per-day/month, charts, hover detail.
9. Workflow Health needs to become a real subsystem (50-point brief).
10. History needs a "More" detail report subsystem.
11. Branch Manager work-order pages need the same detail depth.

## IMPORTANT design-system conflict (flagged, accepted, must be recorded)

`docs/DESIGN_LANGUAGE.md` currently argues FOR the side rail, restrained
radius ("a job card is a rectangle"; "uniformly rounded cards are a
generated-UI tell") and a strict 60/30/10 palette. Items 1-3 above
deliberately reverse that. The product owner has overridden it. When
items 1-3 land, DESIGN_LANGUAGE.md must be updated in the same commit or
the next session will "restore" the old rules as a regression.

## Queue

| # | Item | State | Notes |
|---|------|-------|-------|
| 0 | Owner blocked from branch operations | VERIFIED | Root cause: TENANT_OWNER had no `workorders.branch.view`. Spec (tenant-owner.md:248) wants a read-only company-wide work order view. That key guards GET-only routes; all mutations use other keys. Granted in default-role-permissions.ts. Needs re-seed + browser verify. |
| 1 | Rail -> top nav bar (6 shells) | VERIFIED | Done: all 6 rewritten to a sticky top bar. Measured at 1440px, workspace 1216->1440. DESIGN_LANGUAGE.md updated in the same commit. |
| 2 | Radius pass (tokens) | IMPLEMENTED | Tokens now 6/8/12px + --radius-pill. STILL TO DO: sweep component CSS for hardcoded px radii that bypass the tokens. |
| 3 | Palette softening + elevation | IMPLEMENTED | Added --shadow-1/2/3/focus, --info, --accent-cool, --neutral-track (both themes). STILL TO DO: apply elevation to page-level cards. |
| 4 | Button/interaction animation | IMPLEMENTED | Buttons lift/press, nav underline grows from centre, toast enters, inputs glow on focus. STILL TO DO: page/list entrance transitions. |
| 5 | Reports: volume/day+month, charts, hover detail | PENDING | Check what OwnerReports API already returns before adding endpoints. |
| 6 | Workflow Health subsystem | PENDING | Large. Needs capability matrix first (what exists vs missing). |
| 7 | History "More" full-detail report | PENDING | Needs an aggregation service across audit + events + tasks + inventory. |
| 8 | Branch Manager work-order detail depth | PENDING | Shares the detail-report subsystem with #7. |
| 9 | Service <-> inventory <-> technician linkage | PENDING | Biggest domain item. Inspect PriceCatalog + InventoryItem + Task first. |

## Verification commands

```
corepack pnpm typecheck
corepack pnpm lint
corepack pnpm --filter @mop/web run test
DATABASE_URL=...mop_platform_test corepack pnpm --filter @mop/api exec jest --runInBand
```

Baseline before this run: API 641/641, web 229/229, 6/6 linters.

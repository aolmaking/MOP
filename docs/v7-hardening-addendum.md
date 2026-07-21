# Version 7.2 - Workshop Builder Hardening Addendum

V7.1 created the Builder foundation. V7.2 hardens it so the product does not become a large settings page.

## What Changed

- Builder editor UX now follows the required structure:
  - left page and section tree
  - center live preview canvas
  - right impact and validation panels
  - top bar with role identity preview, device preview, undo, redo, save draft, discard draft, and publish
- Sections are never hard-deleted from tenant configuration.
  - Hide sets `enabled = false`
  - Hidden sections remain restorable
  - Safety-critical sections remain locked
- Page and section reset endpoints were added.
- Presets were added:
  - Default Workshop
  - Car Service Center
  - Motorcycle Workshop
  - Heavy Equipment Service
  - Fast Service Workshop
  - Premium Customer Portal
  - Simple Technician Mode
- Preview now supports real demo identities:
  - Technician Ahmed
  - Customer Omar
  - Inventory Manager Mona
  - Branch Manager Khaled
  - Team Leader Youssef
  - Tenant Admin Salma
- Preview mode is read-only and displays: `Preview Mode - actions are not saved.`
- Block registry metadata now includes forbidden roles, required data, duplicatable, customer-safe, internal-only, and default settings.
- Forms and fields now support stable field IDs, placeholders, help text, validation rules, searchable/reportable flags, archive/restore, and historical preservation.
- Message templates now support default content and version history.
- Workflow Studio remains policy-based only. V7 does not allow arbitrary automation graphs.
- Impact preview now reports affected pages, roles, users, branches, service types, customer portal behavior, validation issues, and risk level.
- High-risk publish requires a reason.
- Tenant Owner and Tenant Admin are separated in shared role/page/permission foundations.
- Theme validation checks contrast and confusing success/danger colors.
- No raw code customization is allowed:
  - no raw JavaScript
  - no raw HTML
  - no raw SQL
  - no unsafe CSS injection
  - no external scripts
  - no iframes
  - no custom API calls

## Configuration Precedence

Builder resolution order is explicitly modeled:

1. Platform safety rules
2. Platform default template
3. Tenant published configuration
4. Branch override when allowed
5. Role experience settings
6. User/session permissions and scopes
7. Runtime record and workflow rules

Builder configuration never overrides permissions, tenant isolation, customer privacy, stock correctness, or safety-critical workflow rules.

## Final V7 Gate

V7 is considered ready for Version 8 only when:

- Tenant can reorder, hide, restore, and reset sections.
- Required safety sections cannot be removed.
- Draft, preview, publish, rollback, discard draft, reset page, and reset section exist.
- Preview works by real role identity and device.
- Preview actions are read-only.
- Forms archive fields instead of deleting historical values.
- Message templates validate required variables.
- Workflow customization remains policy-based.
- Impact preview and risk level are visible before publish.
- High-risk changes require a reason and audit event.
- Builder permissions are granular.
- Tenant Owner is modeled separately from Tenant Admin.

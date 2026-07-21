# Demo Data Readiness Report

Date: 2026-07-09  
Result: PASS

## Included fixtures

| Requirement | Fixture |
| --- | --- |
| Multiple workshops | Apex Motors and Delta Service are active; North Star Workshop is frozen |
| Active owner | Apex and Delta owner accounts |
| Multiple staff roles | Tenant Admin, Branch Manager, Technician, Inventory Manager, Team Leader, Data Analyst |
| Customer | Omar Ali with customer portal account |
| Car | Toyota Corolla, identifier ABC-123 |
| Active Work Order | WO-1021 with brake inspection task |
| Customer decision | CDR-1021 with high and critical repair items |
| Inventory | Multi-warehouse catalog with normal, low, critical and zero stock |
| Part lifecycle | Pending request, issued/arrived item, return request, and stock movements |
| Invoice and payment | INV-NASR-2026-0018, locked and fully paid by confirmed card payment |
| Delivered order | WO-1018, completed and delivered |
| Reports data | Work orders, payment revenue, stock risk, technicians, branches, and audit activity |
| Builder customization | Apex Motors car-service preset, branded tokens, published v1 and editable draft v2 |
| Frozen workshop | North Star Workshop with platform freeze reason and audit event |
| Platform reports | Three workshops with active/frozen state and operational records |

## Demo access

The seed uses role-based login identifiers and the documented development password `0000000` for demo identities. Customer registration codes include `APEX2026` and `DELTA2026`.

These credentials are development fixtures only and must not be loaded into a production database.

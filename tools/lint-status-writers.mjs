#!/usr/bin/env node
// `WorkOrderLifecycleService` is the only thing allowed to write WorkOrder.status.
//
// CLAUDE.md states this as a load-bearing rule and says "a grep for hardcoded
// statuses must return nothing" -- but nothing ran that grep, and by the time it
// was finally run it returned three hits, all written as `status: "..." as any`
// inside a swallowed try/catch. Each one skipped the capability-aware graph, the
// gates, the OperationEvent and the audit row, which is why cycle-time analytics
// and the workflow-integrity detector both went quietly blind.
//
// The rule this enforces: outside the lifecycle service, no Prisma write to
// `workOrder` may set `status`, and no literal WorkOrderStatus may be assigned to
// a `status:` key. Creating a WorkOrder at the graph's declared initial state is
// allowed -- that is what `WORK_ORDER_GRAPH.initial` is for.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const API_SRC = join(ROOT, "apps", "api", "src");

// The one service that owns the column, plus the intake path, which is allowed to
// CREATE at the initial state (never to move a work order).
const OWNER = "systems/operations/work-order-lifecycle.service.ts";

const STATUSES = [
  "DRAFT", "REGISTERED", "UNDER_INSPECTION", "AWAITING_CUSTOMER_APPROVAL",
  "APPROVED_FOR_WORK", "IN_PROGRESS", "WAITING_PARTS", "WAITING_CUSTOMER",
  "BLOCKED", "READY_FOR_TEAM_REVIEW", "READY_FOR_QC", "QC_FAILED",
  "READY_FOR_DELIVERY", "PAYMENT_PENDING", "CLOSED", "CANCELLED",
];

// A line may opt out only with a reason, the same shape lint-money uses.
const ALLOW = "status-writer-ok:";
const ALLOW_LOOKBACK = 4;

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (entry.endsWith(".ts") && !entry.endsWith(".spec.ts")) out.push(full);
  }
  return out;
}

const problems = [];

for (const file of walk(API_SRC)) {
  const rel = relative(API_SRC, file).split(sep).join("/");
  if (rel === OWNER) continue;

  const source = readFileSync(file, "utf8");
  const lines = source.split(/\r?\n/);

  // Only WRITES. Reading by status (`where: { status: "IN_PROGRESS" }`) is how
  // every queue and report is built and is not this rule's business -- so the
  // check looks inside the `data:` object specifically, never the whole call.
  const writeCall = /\.workOrder\.(create|createMany|update|updateMany|upsert)\s*\(/g;
  let match;
  while ((match = writeCall.exec(source)) !== null) {
    let depth = 0;
    let end = match.index + match[0].length - 1;
    for (; end < source.length; end++) {
      if (source[end] === "(") depth++;
      else if (source[end] === ")") {
        depth--;
        if (depth === 0) break;
      }
    }
    const args = source.slice(match.index, end + 1);

    // Isolate every `data:` / `create:` / `update:` payload in the call.
    const payloads = [];
    for (const key of ["data:", "create:", "update:"]) {
      let from = 0;
      for (;;) {
        const at = args.indexOf(key, from);
        if (at === -1) break;
        let d = 0;
        let start = -1;
        for (let i = at; i < args.length; i++) {
          if (args[i] === "{") {
            if (d === 0) start = i;
            d++;
          } else if (args[i] === "}") {
            d--;
            if (d === 0) {
              payloads.push(args.slice(start, i + 1));
              from = i;
              break;
            }
          }
        }
        if (from <= at) break;
      }
    }

    const assignments = payloads.flatMap((payload) => payload.match(/\bstatus\s*:\s*[^,\n}]+/g) ?? []);
    if (assignments.length === 0) continue;

    // Creating at the graph's own declared starting point is the sanctioned way
    // to bring a work order into existence -- it is not a transition, and there
    // is no earlier state to transition from. Anything else, including a create
    // that picks a literal, is a routing decision the graph must make.
    if (assignments.every((assignment) => assignment.includes("WORK_ORDER_GRAPH.initial"))) continue;

    const lineNo = source.slice(0, match.index).split("\n").length;
    const context = lines.slice(Math.max(0, lineNo - 1 - ALLOW_LOOKBACK), lineNo).join("\n");
    if (context.includes(ALLOW)) continue;

    const literal = payloads
      .flatMap((payload) => payload.match(new RegExp(`status\\s*:\\s*["'\`](${STATUSES.join("|")})["'\`]`)) ?? [])
      .find(Boolean);

    problems.push({
      rel,
      line: lineNo,
      text: `prisma.workOrder.${match[1]}({ … ${literal ?? "status: …"} … })`,
      why:
        match[1] === "create" || match[1] === "createMany"
          ? "creates a WorkOrder at a chosen status — use WORK_ORDER_GRAPH.initial, then apply(intent)"
          : "writes WorkOrder.status directly — only WorkOrderLifecycleService may",
    });
  }
}

if (problems.length === 0) {
  console.log("Status writers OK -- WorkOrder.status is written only by WorkOrderLifecycleService.");
  process.exit(0);
}

console.error("WorkOrder.status may only be written by WorkOrderLifecycleService:\n");
for (const problem of problems) {
  console.error(`  ${problem.rel}:${problem.line}`);
  console.error(`    ${problem.text}`);
  console.error(`    ${problem.why}\n`);
}
console.error(
  "Every other caller asks for an INTENT and lets the capability-aware graph decide\n" +
    "where it lands, so the transition is gated, evented and audited. If a line here\n" +
    "is genuinely safe, add a trailing comment containing \"status-writer-ok:\" and say why.",
);
process.exit(1);

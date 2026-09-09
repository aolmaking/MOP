#!/usr/bin/env node
// A resource id is not an authorization.
//
// MOP has no global tenant middleware, no Prisma extension and no row-level
// security: isolation is per-query discipline. A runtime audit proved the
// discipline had gaps -- one workshop's technician started, completed and blocked
// another workshop's task; one workshop's manager paid another workshop's invoice
// and the Payment row was filed under the payer's tenant; one workshop's inventory
// manager issued a part off another workshop's shelf and its stock went 18 -> 17.
// None of it needed a bug or a race. It needed an id.
//
// The shape that makes that possible is always the same: a controller resolves
// `session.tenantId`, then hands the service a bare id, and the service loads the
// row by primary key alone. So that exact shape is what this bans.
//
// The list of tenant-owned models is DERIVED from schema.prisma -- any model with
// a `tenantId` field -- so a model added later is covered without anyone
// remembering to add it here.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const API_SRC = join(ROOT, "apps", "api", "src");
const SCHEMA = join(ROOT, "packages", "database", "prisma", "schema.prisma");

// ---------------------------------------------------------------------------
// Which models belong to a tenant, read from the schema itself
// ---------------------------------------------------------------------------
const schema = readFileSync(SCHEMA, "utf8");
const tenantOwned = new Set();
for (const block of schema.split(/^model\s+/m).slice(1)) {
  const name = block.slice(0, block.indexOf(" ")).trim();
  const body = block.slice(block.indexOf("{"), block.indexOf("\n}"));
  if (/^\s*tenantId\s+String/m.test(body)) {
    tenantOwned.add(name.charAt(0).toLowerCase() + name.slice(1));
  }
}

if (tenantOwned.size === 0) {
  console.error("Tenant-scope check found no tenant-owned models in schema.prisma -- refusing to run against nothing.");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Justified exceptions. Each needs a reason, and each is a promise that the
// caller has already established ownership.
// ---------------------------------------------------------------------------
const ALLOW = "tenant-scope-ok:";
const ALLOW_LOOKBACK = 5;

// Whole files that legitimately operate above or outside tenant scope.
const EXEMPT_FILES = [
  // Platform Super Admin acts across every tenant by definition; its routes are
  // gated by PlatformGuard rather than by a tenant.
  "control/platform/",
  "control/governance/",
  // The audit writer is handed an already-verified tenantId by its only caller.
  "audit/audit.service.ts",
  // Auth resolves an account before any tenant context exists.
  "identity/auth/",
  // Test scaffolding.
  "testing/",
];

const OPS_LOAD = ["findUnique", "findUniqueOrThrow"];
const OPS_WRITE = ["update", "delete"];

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (entry.endsWith(".ts") && !entry.endsWith(".spec.ts")) out.push(full);
  }
  return out;
}

/** The `where: { … }` object of a Prisma call, or null. */
function whereClause(args) {
  const at = args.indexOf("where:");
  if (at === -1) return null;
  let depth = 0;
  for (let i = at; i < args.length; i++) {
    if (args[i] === "{") {
      if (depth === 0) var start = i;
      depth++;
    } else if (args[i] === "}") {
      depth--;
      if (depth === 0) return args.slice(start, i + 1);
    }
  }
  return null;
}

/** The id expression a where clause keys on, e.g. `taskId` in `{ id: taskId }`. */
function idExpression(where) {
  const match = where.match(/\bid\s*:\s*([A-Za-z0-9_.$]+)/);
  return match ? match[1] : null;
}

/**
 * The enclosing CLASS METHOD, not the innermost block.
 *
 * The safe shape almost always spans a nested scope: the ownership check runs
 * at the top of the method and the write happens inside a
 * `$transaction(async (tx) => { … })` callback. Stopping at the innermost brace
 * would put the check outside the window and see none of them.
 *
 * A class member declared at two-space indentation is the boundary. Anything
 * before it belongs to a different method and proves nothing about this one.
 */
const METHOD_START = /\n {2}(?:(?:private|protected|public|static|readonly)\s+)*(?:async\s+)?[A-Za-z_$][\w$]*\s*\(/g;

function enclosingMethodStart(source, index) {
  METHOD_START.lastIndex = 0;
  let start = 0;
  let match;
  while ((match = METHOD_START.exec(source)) !== null) {
    if (match.index >= index) break;
    start = match.index;
  }
  return start;
}

function isOwnershipProvenAbove(source, index, model, where) {
  const id = idExpression(where);
  if (!id) return false;

  const body = source.slice(enclosingMethodStart(source, index), index);

  // Proof 1: an inline load of the SAME model, earlier in this method, whose
  // where clause names both the tenant and this exact id.
  const inline = new RegExp(
    `\\.${model}\\.(?:findFirst|findFirstOrThrow|findUnique|findUniqueOrThrow|findMany)\\s*\\(`,
    "g",
  );

  let found;
  while ((found = inline.exec(body)) !== null) {
    let depth = 0;
    let end = inline.lastIndex - 1;
    for (; end < body.length; end++) {
      if (body[end] === "(") depth++;
      else if (body[end] === ")") {
        depth--;
        if (depth === 0) break;
      }
    }
    const earlier = whereClause(body.slice(inline.lastIndex - 1, end + 1));
    if (!earlier || !/tenantId/.test(earlier)) continue;
    if (idExpression(earlier) === id) return true;
  }

  // Proof 2: a scoping helper called earlier in this method with BOTH this id
  // and a tenant id, in either order -- `this.requireTask(taskId, tenantId)`,
  // `this.findOwned(tenantId, staffId)`, `requireOwnedInvoice(id, tenantId)`.
  //
  // This is the shape the Phase 2 isolation work deliberately introduced: scope
  // at the load so a later edit cannot skip it. Recognising it is not a
  // loosening -- the helper IS the check, and it names this same id.
  const escaped = id.replace(/[.$]/g, "\\$&");
  const tenantArg = "[A-Za-z0-9_.$]*[Tt]enantId";
  const helperName = "\\b(?:require|load|resolve|assert|ensure|find|get)[A-Za-z]*\\s*\\(\\s*";
  if (
    new RegExp(`${helperName}${escaped}\\s*,\\s*${tenantArg}`).test(body) ||
    new RegExp(`${helperName}${tenantArg}\\s*,\\s*${escaped}`).test(body)
  ) {
    return true;
  }

  // Proof 3: the id was READ OFF a row this method already proved.
  //
  //   const staff = await this.findOwned(tenantId, staffId);
  //   await tx.account.update({ where: { id: staff.accountId } });
  //
  // `staff` is this tenant's, so `staff.accountId` is this tenant's account.
  // Only a binding proved by one of the two rules above counts, and only when
  // the flagged id reads a field off it -- `staff.accountId`, never a bare
  // `accountId` that could have come from anywhere.
  const derived = id.match(/^([A-Za-z_$][\w$]*)\.[\w$]+$/);
  if (derived) {
    const binding = derived[1];
    const assigned = new RegExp(
      `\\b(?:const|let)\\s+${binding}\\s*=[^;]*?(?:${helperName.slice(2)}|\\.[a-zA-Z]+\\.find[A-Za-z]*\\s*\\()`,
      "s",
    );
    const assignment = body.match(assigned);
    if (assignment) {
      // The assignment itself has to have been tenant-scoped. Take the
      // statement it belongs to and require a tenantId inside it.
      const from = body.lastIndexOf(assignment[0]);
      const statement = body.slice(from, body.indexOf(";", from) + 1);
      if (/tenantId/.test(statement)) return true;
    }
  }

  return false;
}

const problems = [];

for (const file of walk(API_SRC)) {
  const rel = relative(API_SRC, file).split(sep).join("/");
  if (EXEMPT_FILES.some((prefix) => rel.startsWith(prefix))) continue;

  const source = readFileSync(file, "utf8");
  const lines = source.split(/\r?\n/);

  const call = new RegExp(
    `(?:this\\.prisma|prisma|tx|client)\\.(${[...tenantOwned].join("|")})\\.(${[...OPS_LOAD, ...OPS_WRITE].join("|")})\\s*\\(`,
    "g",
  );

  let match;
  while ((match = call.exec(source)) !== null) {
    const [, model, op] = match;

    let depth = 0;
    let end = call.lastIndex - 1;
    for (; end < source.length; end++) {
      if (source[end] === "(") depth++;
      else if (source[end] === ")") {
        depth--;
        if (depth === 0) break;
      }
    }
    const args = source.slice(call.lastIndex - 1, end + 1);
    const where = whereClause(args);
    if (!where) continue;

    // Scoped by tenant, directly or through a relation — fine either way.
    if (/tenantId/.test(where)) continue;
    // Keyed by something other than the primary key (a unique business key, a
    // parent id, a token) is a different shape and not what this rule is about.
    if (!/\bid\s*:/.test(where)) continue;
    // A compound unique that includes a scoping column is fine.
    if (/_id\s*:|Id_/.test(where.replace(/\bid\s*:/g, ""))) continue;

    const lineNo = source.slice(0, match.index).split("\n").length;
    const exempt = lines
      .slice(Math.max(0, lineNo - 1 - ALLOW_LOOKBACK), lineNo)
      .some((candidate) => candidate.includes(ALLOW));
    if (exempt) continue;

    // Ownership already PROVEN earlier in the same function.
    //
    // The overwhelmingly common safe shape is a load that checks the tenant
    // followed by writes against the row it just proved:
    //
    //   const task = await this.prisma.task.findFirst({ where: { id, tenantId } });
    //   if (!task) throw new NotFoundException(...);
    //   await tx.task.update({ where: { id }, ... });
    //
    // The second call carries no tenantId and does not need one -- the id was
    // established as this tenant's a few lines above, in code the same request
    // ran. Demanding a hand-written "tenant-scope-ok:" on each of those would
    // produce dozens of comments asserting something a machine can check, and a
    // comment nobody re-verifies is worth less than no comment at all.
    //
    // So this looks for the proof rather than for a promise, and stays
    // deliberately narrow about what counts as one: SAME function, SAME model,
    // EARLIER in the source, a where clause naming BOTH tenantId and this exact
    // id expression. A different id, a different model, or a check that happens
    // afterwards proves nothing and is still reported.
    if (isOwnershipProvenAbove(source, match.index, model, where)) continue;

    problems.push({
      rel,
      line: lineNo,
      model,
      op,
      where: where.replace(/\s+/g, " ").slice(0, 90),
    });
  }
}

if (problems.length === 0) {
  console.log(
    `Tenant scope OK -- no tenant-owned model (${tenantOwned.size} in the schema) is loaded or mutated by bare id.`,
  );
  process.exit(0);
}

console.error("A resource id is not an authorization.\n");
console.error(
  `These load or mutate a tenant-owned row by primary key alone, with no tenantId in\n` +
    `the where clause. Any authenticated user of any workshop who knows the id can\n` +
    `reach the row:\n`,
);
for (const problem of problems) {
  console.error(`  ${problem.rel}:${problem.line}`);
  console.error(`    prisma.${problem.model}.${problem.op}({ where: ${problem.where} })\n`);
}
console.error(
  "Add the session's tenantId to the where clause (use findFirst when the compound\n" +
    "is not a declared unique). If the caller has already proven ownership, add a\n" +
    'comment containing "tenant-scope-ok:" above the line and say how.',
);
process.exit(1);

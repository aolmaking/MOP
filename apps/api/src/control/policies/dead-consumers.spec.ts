import * as fs from "fs";
import * as path from "path";
import { POLICY_REGISTRY } from "@mop/shared";

/**
 * A declared consumer that no longer exists in the source tree is a dead
 * policy edge -- the registry claims a runtime effect that a refactor
 * silently removed, and nothing else catches that. This walks the API's
 * own `src` and the shared package's `src` for the method or graph edge
 * each ENFORCED policy's `enforcement.consumers` names, and fails the
 * build the same way the hardcoded-status grep does for
 * `WorkOrderLifecycleService`.
 *
 * This lives here rather than in packages/shared because it needs `fs`
 * and reads across both source trees -- both out of bounds for a package
 * that stays framework- and Node-free by design.
 *
 * A `Class.method` consumer must find `method` declared somewhere; a
 * `WORK_ORDER_GRAPH (X -> Y)` consumer must find that literal edge in
 * `workflow-graphs.ts`.
 */
describe("policy registry -- dead consumer check", () => {
  function collectSource(dir: string, out: string[]): void {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        collectSource(full, out);
      } else if (entry.isFile() && (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx"))) {
        out.push(full);
      }
    }
  }

  function readCorpus(): string {
    const roots = [path.resolve(__dirname, "../.."), path.resolve(__dirname, "../../../../../packages/shared/src")];
    const files: string[] = [];
    for (const root of roots) {
      if (fs.existsSync(root)) collectSource(root, files);
    }
    return files
      .filter((f) => !f.endsWith("dead-consumers.spec.ts"))
      .map((f) => fs.readFileSync(f, "utf8"))
      .join("\n---\n");
  }

  it("every declared consumer of an ENFORCED policy still exists in the source tree", () => {
    const corpus = readCorpus();
    const edgePattern = /^WORK_ORDER_GRAPH \((.+) -> (.+)\)$/;
    const missing: string[] = [];

    for (const policy of POLICY_REGISTRY.values()) {
      if (policy.enforcement.status !== "ENFORCED") continue;
      for (const consumer of policy.enforcement.consumers) {
        const edgeMatch = edgePattern.exec(consumer);
        if (edgeMatch) {
          const [, from, to] = edgeMatch;
          const found =
            corpus.includes(`from: "${from}", to: "${to}"`) ||
            new RegExp(`from:\\s*"${from}",[\\s\\S]{0,80}?to:\\s*"${to}"`).test(corpus);
          if (!found) missing.push(`${policy.key}: no edge ${from} -> ${to} found in the workflow graphs`);
          continue;
        }
        // `Some.identifier` or a bare identifier -- the identifier itself
        // must appear declared somewhere (a method name, a class name).
        const identifier = consumer.includes(".") ? consumer.split(".").pop()! : consumer;
        if (!corpus.includes(identifier)) {
          missing.push(`${policy.key}: consumer "${consumer}" (looked for "${identifier}") not found in source`);
        }
      }
    }

    expect(missing).toEqual([]);
  });
});

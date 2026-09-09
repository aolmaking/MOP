/** Drops the per-worker clones. Never fails a green run -- see the helper. */
import { dropWorkerDatabases, requestedWorkers } from "./worker-databases";

export default function globalTeardown(): void {
  const workers = requestedWorkers();
  if (workers === 0) return;
  dropWorkerDatabases(workers);
}

/**
 * Clones a database per worker when the runner asked for parallelism.
 *
 * Does nothing at all by default, so `pnpm test` behaves exactly as it did.
 */
import { createWorkerDatabases, requestedWorkers } from "./worker-databases";

export default function globalSetup(): void {
  const workers = requestedWorkers();
  if (workers === 0) return;

  createWorkerDatabases(workers);
  // Read back by jest.config.js to set maxWorkers, and by jest-env.ts to pick
  // this worker's own database.
  process.env.MOP_TEST_WORKERS = String(workers);
}

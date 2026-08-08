/**
 * Boot-time environment validation. The process refuses to start on a
 * misconfiguration rather than failing later, per-request, somewhere
 * unrelated.
 *
 * The specific hazard this exists for: `cookie.util.ts` decides whether
 * session cookies get the `secure` flag from `NODE_ENV === "production"`.
 * If that variable is ever unset or misspelled on a production host,
 * session cookies silently begin travelling over plain HTTP and nothing
 * anywhere reports a problem. A misconfiguration that downgrades security
 * in silence has to be a startup crash.
 */

export interface Environment {
  nodeEnv: "development" | "test" | "production";
  port: number;
  databaseUrl: string;
  corsOrigin: string;
  isProduction: boolean;
  throttle: ThrottleSettings;
}

/**
 * Request throttling, configurable because the auth limit has to be
 * strict in production and relaxed for the integration suite, which
 * legitimately logs in many times from one address.
 *
 * The auth limit is the security-critical one. Password hashing is scrypt
 * at N=131072 -- roughly 128MB and real CPU per attempt -- so an
 * unthrottled login endpoint turns credential stuffing into a denial of
 * service. Strong hashing without throttling is worse than weak hashing
 * with it.
 */
export interface ThrottleSettings {
  globalLimit: number;
  globalTtlMs: number;
  authLimit: number;
  authTtlMs: number;
}

export class EnvironmentValidationError extends Error {
  constructor(readonly problems: string[]) {
    super(`Invalid environment configuration:\n  - ${problems.join("\n  - ")}`);
    this.name = "EnvironmentValidationError";
  }
}

const VALID_NODE_ENVS = ["development", "test", "production"] as const;

export function loadEnvironment(source: NodeJS.ProcessEnv = process.env): Environment {
  const problems: string[] = [];

  const rawNodeEnv = source.NODE_ENV ?? "development";
  if (!VALID_NODE_ENVS.includes(rawNodeEnv as (typeof VALID_NODE_ENVS)[number])) {
    problems.push(`NODE_ENV must be one of ${VALID_NODE_ENVS.join(", ")} (got "${rawNodeEnv}")`);
  }
  const nodeEnv = rawNodeEnv as Environment["nodeEnv"];
  const isProduction = nodeEnv === "production";

  const databaseUrl = source.DATABASE_URL ?? "";
  if (!databaseUrl) {
    problems.push("DATABASE_URL is required");
  } else if (!/^postgres(ql)?:\/\//.test(databaseUrl)) {
    problems.push("DATABASE_URL must be a postgresql:// connection string");
  }

  const rawPort = source.PORT ?? "4000";
  const port = Number(rawPort);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    problems.push(`PORT must be a valid port number (got "${rawPort}")`);
  }

  const corsOrigin = source.CORS_ORIGIN ?? "http://localhost:4200";
  if (isProduction) {
    // In production the browser must be told a real origin. A wildcard
    // cannot be combined with credentialed requests anyway, and an
    // http:// origin would defeat the secure cookie it is paired with.
    if (corsOrigin === "*") problems.push("CORS_ORIGIN cannot be '*' in production (credentialed requests need a real origin)");
    else if (!corsOrigin.startsWith("https://")) problems.push(`CORS_ORIGIN must be https:// in production (got "${corsOrigin}")`);
  }

  const throttle = readThrottleSettings(source, problems);

  if (problems.length > 0) throw new EnvironmentValidationError(problems);

  return { nodeEnv, port, databaseUrl, corsOrigin, isProduction, throttle };
}

/**
 * Throttle settings on their own, without validating the rest of the
 * environment.
 *
 * Separate because AuthController needs these at class-definition time
 * (@Throttle is a decorator and takes literal values), and a controller
 * that refused to load because an unrelated variable was missing would be
 * a nasty, far-from-the-cause failure -- especially in unit tests that
 * never touch a database.
 */
export function readThrottleSettings(source: NodeJS.ProcessEnv = process.env, problems: string[] = []): ThrottleSettings {
  return {
    globalLimit: positiveInt(source.THROTTLE_GLOBAL_LIMIT, 300, "THROTTLE_GLOBAL_LIMIT", problems),
    globalTtlMs: positiveInt(source.THROTTLE_GLOBAL_TTL_MS, 60_000, "THROTTLE_GLOBAL_TTL_MS", problems),
    authLimit: positiveInt(source.THROTTLE_AUTH_LIMIT, 10, "THROTTLE_AUTH_LIMIT", problems),
    authTtlMs: positiveInt(source.THROTTLE_AUTH_TTL_MS, 60_000, "THROTTLE_AUTH_TTL_MS", problems),
  };
}

function positiveInt(raw: string | undefined, fallback: number, name: string, problems: string[]): number {
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    problems.push(`${name} must be a positive integer (got "${raw}")`);
    return fallback;
  }
  return value;
}

import { EnvironmentValidationError, loadEnvironment } from "./environment";

const valid = {
  NODE_ENV: "development",
  DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
  PORT: "4000",
  CORS_ORIGIN: "http://localhost:4200",
} satisfies NodeJS.ProcessEnv;

describe("loadEnvironment", () => {
  it("accepts a valid development environment", () => {
    const env = loadEnvironment(valid);
    expect(env.nodeEnv).toBe("development");
    expect(env.port).toBe(4000);
    expect(env.isProduction).toBe(false);
  });

  it("defaults port and CORS origin when unset", () => {
    const env = loadEnvironment({ DATABASE_URL: valid.DATABASE_URL });
    expect(env.port).toBe(4000);
    expect(env.corsOrigin).toBe("http://localhost:4200");
    expect(env.nodeEnv).toBe("development");
  });

  it("rejects a missing DATABASE_URL", () => {
    expect(() => loadEnvironment({ NODE_ENV: "development" })).toThrow(EnvironmentValidationError);
  });

  it("rejects a non-postgres DATABASE_URL", () => {
    expect(() => loadEnvironment({ ...valid, DATABASE_URL: "mysql://localhost/db" })).toThrow(/postgresql/);
  });

  it("rejects an unusable PORT", () => {
    expect(() => loadEnvironment({ ...valid, PORT: "not-a-port" })).toThrow(/PORT/);
  });

  it("rejects an unknown NODE_ENV rather than guessing", () => {
    // The hazard: "prod" is not "production", so the secure-cookie flag
    // would quietly be false on a real production host.
    expect(() => loadEnvironment({ ...valid, NODE_ENV: "prod" })).toThrow(/NODE_ENV/);
  });

  describe("production", () => {
    const prod = { ...valid, NODE_ENV: "production", CORS_ORIGIN: "https://app.mop.example" };

    it("accepts an https origin", () => {
      expect(loadEnvironment(prod).isProduction).toBe(true);
    });

    it("rejects a wildcard CORS origin", () => {
      expect(() => loadEnvironment({ ...prod, CORS_ORIGIN: "*" })).toThrow(/CORS_ORIGIN/);
    });

    it("rejects a plaintext CORS origin, which would defeat the secure cookie", () => {
      expect(() => loadEnvironment({ ...prod, CORS_ORIGIN: "http://app.mop.example" })).toThrow(/https/);
    });
  });

  it("reports every problem at once rather than one per restart", () => {
    try {
      loadEnvironment({ NODE_ENV: "nope", PORT: "0" });
      throw new Error("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(EnvironmentValidationError);
      expect((error as EnvironmentValidationError).problems.length).toBeGreaterThanOrEqual(3);
    }
  });
});

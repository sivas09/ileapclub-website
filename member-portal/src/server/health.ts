import { config } from "./config.js";
import { prisma } from "./db.js";

export const serviceName = "ileap-member-portal-api";

export type ReadinessCheck = () => Promise<void>;

type DatabaseReadinessOptions = {
  probe?: () => Promise<unknown>;
  timeoutMs?: number;
};

export function serviceStatus(ok: boolean, now = new Date()) {
  const version = process.env.npm_package_version?.trim();
  const buildSha = (
    process.env.RENDER_GIT_COMMIT
    || process.env.BUILD_SHA
    || process.env.GIT_COMMIT
    || ""
  ).trim();

  return {
    ok,
    service: serviceName,
    ...(version ? { version } : {}),
    ...(buildSha ? { buildSha: buildSha.slice(0, 12) } : {}),
    timestamp: now.toISOString()
  };
}

export function createDatabaseReadinessCheck({
  probe = () => prisma.$queryRaw`SELECT 1`,
  timeoutMs = config.READINESS_TIMEOUT_MS
}: DatabaseReadinessOptions = {}): ReadinessCheck {
  return async () => {
    let timeout: NodeJS.Timeout | undefined;

    try {
      await Promise.race([
        Promise.resolve().then(probe),
        new Promise<never>((_resolve, reject) => {
          timeout = setTimeout(() => {
            reject(new Error(`Database readiness check timed out after ${timeoutMs}ms.`));
          }, timeoutMs);
          timeout.unref();
        })
      ]);
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
    }
  };
}

export const checkDatabaseReadiness = createDatabaseReadinessCheck();

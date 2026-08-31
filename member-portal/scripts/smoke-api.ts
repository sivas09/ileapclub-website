const baseUrl = process.env.SMOKE_BASE_URL || "http://localhost:4000";

async function main() {
  await checkEndpoint("health", false);
  await checkEndpoint("ready", true);

  console.log(`API liveness and readiness smoke checks passed: ${baseUrl}`);
}

async function checkEndpoint(endpoint: "health" | "ready", expectDatabaseCheck: boolean) {
  const response = await fetch(`${baseUrl}/api/${endpoint}`);

  if (!response.ok) {
    throw new Error(`${endpoint} check failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();

  if (!data.ok || data.service !== "ileap-member-portal-api") {
    throw new Error(`${endpoint} check returned an unexpected payload.`);
  }

  if (expectDatabaseCheck && data.checks?.database !== "reachable") {
    throw new Error("Readiness check did not confirm database connectivity.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

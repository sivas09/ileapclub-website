const baseUrl = process.env.SMOKE_BASE_URL || "http://localhost:4000";

async function main() {
  const response = await fetch(`${baseUrl}/api/health`);

  if (!response.ok) {
    throw new Error(`Health check failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();

  if (!data.ok || data.service !== "ileap-member-portal-api") {
    throw new Error("Health check returned an unexpected payload.");
  }

  console.log(`API smoke check passed: ${baseUrl}/api/health`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

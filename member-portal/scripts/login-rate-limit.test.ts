import assert from "node:assert/strict";
import type { Server } from "node:http";
import express from "express";
import { authRouter } from "../src/server/routes/auth.js";

const app = express();
app.set("trust proxy", 1);
app.use(express.json());
app.use("/api/auth", authRouter);

const server = await listen(app);
const address = server.address();

if (!address || typeof address === "string") {
  throw new Error("Rate-limit test server did not expose a TCP port.");
}

const loginUrl = `http://127.0.0.1:${address.port}/api/auth/login`;

try {
  for (let attempt = 1; attempt <= 10; attempt += 1) {
    const response = await invalidLogin();
    assert.equal(response.status, 400, `Attempt ${attempt} should reach normal login validation.`);
  }

  const blockedResponse = await invalidLogin();
  const blockedBody = await blockedResponse.json() as { message?: unknown };

  assert.equal(blockedResponse.status, 429, "The eleventh failed login attempt should be rate limited.");
  assert.equal(
    blockedBody.message,
    "Too many login attempts. Please wait 15 minutes and try again.",
    "Rate-limited clients should receive a clear recovery message."
  );
  assert.ok(blockedResponse.headers.has("ratelimit"), "Standard rate-limit headers should be returned.");
  assert.ok(blockedResponse.headers.has("retry-after"), "Blocked clients should receive a Retry-After header.");

  const differentClientResponse = await invalidLogin("203.0.113.11");
  assert.equal(differentClientResponse.status, 400, "One throttled client must not block a different client IP.");

  console.log("Login rate-limit tests passed.");
} finally {
  await close(server);
}

function invalidLogin(clientIp = "203.0.113.10") {
  return fetch(loginUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": clientIp
    },
    body: JSON.stringify({ email: "invalid", password: "" })
  });
}

function listen(expressApp: express.Express) {
  return new Promise<Server>((resolve) => {
    const startedServer = expressApp.listen(0, "127.0.0.1", () => resolve(startedServer));
  });
}

function close(serverToClose: Server) {
  return new Promise<void>((resolve, reject) => {
    serverToClose.close((error) => error ? reject(error) : resolve());
  });
}

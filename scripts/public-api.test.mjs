import assert from "node:assert/strict";
import { onRequestPost as submitEnrollment } from "../functions/api/enroll.js";
import { onRequestPost as submitInquiry } from "../functions/api/inquiry.js";

const originalFetch = globalThis.fetch;

try {
  globalThis.fetch = async () => new Response("", { status: 200 });

  const inquiryForm = new FormData();
  inquiryForm.set("inquiry_type", "demo");
  inquiryForm.set("name", "Test Parent");
  inquiryForm.set("email", "parent@example.com");
  inquiryForm.set("grade", "junior");

  const inquiryResponse = await submitInquiry({
    request: new Request("https://example.test/api/inquiry", { method: "POST", body: inquiryForm }),
    env: { RESEND_API_KEY: "test", ENROLL_FROM_EMAIL: "site@example.com" },
  });
  assert.equal(inquiryResponse.status, 200);
  assert.equal((await inquiryResponse.json()).ok, true);

  const invalidInquiryForm = new FormData();
  invalidInquiryForm.set("inquiry_type", "contact");
  invalidInquiryForm.set("name", "Test Parent");
  invalidInquiryForm.set("email", "invalid-email");

  const invalidInquiryResponse = await submitInquiry({
    request: new Request("https://example.test/api/inquiry", { method: "POST", body: invalidInquiryForm }),
    env: {},
  });
  assert.equal(invalidInquiryResponse.status, 400);

  const spamEnrollmentForm = new FormData();
  spamEnrollmentForm.set("website", "spam.example");

  const spamEnrollmentResponse = await submitEnrollment({
    request: new Request("https://example.test/api/enroll", { method: "POST", body: spamEnrollmentForm }),
    env: {},
  });
  assert.equal(spamEnrollmentResponse.status, 200);
  assert.equal((await spamEnrollmentResponse.json()).ok, true);

  console.log("Public API tests passed.");
} finally {
  globalThis.fetch = originalFetch;
}

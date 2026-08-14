import assert from "node:assert/strict";
import { onRequestPost as submitEnrollment } from "../functions/api/enroll.js";
import { onRequestPost as submitInquiry } from "../functions/api/inquiry.js";

const originalFetch = globalThis.fetch;

function enrollmentForm(overrides = {}) {
  const values = {
    franchise_province: "Ontario",
    franchise_city: "Ottawa",
    centre: "Ottawa Centre",
    student_first_name: "Test",
    student_last_name: "Student",
    date_of_birth: "2015-05-10",
    street: "123 Test Street",
    student_city: "Ottawa",
    student_province: "Ontario",
    postal_code: "K1A 0B1",
    primary_mobile: "613-555-0100",
    school_name: "Test School",
    mother_name: "Test Mother",
    father_name: "Test Father",
    mother_cell: "613-555-0101",
    father_cell: "613-555-0102",
    email_1: "parent@example.com",
    ...overrides,
  };
  const form = new FormData();

  Object.entries(values).forEach(([field, value]) => form.set(field, value));
  return form;
}

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

  const oversizedInquiryForm = new FormData();
  oversizedInquiryForm.set("inquiry_type", "franchise");
  oversizedInquiryForm.set("name", "Test Parent");
  oversizedInquiryForm.set("email", "parent@example.com");
  oversizedInquiryForm.set("message", "x".repeat(4001));

  const oversizedInquiryResponse = await submitInquiry({
    request: new Request("https://example.test/api/inquiry", { method: "POST", body: oversizedInquiryForm }),
    env: {},
  });
  assert.equal(oversizedInquiryResponse.status, 400);

  const spamEnrollmentForm = new FormData();
  spamEnrollmentForm.set("website", "spam.example");

  const spamEnrollmentResponse = await submitEnrollment({
    request: new Request("https://example.test/api/enroll", { method: "POST", body: spamEnrollmentForm }),
    env: {},
  });
  assert.equal(spamEnrollmentResponse.status, 200);
  assert.equal((await spamEnrollmentResponse.json()).ok, true);

  const invalidEnrollmentEmailResponse = await submitEnrollment({
    request: new Request("https://example.test/api/enroll", {
      method: "POST",
      body: enrollmentForm({ email_1: "invalid-email" }),
    }),
    env: {},
  });
  assert.equal(invalidEnrollmentEmailResponse.status, 400);

  const invalidEnrollmentDateResponse = await submitEnrollment({
    request: new Request("https://example.test/api/enroll", {
      method: "POST",
      body: enrollmentForm({ date_of_birth: "2015-99-99" }),
    }),
    env: {},
  });
  assert.equal(invalidEnrollmentDateResponse.status, 400);

  const enrollmentResponse = await submitEnrollment({
    request: new Request("https://example.test/api/enroll", { method: "POST", body: enrollmentForm() }),
    env: { RESEND_API_KEY: "test", ENROLL_FROM_EMAIL: "site@example.com" },
  });
  assert.equal(enrollmentResponse.status, 200);
  assert.equal((await enrollmentResponse.json()).ok, true);

  console.log("Public API tests passed.");
} finally {
  globalThis.fetch = originalFetch;
}

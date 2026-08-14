const RECIPIENTS = ["info@ileapclub.com", "info@ileap.club"];

const INQUIRY_LABELS = {
  demo: "Free demo request",
  contact: "General inquiry",
  franchise: "Franchise inquiry",
};

const FIELD_LABELS = {
  name: "Name",
  email: "Email",
  phone: "Phone",
  grade: "Child Grade",
  region: "City / Region",
  message: "Message / Goal",
};

export async function onRequestPost(context) {
  try {
    const { request, env } = context;
    const formData = await request.formData();
    const data = Object.fromEntries(formData.entries());

    if (String(data.website || "").trim()) {
      return jsonResponse({ ok: true, message: "Thank you. Your inquiry has been submitted." });
    }

    const inquiryType = String(data.inquiry_type || "");
    const name = String(data.name || "").trim();
    const email = String(data.email || "").trim();

    if (!INQUIRY_LABELS[inquiryType] || !name || !email) {
      return jsonResponse({ ok: false, message: "Please provide your name and email address." }, 400);
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return jsonResponse({ ok: false, message: "Please enter a valid email address." }, 400);
    }

    if (!env.RESEND_API_KEY || !env.ENROLL_FROM_EMAIL) {
      return jsonResponse(
        { ok: false, message: "Inquiry service is not configured yet. Please email info@ileapclub.com." },
        500,
      );
    }

    const inquiryLabel = INQUIRY_LABELS[inquiryType];
    const emailPayload = {
      from: env.ENROLL_FROM_EMAIL,
      to: RECIPIENTS,
      reply_to: email,
      subject: `${inquiryLabel}: ${name}`,
      text: buildTextEmail(inquiryLabel, data),
      html: buildHtmlEmail(inquiryLabel, data),
    };

    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(emailPayload),
    });

    if (!resendResponse.ok) {
      console.error("Resend inquiry email failed", await resendResponse.text());
      return jsonResponse(
        { ok: false, message: "We could not submit your inquiry right now. Please email info@ileapclub.com." },
        502,
      );
    }

    return jsonResponse({ ok: true, message: "Thank you. Your inquiry has been submitted." });
  } catch (error) {
    console.error("Inquiry submission failed", error);
    return jsonResponse(
      { ok: false, message: "Something went wrong. Please try again or email info@ileapclub.com." },
      500,
    );
  }
}

export function onRequestGet() {
  return jsonResponse({ ok: false, message: "Use POST to submit an inquiry." }, 405);
}

function buildTextEmail(inquiryLabel, data) {
  return [
    `Inquiry Type: ${inquiryLabel}`,
    ...Object.entries(FIELD_LABELS).map(([field, label]) => `${label}: ${data[field] || ""}`),
  ].join("\n");
}

function buildHtmlEmail(inquiryLabel, data) {
  const rows = Object.entries(FIELD_LABELS)
    .map(([field, label]) => `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(data[field] || "")}</td></tr>`)
    .join("");

  return `
    <h1>${escapeHtml(inquiryLabel)}</h1>
    <p>A new inquiry was submitted from ileapclub.com.</p>
    <table cellpadding="8" cellspacing="0" border="1" style="border-collapse:collapse;border-color:#dfe6f0;">
      ${rows}
    </table>
  `;
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

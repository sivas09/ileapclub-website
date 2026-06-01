const RECIPIENTS = ["info@ileapclub.com", "info@ileap.club"];

const REQUIRED_FIELDS = [
  "franchise_province",
  "franchise_city",
  "centre",
  "student_first_name",
  "student_last_name",
  "date_of_birth",
  "street",
  "student_city",
  "student_province",
  "postal_code",
  "primary_mobile",
  "school_name",
  "mother_name",
  "father_name",
  "mother_cell",
  "father_cell",
  "email_1",
];

const FIELD_LABELS = {
  franchise_province: "Franchise Province",
  franchise_city: "Franchise City",
  centre: "Centre",
  student_first_name: "Student First Name",
  student_last_name: "Student Last Name",
  date_of_birth: "Date of Birth",
  gender: "Gender",
  street: "Street",
  unit: "Unit/Apt No",
  student_city: "Student City",
  student_province: "Student Province",
  postal_code: "Postal Code",
  primary_mobile: "Primary Mobile Number",
  student_grade: "Student Grade",
  school_name: "Name of the School",
  mother_name: "Mother's Name",
  father_name: "Father's Name",
  mother_cell: "Mother's Cell",
  father_cell: "Father's Cell",
  email_1: "Email Address 1",
  email_2: "Email Address 2",
  referral_source: "How did you hear about iLEAP Club?",
  referral_details: "Reference Details",
};

export async function onRequestPost(context) {
  try {
    const { request, env } = context;
    const formData = await request.formData();
    const data = Object.fromEntries(formData.entries());
    const missingFields = REQUIRED_FIELDS.filter((field) => !String(data[field] || "").trim());

    if (missingFields.length) {
      return jsonResponse(
        {
          ok: false,
          message: `Please complete: ${missingFields.map((field) => FIELD_LABELS[field]).join(", ")}.`,
        },
        400,
      );
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(data.date_of_birth))) {
      return jsonResponse(
        {
          ok: false,
          message: "Please enter the date of birth in yyyy-mm-dd format.",
        },
        400,
      );
    }

    if (!env.RESEND_API_KEY || !env.ENROLL_FROM_EMAIL) {
      return jsonResponse(
        {
          ok: false,
          message: "Enrollment email service is not configured yet. Please contact info@ileapclub.com.",
        },
        500,
      );
    }

    const subject = `New iLEAP Club Enrollment: ${data.student_first_name} ${data.student_last_name}`;
    const emailPayload = {
      from: env.ENROLL_FROM_EMAIL,
      to: RECIPIENTS,
      reply_to: data.email_1,
      subject,
      text: buildTextEmail(data),
      html: buildHtmlEmail(data),
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
      const errorText = await resendResponse.text();
      console.error("Resend enrollment email failed", errorText);
      return jsonResponse(
        {
          ok: false,
          message: "We could not submit the enrollment form right now. Please email info@ileapclub.com.",
        },
        502,
      );
    }

    return jsonResponse({
      ok: true,
      message: "Thank you. Your enrollment form has been submitted successfully.",
    });
  } catch (error) {
    console.error("Enrollment submission failed", error);
    return jsonResponse(
      {
        ok: false,
        message: "Something went wrong. Please try again or email info@ileapclub.com.",
      },
      500,
    );
  }
}

export function onRequestGet() {
  return jsonResponse(
    {
      ok: false,
      message: "Use POST to submit the enrollment form.",
    },
    405,
  );
}

function buildTextEmail(data) {
  return Object.keys(FIELD_LABELS)
    .map((field) => `${FIELD_LABELS[field]}: ${data[field] || ""}`)
    .join("\n");
}

function buildHtmlEmail(data) {
  const rows = Object.keys(FIELD_LABELS)
    .map((field) => {
      return `<tr><th>${escapeHtml(FIELD_LABELS[field])}</th><td>${escapeHtml(data[field] || "")}</td></tr>`;
    })
    .join("");

  return `
    <h1>New iLEAP Club Enrollment</h1>
    <p>A new enrollment form was submitted from ileapclub.com.</p>
    <table cellpadding="8" cellspacing="0" border="1" style="border-collapse:collapse;border-color:#dfe6f0;">
      ${rows}
    </table>
  `;
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
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

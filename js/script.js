const toggle = document.querySelector(".nav-toggle");
const nav = document.querySelector("#site-nav");
const header = document.querySelector("[data-header]");
const leadForms = document.querySelectorAll(".lead-form");

if (nav) {
  const normalizePage = (value) => {
    const cleanValue = value.replace(/\/+$/, "");
    const page = cleanValue.split("/").pop() || "index.html";

    return page.endsWith(".html") ? page : `${page}.html`;
  };
  const currentPage = normalizePage(window.location.pathname);

  nav.querySelectorAll("a[href]").forEach((link) => {
    const href = normalizePage(link.getAttribute("href") || "");
    if (href === currentPage) {
      link.setAttribute("aria-current", "page");
    } else {
      link.removeAttribute("aria-current");
    }
  });
}

if (toggle && nav) {
  const closeMenu = () => {
    nav.classList.remove("is-open");
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-label", "Open menu");
  };

  toggle.addEventListener("click", () => {
    const isOpen = nav.classList.toggle("is-open");
    toggle.setAttribute("aria-expanded", String(isOpen));
    toggle.setAttribute("aria-label", isOpen ? "Close menu" : "Open menu");
  });

  nav.addEventListener("click", (event) => {
    if (event.target instanceof HTMLAnchorElement) {
      closeMenu();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeMenu();
    }
  });

  document.addEventListener("click", (event) => {
    if (
      event.target instanceof Node &&
      !nav.contains(event.target) &&
      !toggle.contains(event.target)
    ) {
      closeMenu();
    }
  });
}

if (header) {
  const updateHeader = () => {
    header.classList.toggle("is-scrolled", window.scrollY > 12);
  };

  updateHeader();
  window.addEventListener("scroll", updateHeader, { passive: true });
}

leadForms.forEach((leadForm) => {
  if (!(leadForm instanceof HTMLFormElement)) {
    return;
  }

  leadForm.addEventListener("submit", async (event) => {
    const status = leadForm.querySelector(".form-status");

    if (leadForm.dataset.ajaxForm === "true") {
      event.preventDefault();

      if (status) {
        status.textContent = "Submitting...";
        status.classList.remove("is-error", "is-success");
      }

      try {
        const response = await fetch(leadForm.action, {
          method: leadForm.method || "POST",
          body: new FormData(leadForm),
          headers: {
            Accept: "application/json",
          },
        });
        const result = await response.json().catch(() => ({}));

        if (!response.ok || result.ok === false) {
          throw new Error(result.message || "Submission failed.");
        }

        if (status) {
          status.textContent = result.message || "Thank you. Your form has been submitted successfully.";
          status.classList.add("is-success");
        }

        leadForm.reset();
      } catch (error) {
        if (status) {
          status.textContent =
            error instanceof Error
              ? error.message
              : "We could not submit the form right now. Please try again.";
          status.classList.add("is-error");
        }
      }

      return;
    }

    const action = leadForm.getAttribute("action");
    const isPlaceholderForm =
      leadForm.dataset.staticPlaceholder === "true" || !action || action === "#";

    if (!isPlaceholderForm) {
      return;
    }

    event.preventDefault();

    if (status) {
      status.textContent = "Thank you. Your information is ready to submit once the iLEAP Club form endpoint is connected.";
      status.classList.remove("is-error");
      status.classList.add("is-success");
    }

    leadForm.reset();
  });
});

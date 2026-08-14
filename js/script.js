const toggle = document.querySelector(".nav-toggle");
const nav = document.querySelector("#site-nav");
const header = document.querySelector("[data-header]");
const leadForms = document.querySelectorAll(".lead-form");
const locationFinder = document.querySelector("[data-location-finder]");
const main = document.querySelector("main");

if (main) {
  main.id ||= "main-content";

  const skipLink = document.createElement("a");
  skipLink.className = "skip-link";
  skipLink.href = `#${main.id}`;
  skipLink.textContent = "Skip to main content";
  document.body.prepend(skipLink);
}

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
  const closeMenu = (restoreFocus = false) => {
    nav.classList.remove("is-open");
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-label", "Open menu");

    if (restoreFocus) {
      toggle.focus();
    }
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
    if (event.key === "Escape" && nav.classList.contains("is-open")) {
      closeMenu(true);
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
    const submitButton = leadForm.querySelector("button[type='submit']");

    if (leadForm.dataset.ajaxForm === "true") {
      event.preventDefault();

      if (status) {
        status.textContent = "Submitting...";
        status.classList.remove("is-error", "is-success");
      }

      if (submitButton instanceof HTMLButtonElement) {
        submitButton.disabled = true;
        submitButton.setAttribute("aria-busy", "true");
      }

      try {
        const response = await fetch(leadForm.action, {
          method: leadForm.method || "POST",
          body: new FormData(leadForm),
          headers: {
            Accept: "application/json",
          },
        });
        const result = await response.json().catch(() => null);

        if (!response.ok || !result || result.ok === false) {
          throw new Error(result?.message || "We could not submit the form right now. Please try again.");
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
      } finally {
        if (submitButton instanceof HTMLButtonElement) {
          submitButton.disabled = false;
          submitButton.removeAttribute("aria-busy");
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
      status.textContent = "This form is temporarily unavailable. Please email info@ileapclub.com.";
      status.classList.remove("is-success");
      status.classList.add("is-error");
    }
  });
});

if (locationFinder instanceof HTMLFormElement) {
  const locationCards = document.querySelectorAll(".location-option-card[data-province]");
  const status = locationFinder.querySelector(".location-finder-status");

  locationFinder.addEventListener("submit", (event) => {
    event.preventDefault();

    const filters = Object.fromEntries(new FormData(locationFinder).entries());
    let visibleCount = 0;

    locationCards.forEach((card) => {
      if (!(card instanceof HTMLElement)) {
        return;
      }

      const matches = ["province", "city", "centre"].every((field) => {
        const selectedValue = String(filters[field] || "");
        return !selectedValue || card.dataset[field] === selectedValue;
      });

      card.hidden = !matches;
      visibleCount += Number(matches);
    });

    if (status) {
      status.textContent = visibleCount
        ? `Showing ${visibleCount} matching ${visibleCount === 1 ? "option" : "options"}.`
        : "No exact match found. Contact us and we will help you find the nearest option.";
    }
  });
}

const toggle = document.querySelector(".nav-toggle");
const nav = document.querySelector("#site-nav");
const header = document.querySelector("[data-header]");
const leadForms = document.querySelectorAll(".lead-form");

if (nav) {
  const currentPage = window.location.pathname.split("/").pop() || "index.html";
  nav.querySelectorAll("a[href]").forEach((link) => {
    const href = link.getAttribute("href");
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

  leadForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const status = leadForm.querySelector(".form-status");
    if (status) {
      status.textContent = "Thank you. Please email info@ileapclub.com or connect this form to a static form service before launch.";
    }

    leadForm.reset();
  });
});

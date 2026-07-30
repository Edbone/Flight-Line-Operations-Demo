(() => {
  const demoUser = Object.freeze({
    id: "portfolio-admin",
    uid: "portfolio-admin",
    email: "demo@example.invalid",
    name: "Portfolio Admin",
    initials: "PA",
    isAdmin: true,
    isStaff: true,
    isInstructor: false,
    instructorProfileId: "",
    approved: true
  });

  const getCurrentUser = () => ({ ...demoUser });
  const getCurrentUserInitials = () => demoUser.initials;
  const staffStamp = (prefix = "created") => ({
    [`${prefix}ByUserId`]: demoUser.id,
    [`${prefix}ByName`]: demoUser.name,
    [`${prefix}ByInitials`]: demoUser.initials
  });

  function unlockPage() {
    renderCondensedNavigation();
    document.documentElement.classList.remove("auth-checking");
    document.body.classList.remove("auth-locked");
    document.querySelector(".login-gate")?.remove();
    renderPortfolioNotice();
  }

  const NAV_GROUPS = [
    { label: "Home", href: "index.html" },
    {
      label: "People",
      links: [
        ["students.html", "Students"],
        ["instructors.html", "Instructors"],
        ["student-dashboard.html", "Student Dashboard"]
      ]
    },
    {
      label: "Schedules",
      links: [
        ["master-schedule.html", "Master Schedule"],
        ["sheet1.html", "Ground Trainers"],
        ["ground-attendance.html", "Ground Attendance"],
        ["availability.html", "Availability"]
      ]
    },
    {
      label: "Operations",
      links: [
        ["attendance-tracking.html", "Attendance Tracking"],
        ["stage-checks.html", "Stage Checks"],
        ["maintenance.html", "Fleet Maintenance"],
        ["tv-screens.html", "TV Screens"],
        ["sap-dashboard.html", "SAP Dashboard"]
      ]
    },
    {
      label: "Logs",
      links: [
        ["notes.html", "Operations Notes"],
        ["written-tests.html", "Written Tests"],
        ["tuition-tracking.html", "Tuition"],
        ["oil-tracker.html", "Oil"],
        ["e6b-rentals.html", "E6B Rentals"],
        ["fuel-discrepancies.html", "Fuel Reports"]
      ]
    },
    {
      label: "Help",
      links: [["user-guide.html", "User Guide"]]
    },
    {
      label: "Admin",
      links: [
        ["management.html", "Management"],
        ["student-import.html", "Student Import"],
        ["sap-import.html", "SAP Import"],
        ["alerts.html", "Alerts"]
      ]
    },
    { label: "Instructor Dashboard", href: "instructor-home.html" }
  ];

  function currentPage() {
    return window.location.pathname.split("/").pop() || "index.html";
  }

  function renderCondensedNavigation() {
    const nav = document.querySelector(".main-nav");
    const topbar = document.querySelector(".topbar");
    if (!nav || !topbar || nav.dataset.condensed === "true") return;
    const page = currentPage();
    topbar.querySelector(".brand")?.remove();
    nav.dataset.condensed = "true";
    nav.innerHTML = NAV_GROUPS.map((item) => {
      if (item.href) {
        const active = page === item.href ? " active" : "";
        return `<a class="nav-primary-link${active}" href="${item.href}">${item.label}</a>`;
      }
      const active = item.links.some(([href]) => href === page);
      return `
        <details class="nav-group${active ? " active" : ""}">
          <summary>${item.label}</summary>
          <div class="nav-group-menu">
            ${item.links.map(([href, label]) => `<a class="${page === href ? "active" : ""}" href="${href}">${label}</a>`).join("")}
          </div>
        </details>`;
    }).join("");

    const account = document.createElement("div");
    account.className = "portfolio-account";
    account.innerHTML = `
      <span class="portfolio-account-dot" aria-hidden="true">PA</span>
      <span><strong>Portfolio Admin</strong><small>Admin / Demo</small></span>
      <span class="portfolio-account-chevron" aria-hidden="true"></span>`;
    topbar.append(account);

    const mark = document.createElement("a");
    mark.className = "portfolio-mark";
    mark.href = "index.html";
    mark.setAttribute("aria-label", "Portfolio home");
    mark.innerHTML = '<img src="assets/ekwx-logo.png" alt="" />';
    topbar.insertBefore(mark, nav);

    nav.querySelectorAll(".nav-group").forEach((group) => {
      group.addEventListener("toggle", () => {
        if (!group.open) return;
        nav.querySelectorAll(".nav-group[open]").forEach((other) => {
          if (other !== group) other.open = false;
        });
      });
    });
    document.addEventListener("click", (event) => {
      if (event.target.closest(".nav-group")) return;
      nav.querySelectorAll(".nav-group[open]").forEach((group) => { group.open = false; });
    });
  }

  function renderPortfolioNotice() {
    if (document.querySelector(".portfolio-mode-notice")) return;
    const notice = document.createElement("div");
    notice.className = "portfolio-mode-notice";
    notice.setAttribute("role", "status");
    notice.textContent = "Portfolio demo · changes stay in this browser";
    document.body.append(notice);
  }

  function stampRecord(record = {}, prefix = "created") {
    return { ...record, ...staffStamp(prefix), initials: record.initials || demoUser.initials };
  }

  window.AOAAuth = {
    accounts: [getCurrentUser()],
    getCurrentUser,
    getCurrentUserInitials,
    getIdToken: async () => {
      throw new Error("Remote API access is disabled in the portfolio demo.");
    },
    staffStamp,
    stampRecord,
    openAdminDialog: () => window.alert("Account management is disabled in the portfolio demo."),
    logout: async () => window.alert("This portfolio uses a fixed demo session."),
    ready: Promise.resolve(getCurrentUser())
  };

  document.addEventListener("DOMContentLoaded", unlockPage, { once: true });
})();

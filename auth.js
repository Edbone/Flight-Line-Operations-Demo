(() => {
  const PASSWORD = "AngleofAttack";
  const SESSION_KEY = "aoa-ssr-authenticated";

  const isAuthenticated = () => sessionStorage.getItem(SESSION_KEY) === "true";

  const unlockPage = () => {
    sessionStorage.setItem(SESSION_KEY, "true");
    document.documentElement.classList.remove("auth-checking");
    document.body.classList.remove("auth-locked");
    document.querySelector(".login-gate")?.remove();
  };

  const showLogin = () => {
    document.body.classList.add("auth-locked");

    const gate = document.createElement("div");
    gate.className = "login-gate";
    gate.innerHTML = `
      <form class="login-card" id="login-form">
        <img src="assets/aoa-logo.png" alt="Academy of Aviation" />
        <p class="login-logo-caption">Staff Hub</p>
        <h1>Staff Login</h1>
        <label>
          Password
          <input id="login-password" type="password" autocomplete="current-password" required />
        </label>
        <p class="login-error" id="login-error" aria-live="polite"></p>
        <button class="button primary" type="submit">Enter</button>
      </form>
    `;

    document.body.append(gate);
    document.documentElement.classList.remove("auth-checking");

    const form = gate.querySelector("#login-form");
    const passwordInput = gate.querySelector("#login-password");
    const error = gate.querySelector("#login-error");

    passwordInput.focus();

    form.addEventListener("submit", (event) => {
      event.preventDefault();

      if (passwordInput.value === PASSWORD) {
        unlockPage();
        return;
      }

      error.textContent = "Incorrect password. Please try again.";
      passwordInput.value = "";
      passwordInput.focus();
    });
  };

  if (isAuthenticated()) {
    document.addEventListener("DOMContentLoaded", unlockPage, { once: true });
    return;
  }

  document.addEventListener("DOMContentLoaded", showLogin, { once: true });
})();

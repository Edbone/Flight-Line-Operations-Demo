(() => {
  const unlockPage = () => {
    document.documentElement.classList.remove("auth-checking");
    document.body.classList.remove("auth-locked");
    document.querySelector(".login-gate")?.remove();
  };

  document.addEventListener("DOMContentLoaded", unlockPage, { once: true });
})();

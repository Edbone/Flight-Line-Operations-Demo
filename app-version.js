(async () => {
  const label = document.querySelector("#app-version");
  if (!label) return;

  try {
    const response = await fetch("/api/version", { cache: "no-store" });
    if (!response.ok) return;
    const version = await response.json();
    label.textContent = version.label || label.textContent;
    label.title = [
      `Application version ${version.version || "unknown"}`,
      version.commit ? `Commit ${version.commit}` : "",
      version.branch ? `Branch ${version.branch}` : ""
    ].filter(Boolean).join(" · ");
  } catch (error) {
    console.warn("Application version could not be loaded", error);
  }
})();

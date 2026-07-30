const { version } = require("../package.json");

module.exports = function handler(request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    response.status(405).json({ error: "Method not allowed" });
    return;
  }

  const fullCommit = String(process.env.VERCEL_GIT_COMMIT_SHA || "").trim();
  const commit = fullCommit ? fullCommit.slice(0, 7) : "";
  const branch = String(process.env.VERCEL_GIT_COMMIT_REF || "").trim();

  response.setHeader("Cache-Control", "no-store, max-age=0");
  response.status(200).json({
    version,
    commit,
    branch,
    label: `v${version}${commit ? ` · ${commit}` : ""}`
  });
};

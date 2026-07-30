import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const authPath = path.join(root, "auth.js");
const authSource = fs.readFileSync(authPath, "utf8");
const pattern = /const LOADED_APP_VERSION = "[^"]+";/;

if (!pattern.test(authSource)) throw new Error("auth.js is missing LOADED_APP_VERSION");
fs.writeFileSync(authPath, authSource.replace(pattern, `const LOADED_APP_VERSION = "${packageJson.version}";`));
console.log(`Synced browser update monitor to v${packageJson.version}`);

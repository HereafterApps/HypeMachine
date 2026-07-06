// Loads the repo-root .env so the quickstart's single `cp .env.example .env`
// works no matter which package the process starts from. Values already in
// the environment always win (dotenv never overrides).
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const here = path.dirname(fileURLToPath(import.meta.url));
// Works from both src/ (tsx) and dist/ (node): walk up until we find .env
// or the repo root marker.
let dir = here;
for (let i = 0; i < 6; i++) {
  const candidate = path.join(dir, ".env");
  if (existsSync(candidate)) {
    dotenv.config({ path: candidate });
    break;
  }
  dir = path.dirname(dir);
}

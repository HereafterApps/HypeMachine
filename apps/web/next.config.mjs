import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

// Load the repo-root .env so the quickstart's single `cp .env.example .env`
// also covers the web app (Next.js only auto-loads env files from apps/web).
// Values already set in the environment win.
const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, "../../.env") });

/** @type {import('next').NextConfig} */
const nextConfig = {};

export default nextConfig;

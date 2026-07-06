import "./lib/env.js";
import { createHash, timingSafeEqual } from "node:crypto";
import Fastify from "fastify";
import cors from "@fastify/cors";
import { ZodError } from "zod";
import { Prisma } from "@hype/db";
import { HttpError } from "./lib/errors.js";
import { personaRoutes } from "./routes/personas.js";
import { campaignRoutes } from "./routes/campaigns.js";
import { contentRoutes } from "./routes/content.js";
import { dashboardRoutes } from "./routes/dashboard.js";

const app = Fastify({ logger: true });

const corsOrigin = process.env.CORS_ORIGIN;
await app.register(cors, {
  // Default: only the local dashboard. Set CORS_ORIGIN to widen.
  origin: corsOrigin ? corsOrigin.split(",") : ["http://localhost:3000"],
});

// Single-user auth (v1). Fail closed: refuse to boot without a token unless
// auth is explicitly disabled for local development.
const API_TOKEN = process.env.API_TOKEN;
const AUTH_DISABLED = process.env.DISABLE_AUTH === "true";
if (!API_TOKEN && !AUTH_DISABLED) {
  app.log.error(
    "API_TOKEN is not set. Set it in .env, or set DISABLE_AUTH=true for local development only.",
  );
  process.exit(1);
}
if (AUTH_DISABLED) {
  app.log.warn("AUTH IS DISABLED (DISABLE_AUTH=true) — never do this in production.");
}

const expectedAuth = API_TOKEN
  ? createHash("sha256").update(`Bearer ${API_TOKEN}`).digest()
  : null;

app.addHook("onRequest", async (request, reply) => {
  if (request.url === "/health" || !expectedAuth) return;
  const received = createHash("sha256")
    .update(request.headers.authorization ?? "")
    .digest();
  if (!timingSafeEqual(received, expectedAuth)) {
    // Returning reply stops the request lifecycle — the route handler
    // must never run for an unauthorized request.
    return reply.code(401).send({ error: "Unauthorized" });
  }
});

app.setErrorHandler((error, _request, reply) => {
  if (error instanceof ZodError) {
    reply.code(400).send({ error: "Validation failed", issues: error.issues });
    return;
  }
  if (error instanceof HttpError) {
    reply.code(error.statusCode).send({ error: error.message });
    return;
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2025") {
      reply.code(404).send({ error: "Record not found" });
      return;
    }
    if (error.code === "P2003" || error.code === "P2002") {
      reply.code(400).send({ error: `Constraint violation (${error.code})` });
      return;
    }
  }
  // Fastify framework errors (malformed JSON, payload too large, ...)
  // carry their own 4xx statusCode — preserve it.
  const err = error as { statusCode?: number; message?: string };
  if (err.statusCode && err.statusCode >= 400 && err.statusCode < 500) {
    reply.code(err.statusCode).send({ error: err.message ?? "Bad request" });
    return;
  }
  app.log.error(error);
  reply.code(500).send({ error: "Internal server error" });
});

app.get("/health", async () => ({ ok: true }));

await app.register(personaRoutes);
await app.register(campaignRoutes);
await app.register(contentRoutes);
await app.register(dashboardRoutes);

const port = Number(process.env.API_PORT ?? 4000);
app
  .listen({ port, host: "0.0.0.0" })
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });

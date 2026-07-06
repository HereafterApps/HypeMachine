import Fastify from "fastify";
import cors from "@fastify/cors";
import { ZodError } from "zod";
import { HttpError } from "./lib/errors.js";
import { personaRoutes } from "./routes/personas.js";
import { campaignRoutes } from "./routes/campaigns.js";
import { contentRoutes } from "./routes/content.js";
import { dashboardRoutes } from "./routes/dashboard.js";

const app = Fastify({ logger: true });

await app.register(cors, { origin: true });

// Single-user auth (v1): every route except /health requires the token.
const API_TOKEN = process.env.API_TOKEN;
app.addHook("onRequest", async (request, reply) => {
  if (request.url === "/health") return;
  if (!API_TOKEN) return; // auth disabled when no token configured (dev)
  const header = request.headers.authorization;
  if (header !== `Bearer ${API_TOKEN}`) {
    reply.code(401).send({ error: "Unauthorized" });
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

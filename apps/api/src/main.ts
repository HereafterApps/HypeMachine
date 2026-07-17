import { createContext } from './context.js';
import { buildServer } from './server.js';
import { JobSystem } from './jobs/queue.js';

async function main() {
  const ctx = createContext();
  const app = await buildServer(ctx);
  const jobs = new JobSystem(ctx);

  await jobs.start();
  await app.listen({ port: ctx.env.API_PORT, host: '0.0.0.0' });
  const pipelineStatus = await ctx.pipeline
    .health()
    .then((h) => `pipeline=${h.provider}`)
    .catch(() => 'pipeline=UNREACHABLE (start with `pnpm dev:pipeline`)');
  app.log.info(
    `Hype Machine API on :${ctx.env.API_PORT} (${pipelineStatus}, storage=${ctx.storage.driver})`,
  );

  const shutdown = async () => {
    await jobs.stop();
    await app.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import { migrate } from "./db";
import { seedIfEmpty } from "./seed";
import { routingRoutes } from "./routes/routing";
import { savedRoutesRoutes } from "./routes/savedRoutes";
import { activitiesRoutes } from "./routes/activities";
import { heatmapRoutes } from "./routes/heatmap";

const PORT = Number(process.env.SERVER_PORT ?? 3001);

async function main(): Promise<void> {
  migrate();
  seedIfEmpty(); // populate the heatmap on first launch (offline, no network)

  const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? "info" } });

  await app.register(cors, { origin: true });
  await app.register(multipart, { limits: { fileSize: 25 * 1024 * 1024 } });

  app.get("/api/health", async () => ({
    ok: true,
    routingProvider: process.env.ROUTING_PROVIDER ?? "brouter",
  }));

  await app.register(routingRoutes);
  await app.register(savedRoutesRoutes);
  await app.register(activitiesRoutes);
  await app.register(heatmapRoutes);

  await app.listen({ port: PORT, host: "0.0.0.0" });
  console.log(`[server] listening on http://localhost:${PORT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

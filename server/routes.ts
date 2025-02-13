import type { Express } from "express";
import { createServer } from "http";
import { startBot } from "./bot";

export function registerRoutes(app: Express) {
  const httpServer = createServer(app);
  
  // Start the Discord bot
  startBot();

  return httpServer;
}

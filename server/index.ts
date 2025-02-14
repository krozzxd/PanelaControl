import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";

log("Iniciando servidor Express...", "express");

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  try {
    log("Registrando rotas...", "express");
    const server = registerRoutes(app);

    app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";

      log(`Erro: ${status} - ${message}`, "express");
      res.status(status).json({ message });
      throw err;
    });

    log("Configurando ambiente...", "express");
    if (app.get("env") === "development") {
      log("Iniciando em modo desenvolvimento", "express");
      await setupVite(app, server);
    } else {
      log("Iniciando em modo produção", "express");
      serveStatic(app);
    }

    // Use environment port if available, fallback to 5000
    const PORT = process.env.PORT || 5000;
    server.listen(Number(PORT), "0.0.0.0", () => {
      log(`Servidor rodando em http://0.0.0.0:${PORT}`, "express");
    });
  } catch (error) {
    log(`Erro fatal ao iniciar servidor: ${error}`, "express");
    process.exit(1);
  }
})();
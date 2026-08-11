import "dotenv/config";
import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { pool } from "@workspace/db";
import { logger } from "./lib/logger.js";
import type { AlertEngine } from "./services/AlertEngine.js";
import type { MarketDataService } from "./services/MarketDataService.js";
import type { FeedHealthMonitor } from "./services/FeedHealthMonitor.js";
import type { TelegramService } from "./services/TelegramService.js";
import type { DeltaService } from "./services/DeltaService.js";
import type { WSManager } from "./ws/WSManager.js";
import type { CandleAggregator } from "./services/CandleAggregator.js";
import { createRouter } from "./routes/index.js";
import { createAuthRouter, requirePinVerified } from "./routes/auth.js";

declare module "express-session" {
  interface SessionData {
    // Note: PIN-gate verification no longer lives here — it's a stateless
    // bearer token now (see routes/auth.ts) so it isn't affected by
    // cross-site cookie blocking. This session is still used for the
    // broker OAuth handshakes below.
    deltaOAuthState?: string;
    pendingBrokerAccount?: {
      accountId: number;
      apiToken: string;
      label: string;
    };
    pendingDeltaAccount?: {
      accountId: number;
      apiToken: string;
      label: string;
    };
  }
}

const PgSession = connectPgSimple(session);

export function createApp(deps: {
  alertEngine: AlertEngine;
  marketData: MarketDataService;
  healthMonitor: FeedHealthMonitor;
  telegram: TelegramService;
  delta: DeltaService;
  wsManager: WSManager;
  candleAggregator: CandleAggregator;
}): Express {
  const app: Express = express();

  app.set("trust proxy", 1);

  const allowedOrigins: Array<string | RegExp> = [
    /\.replit\.dev$/,
    /\.pike\.replit\.dev$/,
    /\.replit\.app$/,
    // Matches both *.railway.app and *.up.railway.app (Railway's public
    // service domains end in one of these two suffixes depending on plan/
    // region), so the frontend and backend can live on two separate
    // Railway services and still pass CORS.
    /\.railway\.app$/,
    /localhost/,
    // Optional extra origins, e.g. a custom domain in front of the
    // frontend — comma-separated exact origins, matching RAILWAY_DEPLOY.md.
    ...((process.env["CORS_ALLOWED_ORIGINS"] ?? "")
      .split(",")
      .map((o) => o.trim())
      .filter(Boolean)),
  ];

  app.use(
    cors({
      origin: (origin, cb) => {
        if (!origin) return cb(null, true);
        const ok = allowedOrigins.some((p) =>
          typeof p === "string" ? p === origin : p.test(origin),
        );
        cb(null, ok ? origin : false);
      },
      credentials: true,
    }),
  );

  app.use(
    session({
      secret: (() => {
        const s = process.env["SESSION_SECRET"];
        if (!s) {
          if (process.env["NODE_ENV"] === "production") {
            logger.error("SESSION_SECRET is not set — sessions are insecure in production. Add it to Railway Secrets.");
          } else {
            logger.warn("SESSION_SECRET is not set — using insecure dev fallback. Set SESSION_SECRET in Railway Secrets before deploying.");
          }
        }
        return s ?? "dev-fallback-secret-replace-in-prod";
      })(),
      resave: false,
      saveUninitialized: false,
      proxy: true,
      store: new PgSession({
        pool,
        tableName: "sessions",
        createTableIfMissing: true,
        pruneSessionInterval: 60 * 60,
      }),
      cookie: {
        secure: true,
        sameSite: "none",
        httpOnly: true,
        maxAge: 7 * 24 * 60 * 60 * 1000,
      },
    }),
  );

  app.use(
    pinoHttp({
      logger,
      serializers: {
        req(req) {
          return { id: req.id, method: req.method, url: req.url?.split("?")[0] };
        },
        res(res) {
          return { statusCode: res.statusCode };
        },
      },
    }),
  );

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  app.use(createAuthRouter());
  app.use(requirePinVerified);
  app.use("/api", createRouter(deps));

  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    logger.error({ err }, "Unhandled error");
    res.status(500).json({ error: "Internal server error" });
  });

  return app;
}

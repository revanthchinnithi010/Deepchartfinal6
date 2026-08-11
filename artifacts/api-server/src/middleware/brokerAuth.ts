import type { Request, Response, NextFunction } from "express";
import { BrokerService } from "../brokers/BrokerService.js";
import type { BrokerAdapter } from "../brokers/BrokerAdapter.js";

export interface BrokerContext {
  accountId: number;
  brokerId:  string;
  adapter:   BrokerAdapter;
}

declare global {
  namespace Express {
    interface Request {
      brokerCtx?: BrokerContext;
    }
  }
}

export function brokerAuthMiddleware(optionalBrokerId?: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const accountIdStr = (req.headers["x-broker-account-id"] as string | undefined)?.trim();
    const apiToken     = (req.headers["x-broker-token"]      as string | undefined)?.trim();

    if (!accountIdStr || !apiToken) {
      res.status(400).json({
        ok: false,
        error: "Missing required headers: X-Broker-Account-Id and X-Broker-Token",
      });
      return;
    }

    const accountId = parseInt(accountIdStr, 10);
    if (isNaN(accountId) || accountId <= 0) {
      res.status(400).json({ ok: false, error: "X-Broker-Account-Id must be a positive integer" });
      return;
    }

    try {
      const adapter = await BrokerService.getAdapter(accountId, apiToken);
      const brokerId = adapter.brokerId;

      if (optionalBrokerId && brokerId !== optionalBrokerId) {
        res.status(400).json({
          ok: false,
          error: `Account is not a ${optionalBrokerId} account (got: ${brokerId})`,
        });
        return;
      }

      req.brokerCtx = { accountId, brokerId, adapter };
      next();
    } catch (err) {
      const msg = String(err);

      if (msg.includes("not found")) {
        res.status(404).json({ ok: false, error: "Broker account not found" });
        return;
      }
      if (msg.includes("Invalid broker account token") || msg.includes("Invalid")) {
        res.status(403).json({ ok: false, error: "Broker account access denied — invalid token" });
        return;
      }
      if (msg.includes("decryption failed") || msg.includes("BrokerEncryption") || msg.includes("Invalid key length")) {
        res.status(401).json({
          ok: false,
          error:
            "Cannot decrypt stored credentials — the encryption key changed or is missing. " +
            "Set BROKER_ENCRYPTION_KEY in Replit Secrets, then reconnect your broker account.",
        });
        return;
      }

      res.status(500).json({ ok: false, error: `Broker auth error: ${msg}` });
    }
  };
}

export const requireDelta = brokerAuthMiddleware("delta");
export const requireMT5   = brokerAuthMiddleware("mt5");
export const requireAny   = brokerAuthMiddleware();

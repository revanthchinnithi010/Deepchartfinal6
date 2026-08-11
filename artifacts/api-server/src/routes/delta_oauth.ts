import { Router } from "express";
import { randomBytes } from "crypto";
import { pool } from "@workspace/db";
import { encrypt, decrypt } from "../services/BrokerEncryption.js";
import { BrokerService } from "../brokers/BrokerService.js";
import { logger } from "../lib/logger.js";

const DELTA_AUTH_URL = "https://www.delta.exchange/app/oauth/authorize";
const DELTA_TOKEN_URL = "https://api.delta.exchange/v2/auth/oauth/token";

async function createDeltaOAuthState(): Promise<string> {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS delta_oauth_state (
      state TEXT PRIMARY KEY,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
  );
  const state = randomBytes(16).toString("hex");
  await pool.query("INSERT INTO delta_oauth_state (state) VALUES ($1)", [state]);
  await pool.query("DELETE FROM delta_oauth_state WHERE created_at < NOW() - INTERVAL '15 minutes'");
  return state;
}

async function validateDeltaOAuthState(state: string): Promise<boolean> {
  const result = await pool.query(
    "DELETE FROM delta_oauth_state WHERE state = $1 RETURNING state",
    [state],
  );
  return result.rowCount !== null && result.rowCount > 0;
}

export function createDeltaOAuthRouter(): Router {
  const router = Router();

  router.get("/delta/oauth/config", async (req, res) => {
    const clientId = process.env["DELTA_CLIENT_ID"];
    const configured = !!(clientId && process.env["DELTA_CLIENT_SECRET"]);

    const proto = (req.headers["x-forwarded-proto"] as string | undefined) ?? req.protocol;
    const host = (req.headers["x-forwarded-host"] as string | undefined) ?? req.hostname;
    const redirectUri = `${proto}://${host}/api/delta/oauth/callback`;

    let authUrl: string | null = null;
    if (configured) {
      try {
        const state = await createDeltaOAuthState();
        const params = new URLSearchParams({
          client_id: clientId!,
          redirect_uri: redirectUri,
          response_type: "code",
          scope: "read write",
          state,
        });
        authUrl = `${DELTA_AUTH_URL}?${params.toString()}`;
        logger.info({ state }, "delta/oauth/config: OAuth state stored in DB, auth URL built");
      } catch (err) {
        logger.warn({ err }, "delta/oauth/config: failed to build auth URL");
      }
    } else {
      logger.warn("delta/oauth/config: DELTA_CLIENT_ID or DELTA_CLIENT_SECRET not set");
    }

    res.json({ configured, redirectUri, authUrl });
  });

  router.get("/delta/oauth/callback", async (req, res) => {
    const { code, error, error_description, state } = req.query as Record<string, string>;

    if (error) {
      logger.warn({ error, error_description }, "delta/oauth/callback: provider returned error");
      return res.send(popupHtml("error", error_description ?? error));
    }

    if (!code) {
      return res.send(popupHtml("error", "missing_authorization_code"));
    }

    if (state) {
      const valid = await validateDeltaOAuthState(state);
      if (!valid) {
        logger.warn({ state, sessionId: req.sessionID }, "delta/oauth/callback: CSRF state mismatch");
        return res.send(popupHtml("error", "session_expired_please_retry"));
      }
    }

    try {
      const proto = (req.headers["x-forwarded-proto"] as string | undefined) ?? req.protocol;
      const host = (req.headers["x-forwarded-host"] as string | undefined) ?? req.hostname;
      const redirectUri = `${proto}://${host}/api/delta/oauth/callback`;

      const clientId = process.env["DELTA_CLIENT_ID"]!;
      const clientSecret = process.env["DELTA_CLIENT_SECRET"]!;

      logger.info("delta/oauth/callback: exchanging authorization code for tokens");

      const tokenRes = await fetch(DELTA_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({
          grant_type: "authorization_code",
          code,
          redirect_uri: redirectUri,
          client_id: clientId,
          client_secret: clientSecret,
        }),
      });

      type TokenPayload = {
        access_token?: string;
        refresh_token?: string;
        expires_in?: number;
        token_type?: string;
        error?: string;
        message?: string;
      };

      type DeltaTokenResponse = TokenPayload & {
        success?: boolean;
        result?: TokenPayload;
      };

      const tokenData = (await tokenRes.json()) as DeltaTokenResponse;

      if (!tokenRes.ok) {
        const msg = tokenData.error ?? tokenData.message ?? `HTTP ${tokenRes.status}`;
        logger.error({ status: tokenRes.status, msg }, "delta/oauth/callback: token exchange failed");
        throw new Error(`Token exchange failed: ${msg}`);
      }

      const payload: TokenPayload = tokenData.result ?? tokenData;
      const accessToken = payload.access_token;
      const refreshToken = payload.refresh_token ?? "";
      const expiresIn = payload.expires_in ?? 3600;

      if (!accessToken) throw new Error("No access_token in token response");

      const expiresAt = Math.floor(Date.now() / 1000) + expiresIn;
      const apiKeyEnc = encrypt(accessToken);
      const apiSecretEnc = encrypt(refreshToken);
      const apiToken = randomBytes(32).toString("hex");
      const label = "Delta Exchange";
      const meta = JSON.stringify({ auth_mode: "oauth", expires_at: expiresAt });

      const existing = await pool.query(
        `SELECT id FROM broker_accounts WHERE broker_id = 'delta'`,
      );

      let accountId: number;

      if (existing.rows.length > 0) {
        accountId = (existing.rows[0] as { id: number }).id;
        BrokerService.evict(accountId);
        await pool.query(
          `UPDATE broker_accounts
           SET api_key_enc=$1, api_secret_enc=$2, label=$3, is_active=true, api_token=$4, meta=$5
           WHERE id=$6`,
          [apiKeyEnc, apiSecretEnc, label, apiToken, meta, accountId],
        );
      } else {
        const row = await pool.query(
          `INSERT INTO broker_accounts (broker_id, label, api_key_enc, api_secret_enc, api_token, is_active, meta)
           VALUES ('delta', $1, $2, $3, $4, true, $5)
           RETURNING id`,
          [label, apiKeyEnc, apiSecretEnc, apiToken, meta],
        );
        accountId = (row.rows[0] as { id: number }).id;
      }

      logger.info({ accountId, expiresAt }, "delta/oauth/callback: account saved successfully");
      return res.send(popupHtml("success", null, { accountId, apiToken, label }));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "unknown_error";
      logger.error({ err }, "delta/oauth/callback: unhandled error");
      return res.send(popupHtml("error", msg));
    }
  });

  router.get("/delta/oauth/pending-account", async (_req, res) => {
    try {
      const row = await pool.query(
        `SELECT id, label, api_token FROM broker_accounts
         WHERE broker_id = 'delta' AND is_active = true
         ORDER BY id DESC LIMIT 1`,
      );
      if (row.rows.length > 0) {
        const acc = row.rows[0] as { id: number; label: string; api_token: string };
        return res.json({ ok: true, accountId: acc.id, apiToken: acc.api_token, label: acc.label });
      }
      return res.status(404).json({ ok: false, error: "No pending Delta account" });
    } catch (err) {
      logger.warn({ err }, "delta/oauth/pending-account: DB error");
      return res.status(500).json({ ok: false, error: "DB error" });
    }
  });

  router.post("/delta/oauth/refresh", async (req, res) => {
    const { account_id } = req.body as { account_id?: number };
    if (!account_id) {
      res.status(400).json({ ok: false, error: "account_id is required" });
      return;
    }

    try {
      const result = await pool.query(
        `SELECT api_secret_enc FROM broker_accounts WHERE id=$1 AND broker_id='delta'`,
        [account_id],
      );
      if (!result.rows.length) {
        res.status(404).json({ ok: false, error: "Delta account not found" });
        return;
      }

      const row = result.rows[0] as { api_secret_enc: string };
      const refreshToken = decrypt(row.api_secret_enc);

      if (!refreshToken) {
        res.status(400).json({ ok: false, error: "No refresh token stored — please reconnect" });
        return;
      }

      const clientId = process.env["DELTA_CLIENT_ID"]!;
      const clientSecret = process.env["DELTA_CLIENT_SECRET"]!;

      logger.info({ account_id }, "delta/oauth/refresh: requesting new tokens");

      const tokenRes = await fetch(DELTA_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({
          grant_type: "refresh_token",
          refresh_token: refreshToken,
          client_id: clientId,
          client_secret: clientSecret,
        }),
      });

      type RefreshPayload = {
        access_token?: string;
        refresh_token?: string;
        expires_in?: number;
        error?: string;
        message?: string;
      };
      type DeltaRefreshResponse = RefreshPayload & { success?: boolean; result?: RefreshPayload };

      const tokenData = (await tokenRes.json()) as DeltaRefreshResponse;

      if (!tokenRes.ok) {
        const msg = tokenData.error ?? tokenData.message ?? `HTTP ${tokenRes.status}`;
        throw new Error(`Token refresh failed: ${msg}`);
      }

      const payload: RefreshPayload = tokenData.result ?? tokenData;
      const newAccessToken = payload.access_token;
      const newRefreshToken = payload.refresh_token ?? refreshToken;
      const expiresIn = payload.expires_in ?? 3600;

      if (!newAccessToken) throw new Error("No access_token in refresh response");

      const expiresAt = Math.floor(Date.now() / 1000) + expiresIn;
      const meta = JSON.stringify({ auth_mode: "oauth", expires_at: expiresAt });

      BrokerService.evict(account_id);
      await pool.query(
        `UPDATE broker_accounts
         SET api_key_enc=$1, api_secret_enc=$2, meta=$3
         WHERE id=$4 AND broker_id='delta'`,
        [encrypt(newAccessToken), encrypt(newRefreshToken), meta, account_id],
      );

      logger.info({ account_id, expiresAt }, "delta/oauth/refresh: tokens refreshed successfully");
      res.json({ ok: true, expires_at: expiresAt });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "unknown_error";
      logger.error({ err }, "delta/oauth/refresh: failed");
      res.status(502).json({ ok: false, error: msg });
    }
  });

  router.post("/delta/oauth/disconnect", async (req, res) => {
    const { account_id } = req.body as { account_id?: number };
    try {
      if (account_id) {
        BrokerService.evict(account_id);
        await pool.query(`DELETE FROM broker_accounts WHERE id=$1 AND broker_id='delta'`, [account_id]);
      } else {
        const rows = await pool.query(`SELECT id FROM broker_accounts WHERE broker_id='delta'`);
        for (const row of rows.rows as { id: number }[]) {
          BrokerService.evict(row.id);
        }
        await pool.query(`DELETE FROM broker_accounts WHERE broker_id='delta'`);
      }
      res.json({ ok: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "unknown";
      res.status(500).json({ ok: false, error: msg });
    }
  });

  return router;
}

interface AccountPayload {
  accountId: number;
  apiToken: string;
  label: string;
}

function popupHtml(status: "success" | "error", message: string | null, account?: AccountPayload): string {
  const safeMsg = message ? message.replace(/</g, "&lt;").replace(/>/g, "&gt;") : "";
  const safeMessage = JSON.stringify(message ?? "");
  const safeAccountId = account ? String(account.accountId) : "null";
  const safeApiToken = account ? JSON.stringify(account.apiToken) : "null";
  const safeLabel = account ? JSON.stringify(account.label) : "null";

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Delta Exchange OAuth</title>
  <style>
    body { font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center;
           min-height: 100vh; margin: 0; background: #0D1117; color: #F3FFF3; text-align: center; }
    .icon { font-size: 48px; margin-bottom: 12px; }
    h2 { margin: 0 0 8px; font-size: 20px; }
    p { color: rgba(167,184,169,0.7); font-size: 13px; margin-top: 8px; }
    .badge { display:inline-block; margin-top:12px; padding:4px 12px; border-radius:20px;
             font-size:11px; font-weight:600;
             background:${status === "success" ? "rgba(183,255,90,0.12)" : "rgba(239,68,68,0.12)"};
             color:${status === "success" ? "#B7FF5A" : "#f87171"};
             border:1px solid ${status === "success" ? "rgba(183,255,90,0.3)" : "rgba(239,68,68,0.3)"}; }
  </style>
</head>
<body>
  <div>
    <div class="icon">${status === "success" ? "✅" : "❌"}</div>
    <h2>${status === "success" ? "Delta Connected!" : "Connection Failed"}</h2>
    ${safeMsg ? `<p>${safeMsg}</p>` : ""}
    <div class="badge">${status === "success" ? "OAuth 2.0 authenticated" : "Authentication error"}</div>
    <p>${status === "success" ? "You can close this window." : "Please close this window and try again."}</p>
  </div>
  <script>
    (function () {
      var cbStatus = '${status}';
      var accountId = ${safeAccountId};
      var apiToken  = ${safeApiToken};
      var label     = ${safeLabel};

      try {
        window.opener && window.opener.postMessage(
          {
            type: 'delta_oauth_result',
            status: cbStatus,
            message: ${safeMessage},
            accountId: accountId,
            apiToken: apiToken,
            label: label,
          },
          '*'
        );
      } catch (_) {}
      setTimeout(function () { window.close(); }, 1500);
    })();
  </script>
</body>
</html>`;
}

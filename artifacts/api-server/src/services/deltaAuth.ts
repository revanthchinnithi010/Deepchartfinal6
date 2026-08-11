import { buildDeltaAuthHeaders } from "./deltaSigner.js";
import { logger } from "../lib/logger.js";

/**
 * Delta Exchange runs two completely separate platforms with separate API key namespaces.
 * A key from one platform will always return "invalid_api_key" on the other.
 *
 * International : https://api.delta.exchange        / wss://socket.delta.exchange
 * India         : https://api.india.delta.exchange  / wss://socket.india.delta.exchange
 */
export const DELTA_ENVIRONMENTS = [
  {
    name: "international",
    restBase: "https://api.delta.exchange",
    wsUrl:    "wss://socket.delta.exchange",
  },
  {
    name: "india",
    restBase: "https://api.india.delta.exchange",
    wsUrl:    "wss://socket.india.delta.exchange",
  },
] as const;

export type DeltaEnvName = typeof DELTA_ENVIRONMENTS[number]["name"];

export interface DeltaValidationResult {
  valid:       boolean;
  error?:      string;
  usdtBalance?: string;
  walletBalance?: string;
  restBase?:   string;
  wsUrl?:      string;
  envName?:    DeltaEnvName;
}

async function tryEndpoint(
  restBase: string,
  envName: string,
  apiKey: string,
  apiSecret: string,
): Promise<DeltaValidationResult & { restBase: string; wsUrl: string; envName: DeltaEnvName }> {
  const fullPath = "/v2/wallet/balances";
  const method   = "GET";

  logger.info(
    { restBase, envName, method, fullPath, apiKeyLen: apiKey.length },
    "DeltaAuth: trying endpoint",
  );

  const headers = buildDeltaAuthHeaders(method, fullPath, "", "", apiKey, apiSecret);
  const url     = restBase + fullPath;

  logger.debug({ url, timestamp: headers["timestamp"], signatureHead: headers["signature"]?.slice(0, 12) }, "DeltaAuth: request");

  const res = await fetch(url, {
    method,
    headers,
    signal: AbortSignal.timeout(10_000),
  });

  const data = await res.json() as {
    success?: boolean;
    result?:  Array<{ asset_symbol: string; balance: string; available_balance: string }>;
    error?:   { code: string; message?: string };
    message?: string;
  };

  const env = DELTA_ENVIRONMENTS.find(e => e.name === envName)!;

  logger.info(
    { restBase, envName, status: res.status, success: data.success, errorCode: data.error?.code },
    "DeltaAuth: response",
  );

  if (res.status === 401) {
    const code = data.error?.code ?? "unknown";
    const msg  = data.error?.message ?? data.message ?? "Unauthorized";
    logger.warn({ restBase, envName, code, msg }, "DeltaAuth: 401 on this endpoint");
    return { valid: false, error: `${code}: ${msg}`, ...env, envName: env.name };
  }

  if (!res.ok || data.success === false) {
    const msg = data.error?.message ?? data.message ?? `HTTP ${res.status}`;
    logger.warn({ restBase, envName, status: res.status, msg }, "DeltaAuth: non-OK response");
    return { valid: false, error: msg, ...env, envName: env.name };
  }

  const usdt = (data.result ?? []).find(b => b.asset_symbol === "USDT");

  logger.info(
    { restBase, envName, usdtBalance: usdt?.balance, assetsCount: (data.result ?? []).length },
    "DeltaAuth: credentials valid ✓",
  );

  return {
    valid:        true,
    usdtBalance:  usdt?.balance,
    walletBalance: usdt?.available_balance,
    ...env,
    envName: env.name,
  };
}

/**
 * Validate Delta Exchange credentials by probing both the International and India endpoints.
 *
 * Strategy:
 *  1. Try both endpoints concurrently (saves ~1 RTT in the happy path)
 *  2. Accept whichever one succeeds first
 *  3. If both fail, return a combined error message so the user knows both were tried
 *
 * The detected restBase and wsUrl are returned so the caller can persist them in meta,
 * ensuring all subsequent requests (REST + WebSocket) go to the correct environment.
 */
export async function validateDeltaCredentials(
  apiKey: string,
  apiSecret: string,
): Promise<DeltaValidationResult> {
  logger.info({ apiKeyLen: apiKey.length }, "DeltaAuth: probing International + India endpoints concurrently");

  const tries = await Promise.allSettled(
    DELTA_ENVIRONMENTS.map(env =>
      tryEndpoint(env.restBase, env.name, apiKey, apiSecret).catch(err => {
        const msg = String(err);
        const isTimeout = msg.includes("TimeoutError") || msg.includes("timeout");
        logger.error({ env: env.name, err: msg }, "DeltaAuth: fetch error");
        return {
          valid: false as const,
          error: isTimeout ? `${env.name}: connection timed out` : `${env.name}: ${msg}`,
          ...env,
        };
      }),
    ),
  );

  for (const result of tries) {
    if (result.status === "fulfilled" && result.value.valid) {
      return result.value;
    }
  }

  const errors = tries
    .map(r => (r.status === "fulfilled" ? r.value.error : String((r as PromiseRejectedResult).reason)))
    .filter(Boolean)
    .join(" | ");

  logger.error({ errors }, "DeltaAuth: both endpoints rejected credentials");

  return {
    valid: false,
    error:
      `Both Delta environments rejected these credentials — ${errors}. ` +
      "Double-check your API key and secret on delta.exchange or india.delta.exchange.",
  };
}

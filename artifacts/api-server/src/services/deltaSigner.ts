import { createHmac } from "crypto";
import { logger } from "../lib/logger.js";

/**
 * Delta Exchange HMAC-SHA256 request signing.
 *
 * Payload (per Delta docs):
 *   METHOD + TIMESTAMP + FULL_PATH + QUERY_STRING + BODY
 *
 * Rules:
 *  - METHOD   : uppercase (GET, POST, DELETE)
 *  - TIMESTAMP: Math.floor(Date.now() / 1000).toString()  — seconds, NOT milliseconds
 *  - FULL_PATH: must include the /v2 prefix (e.g. "/v2/wallet/balances")
 *  - QUERY    : raw query string WITHOUT leading "?", empty string when absent
 *  - BODY     : serialised JSON string, empty string ("") for GET requests
 */
export function signDeltaRequest(
  method: string,
  fullPath: string,
  queryString: string,
  body: string,
  timestamp: number,
  apiSecret: string,
): string {
  const payload =
    method.toUpperCase() +
    String(timestamp) +
    fullPath +
    (queryString ? "?" + queryString : "") +
    body;

  logger.debug(
    { method: method.toUpperCase(), fullPath, queryString: queryString || "(none)", bodyLen: body.length, timestamp, payload },
    "DeltaSigner: payload",
  );

  const signature = createHmac("sha256", apiSecret).update(payload).digest("hex");

  logger.debug({ signature }, "DeltaSigner: signature");

  return signature;
}

export function buildDeltaAuthHeaders(
  method: string,
  fullPath: string,
  queryString: string,
  body: string,
  apiKey: string,
  apiSecret: string,
): Record<string, string> {
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = signDeltaRequest(method, fullPath, queryString, body, timestamp, apiSecret);

  logger.debug(
    { method: method.toUpperCase(), fullPath, timestamp, apiKeyLen: apiKey.length, signatureHead: signature.slice(0, 12) },
    "DeltaSigner: headers built",
  );

  return {
    "api-key":       apiKey,
    "timestamp":     String(timestamp),
    "signature":     signature,
    "Content-Type":  "application/json",
    "Accept":        "application/json",
    "User-Agent":    "TradeVault/1.0",
  };
}

/**
 * Build the WebSocket auth message for Delta Exchange.
 * Payload: "GET" + timestamp + "/live"
 */
export function buildDeltaWsAuthPayload(
  apiKey: string,
  apiSecret: string,
): { type: string; payload: { "api-key": string; signature: string; timestamp: string } } {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const wsPayload  = "GET" + timestamp + "/live";

  logger.debug({ wsPayload, apiKeyLen: apiKey.length }, "DeltaSigner: WS auth payload");

  const signature = createHmac("sha256", apiSecret).update(wsPayload).digest("hex");

  return { type: "auth", payload: { "api-key": apiKey, signature, timestamp } };
}

import { z } from "zod";
import type { Request, Response, NextFunction } from "express";
import { logger } from "../lib/logger.js";

// ── Shared primitives ─────────────────────────────────────────────────────────

const positiveNumStr = z
  .string()
  .regex(/^\d+(\.\d+)?$/, "Must be a positive numeric string (e.g. '0.01')")
  .refine(v => parseFloat(v) > 0, "Must be greater than zero");

const optPositiveNumStr = positiveNumStr.optional();

// ── Order placement schema ────────────────────────────────────────────────────

export const PlaceOrderSchema = z.object({
  symbol:           z.string().min(1, "symbol is required").max(30),
  side:             z.enum(["Buy", "Sell"], { message: "side must be 'Buy' or 'Sell'" }),
  orderType:        z.enum(["Market", "Limit", "Stop", "StopLimit"], {
    message: "orderType must be 'Market', 'Limit', 'Stop', or 'StopLimit'",
  }),
  qty:              positiveNumStr,
  price:            optPositiveNumStr,
  stopPrice:        optPositiveNumStr,
  takeProfitPrice:  optPositiveNumStr,
  stopLossPrice:    optPositiveNumStr,
  timeInForce:      z.enum(["GTC", "IOC", "FOK"]).optional(),
  reduceOnly:       z.boolean().optional(),
  postOnly:         z.boolean().optional(),
  clientOrderId:    z.string().max(64).optional(),
}).superRefine((data, ctx) => {
  if ((data.orderType === "Limit" || data.orderType === "StopLimit") && !data.price) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["price"],
      message: `price is required for ${data.orderType} orders`,
    });
  }
  if ((data.orderType === "Stop" || data.orderType === "StopLimit") && !data.stopPrice) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["stopPrice"],
      message: `stopPrice is required for ${data.orderType} orders`,
    });
  }
});

export type PlaceOrderBody = z.infer<typeof PlaceOrderSchema>;

// ── Close position schema ─────────────────────────────────────────────────────

export const ClosePositionSchema = z.object({
  side: z.enum(["Long", "Short"], { message: "side must be 'Long' or 'Short'" }),
  size: z.number().positive("size must be a positive number"),
});

// ── Modify order schema (for TP/SL amendment) ────────────────────────────────

export const ModifyOrderSchema = z.object({
  price:           optPositiveNumStr,
  stopPrice:       optPositiveNumStr,
  takeProfitPrice: optPositiveNumStr,
  stopLossPrice:   optPositiveNumStr,
  qty:             optPositiveNumStr,
}).refine(
  obj => obj.price || obj.stopPrice || obj.takeProfitPrice || obj.stopLossPrice || obj.qty,
  "At least one field must be provided",
);

// ── Validation middleware factory ─────────────────────────────────────────────

export function validate<T extends z.ZodTypeAny>(schema: T) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const errors = result.error.errors.map(e => ({
        field:   e.path.join("."),
        message: e.message,
      }));
      logger.warn({ errors, path: req.path }, "validateOrder: invalid request body");
      res.status(400).json({ ok: false, error: "Validation failed", errors });
      return;
    }
    req.body = result.data;
    next();
  };
}

// ── Pre-built validators ──────────────────────────────────────────────────────

export const validatePlaceOrder     = validate(PlaceOrderSchema);
export const validateClosePosition  = validate(ClosePositionSchema);
export const validateModifyOrder    = validate(ModifyOrderSchema);

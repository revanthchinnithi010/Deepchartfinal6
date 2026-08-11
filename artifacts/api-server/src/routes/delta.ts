import { Router, type IRouter } from "express";
import { z } from "zod";
import type { DeltaService } from "../services/DeltaService.js";

const ConnectBody = z.object({
  apiKey:    z.string().optional(),
  apiSecret: z.string().optional(),
});

export function createDeltaRouter(delta: DeltaService): IRouter {
  const router: IRouter = Router();

  router.get("/delta/status", (_req, res): void => {
    res.json(delta.getStatus());
  });

  router.post("/delta/connect", async (req, res): Promise<void> => {
    const parsed = ConnectBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: "Invalid input" });
      return;
    }
    const result = await delta.connect(parsed.data.apiKey, parsed.data.apiSecret);
    res.json(result);
  });

  router.delete("/delta/connect", async (_req, res): Promise<void> => {
    await delta.disconnect();
    res.json({ success: true, connected: false });
  });

  router.post("/delta/test", async (_req, res): Promise<void> => {
    const result = await delta.test();
    res.json(result);
  });

  return router;
}

import { Router, type IRouter } from "express";
import { z } from "zod";
import type { TelegramService } from "../services/TelegramService.js";

const ConfigBody = z.object({
  token:  z.string().min(20, "Bot token is too short"),
  chatId: z.string().min(1, "Chat ID is required"),
});

const ToggleBody = z.object({
  enabled: z.boolean(),
});

export function createTelegramRouter(telegram: TelegramService): IRouter {
  const router: IRouter = Router();

  router.get("/telegram/status", (_req, res): void => {
    res.json(telegram.getStatus());
  });

  router.get("/telegram/config", (_req, res): void => {
    res.json(telegram.getStatus());
  });

  router.post("/telegram/config", async (req, res): Promise<void> => {
    const parsed = ConfigBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" });
      return;
    }
    const result = await telegram.configure(parsed.data.token, parsed.data.chatId);
    res.json(result);
  });

  router.delete("/telegram/config", async (_req, res): Promise<void> => {
    await telegram.disconnect();
    res.json({ success: true, configured: false });
  });

  /** Global enable/disable toggle — keeps credentials, suppresses/restores delivery. */
  router.patch("/telegram/toggle", async (req, res): Promise<void> => {
    const parsed = ToggleBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: "enabled (boolean) is required" });
      return;
    }
    await telegram.setGlobalEnabled(parsed.data.enabled);
    res.json({ success: true, globalEnabled: parsed.data.enabled });
  });

  router.post("/telegram/test", async (_req, res): Promise<void> => {
    const status = telegram.getStatus();
    if (!status.configured) {
      res.status(200).json({
        success:    false,
        configured: false,
        error:      "Telegram not configured — connect your bot first",
      });
      return;
    }
    const result = await telegram.sendTestMessage();
    res.status(200).json(result);
  });

  return router;
}

/**
 * Backs the admin Messaging tab (Customer/Driver) -- a straight read/write over
 * notifications/message-catalog.ts's MESSAGE_CATALOG, the single source of truth for
 * both what the app can send and what each entry's settings keys are. Deliberately
 * its own small route file rather than folded into auth/admin.routes.ts's generic
 * /settings endpoints: those reject any key not already in SETTINGS_SPEC, and every
 * message here needs a paired enabled-flag key that has no reason to also appear on
 * the old flat Settings screen.
 */
import { Router } from "express";
import { getSetting, setSetting } from "../../db/settings.repo";
import { isMessageEnabled, MESSAGE_CATALOG } from "../../notifications/message-catalog";

export function dashboardMessagingRoutes(): Router {
  const router = Router();

  router.get("/", async (_req, res) => {
    try {
      const items = await Promise.all(MESSAGE_CATALOG.map(async def => {
        const [enabled, body, title] = await Promise.all([
          isMessageEnabled(def.id),
          getSetting(def.bodyKey, def.bodyFallback),
          def.titleKey ? getSetting(def.titleKey, def.titleFallback || "") : Promise.resolve(undefined)
        ]);
        return {
          id: def.id,
          audience: def.audience,
          channel: def.channel,
          label: def.label,
          hint: def.hint,
          variables: def.variables,
          enabled,
          hasTitle: Boolean(def.titleKey),
          title,
          titleFallback: def.titleFallback,
          body,
          bodyFallback: def.bodyFallback
        };
      }));
      res.status(200).json({ items });
    } catch (error) {
      res.status(500).json({ error: { code: "MESSAGES_FETCH_FAILED", message: "Failed to load messages." } });
    }
  });

  router.post("/:id/toggle", async (req, res) => {
    const def = MESSAGE_CATALOG.find(m => m.id === req.params.id);
    if (!def) {
      res.status(404).json({ error: { code: "UNKNOWN_MESSAGE", message: "Unknown message id." } });
      return;
    }
    const enabled = Boolean(req.body?.enabled);
    await setSetting(def.enabledKey, enabled ? "true" : "false");
    res.status(200).json({ ok: true, enabled });
  });

  router.post("/:id", async (req, res) => {
    const def = MESSAGE_CATALOG.find(m => m.id === req.params.id);
    if (!def) {
      res.status(404).json({ error: { code: "UNKNOWN_MESSAGE", message: "Unknown message id." } });
      return;
    }
    if (typeof req.body?.body === "string") await setSetting(def.bodyKey, req.body.body);
    if (def.titleKey && typeof req.body?.title === "string") await setSetting(def.titleKey, req.body.title);
    res.status(200).json({ ok: true });
  });

  return router;
}

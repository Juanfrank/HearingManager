import { Router } from "express";
import { sendChatMessage } from "../graph/client";
import { logAudit } from "../services/auditLog";
import type { AuthedRequest } from "../auth/verifyTeamsToken";

export const messagesRouter = Router();

/** docs §5.6: POST /chats/{chat-id}/messages (mocked until Graph is real). */
messagesRouter.post("/", async (req, res) => {
  const { toEmail, text } = req.body as { toEmail: string; text: string };
  const fromEmail = (req as AuthedRequest).actorEmail ?? "unknown@local";
  try {
    const result = await sendChatMessage(toEmail, fromEmail, text);
    await logAudit({
      actorEmail: fromEmail,
      action: "message.send",
      after: { toEmail, text, mocked: result.mocked },
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

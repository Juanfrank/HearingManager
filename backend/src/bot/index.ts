import { ActivityHandler, TurnContext } from "botbuilder";
import { applyRosterEvent } from "../routes/roster";
import { broadcastState, setRosterStale } from "../ws";

/**
 * Bot Framework adapter (docs §2, §5.1): joins/is added to the meeting,
 * receives conversationUpdate roster events, and is the source of truth
 * for "who is currently connected." Runs the SAME applyRosterEvent() the
 * dev HTTP endpoint (routes/roster.ts) uses, so there is one code path
 * for "a roster event happened" regardless of where it came from.
 */
export class HearingRosterBot extends ActivityHandler {
  constructor() {
    super();

    this.onConversationUpdate(async (context: TurnContext, next) => {
      const activity = context.activity;

      try {
        for (const member of activity.membersAdded ?? []) {
          if (!member.aadObjectId) continue;
          await applyRosterEvent(
            member.aadObjectId, // real deployment: resolve to email via Graph /users/{id}
            member.name ?? member.aadObjectId,
            "joined",
          );
        }
        for (const member of activity.membersRemoved ?? []) {
          if (!member.aadObjectId) continue;
          await applyRosterEvent(member.aadObjectId, member.name ?? member.aadObjectId, "left");
        }
        await broadcastState();
        setRosterStale(false);
      } catch (err) {
        // docs §7: if roster ingestion breaks mid-hearing, surface staleness
        // rather than silently showing outdated presence.
        console.error("[bot] roster event handling failed", err);
        setRosterStale(true);
      }

      await next();
    });
  }
}

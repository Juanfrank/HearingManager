import { ActivityHandler, TurnContext } from "botbuilder";
import { applyRosterEvent } from "../routes/roster";
import { broadcastState, setRosterStale } from "../ws";

/**
 * Bot Framework adapter (docs §2, §5.1): joins/is added to the meeting,
 * receives conversationUpdate roster events, and is the source of truth
 * for "who is currently connected." Runs the SAME applyRosterEvent() the
 * dev HTTP endpoint (routes/roster.ts) uses, so there is one code path
 * for "a roster event happened" regardless of where it came from.
 *
 * activity.conversation.id is the SAME meeting/conversation id the tab
 * resolves from its own Teams context (tab/src/teamsContext.ts) — Teams
 * hands it to the bot on every activity for free, which is exactly what
 * scopes each roster event to the right Meeting without any manual
 * "which meeting is this" bookkeeping on our side.
 */
export class HearingRosterBot extends ActivityHandler {
  constructor() {
    super();

    this.onConversationUpdate(async (context: TurnContext, next) => {
      const activity = context.activity;
      const meetingId = activity.conversation?.id;

      if (!meetingId) {
        console.error("[bot] conversationUpdate activity had no conversation.id, dropping");
        await next();
        return;
      }

      try {
        for (const member of activity.membersAdded ?? []) {
          if (!member.aadObjectId) continue;
          await applyRosterEvent(
            meetingId,
            member.aadObjectId, // real deployment: resolve to email via Graph /users/{id}
            member.name ?? member.aadObjectId,
            "joined",
          );
        }
        for (const member of activity.membersRemoved ?? []) {
          if (!member.aadObjectId) continue;
          await applyRosterEvent(
            meetingId,
            member.aadObjectId,
            member.name ?? member.aadObjectId,
            "left",
          );
        }
        await broadcastState(meetingId);
        setRosterStale(meetingId, false);
      } catch (err) {
        // docs §7: if roster ingestion breaks mid-hearing, surface staleness
        // rather than silently showing outdated presence — scoped to just
        // this meeting, not every concurrent one this bot instance serves.
        console.error("[bot] roster event handling failed", err);
        setRosterStale(meetingId, true);
      }

      await next();
    });
  }
}

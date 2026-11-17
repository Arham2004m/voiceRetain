import type { TranscriptTurnDTO } from "@voiceretain/shared";
import { formatLatency } from "@/lib/format";

/** Agent on the left, customer on the right, system events centred. */
export function TranscriptChat({
  turns,
  showLatency = false,
}: {
  turns: TranscriptTurnDTO[];
  /** Under each agent line, how long the agent took to answer. */
  showLatency?: boolean;
}) {
  if (turns.length === 0) return <p className="text-ink-soft">No conversation yet.</p>;

  return (
    <ol aria-label="Transcript" className="flex flex-col gap-2.5">
      {turns.map((t) => {
        const style =
          t.speaker === "AGENT"
            ? "bg-paper text-ink border-ink self-start border-2"
            : t.speaker === "CUSTOMER"
              ? "bg-marigold text-ink border-ink self-end border-2"
              : "text-ink-soft border-ink/30 self-center border border-dashed text-sm";
        return (
          <li
            key={t.id}
            data-speaker={t.speaker}
            className={`max-w-[85%] px-3.5 py-2.5 leading-snug ${style}`}
          >
            <p>{t.text}</p>
            {showLatency && t.speaker === "AGENT" && t.latencyMs !== null ? (
              <p className="num text-ink-soft mt-1 text-xs">{formatLatency(t.latencyMs)}</p>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

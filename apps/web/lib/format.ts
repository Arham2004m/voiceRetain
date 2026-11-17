/** `0.6667` → `67%` */
export const formatPercent = (ratio: number) => `${Math.round(ratio * 100)}%`;

/** `102` → `1:42` */
export const formatDuration = (seconds: number | null | undefined) =>
  seconds === null || seconds === undefined
    ? "—"
    : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

/** `1840` → `1.8 s`; `null` → `—` */
export const formatLatency = (ms: number | null | undefined) =>
  ms === null || ms === undefined ? "—" : `${(ms / 1000).toFixed(1)} s`;

const when = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
});
/** `2026-11-05T11:11:00Z` → `5 Nov, 4:41 pm` (in the viewer's time zone) */
export const formatWhen = (iso: string | null | undefined) =>
  iso ? when.format(new Date(iso)) : "—";

const weekday = new Intl.DateTimeFormat("en-IN", { weekday: "short", timeZone: "UTC" });
/** `2026-11-17` (an Indian calendar day) → `Tue` */
export const formatWeekday = (isoDay: string) => weekday.format(new Date(`${isoDay}T12:00:00Z`));

/** `9876543210` → `98765 43210` */
export const formatPhone = (p: string) => (p.length === 10 ? `${p.slice(0, 5)} ${p.slice(5)}` : p);

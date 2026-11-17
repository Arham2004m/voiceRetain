import { describe, expect, it } from "vitest";
import { formatDuration, formatLatency, formatPercent, formatWeekday } from "../format";

describe("format", () => {
  it("formats ratios as whole percentages", () => {
    expect(formatPercent(0)).toBe("0%");
    expect(formatPercent(0.6667)).toBe("67%");
    expect(formatPercent(1)).toBe("100%");
  });

  it("formats call lengths as m:ss, with a dash when unknown", () => {
    expect(formatDuration(102)).toBe("1:42");
    expect(formatDuration(5)).toBe("0:05");
    expect(formatDuration(null)).toBe("—");
  });

  it("formats latency in seconds, with a dash when unknown", () => {
    expect(formatLatency(1840)).toBe("1.8 s");
    expect(formatLatency(400)).toBe("0.4 s");
    expect(formatLatency(null)).toBe("—");
  });

  it("names the weekday of an Indian calendar day", () => {
    expect(formatWeekday("2026-11-17")).toBe("Tue");
    expect(formatWeekday("2026-11-15")).toBe("Sun");
  });
});

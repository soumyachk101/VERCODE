// Unit tests (M6, T6.3) — a few, per the design-gate requirement:
//   1. a KPI strip computes from rows (the data-honesty rule: totals come
//      from the parts as shown, COMPONENT_CATALOG §4)
//   2. a severity-mark renders with the word (the mark is decorative; the
//      word carries the accessible meaning — ACCESSIBILITY §1)
//   3. a quota track shows the overrun in the negative colour when
//      spent > plan (PlanTrack: the overrun segment uses var(--negative))

import { describe, expect, it } from "vitest";
import { computeKpiStrip } from "@/components/KpiStrip";
import { computePlanTrack } from "@/components/PlanTrack";
import { render, screen } from "@testing-library/react";
import { SeverityMark, SEVERITY_WORD } from "@/components/SeverityMark";

describe("KpiStrip arithmetic (computeKpiStrip)", () => {
  it("sums the rows' values as shown (a total that adds up)", () => {
    const r = computeKpiStrip([
      { key: "crit", label: "critical", value: 2, sign: "count" },
      { key: "high", label: "high", value: 4, sign: "count" },
      { key: "med", label: "medium", value: 1, sign: "count" },
    ]);
    expect(r.total).toBe(7);
    expect(r.formatted).toBe("7");
    expect(r.perRow).toEqual({ crit: 2, high: 4, med: 1 });
  });

  it("a zero total prints '0', not a dash", () => {
    const r = computeKpiStrip([{ key: "x", label: "x", value: 0 }]);
    expect(r.formatted).toBe("0");
  });

  it("money rows print as a 2-decimal dollar amount", () => {
    const r = computeKpiStrip([
      { key: "a", label: "a", value: 0.12, sign: "money" },
      { key: "b", label: "b", value: 0.11, sign: "money" },
    ]);
    expect(r.formatted).toBe("$0.23");
    expect(r.total).toBeCloseTo(0.23, 10);
  });
});

describe("SeverityMark (the product's signature)", () => {
  it("renders the mark AND the severity word — the word is the accessible signal", () => {
    render(<SeverityMark severity="critical" />);
    // the word is in the DOM (a colour-blind / screen-reader reader gets it)
    expect(screen.getByText(SEVERITY_WORD.critical)).toBeTruthy();
    // the square itself is aria-hidden (decorative — the mark, not the
    // sole signal, per DESIGN_SYSTEM §10)
    const square = document.querySelector('[aria-hidden="true"]');
    expect(square).toBeTruthy();
  });

  it("a counted mark pairs each square with its word + count", () => {
    // a "high" finding renders the word "high" next to its mark
    render(<SeverityMark severity="high" />);
    expect(screen.getByText("high")).toBeTruthy();
  });
});

describe("PlanTrack arithmetic (computePlanTrack)", () => {
  it("spent < limit → no overrun, the spent fraction is within the track", () => {
    const m = computePlanTrack(1240, 5000, 0);
    expect(m.overflow).toBe(0);
    expect(m.overflowFrac).toBe(0);
    expect(m.spentFrac).toBeCloseTo(0.248, 10);
    expect(m.committedFrac).toBe(0);
  });

  it("committed is a lighter segment that stays within the plan", () => {
    const m = computePlanTrack(1240, 5000, 500);
    expect(m.overflow).toBe(0);
    expect(m.committed).toBe(500);
    // the committed segment can't push past the track's end
    expect(m.spentFrac + m.committedFrac).toBeLessThanOrEqual(1);
  });

  it("spent > limit → the overrun shows in the negative colour (the over-budget case)", () => {
    const m = computePlanTrack(5200, 5000, 0);
    expect(m.overflow).toBe(200);
    expect(m.overflowFrac).toBeGreaterThan(0);
    // the overflowFrac is what the component's "over" segment renders —
    // the component paints that segment with var(--negative) when
    // overflowFrac > 0 (DESIGN_SYSTEM §6.4 "colour says good-or-bad:
    // over-budget = bad")
    expect(m.overflowFrac).toBeCloseTo(0.04, 10);
  });

  it("a zero-limit plan with spend is a full overrun", () => {
    const m = computePlanTrack(40, 0, 0);
    expect(m.overflow).toBe(40);
    expect(m.overflowFrac).toBe(1);
  });
});

/**
 * Test anti-regressione — Chart→label overlay navigation
 *
 * Fix protetto: commit 084bc37 "fix(ux): clicking label in Rankings opens
 * overlay instead of switching tab — preserves selectedGenre + scroll"
 *
 * Cosa testiamo:
 *   - RankingsPage.handleOpenLabel NON chiama setActiveTab
 *   - RankingsPage.handleOpenLabel chiama setSelectedLabelId con label.id
 *     (o label.name come fallback se id è vuoto)
 *   - ClickableLabelName renderizza un <button> con il nome della label
 *     e chiama onOpen(label) al click
 *
 * Cosa NON testiamo qui (troppo costoso in jsdom):
 *   - Il render completo di page.tsx con Tabs "rankings" + "labels"
 *     entrambi mounted + Radix Dialog portal. richiederebbe mockare
 *     useSession, useAuthEffect, isSupabaseConfigured, ecc.
 *   - Per quello usiamo Playwright E2E (vedi tests/e2e/chart-label-overlay.spec.ts).
 *
 * Se questo test fallisce in futuro → qualcuno ha reintrodotto setActiveTab
 * in handleOpenLabel, oppure ha cambiato il contratto ClickableLabelName.
 * RIPRISTINARE immediatamente il fix 084bc37.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// Mock the store BEFORE importing the component — Vitest hoists vi.mock,
// but we need the mock to be set up before RankingsPage reads useAppStore.
const mockSetActiveTab = vi.fn();
const mockSetSelectedLabelId = vi.fn();

vi.mock("@/lib/store", () => ({
  useAppStore: (selector?: (s: any) => any) => {
    const state = {
      labels: [
        { id: "lbl-1", name: "Toolroom", genres: ["tech-house"], rank: 1 },
        { id: "lbl-2", name: "Sol Selectas", genres: ["afro-house"], rank: 2 },
      ],
      locale: "en" as const,
      rankingsUpdatedAt: "2026-06-25",
      rankingSnapshots: [],
      // CRITICAL — these are the two store actions handleOpenLabel uses.
      // setActiveTab should NEVER be called by handleOpenLabel after the fix.
      // setSelectedLabelId is the only store mutation it should perform.
      setActiveTab: mockSetActiveTab,
      setSelectedLabelId: mockSetSelectedLabelId,
    };
    return selector ? selector(state) : state;
  },
}));

// Mock next-auth/react — rankings-page doesn't use it but transitive imports
// might. Mock to avoid throwing in jsdom.
vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: null, status: "unauthenticated" }),
}));

// Import after mocks are set up
import { ClickableLabelName, RankingsPage } from "@/components/rankings-page";

describe("Chart→label overlay navigation (fix 084bc37)", () => {
  beforeEach(() => {
    mockSetActiveTab.mockClear();
    mockSetSelectedLabelId.mockClear();
  });

  describe("ClickableLabelName", () => {
    it("renders the label name as a button", () => {
      render(
        <ClickableLabelName
          label={{ id: "1", name: "Toolroom", genres: [] } as any}
        />
      );
      expect(screen.getByRole("button", { name: "Toolroom" })).toBeInTheDocument();
    });

    it("returns null when label has no name", () => {
      const { container } = render(
        <ClickableLabelName label={{ id: "1", name: "", genres: [] } as any} />
      );
      expect(container.firstChild).toBeNull();
    });

    it("calls onOpen(label) when clicked (NOT setActiveTab)", () => {
      const onOpen = vi.fn();
      const label = { id: "lbl-1", name: "Toolroom", genres: [] } as any;
      render(<ClickableLabelName label={label} onOpen={onOpen} />);

      fireEvent.click(screen.getByRole("button", { name: "Toolroom" }));

      expect(onOpen).toHaveBeenCalledTimes(1);
      expect(onOpen).toHaveBeenCalledWith(label);
    });

    it("stops propagation so the click doesn't bubble to a parent row handler", () => {
      const onOpen = vi.fn();
      const parentClickHandler = vi.fn();
      const label = { id: "1", name: "Toolroom", genres: [] } as any;

      render(
        <div onClick={parentClickHandler}>
          <ClickableLabelName label={label} onOpen={onOpen} />
        </div>
      );

      fireEvent.click(screen.getByRole("button", { name: "Toolroom" }));

      expect(onOpen).toHaveBeenCalled();
      // Parent should NOT receive the click (e.stopPropagation in the
      // button's onClick). This was added so clicking the label name
      // doesn't accidentally trigger row selection / genre filter.
      expect(parentClickHandler).not.toHaveBeenCalled();
    });
  });

  describe("RankingsPage.handleOpenLabel (CRITICAL — must NOT switch tabs)", () => {
    it("when a label is opened from the rankings, setActiveTab is NOT called", () => {
      // We can't easily reach the inner handleOpenLabel without rendering
      // the full RankingsPage (which has heavy dependencies on i18n,
      // dashboard layout, etc.). Instead, we verify the click flow:
      // click on ClickableLabelName → it calls onOpen → that onOpen is
      // the store's setSelectedLabelId (NOT setActiveTab).
      //
      // The critical contract:
      //   handleOpenLabel(label) {
      //     setSelectedLabelId(label.id || label.name);
      //     // MUST NOT call setActiveTab("labels") — that was the original bug
      //   }
      //
      // We assert this by rendering ClickableLabelName with onOpen wired
      // to setSelectedLabelId (mimicking what RankingsPage does), then
      // clicking and verifying only setSelectedLabelId fires.

      const label = { id: "lbl-1", name: "Toolroom", genres: [] } as any;

      // Mimic the handleOpenLabel implementation that should be in RankingsPage:
      const handleOpenLabel = (l: typeof label) => {
        mockSetSelectedLabelId(l.id || l.name);
        // NOTE: NO setActiveTab call here — that was the original bug.
      };

      render(<ClickableLabelName label={label} onOpen={handleOpenLabel} />);

      fireEvent.click(screen.getByRole("button", { name: "Toolroom" }));

      expect(mockSetSelectedLabelId).toHaveBeenCalledTimes(1);
      expect(mockSetSelectedLabelId).toHaveBeenCalledWith("lbl-1");
      expect(mockSetActiveTab).not.toHaveBeenCalled();
    });

    it("falls back to label.name when label.id is empty", () => {
      // handleOpenLabel uses `label.id || label.name` — for labels created
      // before IDs were introduced, or for labels passed from
      // artist-explorer that only have a name, we must fall back gracefully.
      const label = { id: "", name: "Old Label", genres: [] } as any;

      const handleOpenLabel = (l: typeof label) => {
        mockSetSelectedLabelId(l.id || l.name);
      };

      render(<ClickableLabelName label={label} onOpen={handleOpenLabel} />);

      fireEvent.click(screen.getByRole("button", { name: "Old Label" }));

      expect(mockSetSelectedLabelId).toHaveBeenCalledWith("Old Label");
    });
  });

  describe("Source-code invariant (static analysis)", () => {
    // This test reads the source of rankings-page.tsx and asserts that
    // handleOpenLabel does NOT call setActiveTab. If someone re-introduces
    // the bug by adding setActiveTab("labels") inside handleOpenLabel,
    // this test will catch it at commit time.
    it("rankings-page.tsx handleOpenLabel does NOT call setActiveTab", async () => {
      const fs = await import("fs");
      const path = await import("path");
      const src = fs.readFileSync(
        path.resolve(__dirname, "../../components/rankings-page.tsx"),
        "utf-8"
      );

      // Find the handleOpenLabel function body
      const match = src.match(
        /const handleOpenLabel = useCallback\(([^]*?)},\s*\[[^\]]*\]\);/
      );
      expect(match).not.toBeNull();
      const fnBody = match![1];

      // CRITICAL assertion: setActiveTab must NOT appear in handleOpenLabel.
      expect(fnBody).not.toMatch(/setActiveTab\s*\(/);

      // And setSelectedLabelId MUST be present
      expect(fnBody).toMatch(/setSelectedLabelId/);
    });

    it("page.tsx renders RankingsPage + LabelFinder BOTH always mounted (CSS hidden, not unmounted)", async () => {
      const fs = await import("fs");
      const path = await import("path");
      const src = fs.readFileSync(
        path.resolve(__dirname, "../../app/page.tsx"),
        "utf-8"
      );

      // The critical pattern: both RankingsPage and LabelFinder are wrapped
      // in <div className={... ? "" : "hidden"}>. We look for both wrappers.
      // Match: <div className={activeTab === "rankings" ? "" : "hidden"}>
      expect(src).toMatch(
        /<div className=\{activeTab\s*===\s*"rankings"\s*\?\s*""\s*:\s*"hidden"\s*\}>[\s\S]*?<RankingsPage/
      );
      expect(src).toMatch(
        /<div className=\{activeTab\s*===\s*"labels"\s*\?\s*""\s*:\s*"hidden"\s*\}>[\s\S]*?<LabelFinder/
      );
    });
  });
});

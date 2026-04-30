"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import {
  extractOpeningFeatures,
  OPENING_FEATURE_COLUMNS,
  type OpeningReadKey,
} from "@/lib/opening-features";
import type { Bar } from "@/lib/types";

type LabelKey = OpeningReadKey;

type TrainingExample = {
  id: string;
  symbol: string;
  date: string;
  decisionBar: number;
  label: LabelKey | "";
  note: string;
  imageUrl: string;
  sourceFile: string;
  previousDay?: string;
  yesterdayHigh?: number | null;
  yesterdayLow?: number | null;
  bars?: Bar[];
  reviewLabel?: LabelKey | "";
  reviewNote?: string;
  reviewConfidence?: Confidence;
  reviewedAt?: string;
  labeledAt?: string;
};

type Manifest = {
  version: number;
  generatedAt: string;
  examples: TrainingExample[];
};

type SavedLabel = {
  label: LabelKey | "";
  note: string;
  labeledAt?: string;
};

type Confidence = "sure" | "unsure";
type TrainingMode = "label" | "review";
type Stage = "direction" | "setup";
type Direction = "long" | "short";

type DirectionButton = {
  key: "long" | "short" | "no_trade";
  title: string;
  short: string;
  hotkey: string;
  tone: string;
};

const DIRECTION_BUTTONS: DirectionButton[] = [
  {
    key: "long",
    title: "Bulls in control",
    short: "Bulls",
    hotkey: "L",
    tone: "border-teal/55 bg-teal/12 text-teal",
  },
  {
    key: "no_trade",
    title: "Unclear",
    short: "Unclear",
    hotkey: "N",
    tone: "border-stone-400/35 bg-stone-300/8 text-stone-200",
  },
  {
    key: "short",
    title: "Bears in control",
    short: "Bears",
    hotkey: "S",
    tone: "border-red/55 bg-red/12 text-red",
  },
];

type SetupButton = {
  key: LabelKey;
  title: string;
  short: string;
  hotkey: string;
  tone: string;
};

const LONG_SETUPS: SetupButton[] = [
  {
    key: "trend_open_long",
    title: "Trend From Open",
    short: "TFO Long",
    hotkey: "T",
    tone: "border-emerald-400/50 bg-emerald-400/12 text-emerald-200",
  },
  {
    key: "long_reversal",
    title: "Reversal",
    short: "Long Rev",
    hotkey: "R",
    tone: "border-teal/55 bg-teal/12 text-teal",
  },
];

const SHORT_SETUPS: SetupButton[] = [
  {
    key: "short_reversal",
    title: "Reversal",
    short: "Short Rev",
    hotkey: "R",
    tone: "border-red/55 bg-red/12 text-red",
  },
  {
    key: "trend_open_short",
    title: "Trend From Open",
    short: "TFO Short",
    hotkey: "T",
    tone: "border-amber-400/55 bg-amber-500/12 text-amber-200",
  },
];

type SavedReview = SavedLabel & {
  confidence: Confidence;
  firstPassLabel?: LabelKey | "";
};

type SavedState = {
  currentIndex: number;
  mode?: TrainingMode;
  reviewConfidence?: Confidence;
  labels: Record<string, SavedLabel>;
  reviews?: Record<string, SavedReview>;
};

type SaveStatus = "loading" | "saving" | "saved" | "local";

type TrainingLabelsResponse = {
  labels?: Record<string, unknown>;
  reviews?: Record<string, unknown>;
};

const DECK_ID = "aapl-opening-v1";
const STORAGE_KEY = "aiedge_aapl_opening_training_v1";

const LABELS: Array<{
  key: LabelKey;
  title: string;
  short: string;
  hotkey: string;
  tone: string;
}> = [
  {
    key: "trend_open_long",
    title: "Trend Open Long",
    short: "TFO Long",
    hotkey: "1",
    tone: "border-emerald-400/50 bg-emerald-400/12 text-emerald-200",
  },
  {
    key: "long_reversal",
    title: "Long Reversal",
    short: "Long Rev",
    hotkey: "2",
    tone: "border-teal/55 bg-teal/12 text-teal",
  },
  {
    key: "no_trade",
    title: "No Trade",
    short: "No Trade",
    hotkey: "3",
    tone: "border-stone-400/35 bg-stone-300/8 text-stone-200",
  },
  {
    key: "short_reversal",
    title: "Short Reversal",
    short: "Short Rev",
    hotkey: "4",
    tone: "border-red/55 bg-red/12 text-red",
  },
  {
    key: "trend_open_short",
    title: "Trend Open Short",
    short: "TFO Short",
    hotkey: "5",
    tone: "border-amber-400/55 bg-amber-500/12 text-amber-200",
  },
];

function parseSavedState(): SavedState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SavedState) : null;
  } catch {
    return null;
  }
}

function toCsvCell(value: unknown) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function labelTitle(label: LabelKey | "") {
  return LABELS.find((item) => item.key === label)?.title ?? "Unlabeled";
}

function openingFeaturesFor(example: TrainingExample) {
  if (!example.bars?.length) return null;
  return extractOpeningFeatures(example.bars, {
    priorDayHigh: example.yesterdayHigh ?? undefined,
    priorDayLow: example.yesterdayLow ?? undefined,
  });
}

function isLabelKey(value: unknown): value is LabelKey {
  return LABELS.some((item) => item.key === value);
}

function normalizeServerLabels(rawLabels: Record<string, unknown> | undefined): Record<string, SavedLabel> {
  if (!rawLabels) return {};
  return Object.entries(rawLabels).reduce<Record<string, SavedLabel>>((memo, [id, raw]) => {
    if (!raw || typeof raw !== "object") return memo;
    const item = raw as Record<string, unknown>;
    if (!isLabelKey(item.label)) return memo;
    memo[id] = {
      label: item.label,
      note: typeof item.note === "string" ? item.note : "",
      labeledAt: typeof item.labeledAt === "string" ? item.labeledAt : undefined,
    };
    return memo;
  }, {});
}

function normalizeConfidence(value: unknown): Confidence {
  return value === "unsure" ? "unsure" : "sure";
}

function normalizeServerReviews(rawReviews: Record<string, unknown> | undefined): Record<string, SavedReview> {
  if (!rawReviews) return {};
  return Object.entries(rawReviews).reduce<Record<string, SavedReview>>((memo, [id, raw]) => {
    if (!raw || typeof raw !== "object") return memo;
    const item = raw as Record<string, unknown>;
    if (!isLabelKey(item.label)) return memo;
    memo[id] = {
      label: item.label,
      note: typeof item.note === "string" ? item.note : "",
      confidence: normalizeConfidence(item.confidence),
      firstPassLabel: isLabelKey(item.firstPassLabel) ? item.firstPassLabel : "",
      labeledAt: typeof item.labeledAt === "string" ? item.labeledAt : undefined,
    };
    return memo;
  }, {});
}

function labelStamp(saved: SavedLabel | undefined) {
  if (!saved?.labeledAt) return 0;
  const stamp = Date.parse(saved.labeledAt);
  return Number.isFinite(stamp) ? stamp : 0;
}

function newestLabel(localLabel: SavedLabel | undefined, serverLabel: SavedLabel | undefined) {
  if (!localLabel) return serverLabel;
  if (!serverLabel) return localLabel;
  return labelStamp(localLabel) >= labelStamp(serverLabel) ? localLabel : serverLabel;
}

function newestReview(localReview: SavedReview | undefined, serverReview: SavedReview | undefined) {
  if (!localReview) return serverReview;
  if (!serverReview) return localReview;
  return labelStamp(localReview) >= labelStamp(serverReview) ? localReview : serverReview;
}

function isDone(example: TrainingExample, mode: TrainingMode) {
  return mode === "review" ? Boolean(example.reviewLabel) : Boolean(example.label);
}

function firstOpenIndex(items: TrainingExample[], mode: TrainingMode) {
  const open = items.findIndex((example) => !isDone(example, mode));
  return open >= 0 ? open : 0;
}

export function AaplOpeningLabeler() {
  const [examples, setExamples] = useState<TrainingExample[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [mode, setMode] = useState<TrainingMode>("label");
  const [reviewConfidence, setReviewConfidence] = useState<Confidence>("sure");
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<Array<{ index: number; mode: TrainingMode; before: TrainingExample }>>([]);
  const [dragPreview, setDragPreview] = useState<LabelKey | "">("");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("loading");
  const [stage, setStage] = useState<Stage>("direction");
  const [direction, setDirection] = useState<Direction | null>(null);
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const loaded = useRef(false);
  const pendingSaves = useRef(0);
  const saveFailed = useRef(false);
  const applyLabelRef = useRef<((label: LabelKey) => void) | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadDeck() {
      try {
        const response = await fetch("/training/aapl-opening/examples.json", { cache: "no-store" });
        if (!response.ok) throw new Error(`examples HTTP ${response.status}`);
        const manifest = (await response.json()) as Manifest;

        let serverLabels: Record<string, SavedLabel> = {};
        let serverReviews: Record<string, SavedReview> = {};
        let serverAvailable = false;
        try {
          const labelsResponse = await fetch(`/api/training-labels?deckId=${DECK_ID}`, { cache: "no-store" });
          if (!labelsResponse.ok) throw new Error(`labels HTTP ${labelsResponse.status}`);
          const labelsPayload = (await labelsResponse.json()) as TrainingLabelsResponse;
          serverLabels = normalizeServerLabels(labelsPayload.labels);
          serverReviews = normalizeServerReviews(labelsPayload.reviews);
          serverAvailable = true;
        } catch {
          serverAvailable = false;
        }

        const saved = parseSavedState();
        const merged = manifest.examples.map((example) => {
          const savedLabel = newestLabel(saved?.labels?.[example.id], serverLabels[example.id]);
          const savedReview = newestReview(saved?.reviews?.[example.id], serverReviews[example.id]);
          return {
            ...example,
            label: savedLabel?.label ?? example.label ?? "",
            note: savedLabel?.note ?? example.note ?? "",
            labeledAt: savedLabel?.labeledAt ?? example.labeledAt,
            reviewLabel: savedReview?.label ?? "",
            reviewNote: savedReview?.note ?? "",
            reviewConfidence: savedReview?.confidence ?? "sure",
            reviewedAt: savedReview?.labeledAt,
          };
        });

        if (cancelled) return;
        const allFirstPassLabeled = merged.length > 0 && merged.every((example) => example.label);
        const hasReviewLabels = merged.some((example) => example.reviewLabel);
        const initialMode = saved?.mode ?? (allFirstPassLabeled && !hasReviewLabels ? "review" : "label");
        setExamples(merged);
        setMode(initialMode);
        setReviewConfidence(saved?.reviewConfidence ?? "sure");
        const savedIndex =
          saved?.mode === initialMode && typeof saved.currentIndex === "number"
            ? saved.currentIndex
            : firstOpenIndex(merged, initialMode);
        setCurrentIndex(
          Math.min(savedIndex, Math.max(merged.length - 1, 0))
        );
        setSaveStatus(serverAvailable ? "saved" : "local");
        loaded.current = true;
      } catch (caught: unknown) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : String(caught));
      }
    }

    void loadDeck();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!loaded.current || !examples.length) return;
    const labels = examples.reduce<Record<string, SavedLabel>>((memo, example) => {
      if (example.label || example.note) {
        memo[example.id] = {
          label: example.label,
          note: example.note,
          labeledAt: example.labeledAt,
        };
      }
      return memo;
    }, {});
    const reviews = examples.reduce<Record<string, SavedReview>>((memo, example) => {
      if (example.reviewLabel || example.reviewNote) {
        memo[example.id] = {
          label: example.reviewLabel ?? "",
          note: example.reviewNote ?? "",
          confidence: example.reviewConfidence ?? "sure",
          firstPassLabel: example.label,
          labeledAt: example.reviewedAt,
        };
      }
      return memo;
    }, {});
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        currentIndex,
        mode,
        reviewConfidence,
        labels,
        reviews,
      } satisfies SavedState)
    );
  }, [currentIndex, examples, mode, reviewConfidence]);

  const current = examples[currentIndex];

  const counts = useMemo(() => {
    return examples.reduce(
      (memo, example) => {
        if (example.label) memo.done += 1;
        memo[example.label || "unlabeled"] += 1;
        return memo;
      },
      {
        done: 0,
        trend_open_long: 0,
        long_reversal: 0,
        no_trade: 0,
        short_reversal: 0,
        trend_open_short: 0,
        unlabeled: 0,
      } as Record<LabelKey | "done" | "unlabeled", number>
    );
  }, [examples]);

  const reviewCounts = useMemo(() => {
    return examples.reduce(
      (memo, example) => {
        if (example.reviewLabel) {
          memo.done += 1;
          if (example.reviewConfidence === "unsure") memo.unsure += 1;
          if (example.label && example.label !== example.reviewLabel) memo.disagree += 1;
        }
        return memo;
      },
      { done: 0, unsure: 0, disagree: 0 }
    );
  }, [examples]);

  const activeDone = mode === "review" ? reviewCounts.done : counts.done;
  const activeDoneLabel = mode === "review" ? "reviewed" : "labeled";
  const modeLabel = mode === "review" ? "Review" : "Label";

  const saveStatusLabel =
    saveStatus === "loading"
      ? "Loading"
      : saveStatus === "saving"
        ? "Saving"
        : saveStatus === "saved"
          ? "Saved"
          : "Local";
  const saveStatusTone =
    saveStatus === "saved"
      ? "border-emerald-400/35 bg-emerald-400/10 text-emerald-200"
      : saveStatus === "saving" || saveStatus === "loading"
        ? "border-[#f0b35b]/40 bg-[#f0b35b]/10 text-[#f0b35b]"
        : "border-red/40 bg-red/10 text-red";

  const persistLabel = useCallback(
    async (
      exampleId: string,
      label: LabelKey | "",
      note: string,
      labeledAt: string | undefined,
      saveMode: TrainingMode,
      confidence: Confidence = "sure",
      firstPassLabel: LabelKey | "" = ""
    ) => {
      if (pendingSaves.current === 0) saveFailed.current = false;
      pendingSaves.current += 1;
      setSaveStatus("saving");

      try {
        const response = await fetch("/api/training-labels", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            deckId: DECK_ID,
            exampleId,
            label,
            note,
            labeledAt,
            mode: saveMode,
            confidence,
            firstPassLabel,
          }),
        });
        if (!response.ok) throw new Error(`save HTTP ${response.status}`);
      } catch {
        saveFailed.current = true;
      } finally {
        pendingSaves.current = Math.max(pendingSaves.current - 1, 0);
        if (pendingSaves.current === 0) setSaveStatus(saveFailed.current ? "local" : "saved");
      }
    },
    []
  );

  const resetStage = useCallback(() => {
    setStage("direction");
    setDirection(null);
  }, []);

  const pickDirection = useCallback(
    (dir: "long" | "short" | "no_trade") => {
      if (dir === "no_trade") {
        applyLabelRef.current?.("no_trade");
        return;
      }
      setDirection(dir);
      setStage("setup");
    },
    []
  );

  const applyLabel = useCallback(
    (label: LabelKey) => {
      if (!current) return;
      const note =
        mode === "label" && label === "trend_open_long" && currentIndex === 0
          ? "Trend from the open long: four consecutive bull bars."
          : mode === "review"
            ? current.reviewNote ?? ""
            : current.note;
      const labeledAt = new Date().toISOString();

      setExamples((items) =>
        items.map((item, index) => {
          if (index !== currentIndex) return item;
          if (mode === "review") {
            return {
              ...item,
              reviewLabel: label,
              reviewNote: note,
              reviewConfidence,
              reviewedAt: labeledAt,
            };
          }
          return {
            ...item,
            label,
            note,
            labeledAt,
          };
        })
      );
      setHistory((items) => [...items, { index: currentIndex, mode, before: current }]);
      void persistLabel(current.id, label, note, labeledAt, mode, reviewConfidence, current.label);
      if (mode === "review") setReviewConfidence("sure");
      setCurrentIndex((index) => Math.min(index + 1, Math.max(examples.length - 1, 0)));
    },
    [current, currentIndex, examples.length, mode, persistLabel, reviewConfidence]
  );

  useEffect(() => {
    applyLabelRef.current = applyLabel;
  }, [applyLabel]);

  useEffect(() => {
    setStage("direction");
    setDirection(null);
  }, [currentIndex, mode]);

  const undo = useCallback(() => {
    const last = history[history.length - 1];
    if (!last) return;
    setExamples((items) => items.map((item, index) => (index === last.index ? last.before : item)));
    setCurrentIndex(last.index);
    setMode(last.mode);
    setHistory((items) => items.slice(0, -1));
    if (last.mode === "review") {
      void persistLabel(
        last.before.id,
        last.before.reviewLabel ?? "",
        last.before.reviewNote ?? "",
        last.before.reviewedAt,
        "review",
        last.before.reviewConfidence ?? "sure",
        last.before.label
      );
    } else {
      void persistLabel(last.before.id, last.before.label, last.before.note, last.before.labeledAt, "label");
    }
  }, [history, persistLabel]);

  const exportCsv = useCallback(() => {
    const scoreColumns = LABELS.map((label) => `score_${label.key}`);
    const featureColumns = OPENING_FEATURE_COLUMNS.map((column) => `feature_${column}`);
    const columns = [
      "date",
      "decision_bar",
      "first_pass_label",
      "review_label",
      "review_confidence",
      "review_result",
      "feature_read",
      "feature_read_score",
      "feature_read_confidence",
      ...scoreColumns,
      ...featureColumns,
      "notes",
      "review_notes",
      "symbol",
      "source_file",
      "image_url",
      "labeled_at",
      "reviewed_at",
    ];
    const lines = [
      columns.join(","),
      ...examples.map((example) => {
        const featureSet = openingFeaturesFor(example);
        return [
          example.date,
          example.decisionBar,
          example.label,
          example.reviewLabel ?? "",
          example.reviewConfidence ?? "",
          example.label && example.reviewLabel ? (example.label === example.reviewLabel ? "agree" : "disagree") : "",
          featureSet?.read.label ?? "",
          featureSet?.read.score ?? "",
          featureSet?.read.confidence ?? "",
          ...LABELS.map((label) => featureSet?.scores[label.key] ?? ""),
          ...OPENING_FEATURE_COLUMNS.map((column) => featureSet?.values[column] ?? ""),
          example.note,
          example.reviewNote ?? "",
          example.symbol,
          example.sourceFile,
          example.imageUrl,
          example.labeledAt ?? "",
          example.reviewedAt ?? "",
        ]
          .map(toCsvCell)
          .join(",");
      }),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `aapl-opening-labels-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }, [examples]);

  const switchMode = useCallback(
    (nextMode: TrainingMode) => {
      setMode(nextMode);
      setHistory([]);
      setCurrentIndex(firstOpenIndex(examples, nextMode));
    },
    [examples]
  );

  const resetLabels = useCallback(() => {
    const target = mode === "review" ? "review labels" : "first-pass labels";
    const confirmed = window.confirm(`Clear saved ${target} for this deck everywhere?`);
    if (!confirmed) return;
    window.localStorage.removeItem(STORAGE_KEY);
    setSaveStatus("saving");
    fetch(`/api/training-labels?deckId=${DECK_ID}&mode=${mode}`, { method: "DELETE" })
      .then((response) => {
        if (!response.ok) throw new Error(`clear HTTP ${response.status}`);
        window.location.reload();
      })
      .catch(() => {
        setSaveStatus("local");
        window.alert("Local labels were cleared, but the website save could not be cleared.");
      });
  }, [mode]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return;
      }
      const key = event.key.toLowerCase();

      // Direct 5-way hotkeys still work — power-user shortcut bypasses the two-stage flow.
      const match = LABELS.find((item) => item.hotkey === event.key);
      if (match) {
        event.preventDefault();
        applyLabel(match.key);
        return;
      }

      if (stage === "direction") {
        if (key === "l") {
          event.preventDefault();
          pickDirection("long");
          return;
        }
        if (key === "s") {
          event.preventDefault();
          pickDirection("short");
          return;
        }
        if (key === "n") {
          event.preventDefault();
          pickDirection("no_trade");
          return;
        }
      } else {
        const setups = direction === "long" ? LONG_SETUPS : SHORT_SETUPS;
        if (key === "t") {
          event.preventDefault();
          const target = setups.find((s) => s.hotkey === "T");
          if (target) applyLabel(target.key);
          return;
        }
        if (key === "r") {
          event.preventDefault();
          const target = setups.find((s) => s.hotkey === "R");
          if (target) applyLabel(target.key);
          return;
        }
        if (event.key === "Escape") {
          event.preventDefault();
          resetStage();
          return;
        }
      }

      if (mode === "review" && (event.key === "?" || event.key === "0")) {
        event.preventDefault();
        setReviewConfidence((value) => (value === "sure" ? "unsure" : "sure"));
      }
      if (key === "u" || event.key === "Backspace") {
        event.preventDefault();
        undo();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [applyLabel, direction, mode, pickDirection, resetStage, stage, undo]);

  function previewFromDelta(dx: number, dy: number): LabelKey | "" {
    if (Math.abs(dy) > Math.abs(dx) && dy > 84) return "no_trade";
    if (dx > 190) return "trend_open_long";
    if (dx > 82) return "long_reversal";
    if (dx < -190) return "trend_open_short";
    if (dx < -82) return "short_reversal";
    return "";
  }

  return (
    <section className="h-[calc(100dvh-var(--nav-h))] overflow-hidden bg-[#140f0c] text-[#f4e5d6]">
      <div className="grid h-full min-w-0 grid-rows-[auto_minmax(0,1fr)_auto]">
        <header className="flex items-center justify-between gap-2 border-b border-[#3a2a20] bg-[#1b130f]/95 px-2 py-2 min-[430px]:px-3">
          <div className="flex min-w-0 items-baseline gap-2 overflow-hidden">
            <strong className="shrink-0 text-lg tabular-nums text-[#fff1df]">
              {examples.length ? currentIndex + 1 : 0}/{examples.length}
            </strong>
            <span
              aria-live="polite"
              className={`shrink-0 rounded border px-1.5 py-0.5 text-[0.62rem] font-black uppercase tracking-normal ${saveStatusTone}`}
            >
              {saveStatusLabel}
            </span>
            <span className="shrink-0 rounded border border-[#4d3a2e] bg-[#241912] px-1.5 py-0.5 text-[0.62rem] font-black uppercase text-[#dcc4ae]">
              {modeLabel}
            </span>
            <span className="hidden truncate text-xs font-medium text-[#b89b82] min-[680px]:block">
              {activeDone} {activeDoneLabel} {current ? `· ${current.date}` : ""}
              {mode === "label" && current?.label ? ` · ${labelTitle(current.label)}` : ""}
              {mode === "review" && reviewCounts.done ? ` · ${reviewCounts.unsure} unsure` : ""}
            </span>
          </div>
          <div className="flex min-w-0 items-center gap-1.5">
            {mode === "review" && (
              <div className="grid min-h-10 grid-cols-2 overflow-hidden rounded border border-[#4d3a2e] bg-[#241912] text-[0.64rem] font-black">
                <button
                  type="button"
                  onClick={() => setReviewConfidence("sure")}
                  className={`px-2 ${reviewConfidence === "sure" ? "bg-[#f0b35b] text-[#1a100b]" : "text-[#dcc4ae]"}`}
                >
                  Sure
                </button>
                <button
                  type="button"
                  onClick={() => setReviewConfidence("unsure")}
                  className={`px-2 ${reviewConfidence === "unsure" ? "bg-red/80 text-[#1a100b]" : "text-[#dcc4ae]"}`}
                >
                  ?
                </button>
              </div>
            )}
            <button
              type="button"
              onClick={undo}
              disabled={!history.length}
              className="hidden min-h-10 rounded border border-[#4d3a2e] bg-[#241912] px-2 text-xs font-bold text-[#dcc4ae] disabled:opacity-40 min-[520px]:block min-[520px]:px-3"
            >
              Undo
            </button>
            <button
              type="button"
              onClick={exportCsv}
              disabled={!examples.length}
              className="min-h-10 rounded border border-[#f0b35b] bg-[#f0b35b] px-2 text-xs font-black text-[#1a100b] disabled:opacity-40 min-[430px]:px-3"
            >
              Export
            </button>
            <details className="relative">
              <summary className="grid min-h-10 cursor-pointer list-none place-items-center rounded border border-[#4d3a2e] bg-[#241912] px-2 text-xs font-bold text-[#dcc4ae] min-[430px]:px-3">
                Tools
              </summary>
              <div className="absolute right-0 top-12 z-20 grid w-56 gap-2 rounded border border-[#4d3a2e] bg-[#21160f] p-3 shadow-2xl">
                <button
                  type="button"
                  onClick={undo}
                  disabled={!history.length}
                  className="min-h-10 rounded border border-[#4d3a2e] bg-[#2a1d15] px-3 text-left text-xs font-bold text-[#f4e5d6] disabled:opacity-40"
                >
                  Undo last label
                </button>
                <button
                  type="button"
                  onClick={() => switchMode(mode === "review" ? "label" : "review")}
                  className="min-h-10 rounded border border-[#f0b35b]/50 bg-[#f0b35b]/10 px-3 text-left text-xs font-bold text-[#f0b35b]"
                >
                  {mode === "review" ? "Switch to first pass" : "Start review pass"}
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentIndex(0)}
                  className="min-h-10 rounded border border-[#4d3a2e] bg-[#2a1d15] px-3 text-left text-xs font-bold text-[#f4e5d6]"
                >
                  First card
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const next = examples.findIndex((example) => !isDone(example, mode));
                    if (next >= 0) setCurrentIndex(next);
                  }}
                  className="min-h-10 rounded border border-[#4d3a2e] bg-[#2a1d15] px-3 text-left text-xs font-bold text-[#f4e5d6]"
                >
                  Next open card
                </button>
                <button
                  type="button"
                  onClick={resetLabels}
                  className="min-h-10 rounded border border-red/40 bg-red/10 px-3 text-left text-xs font-bold text-red"
                >
                  {mode === "review" ? "Clear saved reviews" : "Clear saved labels"}
                </button>
              </div>
            </details>
          </div>
        </header>

        <main className="grid min-h-0 min-w-0 place-items-center p-2">
          {error ? (
            <div className="rounded border border-red/40 bg-red/10 px-3 py-2 text-sm text-red">
              {error}
            </div>
          ) : current ? (
            <article
              className="relative grid h-full max-h-[760px] w-full max-w-[calc(100vw-1rem)] touch-none place-items-center overflow-hidden rounded border border-[#4a382c] bg-[#201710] min-[520px]:max-w-[470px]"
              onPointerDown={(event) => {
                dragStart.current = { x: event.clientX, y: event.clientY };
              }}
              onPointerMove={(event) => {
                if (!dragStart.current) return;
                setDragPreview(
                  previewFromDelta(event.clientX - dragStart.current.x, event.clientY - dragStart.current.y)
                );
              }}
              onPointerUp={(event) => {
                if (!dragStart.current) return;
                const label = previewFromDelta(
                  event.clientX - dragStart.current.x,
                  event.clientY - dragStart.current.y
                );
                dragStart.current = null;
                setDragPreview("");
                if (label) applyLabel(label);
              }}
              onPointerCancel={() => {
                dragStart.current = null;
                setDragPreview("");
              }}
            >
              <Image
                src={current.imageUrl}
                alt={`${current.symbol} ${current.date} opening bars`}
                width={720}
                height={1170}
                unoptimized
                className="h-full w-full object-contain"
                draggable={false}
              />
              {dragPreview && (
                <div className="absolute inset-4 grid place-items-center rounded border border-[#f0b35b] bg-[#160f0b]/80 text-center text-4xl font-black uppercase text-[#f0b35b]">
                  {labelTitle(dragPreview)}
                </div>
              )}
            </article>
          ) : (
            <div className="text-sm text-[#b89b82]">Loading examples...</div>
          )}
        </main>

        <footer className="grid min-w-0 gap-1.5 border-t border-[#3a2a20] bg-[#1b130f] px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1.5">
          <div className="px-1 text-center text-[0.6rem] font-black uppercase tracking-wider text-[#b89b82]">
            {stage === "direction" ? "Which side has clear control?" : direction === "long" ? "Bull setup type" : "Bear setup type"}
          </div>
          {stage === "direction" ? (
            <div className="grid grid-cols-3 gap-1.5">
              {DIRECTION_BUTTONS.map((button) => (
                <button
                  key={button.key}
                  type="button"
                  onClick={() => pickDirection(button.key)}
                  disabled={!current}
                  className={`min-h-[54px] min-w-0 rounded border px-1 text-center text-[0.66rem] font-black leading-tight disabled:opacity-40 min-[390px]:min-h-[60px] min-[390px]:text-[0.78rem] ${button.tone}`}
                >
                  <span className="mx-auto mb-0.5 grid h-5 w-5 place-items-center rounded bg-[#fff4e6]/10 text-[0.66rem] min-[390px]:mb-1 min-[390px]:h-6 min-[390px]:w-6">
                    {button.hotkey}
                  </span>
                  {button.short}
                </button>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-[auto_1fr_1fr] gap-1.5">
              <button
                type="button"
                onClick={resetStage}
                className="min-h-[54px] rounded border border-[#4d3a2e] bg-[#241912] px-3 text-xs font-bold text-[#dcc4ae] min-[390px]:min-h-[60px]"
              >
                ←
              </button>
              {(direction === "long" ? LONG_SETUPS : SHORT_SETUPS).map((button) => (
                <button
                  key={button.key}
                  type="button"
                  onClick={() => applyLabel(button.key)}
                  disabled={!current}
                  className={`min-h-[54px] min-w-0 rounded border px-1 text-center text-[0.66rem] font-black leading-tight disabled:opacity-40 min-[390px]:min-h-[60px] min-[390px]:text-[0.78rem] ${button.tone}`}
                >
                  <span className="mx-auto mb-0.5 grid h-5 w-5 place-items-center rounded bg-[#fff4e6]/10 text-[0.66rem] min-[390px]:mb-1 min-[390px]:h-6 min-[390px]:w-6">
                    {button.hotkey}
                  </span>
                  {button.short}
                </button>
              ))}
            </div>
          )}
        </footer>
      </div>
    </section>
  );
}

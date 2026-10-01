"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type Stage =
  | "idle"
  | "scanning"
  | "extracted"
  | "precleaning"
  | "precleaned"
  | "reviewing"
  | "reviewed";

type SourceState = "waiting" | "scanning" | "done";

const sources = [
  { name: "Remote OK", type: "Remote jobs" },
  { name: "Arbeitnow", type: "Hiring signals" },
  { name: "Remotive", type: "Remote companies" },
  { name: "Jobicy", type: "Job posts" },
  { name: "Web Summit", type: "Event companies" },
  { name: "SaaStr", type: "B2B event signals" },
  { name: "Adzuna", type: "Market activity" },
];

const reviewSteps = [
  "ICP fit",
  "Buyer need",
  "Signal strength",
  "Confidence",
  "Why now",
  "Next action",
];

export default function ConsolePage() {
  const [darkMode, setDarkMode] = useState(false);
  const [stage, setStage] = useState<Stage>("idle");
  const [sourceStates, setSourceStates] = useState<Record<string, SourceState>>(
    () => Object.fromEntries(sources.map((source) => [source.name, "waiting"]))
  );
  const [logs, setLogs] = useState<string[]>([
    "system ready",
    "waiting for signal scan",
  ]);
  const [scanProgress, setScanProgress] = useState(0);
  const [activeProgress, setActiveProgress] = useState(0);
  const [pipelineTitle, setPipelineTitle] = useState("Processing Queue");
  const [pipelineItems, setPipelineItems] = useState<
    { label: string; status: "waiting" | "running" | "done" }[]
  >([{ label: "Waiting for signal scan", status: "waiting" }]);

  const [extractionCounts, setExtractionCounts] = useState({
    rawMentions: 0,
    sourcesScanned: 0,
    uniqueCompanies: 0,
    junkRows: 0,
  });

  const [precleanCounts, setPrecleanCounts] = useState({
    acceptedMentions: 0,
    rejectedRows: 0,
    companiesReady: 0,
  });
  const [status, setStatus] = useState<{
    visibleAiCompanies?: number;
    prefetchedAiCompanies?: number;
    pendingAiCompanies?: number;
    readyToRevealCount?: number;
    nextBatchStart?: number;
    nextBatchEnd?: number;
  } | null>(null);
  const [apiLoading, setApiLoading] = useState(false);


  const logRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [logs]);

  const phases = ["Scan", "Pre-clean", "Qualify", "Ready"];
  const isRunning = stage === "scanning" || stage === "precleaning" || stage === "reviewing";
  const completedPhases =
    stage === "reviewed" ? 4 : stage === "precleaned" || stage === "reviewing" ? 2 : stage === "extracted" || stage === "precleaning" ? 1 : 0;

  const sourcesDone =
    stage === "idle"
      ? 0
      : stage === "scanning"
      ? Math.min(sources.length, Math.floor((activeProgress / 100) * sources.length))
      : sources.length;

  function sourceStatus(index: number): SourceState {
    if (index < sourcesDone) return "done";
    if (stage === "scanning" && index === sourcesDone) return "scanning";
    return "waiting";
  }

  const pageClass = darkMode
    ? "relative min-h-screen overflow-hidden bg-slate-950 text-white"
    : "relative min-h-screen overflow-hidden bg-slate-50 text-slate-950";

  const panelClass = darkMode
    ? "retro-box border border-slate-800 bg-slate-950/90 shadow-sm"
    : "retro-box border border-slate-200 bg-white/88 shadow-sm";

  const mutedText = darkMode ? "text-slate-400" : "text-slate-600";


  function pushLog(line: string) {
    setLogs((current) => [...current.slice(-8), line]);
  }


  async function runPipelineStep(step: string) {
    const response = await fetch("/api/run-pipeline-step", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ step }),
    });

    const data = await response.json();

    if (!response.ok || !data.ok) {
      throw new Error(data.error || `${step} failed`);
    }

    return data;
  }

  function updatePipelineItem(
    label: string,
    status: "waiting" | "running" | "done"
  ) {
    setPipelineItems((items) =>
      items.map((item) => (item.label === label ? { ...item, status } : item))
    );
  }

  function countTowards<T extends Record<string, number>>(
    setter: React.Dispatch<React.SetStateAction<T>>,
    key: keyof T & string,
    target: number,
    duration = 900
  ) {
    const steps = 18;
    let currentStep = 0;

    const interval = window.setInterval(() => {
      currentStep += 1;
      const nextValue = Math.round((target * currentStep) / steps);

      setter((current) => ({
        ...current,
        [key]: Math.min(nextValue, target),
      }));

      if (currentStep >= steps) {
        window.clearInterval(interval);
      }
    }, duration / steps);
  }

  async function startScan() {
    setStage("scanning");
    setScanProgress(0);
    setActiveProgress(0);
    setApiLoading(true);
    setStatus(null);

    setExtractionCounts({
      rawMentions: 0,
      sourcesScanned: 0,
      uniqueCompanies: 0,
      junkRows: 0,
    });

    setPrecleanCounts({
      acceptedMentions: 0,
      rejectedRows: 0,
      companiesReady: 0,
    });

    const steps = [
      { apiStep: "collect_sources", label: "Jobs", log: "> jobs", progress: 35 },
      { apiStep: "collect_extra", label: "Web", log: "> web", progress: 68 },
      { apiStep: "collect_saas", label: "Events", log: "> events", progress: 100 },
    ];

    setLogs([
      "> scan started",
      "> checking live sources",
    ]);

    setPipelineTitle("Signal Scan");
    setPipelineItems(
      steps.map((step, index) => ({
        label: step.label,
        status: index === 0 ? "running" : "waiting",
      }))
    );

    try {
      for (let index = 0; index < steps.length; index += 1) {
        const step = steps[index];

        setLogs((current) => [...current, step.log]);
        updatePipelineItem(step.label, "running");

        const data = await runPipelineStep(step.apiStep);

        updatePipelineItem(step.label, "done");
        setActiveProgress(step.progress);
        setScanProgress(step.progress);

        setExtractionCounts({
          rawMentions: Number(data.sourceStats?.rawMentions || 0),
          sourcesScanned: Number(data.sourceStats?.sourcesScanned || 0),
          uniqueCompanies: Number(data.sourceStats?.uniqueCompanies || 0),
          junkRows: 0,
        });

        setLogs((current) => [
          ...current,
          ...((data.logs || []).map((line: string) => `> ✓ ${line}`)),
          `> mentions: ${data.sourceStats?.rawMentions || 0}`,
          `> companies: ${data.sourceStats?.uniqueCompanies || 0}`,
        ]);

        if (index + 1 < steps.length) {
          updatePipelineItem(steps[index + 1].label, "running");
        }
      }

      setStage("extracted");
      setLogs((current) => [...current, "> scan complete"]);
    } catch (error) {
      setLogs((current) => [
        ...current,
        `> scan failed: ${error instanceof Error ? error.message : "unknown error"}`,
      ]);
    } finally {
      setApiLoading(false);
    }
  }

  async function startPrecleaning() {
    setStage("precleaning");
    setActiveProgress(0);
    setApiLoading(true);

    setPrecleanCounts({
      acceptedMentions: 0,
      rejectedRows: 0,
      companiesReady: 0,
    });

    const steps = [
      { label: "Read", progress: 25 },
      { label: "Clean", progress: 55 },
      { label: "Accept", progress: 80 },
      { label: "Ready", progress: 100 },
    ];

    setLogs((current) => [
      ...current,
      "> clean started",
      "> removing noise",
    ]);

    setPipelineTitle("Pre-Clean");
    setPipelineItems(
      steps.map((step, index) => ({
        label: step.label,
        status: index === 0 ? "running" : "waiting",
      }))
    );

    const visualTimer = window.setInterval(() => {
      setActiveProgress((value) => Math.min(value + 3, 88));
    }, 350);

    try {
      const data = await runPipelineStep("preclean");

      window.clearInterval(visualTimer);

      for (const step of steps) {
        updatePipelineItem(step.label, "done");
        setActiveProgress(step.progress);
      }

      setPrecleanCounts({
        acceptedMentions: Number(data.precleanStats?.acceptedMentions || 0),
        rejectedRows: Number(data.precleanStats?.rejectedRows || 0),
        companiesReady: Number(data.precleanStats?.companiesReady || 0),
      });

      setStage("precleaned");

      setLogs((current) => [
        ...current,
        "> clean complete",
        ...((data.logs || []).map((line: string) => `> ✓ ${line}`)),
        `> accepted: ${data.precleanStats?.acceptedMentions || 0}`,
        `> rejected: ${data.precleanStats?.rejectedRows || 0}`,
        `> ready: ${data.precleanStats?.companiesReady || 0}`,
      ]);
    } catch (error) {
      window.clearInterval(visualTimer);

      setLogs((current) => [
        ...current,
        `> clean failed: ${error instanceof Error ? error.message : "unknown error"}`,
      ]);
    } finally {
      setApiLoading(false);
    }
  }

  async function loadReviewStatus() {
    setStage("reviewing");
    setApiLoading(true);
    setActiveProgress(0);

    const steps = [
      { label: "Review", progress: 60 },
      { label: "Score", progress: 75 },
      { label: "Queue", progress: 90 },
      { label: "Ready", progress: 100 },
    ];

    setLogs((current) => [
      ...current,
      "> review started",
      "> scoring fit and intent",
    ]);

    setPipelineTitle("Intent Score");
    setPipelineItems(
      steps.map((step, index) => ({
        label: step.label,
        status: index === 0 ? "running" : "waiting",
      }))
    );

    const visualTimer = window.setInterval(() => {
      setActiveProgress((value) => Math.min(value + 2, 88));
    }, 700);

    try {
      const data = await runPipelineStep("qualify");

      window.clearInterval(visualTimer);

      for (const step of steps) {
        updatePipelineItem(step.label, "done");
        setActiveProgress(step.progress);
      }

      setStatus(data);
      setStage("reviewed");

      setLogs((current) => [
        ...current,
        "> review complete",
        ...((data.logs || []).map((line: string) => `> ✓ ${line}`)),
        `> reviewed: ${data.qualificationStats?.reviewedCompanies || 0}`,
        `> first page: ${data.qualificationStats?.visibleLeads || 0}`,
        `> queue: ${data.qualificationStats?.totalLeads || 0}`,
      ]);
    } catch (error) {
      window.clearInterval(visualTimer);

      setLogs((current) => [
        ...current,
        `> review failed: ${error instanceof Error ? error.message : "unknown error"}`,
      ]);
    } finally {
      setApiLoading(false);
    }
  }

  async function revealNextBatch() {
    setApiLoading(true);
    pushLog("> revealing next reviewed lead batch");

    try {
      await fetch("/api/enrich-next-batch", {
        method: "POST",
      });

      const response = await fetch("/api/enrichment-status", { cache: "no-store" });
      const data = await response.json();
      setStatus(data);
      pushLog("> next 50 reviewed leads revealed");
    } catch {
      pushLog("> reveal action failed, dashboard can still be opened");
    } finally {
      setApiLoading(false);
    }
  }

  return (
    <main className={pageClass}>
      <style>{`
        @keyframes scanLine {
          0% { transform: translateY(-100%); opacity: 0; }
          30% { opacity: 0.22; }
          100% { transform: translateY(100%); opacity: 0; }
        }

        @keyframes pulsePixel {
          0%, 100% { opacity: 0.45; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.18); }
        }

        .retro-font {
          font-family: var(--font-geist-sans), system-ui, sans-serif;
        }

        .retro-box {
          border-radius: 0.75rem;
        }

        .scan-panel::after {
          content: "";
          position: absolute;
          inset: 0;
          background: linear-gradient(to bottom, transparent, rgba(255,255,255,0.16), transparent);
          animation: scanLine 4s linear infinite;
          pointer-events: none;
        }

        .pulse-pixel {
          animation: pulsePixel 1.4s ease-in-out infinite;
        }

        @keyframes stripes {
          from { background-position: 0 0; }
          to { background-position: 28px 0; }
        }

        .progress-stripes {
          background-image:
            repeating-linear-gradient(45deg, rgba(255,255,255,0.22) 0 10px, transparent 10px 20px),
            linear-gradient(to right, #6366f1, #a78bfa, #67e8f9);
          background-size: 28px 28px, 100% 100%;
          animation: stripes 0.9s linear infinite;
        }

        @keyframes stepGlow {
          0%, 100% { box-shadow: 0 0 0 0 rgba(129, 140, 248, 0.6); }
          50% { box-shadow: 0 0 0 9px rgba(129, 140, 248, 0); }
        }

        .step-active {
          animation: stepGlow 1.6s ease-out infinite;
        }

        @keyframes sourcePulse {
          0%, 100% { background-color: rgba(129, 140, 248, 0.10); }
          50% { background-color: rgba(129, 140, 248, 0.24); }
        }

        .source-scanning {
          animation: sourcePulse 1.2s ease-in-out infinite;
        }

        @keyframes blinkCursor {
          0%, 49% { opacity: 1; }
          50%, 100% { opacity: 0; }
        }

        .cursor-blink {
          animation: blinkCursor 1s steps(1) infinite;
        }
      `}</style>

      <div className="pointer-events-none absolute inset-0 z-0">
        <div
          className={
            darkMode
              ? "absolute inset-0 opacity-[0.5] [background-image:radial-gradient(circle,#94a3b8_1px,transparent_1px)] [background-size:24px_24px]"
              : "absolute inset-0 opacity-[0.5] [background-image:radial-gradient(circle,#94a3b8_1px,transparent_1px)] [background-size:24px_24px]"
          }
        />
        <div className="absolute right-[-160px] top-[-160px] h-[520px] w-[520px] rounded-full bg-cyan-400/20 blur-3xl" />
        <div className="absolute bottom-[-180px] left-[-160px] h-[560px] w-[560px] rounded-full bg-violet-500/18 blur-3xl" />
      </div>

      <div className="relative z-10 mx-auto max-w-7xl px-5 py-6 md:px-10">
        <nav
          className={
            darkMode
              ? "sticky top-4 z-50 flex items-center justify-between gap-4 rounded-full border border-white/10 bg-slate-950/82 px-4 py-3 shadow-lg shadow-black/30 backdrop-blur-xl"
              : "sticky top-4 z-50 flex items-center justify-between gap-4 rounded-full border border-slate-200 bg-white/86 px-4 py-3 shadow-lg shadow-slate-900/5 backdrop-blur-xl"
          }
        >
          <Link href="/landing-page" className="flex items-center gap-3">
            <span className="grid h-11 w-11 grid-cols-2 gap-0.5 rounded-xl border border-slate-200 bg-slate-950 p-1 shadow-sm">
              <span className="bg-violet-400" />
              <span className="bg-indigo-500" />
              <span className="bg-emerald-300" />
              <span className="bg-amber-300" />
            </span>
            <span>
              <span className="retro-font block text-xl font-semibold tracking-tight">
                LeadGrid
              </span>
              <span className={`block text-xs font-semibold ${mutedText}`}>
                Signal Run Console
              </span>
            </span>
          </Link>

          <div className="hidden items-center gap-7 md:flex">
            <a href="#run" className={`retro-font text-xs font-semibold ${mutedText}`}>
              Run Console
            </a>
            <a href="#source-scan" className={`retro-font text-xs font-semibold ${mutedText}`}>
              Sources
            </a>
            <Link href="/leads" className={`retro-font text-xs font-semibold ${mutedText}`}>
              Lead Queue
            </Link>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setDarkMode(!darkMode)}
              className={
                darkMode
                  ? "grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-slate-900 text-lg"
                  : "grid h-10 w-10 place-items-center rounded-full border border-slate-200 bg-white/80 text-lg"
              }
              aria-label="Toggle color mode"
            >
              {darkMode ? "☀" : "☾"}
            </button>

            <Link
              href="/leads"
              className="btn-3d btn-3d-dark px-5 py-2.5 text-xs"
            >
              Lead Queue
            </Link>
          </div>
        </nav>

        <section id="run" className="grid gap-8 py-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
          <div>
            <p className="retro-font text-sm font-semibold text-indigo-600">
              Live lead machine
            </p>
            <h1 className="mt-5 text-5xl font-semibold tracking-tight md:text-6xl">
              Build a lead queue from public signals.
            </h1>
            <p className={`mt-6 max-w-2xl text-lg leading-8 ${mutedText}`}>
              Start a guided run. Watch LeadGrid scan public sources, extract raw mentions,
              clean obvious noise, review company intent, and reveal a ranked outbound queue.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              {stage === "idle" && (
                <button
                  onClick={startScan}
                  className="btn-3d px-8 py-4 text-sm"
                >
                  Start Signal Scan
                </button>
              )}

              {stage === "extracted" && (
                <button
                  onClick={startPrecleaning}
                  className="btn-3d px-8 py-4 text-sm"
                >
                  Send to Pre-Cleaning
                </button>
              )}

              {stage === "precleaned" && (
                <div>
                  <button
                    onClick={loadReviewStatus}
                    className="btn-3d px-8 py-4 text-sm"
                  >
                    Qualify Companies for Sales Intent
                  </button>

                  <p className={`mt-3 max-w-2xl text-sm leading-6 ${mutedText}`}>
                    <span className="font-semibold">*</span> ICP fit here means companies that look useful
                    for a B2B outbound / appointment-setting offer. We separate them by public signals:
                    hiring activity, growth movement, startup/event presence, market activity,
                    likely sales-team need, urgency, signal strength, and confidence.
                  </p>
                </div>
              )}

              {stage === "reviewed" && (
                <div className={darkMode ? "retro-box border border-cyan-300/40 bg-slate-950/90 p-5" : "retro-box border border-slate-200 bg-white/85 p-5"}>
                  <p className="retro-font text-xs font-semibold text-indigo-600">
                    Qualification Complete
                  </p>
                  <h3 className="mt-2 text-2xl font-semibold">
                    Reviewed lead queue is ready.
                  </h3>
                  <p className={`mt-2 text-sm leading-6 ${mutedText}`}>
                    Companies have been separated by ICP fit, public signal strength,
                    urgency, confidence, and recommended next action.
                  </p>

                  <Link
                    href="/leads"
                    className="btn-3d mt-5 inline-block px-8 py-4 text-sm"
                  >
                    Reveal
                  </Link>
                </div>
              )}
            </div>
          </div>

          <div className="scan-panel relative overflow-hidden rounded-3xl border border-slate-700/60 bg-slate-950 p-6 text-white shadow-2xl shadow-indigo-950/30 lg:sticky lg:top-28">
            <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-indigo-500/25 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-24 -left-24 h-64 w-64 rounded-full bg-cyan-500/15 blur-3xl" />

            <div className="relative flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold tracking-wide text-indigo-300">Mission control</p>
                <h2 className="mt-1 text-3xl font-semibold tracking-tight">Signal Run</h2>
              </div>

              <span
                className={
                  isRunning
                    ? "inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1.5 text-xs font-semibold text-emerald-300"
                    : stage === "reviewed"
                    ? "inline-flex items-center gap-2 rounded-full border border-indigo-400/30 bg-indigo-400/10 px-3 py-1.5 text-xs font-semibold text-indigo-300"
                    : "inline-flex items-center gap-2 rounded-full border border-slate-600 bg-slate-800/60 px-3 py-1.5 text-xs font-semibold text-slate-300"
                }
              >
                <span className="relative flex h-2 w-2">
                  {isRunning && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />}
                  <span
                    className={
                      isRunning
                        ? "relative inline-flex h-2 w-2 rounded-full bg-emerald-400"
                        : stage === "reviewed"
                        ? "relative inline-flex h-2 w-2 rounded-full bg-indigo-400"
                        : "relative inline-flex h-2 w-2 rounded-full bg-slate-500"
                    }
                  />
                </span>
                {isRunning ? "Live" : stage === "reviewed" ? "Complete" : stage === "idle" ? "Idle" : "Paused"}
              </span>
            </div>

            {/* Phase stepper */}
            <div className="relative mt-6 flex items-start">
              {phases.map((phase, index) => {
                const done = index < completedPhases;
                const active = isRunning && index === completedPhases;
                return (
                  <div key={phase} className="flex flex-1 flex-col items-center">
                    <div className="flex w-full items-center">
                      <div className={index === 0 ? "h-0.5 flex-1 bg-transparent" : done || active ? "h-0.5 flex-1 bg-indigo-400" : "h-0.5 flex-1 bg-slate-700"} />
                      <div
                        className={
                          done
                            ? "grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-b from-emerald-300 to-emerald-500 text-sm font-bold text-slate-950 shadow-[0_0_18px_rgba(52,211,153,0.55)]"
                            : active
                            ? "step-active grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-b from-indigo-400 to-indigo-600 text-sm font-bold text-white"
                            : "grid h-9 w-9 shrink-0 place-items-center rounded-full border border-slate-600 bg-slate-800 text-sm font-semibold text-slate-400"
                        }
                      >
                        {done ? "✓" : index + 1}
                      </div>
                      <div className={index === phases.length - 1 ? "h-0.5 flex-1 bg-transparent" : done ? "h-0.5 flex-1 bg-indigo-400" : "h-0.5 flex-1 bg-slate-700"} />
                    </div>
                    <p className={done || active ? "mt-2 text-xs font-semibold text-white" : "mt-2 text-xs font-medium text-slate-500"}>
                      {phase}
                    </p>
                  </div>
                );
              })}
            </div>

            {/* Progress */}
            <div className="relative mt-7 rounded-2xl border border-slate-700/60 bg-slate-900/70 p-4">
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-xs font-semibold text-slate-400">
                    {pipelineTitle.includes("Pre-Cleaning") ? "Pre-cleaning" : pipelineTitle.includes("Sales") ? "Qualification" : "Extraction"}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">{pipelineTitle}</p>
                </div>
                <p className="text-4xl font-semibold tabular-nums tracking-tight">
                  {activeProgress}
                  <span className="text-xl text-slate-400">%</span>
                </p>
              </div>

              <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-800 shadow-inner">
                <div
                  className={
                    isRunning
                      ? "progress-stripes h-full rounded-full bg-gradient-to-r from-indigo-500 via-violet-400 to-cyan-300 transition-all duration-700"
                      : "h-full rounded-full bg-gradient-to-r from-indigo-500 via-violet-400 to-cyan-300 transition-all duration-700"
                  }
                  style={{ width: `${activeProgress}%` }}
                />
              </div>
            </div>

            {/* Sources */}
            <div id="source-scan" className="relative mt-5">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-semibold text-slate-400">Sources</p>
                <p className="text-xs font-semibold text-slate-500">
                  {sourcesDone}/{sources.length} scanned
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {sources.map((source, index) => {
                  const state = sourceStatus(index);
                  return (
                    <div
                      key={source.name}
                      className={
                        state === "done"
                          ? "rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-3 py-2"
                          : state === "scanning"
                          ? "source-scanning rounded-xl border border-indigo-400/50 bg-indigo-400/10 px-3 py-2"
                          : "rounded-xl border border-slate-700/70 bg-slate-900/60 px-3 py-2"
                      }
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className={state === "waiting" ? "truncate text-sm font-semibold text-slate-400" : "truncate text-sm font-semibold text-white"}>
                          {source.name}
                        </p>
                        {state === "done" ? (
                          <span className="text-xs font-bold text-emerald-300">✓</span>
                        ) : state === "scanning" ? (
                          <span className="h-2 w-2 animate-ping rounded-full bg-indigo-300" />
                        ) : (
                          <span className="h-2 w-2 rounded-full bg-slate-600" />
                        )}
                      </div>
                      <p className="mt-0.5 truncate text-[11px] text-slate-500">{source.type}</p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Stats */}
            <div className="relative mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                { label: "Raw mentions", value: extractionCounts.rawMentions, color: "text-indigo-300" },
                { label: "Sources", value: extractionCounts.sourcesScanned, color: "text-cyan-300" },
                { label: "Companies", value: extractionCounts.uniqueCompanies, color: "text-emerald-300" },
                { label: "Noise", value: extractionCounts.junkRows, color: "text-amber-300" },
              ].map((stat) => (
                <div key={stat.label} className="rounded-xl border border-slate-700/60 bg-slate-900/70 p-3">
                  <p className="text-[11px] font-semibold text-slate-500">{stat.label}</p>
                  <p className={`mt-1 text-2xl font-semibold tabular-nums ${stat.color}`}>{stat.value}</p>
                </div>
              ))}
            </div>

            {(stage === "precleaning" || stage === "precleaned" || stage === "reviewing" || stage === "reviewed") && (
              <div className="relative mt-2 grid grid-cols-3 gap-2">
                {[
                  { label: "Accepted", value: precleanCounts.acceptedMentions, color: "text-emerald-300" },
                  { label: "Rejected", value: precleanCounts.rejectedRows, color: "text-rose-300" },
                  { label: "Ready", value: precleanCounts.companiesReady, color: "text-indigo-300" },
                ].map((stat) => (
                  <div key={stat.label} className="rounded-xl border border-slate-700/60 bg-slate-900/70 p-3">
                    <p className="text-[11px] font-semibold text-slate-500">{stat.label}</p>
                    <p className={`mt-1 text-2xl font-semibold tabular-nums ${stat.color}`}>{stat.value}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Pipeline steps */}
            {pipelineItems.length > 1 && (
              <div className="relative mt-5 grid gap-2 sm:grid-cols-2">
                {pipelineItems.map((item) => (
                  <div
                    key={item.label}
                    className="flex items-center justify-between rounded-xl border border-slate-700/60 bg-slate-900/60 px-3 py-2 text-sm"
                  >
                    <span className={item.status === "waiting" ? "font-medium text-slate-500" : "font-medium text-slate-100"}>{item.label}</span>
                    {item.status === "done" ? (
                      <span className="grid h-5 w-5 place-items-center rounded-full bg-emerald-400 text-[11px] font-bold text-slate-950">✓</span>
                    ) : item.status === "running" ? (
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-300 border-t-transparent" />
                    ) : (
                      <span className="h-4 w-4 rounded-full border border-slate-600" />
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Terminal */}
            <div className="relative mt-5 overflow-hidden rounded-2xl border border-slate-700/60 bg-black/60">
              <div className="flex items-center gap-1.5 border-b border-slate-700/60 bg-slate-900/80 px-3 py-2">
                <span className="h-2.5 w-2.5 rounded-full bg-rose-400/80" />
                <span className="h-2.5 w-2.5 rounded-full bg-amber-400/80" />
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/80" />
                <span className="ml-2 font-mono text-[11px] text-slate-500">leadgrid — run.log</span>
              </div>
              <div ref={logRef} className="max-h-[170px] space-y-1 overflow-y-auto p-3 font-mono text-[13px] leading-6">
                {logs.map((log, index) => (
                  <div key={`${log}-${index}`} className={index === logs.length - 1 ? "text-emerald-300" : "text-slate-400"}>
                    <span className="mr-2 text-indigo-400">$</span>
                    {log.replace(/^> /, "")}
                    {index === logs.length - 1 && <span className="cursor-blink ml-0.5 inline-block h-3.5 w-1.5 translate-y-0.5 bg-emerald-300" />}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>




      </div>
    </main>
  );
}

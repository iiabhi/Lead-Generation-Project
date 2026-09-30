"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Lead = Record<string, any>;

type LeadMeta = {
  totalAvailable: number;
  totalPages: number;
  currentPage: number;
  pageSize: number;
  visibleStart: number;
  visibleEnd: number;
  visibleLeadCount: number;
  scoredVisibleLeads: number;
  hiddenLeft: number;
  canGoPrev: boolean;
  canGoNext: boolean;
  canUnlockNext: boolean;
  nextStart: number;
  nextEnd: number;
};

const emptyMeta: LeadMeta = {
  totalAvailable: 0,
  totalPages: 1,
  currentPage: 0,
  pageSize: 50,
  visibleStart: 0,
  visibleEnd: 0,
  visibleLeadCount: 0,
  scoredVisibleLeads: 0,
  hiddenLeft: 0,
  canGoPrev: false,
  canGoNext: false,
  canUnlockNext: false,
  nextStart: 0,
  nextEnd: 0,
};

const filters = [
  { key: "all", label: "All" },
  { key: "hot", label: "High Intent" },
  { key: "warm", label: "Qualified" },
  { key: "nurture", label: "Monitor" },
  { key: "review", label: "Needs Review" },
  { key: "excluded", label: "Excluded" },
];

function getDecision(lead: Lead) {
  return String(
    lead.aiDecision ||
      lead.decision ||
      lead.status ||
      lead.leadDecision ||
      "reviewed"
  ).toLowerCase();
}

function getDecisionLabel(decision: string) {
  if (decision.includes("hot")) return "High Intent";
  if (decision.includes("warm")) return "Qualified";
  if (decision.includes("nurture")) return "Monitor";
  if (decision.includes("research")) return "Needs Review";
  if (
    decision.includes("trash") ||
    decision.includes("excluded") ||
    decision.includes("not_relevant")
  ) {
    return "Excluded";
  }
  return "Reviewed";
}

function getDecisionFilter(decision: string) {
  if (decision.includes("hot")) return "hot";
  if (decision.includes("warm")) return "warm";
  if (decision.includes("nurture")) return "nurture";
  if (decision.includes("research")) return "review";
  if (
    decision.includes("trash") ||
    decision.includes("excluded") ||
    decision.includes("not_relevant")
  ) {
    return "excluded";
  }
  return "all";
}

function getCompanyName(lead: Lead) {
  return (
    lead.companyName ||
    lead.company ||
    lead.name ||
    lead.aiCompanyName ||
    lead.accountName ||
    "Unknown company"
  );
}

function getScore(lead: Lead) {
  const raw =
    lead.aiIntentScore ||
    lead.intentScore ||
    lead.score ||
    lead.aiScore ||
    lead.confidenceScore ||
    0;

  const numberValue = Number(raw);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function cleanLeadText(value: string) {
  return value
    .replace(/people generation/gi, "lead generation")
    .replace(/person generation/gi, "lead generation")
    .replace(/appointment setting/gi, "appointment-setting")
    .replace(/outbound sale\b/gi, "outbound sales")
    .replace(/sales people/gi, "sales team")
    .replace(/company need/gi, "company may need")
    .replace(/need lead generation/gi, "may need lead-generation support")
    .replace(/need appointment-setting/gi, "may need appointment-setting support");
}


function getText(lead: Lead, keys: string[], fallback: string) {
  for (const key of keys) {
    if (lead[key]) return cleanLeadText(String(lead[key]));
  }
  return fallback;
}

function getSourceUrl(lead: Lead) {
  const raw =
    lead.sourceUrl ||
    lead.sourceURL ||
    lead.url ||
    lead.link ||
    lead.companyUrl ||
    lead.companyURL ||
    lead.jobUrl ||
    lead.eventUrl ||
    lead.website ||
    lead.source_link ||
    lead.source;

  if (!raw || typeof raw !== "string") return "";

  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;

  if (raw.includes(".") && !raw.includes(" ")) {
    return `https://${raw}`;
  }

  return "";
}

function getSourceName(lead: Lead) {
  const source =
    lead.sourceName ||
    lead.sourcePlatform ||
    lead.platform ||
    lead.sourceType ||
    lead.source ||
    "";

  if (!source || typeof source !== "string") return "Public signal";

  if (source.startsWith("http")) return "Public source";

  return source;
}

function getIcpFit(lead: Lead) {
  const text = getText(
    lead,
    ["aiIcpFit", "icpFit", "aiIcpReason", "icpReason", "aiBuyerNeed", "buyerNeed", "need"],
    "Possible fit for B2B outbound, lead generation, or appointment-setting support based on available public signals."
  );

  if (text.toLowerCase().includes("people generation")) {
    return "Possible fit for lead-generation or appointment-setting support based on available public signals.";
  }

  return text;
}


function getNextAction(lead: any) {
  const existing =
    lead.nextAction ||
    lead.next_action ||
    lead.recommendedAction ||
    lead.action;

  if (existing) return existing;

  if (lead.reviewStatus === "pending") {
    return "Run qualification review, then choose the outreach angle.";
  }

  const score = Number(lead.score || lead.aiIntentScore || lead.intentScore || 0);

  if (score >= 85) return "Prioritize for outreach and write a direct sales-intent opener.";
  if (score >= 70) return "Research buyer role and prepare a warm outbound angle.";
  if (score >= 45) return "Add to nurture list and monitor for stronger buying signals.";

  return "Review manually before adding to outreach.";
}
export default function LeadsPage() {
  const [darkMode, setDarkMode] = useState(false);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [leadMeta, setLeadMeta] = useState<LeadMeta>(emptyMeta);
  const [activeFilter, setActiveFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [movingPage, setMovingPage] = useState<"prev" | "next" | "unlock" | null>(null);
  const [pageMessage, setPageMessage] = useState("Showing current 50-lead page");

  const pageClass = darkMode
    ? "relative min-h-screen overflow-hidden bg-slate-950 text-white"
    : "relative min-h-screen overflow-hidden bg-slate-50 text-slate-950";

  const panelClass = darkMode
    ? "retro-box border border-slate-800 bg-slate-950/90 shadow-sm"
    : "retro-box border border-slate-200 bg-white/88 shadow-sm";

  const mutedText = darkMode ? "text-slate-400" : "text-slate-600";

  async function loadData() {
    setLoading(true);

    try {
      const leadResponse = await fetch("/api/leads", { cache: "no-store" });
      const leadData = await leadResponse.json();

      setLeads(Array.isArray(leadData.leads) ? leadData.leads : []);
      setLeadMeta(leadData.meta || emptyMeta);
    } catch {
      setLeads([]);
      setLeadMeta(emptyMeta);
    } finally {
      setLoading(false);
    }
  }

  async function movePage(direction: "prev" | "next") {
    setMovingPage(direction);
    setPageMessage(direction === "next" ? "Loading next 50 leads..." : "Loading previous 50 leads...");

    try {
      await fetch("/api/leads-page", {
        method: "POST",
        body: JSON.stringify({ direction }),
      });

      await loadData();
      setPageMessage("Showing current 50-lead page");
    } finally {
      setMovingPage(null);
    }
  }

  async function unlockNext50() {
    setMovingPage("unlock");
    setPageMessage("Unlocking next 50 leads...");

    try {
      await fetch("/api/reveal-leads-next", {
        method: "POST",
      });

      await loadData();
      setPageMessage("Next 50 leads unlocked");
    } finally {
      setMovingPage(null);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  const filteredLeads = useMemo(() => {
    return leads.filter((lead) => {
      if (activeFilter === "all") return true;
      return getDecisionFilter(getDecision(lead)) === activeFilter;
    });
  }, [leads, activeFilter]);

  const counts = useMemo(() => {
    return {
      all: leads.length,
      hot: leads.filter((lead) => getDecisionFilter(getDecision(lead)) === "hot").length,
      warm: leads.filter((lead) => getDecisionFilter(getDecision(lead)) === "warm").length,
      nurture: leads.filter((lead) => getDecisionFilter(getDecision(lead)) === "nurture").length,
      review: leads.filter((lead) => getDecisionFilter(getDecision(lead)) === "review").length,
      excluded: leads.filter((lead) => getDecisionFilter(getDecision(lead)) === "excluded").length,
    };
  }, [leads]);

  const visiblePercent =
    leadMeta.totalAvailable > 0
      ? Math.round((leadMeta.visibleEnd / leadMeta.totalAvailable) * 100)
      : 0;

  const scoredPercent =
    leadMeta.visibleLeadCount > 0
      ? Math.round((leadMeta.scoredVisibleLeads / leadMeta.visibleLeadCount) * 100)
      : 0;

  return (
    <main className={pageClass}>
      <style>{`
        .retro-font {
          font-family: var(--font-geist-sans), system-ui, sans-serif;
        }

        .retro-box {
          border-radius: 0.75rem;
        }

        @keyframes pulsePixel {
          0%, 100% { opacity: 0.45; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.18); }
        }

        .pulse-pixel {
          animation: pulsePixel 1.4s ease-in-out infinite;
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
                Reviewed Leads
              </span>
            </span>
          </Link>

          <div className="hidden items-center gap-7 md:flex">
            <Link href="/console" className={`retro-font text-xs font-semibold ${mutedText}`}>
              Run Console
            </Link>
            <a href="#filters" className={`retro-font text-xs font-semibold ${mutedText}`}>
              Filters
            </a>
            <a href="#queue" className={`retro-font text-xs font-semibold ${mutedText}`}>
              Queue
            </a>
          </div>

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
        </nav>

        <section className="grid gap-8 py-10 lg:grid-cols-[0.95fr_1.05fr] lg:items-end">
          <div>
            <p className="retro-font text-sm font-semibold text-indigo-600">
              Lead Queue
            </p>
            <h1 className="mt-5 max-w-4xl text-5xl font-semibold tracking-tight md:text-6xl">
              Review leads 50 at a time.
            </h1>
          </div>

          <p className={`max-w-3xl text-lg leading-8 ${mutedText}`}>
            Lead scores combine ICP fit, signal strength, sales urgency, confidence, and next-action clarity. Higher scores mean the account looks more ready for outbound.
          </p>
        </section>

        <section className="grid gap-6 pb-10 lg:grid-cols-[380px_1fr]">
          <aside className="space-y-5 lg:sticky lg:top-28 lg:self-start">
            <div className={`${panelClass} p-6`}>
              <p className="retro-font text-xs font-semibold text-indigo-600">
                Queue Controls
              </p>

              <button
                onClick={() => {
                  if (!loading && leadMeta.canUnlockNext && movingPage === null) {
                    unlockNext50();
                  }
                }}
                aria-disabled={loading || !leadMeta.canUnlockNext || movingPage !== null}
                className={
                  loading || !leadMeta.canUnlockNext || movingPage !== null
                    ? "btn-3d mt-5 w-full px-8 py-5 text-sm"
                    : "btn-3d mt-5 w-full px-8 py-5 text-sm"
                }
              >
                {loading ? "Loading" : !leadMeta.canUnlockNext ? "Done" : movingPage === "unlock" ? "Loading" : "Next 50"}
              </button>

              <p className={`mt-4 text-sm leading-6 ${mutedText}`}>
                {leadMeta.canUnlockNext
                  ? `Next up: ${leadMeta.nextStart}-${leadMeta.nextEnd}`
                  : "All leads unlocked"}
              </p>

              <Link
                href="/api/leads-csv"
                className={
                  darkMode
                    ? "btn-3d btn-3d-dark mt-7 flex w-full px-6 py-4 text-sm"
                    : "btn-3d btn-3d-light mt-7 flex w-full px-6 py-4 text-sm"
                }
              >
                Download CSV
              </Link>
            </div>

            <div className={`${panelClass} p-5`}>
              <p className="retro-font text-xs font-semibold text-indigo-600">
                Lead Coverage
              </p>

              <div className="mt-4 grid grid-cols-2 gap-3">
                {[
                  { label: "Visible", value: leadMeta.visibleLeadCount },
                  { label: "Scored", value: leadMeta.scoredVisibleLeads },
                  { label: "Left", value: leadMeta.hiddenLeft },
                  { label: "Total", value: leadMeta.totalAvailable },
                ].map((stat) => (
                  <div
                    key={stat.label}
                    className={darkMode ? "bg-slate-900 p-3" : "bg-slate-100 p-3"}
                  >
                    <p className={`retro-font text-xs font-semibold ${mutedText}`}>
                      {stat.label}
                    </p>
                    <p className="mt-1 text-3xl font-semibold">{stat.value}</p>
                  </div>
                ))}
              </div>

              <div className="mt-5 space-y-4">
                {[
                  { label: "Queue viewed", value: visiblePercent },
                  { label: "Scored on this page", value: scoredPercent },
                ].map((bar) => (
                  <div key={bar.label}>
                    <div className="mb-1 flex items-center justify-between">
                      <p className={`retro-font text-xs font-semibold ${mutedText}`}>
                        {bar.label}
                      </p>
                      <p className="text-xs font-semibold">{bar.value}%</p>
                    </div>
                    <div className={darkMode ? "h-3 border border-slate-700 bg-slate-900" : "h-3 border border-slate-200 bg-white"}>
                      <div
                        className="h-full bg-indigo-500 transition-all duration-500"
                        style={{ width: `${bar.value}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div id="filters" className={`${panelClass} p-5`}>
              <p className="retro-font text-xs font-semibold text-indigo-600">
                Filters on this page
              </p>

              <div className="mt-4 grid gap-2">
                {filters.map((filter) => (
                  <button
                    key={filter.key}
                    onClick={() => setActiveFilter(filter.key)}
                    className={
                      activeFilter === filter.key
                        ? "retro-box flex items-center justify-between bg-slate-950 px-4 py-3 text-xs font-semibold text-white"
                        : darkMode
                        ? "retro-box flex items-center justify-between border border-slate-800 bg-slate-950/80 px-4 py-3 text-xs font-semibold text-slate-300"
                        : "retro-box flex items-center justify-between border border-slate-200 bg-white/80 px-4 py-3 text-xs font-semibold text-slate-950"
                    }
                  >
                    <span>{filter.label}</span>
                    <span>{counts[filter.key as keyof typeof counts] ?? 0}</span>
                  </button>
                ))}
              </div>
            </div>
          </aside>

          <section id="queue" className={`${panelClass} p-5`}>

            <div className="mb-5 mt-5 flex flex-col gap-4 border-b border-slate-500/30 pb-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="retro-font text-xs font-semibold text-indigo-600">
                  Lead Card
                </p>
                <h2 className="mt-1 text-3xl font-semibold">
                  {leadMeta.visibleStart}-{leadMeta.visibleEnd} Leads
                </h2>
                <p className={`mt-1 text-xs font-semibold ${mutedText}`}>
                  Page {leadMeta.currentPage + 1} of {leadMeta.totalPages} · {filteredLeads.length} shown
                </p>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    if (leadMeta.canGoPrev && movingPage === null) movePage("prev");
                  }}
                  aria-disabled={!leadMeta.canGoPrev || movingPage !== null}
                  className={
                    !leadMeta.canGoPrev || movingPage !== null
                      ? "btn-3d btn-3d-dark px-4 py-3 text-lg opacity-40"
                      : "btn-3d btn-3d-dark px-4 py-3 text-lg"
                  }
                >
                  ←
                </button>

                <div className={darkMode ? "retro-box bg-slate-900 px-4 py-3 text-center" : "retro-box bg-white px-4 py-3 text-center"}>
                  <p className="retro-font text-xs font-semibold text-indigo-600">
                    Range
                  </p>
                  <p className="text-lg font-semibold">
                    {leadMeta.visibleStart}-{leadMeta.visibleEnd}
                  </p>
                </div>

                <button
                  onClick={() => {
                    if (leadMeta.canGoNext && movingPage === null) movePage("next");
                  }}
                  aria-disabled={!leadMeta.canGoNext || movingPage !== null}
                  className={
                    !leadMeta.canGoNext || movingPage !== null
                      ? "btn-3d btn-3d-dark px-4 py-3 text-lg opacity-40"
                      : "btn-3d btn-3d-dark px-4 py-3 text-lg"
                  }
                >
                  →
                </button>
              </div>
            </div>

            <div className="max-h-[calc(100vh-15rem)] space-y-5 overflow-y-auto pr-2">
              {loading && (
                <div className={darkMode ? "bg-slate-900 p-6" : "bg-slate-100 p-6"}>
                  <div className="flex items-center gap-3">
                    <span className="pulse-pixel h-2.5 w-2.5 rounded-full bg-indigo-500" />
                    <p className="retro-font text-sm font-semibold">
                      Loading reviewed leads...
                    </p>
                  </div>
                </div>
              )}

              {!loading && filteredLeads.length === 0 && (
                <div className={darkMode ? "bg-slate-900 p-6" : "bg-slate-100 p-6"}>
                  <h3 className="text-2xl font-semibold">No leads found in this filter.</h3>
                  <p className={`mt-2 ${mutedText}`}>
                    Try another filter or move to another 50-lead page.
                  </p>
                </div>
              )}

              {!loading &&
                filteredLeads.map((lead, index) => {
                  const decision = getDecision(lead);
                  const score = getScore(lead);
                  const sourceUrl = getSourceUrl(lead);
                  const sourceName = getSourceName(lead);
                  const cardClass = darkMode
                    ? "retro-box block border border-slate-800 bg-slate-900 p-5 transition hover:-translate-y-0.5 hover:border-cyan-300"
                    : "retro-box block border border-slate-300 bg-white p-5 transition hover:-translate-y-0.5 hover:border-indigo-400";

                  const content = (
                    <>
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="retro-font text-xs font-semibold text-indigo-600">
                            {getDecisionLabel(decision)}
                          </p>
                          <h3 className="mt-2 text-2xl font-semibold">{getCompanyName(lead)}</h3>

                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            <span className={darkMode ? "retro-box bg-slate-950 px-3 py-2 text-xs font-semibold text-slate-300" : "retro-box bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700"}>
                              Source: {sourceName}
                            </span>

                            <span className={sourceUrl ? "retro-box bg-indigo-500 px-3 py-2 text-xs font-semibold text-slate-950" : darkMode ? "retro-box bg-slate-950 px-3 py-2 text-xs font-semibold text-slate-500" : "retro-box bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-500"}>
                              {sourceUrl ? "Open source ↗" : "Source unavailable"}
                            </span>
                          </div>
                        </div>

                        <div className="retro-box bg-slate-950 px-4 py-3 text-center text-white">
                          <p className="retro-font text-xs font-semibold text-indigo-400">
                            Score
                          </p>
                          <p className="text-2xl font-semibold">{score}</p>
                        </div>
                      </div>

                      <div className="mt-5 grid gap-3 md:grid-cols-2">
                        <div className={darkMode ? "bg-slate-950 p-4" : "bg-slate-100 p-4"}>
                          <p className="retro-font text-xs font-semibold text-indigo-600">
                            Why now
                          </p>
                          <p className={`mt-2 text-sm leading-6 ${mutedText}`}>
                            {getText(lead, ["aiWhyNow", "whyNow", "reason", "aiReasoning"], "No reason available yet.")}
                          </p>
                        </div>

                        <div className={darkMode ? "bg-slate-950 p-4" : "bg-slate-100 p-4"}>
                          <p className="retro-font text-xs font-semibold text-indigo-600">
                            ICP Fit
                          </p>
                          <p className={`mt-2 text-sm leading-6 ${mutedText}`}>
                            {getIcpFit(lead)}
                          </p>
                        </div>
                      </div>

                      <div className="mt-4">
                        <p className="retro-font text-xs font-semibold text-indigo-600">
                          Next action
                        </p>
                        <p className={`mt-2 text-sm leading-6 ${mutedText}`}>
                          {getText(lead, ["aiNextAction", "nextAction", "recommendedAction"], "Research the right buyer and prepare outbound messaging.")}
                        </p>
                      </div>
                    </>
                  );

                  return sourceUrl ? (
                    <a
                      key={`${getCompanyName(lead)}-${index}`}
                      href={sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className={cardClass}
                    >
                      {content}
                    </a>
                  ) : (
                    <article key={`${getCompanyName(lead)}-${index}`} className={cardClass}>
                      {content}
                    </article>
                  );
                })}
            </div>
          </section>
        </section>
      </div>
    </main>
  );
}

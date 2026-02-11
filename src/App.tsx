import { useEffect, useMemo, useRef, useState } from "react";
import PromptOutput from "./components/PromptOutput";

type Plan = "free" | "pro";

type PresetId =
  | "business"
  | "education"
  | "viralContent"
  | "youtubeFaceless"
  | "productAds"
  | "quickFixPlan"
  | "nonprofit"
  | "aiTopics"
  | "digitalProduct";

type Preset = {
  id: PresetId;
  label: string;
  text: string;
  proOnly?: boolean;
};

type ApiResponse = {
  prompt?: string;
  follow_up_questions?: unknown;
  [key: string]: any;
};

type HistoryItem = {
  id: string;
  createdAt: number;
  preset: PresetId | null;
  input: string;
  output: string;
  followUps: string[];
  saved: boolean;
};

const FREE_DAILY_LIMIT = 3;
const FREE_HISTORY_LIMIT = 10;

function todayKey() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function readUsage(): number {
  try {
    const raw = localStorage.getItem("pap_usage");
    if (!raw) return 0;
    const parsed = JSON.parse(raw) as { date: string; count: number };
    if (!parsed?.date || typeof parsed.count !== "number") return 0;
    if (parsed.date !== todayKey()) return 0;
    return Math.max(0, parsed.count);
  } catch {
    return 0;
  }
}

function writeUsage(count: number) {
  try {
    localStorage.setItem("pap_usage", JSON.stringify({ date: todayKey(), count }));
  } catch {
    // ignore
  }
}

function readHistory(): HistoryItem[] {
  try {
    const raw = localStorage.getItem("pap_history");
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(Boolean) as HistoryItem[];
  } catch {
    return [];
  }
}

function writeHistory(items: HistoryItem[]) {
  try {
    localStorage.setItem("pap_history", JSON.stringify(items));
  } catch {
    // ignore
  }
}

function uid() {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Gemini may not always return { prompt: "...", follow_up_questions: [...] }
 * This turns almost any JSON shape into a copy-ready prompt string.
 */
function toCopyReadyPrompt(data: any): string {
  if (!data) return "No prompt generated.";

  if (typeof data.prompt === "string" && data.prompt.trim()) return data.prompt.trim();

  const pick = (keys: string[]) => {
    for (const k of keys) {
      const v = data?.[k];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
    return "";
  };

  const role = pick(["AI Role", "role", "ai_role"]);
  const context = pick(["Context", "context"]);
  const task = pick(["Task", "task"]);
  const constraints = data?.Constraints ?? data?.constraints;
  const outputFormat = data?.["Output Format"] ?? data?.output_format ?? data?.outputFormat;
  const followUps = data?.["Follow-up Questions"] ?? data?.follow_up_questions ?? data?.followUps;

  const lines: string[] = [];

  if (role) lines.push(`AI Role:\n${role}`);
  if (context) lines.push(`\nContext:\n${context}`);
  if (task) lines.push(`\nTask:\n${task}`);

  if (constraints) {
    lines.push(`\nConstraints:`);
    if (Array.isArray(constraints)) {
      for (const c of constraints) lines.push(`- ${String(c)}`);
    } else {
      lines.push(String(constraints));
    }
  }

  if (outputFormat) {
    lines.push(`\nOutput Format:`);
    if (Array.isArray(outputFormat)) {
      for (const o of outputFormat) lines.push(`- ${String(o)}`);
    } else {
      lines.push(String(outputFormat));
    }
  }

  if (followUps) {
    lines.push(`\nFollow-up Questions (max 2):`);
    if (Array.isArray(followUps)) {
      for (const q of followUps) lines.push(`- ${String(q)}`);
    } else {
      lines.push(String(followUps));
    }
  }

  return lines.join("\n").trim() || JSON.stringify(data, null, 2);
}

export default function App() {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // plan + usage
  const [plan, setPlan] = useState<Plan>("free");
  const [dailyCount, setDailyCount] = useState(0);

  // input/output
  const [idea, setIdea] = useState("");
  const [preset, setPreset] = useState<PresetId | null>(null);
  const [result, setResult] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showUpgrade, setShowUpgrade] = useState(false);

  // history/saved
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [activeHistoryId, setActiveHistoryId] = useState<string | null>(null);
  const [historyTab, setHistoryTab] = useState<"all" | "saved">("all");
  const [query, setQuery] = useState("");

  useEffect(() => {
    setDailyCount(readUsage());
    setHistory(readHistory());
  }, []);

  const presets = useMemo<Preset[]>(
    () => [
      {
        id: "viralContent",
        label: "Viral Content",
        text:
          "Generate 10 viral short-form content ideas for my niche. For each: hook (first 2 seconds), script outline, captions, CTA, filming notes, posting time, and why it will perform.",
      },
      {
        id: "youtubeFaceless",
        label: "YouTube Faceless",
        text:
          "Create a faceless YouTube video plan: 10 title ideas, 10 thumbnail text ideas, 8–12 minute script structure, voiceover style, B-roll/stock footage plan, on-screen text, and SEO tags/description.",
      },
      {
        id: "productAds",
        label: "Product Ads",
        text:
          "Write high-converting product ads for TikTok/IG/FB. Provide: 5 hooks, 3 ad angles, 2 short scripts (15–30s), 1 long script (45–60s), headline options, CTAs, objections + rebuttals, and a simple testing plan.",
      },
      {
        id: "quickFixPlan",
        label: "Quick Fix Plan",
        text:
          "Turn my situation into a clear, step-by-step action plan that actually works. Include: what’s causing the issue, the fastest fixes, the best long-term fix, exact steps (day 1 to day 7), tools/templates, what to avoid, and a checklist I can follow.",
      },
      {
        id: "business",
        label: "Business Strategy",
        text:
          "Create a clear, structured business strategy with actionable steps. Include: positioning, offers, pricing, content/marketing channels, weekly execution plan, KPIs, risks, and a 30-day rollout plan.",
      },
      {
        id: "nonprofit",
        label: "Nonprofit Growth",
        text:
          "Build a nonprofit growth plan. Include: mission clarity, target beneficiaries, programs, fundraising ideas, donor pitch, sponsorship deck outline, grant-ready summary, social media plan, volunteer roles, governance basics, impact metrics, and a 90-day execution roadmap.",
      },
      {
        id: "education",
        label: "Education / Curriculum",
        text:
          "Design an age-appropriate educational curriculum with learning objectives, lesson breakdowns, activities, assessments, differentiation, and resources needed. Include a weekly plan and measurable outcomes.",
      },
      {
        id: "aiTopics",
        label: "AI Topic Generator",
        text:
          "Generate trending and evergreen AI-related topics explained simply. Include: who it’s for, why it matters, examples, and content angles for short-form + long-form. Give 10 topics with hooks.",
      },
      {
        id: "digitalProduct",
        label: "Digital Product",
        text:
          "Design a profitable digital product including the target audience, problem solved, product format, pricing strategy, content outline, funnel, and launch plan. Include a simple sales page structure and 10 marketing angles.",
        proOnly: true,
      },
    ],
    []
  );

  const remaining =
    plan === "pro" ? Infinity : Math.max(0, FREE_DAILY_LIMIT - dailyCount);

  const canGenerate = () => (plan === "pro" ? true : dailyCount < FREE_DAILY_LIMIT);

  const bumpUsage = () => {
    if (plan === "pro") return;
    const next = dailyCount + 1;
    setDailyCount(next);
    writeUsage(next);
  };

  const followUpsFromResult = (r: any) => {
    const v = r?.follow_up_questions ?? r?.["Follow-up Questions"] ?? r?.followUps;
    return Array.isArray(v) ? v.filter((q: any) => typeof q === "string") : [];
  };

  const applyPreset = (p: Preset) => {
    setError("");

    if (p.proOnly && plan !== "pro") {
      setShowUpgrade(true);
      setError("That preset is Pro-only. Upgrade to unlock it.");
      return;
    }

    setPreset(p.id);
    setIdea(p.text);
    textareaRef.current?.focus();
  };

  const enforceHistoryLimit = (items: HistoryItem[]) => {
    if (plan === "pro") return items;

    const saved = items.filter((x) => x.saved);
    const nonSaved = items.filter((x) => !x.saved);

    const trimmedNonSaved = nonSaved.slice(0, FREE_HISTORY_LIMIT);
    const merged = [...saved, ...trimmedNonSaved];

    const byId = new Map<string, HistoryItem>();
    for (const item of merged) byId.set(item.id, item);

    return Array.from(byId.values()).sort((a, b) => b.createdAt - a.createdAt);
  };

  const saveToHistory = (input: string, output: string, fups: string[]) => {
    const item: HistoryItem = {
      id: uid(),
      createdAt: Date.now(),
      preset,
      input,
      output,
      followUps: fups,
      saved: false,
    };

    const next = enforceHistoryLimit(
      [item, ...history].sort((a, b) => b.createdAt - a.createdAt)
    );
    setHistory(next);
    writeHistory(next);
    setActiveHistoryId(item.id);
  };

  const toggleSaved = (id: string) => {
    const next = history.map((h) => (h.id === id ? { ...h, saved: !h.saved } : h));
    const enforced = enforceHistoryLimit(next.sort((a, b) => b.createdAt - a.createdAt));
    setHistory(enforced);
    writeHistory(enforced);
  };

  const deleteHistoryItem = (id: string) => {
    const next = history.filter((h) => h.id !== id);
    setHistory(next);
    writeHistory(next);
    if (activeHistoryId === id) setActiveHistoryId(null);
  };

  const clearAllHistory = () => {
    const keepSaved = history.filter((h) => h.saved);
    const enforced = enforceHistoryLimit(keepSaved.sort((a, b) => b.createdAt - a.createdAt));
    setHistory(enforced);
    writeHistory(enforced);
    setActiveHistoryId(null);
  };

  const loadHistoryItem = (item: HistoryItem) => {
    setIdea(item.input);
    setPreset(item.preset);
    setResult({ prompt: item.output, follow_up_questions: item.followUps });
    setActiveHistoryId(item.id);
    setError("");
    textareaRef.current?.focus();
  };

  const handleFollowUpClick = (q: string) => {
    setIdea((prev) => {
      const base = prev.trim();
      const block = `\n\n---\nFollow-up question:\n${q}\n\nMy answer:\n`;
      return base ? base + block : `Follow-up question:\n${q}\n\nMy answer:\n`;
    });

    setTimeout(() => {
      textareaRef.current?.focus();
      textareaRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 0);
  };

  const handleArchitect = async () => {
    setError("");
    setResult(null);

    const trimmed = idea.trim();
    if (!trimmed) {
      setError("Type something first.");
      return;
    }

    if (!canGenerate()) {
      setShowUpgrade(true);
      setError(
        `Daily limit reached. Free plan allows ${FREE_DAILY_LIMIT} prompts/day. Upgrade for unlimited.`
      );
      return;
    }

    try {
      setLoading(true);

      const res = await fetch("/api/transformPrompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userInput: trimmed }),
      });

      let data: any = null;
      try {
        data = await res.json();
      } catch {
        data = null;
      }

      if (!res.ok) {
        setError(data?.error || `Request failed (${res.status})`);
        return;
      }

      bumpUsage();

      const promptText = toCopyReadyPrompt(data);
      const fups = followUpsFromResult(data) as string[];

      setResult({ ...(data || {}), prompt: promptText, follow_up_questions: fups });
      saveToHistory(trimmed, promptText, fups);
    } catch (e: any) {
      setError(e?.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  const followUps = followUpsFromResult(result);

  const filteredHistory = useMemo(() => {
    const base = historyTab === "saved" ? history.filter((h) => h.saved) : history;

    const q = query.trim().toLowerCase();
    if (!q) return base;

    return base.filter((h) => {
      const hay = `${h.input}\n${h.output}`.toLowerCase();
      return hay.includes(q);
    });
  }, [history, historyTab, query]);

  const exportData = useMemo(() => {
    return history.map((h) => ({
      id: h.id,
      createdAt: h.createdAt,
      preset: h.preset,
      saved: h.saved,
      input: h.input,
      output: h.output,
      followUps: h.followUps,
    }));
  }, [history]);

  // Premium styles (Dark bg + white glass cards)
  const cardStyle: React.CSSProperties = {
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 26,
    background: "rgba(255,255,255,0.97)", // more contrast vs previous
    boxShadow: "0 18px 50px rgba(0,0,0,0.35)",
    backdropFilter: "blur(10px)",
  };

  const headerMuted: React.CSSProperties = {
    color: "rgba(226,232,240,0.88)",
    lineHeight: 1.6,
  };

  const cardMuted: React.CSSProperties = {
    color: "#475569",
    lineHeight: 1.6,
  };

  const pill: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 900,
    padding: "7px 12px",
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.18)",
    background: "rgba(15, 23, 42, 0.35)",
    color: "#e2e8f0",
    backdropFilter: "blur(8px)",
  };

  const ctaBase: React.CSSProperties = {
    padding: "12px 18px",
    borderRadius: 18,
    border: "1px solid rgba(255,255,255,0.25)",
    color: "#fff",
    fontWeight: 1000,
    transition: "all 0.2s ease",
    transform: "translateY(0)",
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(1200px 600px at 20% 0%, rgba(59,130,246,0.35) 0%, rgba(59,130,246,0) 60%), radial-gradient(1000px 500px at 80% 10%, rgba(99,102,241,0.35) 0%, rgba(99,102,241,0) 55%), linear-gradient(180deg, #0b1220 0%, #08101d 100%)",
        padding: "56px 16px",
      }}
    >
      <main style={{ maxWidth: 1180, margin: "0 auto" }}>
        {/* HEADER */}
        <div style={{ marginBottom: 18 }}>
          <div
            style={{
              display: "flex",
              gap: 10,
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
            }}
          >
            <span style={pill}>PromptArchitect Pro</span>

            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={pill}>Plan: {plan === "pro" ? "Pro (Unlimited)" : "Free"}</span>

              {plan === "free" && (
                <span
                  style={{
                    ...pill,
                    background: remaining === 0 ? "rgba(239,68,68,0.25)" : "rgba(14,165,233,0.22)",
                    border: "1px solid rgba(255,255,255,0.16)",
                    color: remaining === 0 ? "#fecaca" : "#e0f2fe",
                  }}
                >
                  {remaining} / {FREE_DAILY_LIMIT} left today
                </span>
              )}

              <button
                onClick={() => {
                  setPlan((p) => (p === "free" ? "pro" : "free"));
                  setShowUpgrade(false);
                  setError("");
                  setHistory((h) => {
                    const enforced = enforceHistoryLimit(h);
                    writeHistory(enforced);
                    return enforced;
                  });
                }}
                style={{
                  padding: "10px 14px",
                  borderRadius: 14,
                  border: "1px solid rgba(255,255,255,0.18)",
                  background: plan === "pro" ? "rgba(255,255,255,0.15)" : "rgba(15,23,42,0.45)",
                  color: "#e2e8f0",
                  fontWeight: 900,
                  cursor: "pointer",
                  backdropFilter: "blur(10px)",
                  transition: "transform 0.15s ease",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.transform = "translateY(-1px)")}
                onMouseLeave={(e) => (e.currentTarget.style.transform = "translateY(0)")}
                title="Demo toggle for now. Later: real billing."
              >
                {plan === "pro" ? "Switch to Free" : "Try Pro (Demo)"}
              </button>
            </div>
          </div>

          <h1
            style={{
              fontSize: 58,
              margin: "16px 0 10px",
              color: "#f8fafc",
              letterSpacing: -0.8,
              lineHeight: 1.05,
            }}
          >
            Stop guessing.
            <br />
            Run your AI operating system.
          </h1>

          <p style={{ ...headerMuted, fontSize: 16, maxWidth: 920, margin: "0 0 10px" }}>
            PromptArchitect is your command center: prompts, workflows, presets, and reusable output — all in one place.
          </p>

          <p style={{ ...headerMuted, fontSize: 16, maxWidth: 920, margin: 0 }}>
            Pick a module or write your idea. You’ll get copy-ready output for ChatGPT, Gemini, or any AI tool.
          </p>
        </div>

        {/* UPGRADE BANNER */}
        {showUpgrade && plan !== "pro" && (
          <section
            style={{
              ...cardStyle,
              padding: 16,
              marginBottom: 14,
              borderColor: "rgba(245, 158, 11, 0.35)",
            }}
          >
            <div style={{ fontWeight: 1000, color: "#7c2d12", marginBottom: 6 }}>
              Upgrade to Pro
            </div>

            <div style={{ color: "#7c2d12", lineHeight: 1.7 }}>
              - Unlimited prompts per day
              <br />
              - Unlimited history (Free keeps last {FREE_HISTORY_LIMIT})
              <br />
              - Unlock Pro-only modules (Digital Product + more coming)
            </div>

            <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button
                onClick={() => setPlan("pro")}
                style={{
                  padding: "12px 16px",
                  borderRadius: 16,
                  border: "1px solid rgba(255,255,255,0.25)",
                  background: "linear-gradient(135deg, #2563eb 0%, #4f46e5 50%, #0ea5e9 100%)",
                  color: "#fff",
                  fontWeight: 1000,
                  cursor: "pointer",
                  boxShadow: "0 12px 24px rgba(37,99,235,0.25)",
                  transition: "transform 0.15s ease",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.transform = "translateY(-2px)")}
                onMouseLeave={(e) => (e.currentTarget.style.transform = "translateY(0)")}
              >
                Upgrade (Demo)
              </button>

              <button
                onClick={() => setShowUpgrade(false)}
                style={{
                  padding: "12px 16px",
                  borderRadius: 16,
                  border: "1px solid rgba(15,23,42,0.2)",
                  background: "#fff",
                  color: "#0f172a",
                  fontWeight: 900,
                  cursor: "pointer",
                }}
              >
                Not now
              </button>
            </div>
          </section>
        )}

        {/* LAYOUT */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.2fr 0.8fr",
            gap: 16,
            alignItems: "start",
          }}
        >
          {/* LEFT */}
          <div>
            {/* INPUT CARD */}
            <section style={{ ...cardStyle, padding: 18 }}>
              {/* PRESETS */}
              <div style={{ marginBottom: 14 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    justifyContent: "space-between",
                    gap: 12,
                    marginBottom: 10,
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 1000, color: "#0f172a" }}>Modules</div>
                    <div style={{ ...cardMuted, fontSize: 13 }}>
                      Choose a module. Generate. Save. Reuse.
                    </div>
                  </div>

                  {preset && (
                    <span
                      style={{
                        fontSize: 12,
                        color: "#1d4ed8",
                        background: "#dbeafe",
                        border: "1px solid #93c5fd",
                        padding: "5px 10px",
                        borderRadius: 999,
                        fontWeight: 1000,
                      }}
                    >
                      Selected: {presets.find((x) => x.id === preset)?.label}
                    </span>
                  )}
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {presets.map((p) => {
                    const active = preset === p.id;
                    const locked = !!p.proOnly && plan !== "pro";
                    return (
                      <button
                        key={p.id}
                        onClick={() => applyPreset(p)}
                        style={{
                          padding: "9px 12px",
                          borderRadius: 999,
                          border: locked
                            ? "1px solid #fca5a5"
                            : active
                            ? "1px solid #1d4ed8"
                            : "1px solid rgba(15,23,42,0.18)",
                          background: locked
                            ? "#fff1f2"
                            : active
                            ? "linear-gradient(135deg, #2563eb 0%, #4f46e5 50%, #0ea5e9 100%)"
                            : "#fff",
                          color: locked ? "#b91c1c" : active ? "#fff" : "#0f172a",
                          fontSize: 13,
                          fontWeight: 1000,
                          cursor: "pointer",
                          display: "flex",
                          gap: 8,
                          alignItems: "center",
                          boxShadow: active ? "0 10px 22px rgba(37,99,235,0.20)" : "none",
                          transition: "transform 0.12s ease",
                        }}
                        onMouseEnter={(e) => {
                          if (!locked) e.currentTarget.style.transform = "translateY(-1px)";
                        }}
                        onMouseLeave={(e) => (e.currentTarget.style.transform = "translateY(0)")}
                        title={locked ? "Pro-only module" : ""}
                      >
                        <span>{p.label}</span>
                        {p.proOnly && (
                          <span
                            style={{
                              fontSize: 11,
                              padding: "2px 8px",
                              borderRadius: 999,
                              background: locked ? "#fecaca" : "rgba(255,255,255,0.25)",
                              color: locked ? "#7f1d1d" : "#fff",
                              border: locked
                                ? "1px solid #fca5a5"
                                : "1px solid rgba(255,255,255,0.25)",
                            }}
                          >
                            PRO
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* TEXTAREA */}
              <div style={{ marginTop: 14 }}>
                <div style={{ fontWeight: 1000, color: "#0f172a", marginBottom: 8 }}>
                  Your command
                </div>

                <textarea
                  ref={textareaRef}
                  placeholder="Example: Build a weekly content system for TikTok + YouTube, with scripts, hooks, and a simple monetisation path."
                  value={idea}
                  onChange={(e) => setIdea(e.target.value)}
                  rows={7}
                  style={{
                    width: "100%",
                    padding: 14,
                    fontSize: 16,
                    borderRadius: 18,
                    border: "1px solid rgba(15,23,42,0.18)",
                    outline: "none",
                    resize: "vertical",
                    lineHeight: 1.6,
                    background: "rgba(255,255,255,0.9)",
                  }}
                />

                <div
                  style={{
                    marginTop: 12,
                    display: "flex",
                    gap: 10,
                    alignItems: "center",
                    flexWrap: "wrap",
                  }}
                >
                  <button
                    onClick={handleArchitect}
                    disabled={loading || (plan === "free" && remaining === 0)}
                    style={{
                      ...ctaBase,
                      background:
                        loading || (plan === "free" && remaining === 0)
                          ? "#94a3b8"
                          : "linear-gradient(135deg, #2563eb 0%, #4f46e5 50%, #0ea5e9 100%)",
                      cursor:
                        loading || (plan === "free" && remaining === 0)
                          ? "not-allowed"
                          : "pointer",
                      boxShadow:
                        loading || (plan === "free" && remaining === 0)
                          ? "none"
                          : "0 14px 26px rgba(37,99,235,0.25)",
                    }}
                    onMouseEnter={(e) => {
                      if (!e.currentTarget.disabled) e.currentTarget.style.transform = "translateY(-2px)";
                    }}
                    onMouseLeave={(e) => (e.currentTarget.style.transform = "translateY(0)")}
                  >
                    {loading
                      ? "Working…"
                      : plan === "free" && remaining === 0
                      ? "Daily limit reached"
                      : "Generate output"}
                  </button>

                  <button
                    onClick={() => {
                      setIdea("");
                      setPreset(null);
                      setResult(null);
                      setError("");
                      setShowUpgrade(false);
                      setActiveHistoryId(null);
                    }}
                    style={{
                      padding: "12px 18px",
                      borderRadius: 18,
                      border: "1px solid rgba(15,23,42,0.18)",
                      background: "#fff",
                      cursor: "pointer",
                      fontWeight: 1000,
                      color: "#0f172a",
                      transition: "transform 0.15s ease",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.transform = "translateY(-1px)")}
                    onMouseLeave={(e) => (e.currentTarget.style.transform = "translateY(0)")}
                  >
                    Clear
                  </button>

                  <span style={{ ...cardMuted, fontSize: 13 }}>
                    Free: {FREE_DAILY_LIMIT}/day + last {FREE_HISTORY_LIMIT} history. Pro: unlimited.
                  </span>
                </div>

                {error && (
                  <div
                    style={{
                      marginTop: 14,
                      padding: 14,
                      borderRadius: 16,
                      border: "1px solid #fecaca",
                      color: "#b91c1c",
                      background: "#fef2f2",
                      whiteSpace: "pre-wrap",
                      fontWeight: 800,
                    }}
                  >
                    {error}
                  </div>
                )}
              </div>
            </section>

            {/* OUTPUT CARD */}
            {result && (
              <section style={{ ...cardStyle, padding: 18, marginTop: 16 }}>
                <div style={{ marginBottom: 10 }}>
                  <span
                    style={{
                      display: "inline-block",
                      padding: "5px 10px",
                      borderRadius: 999,
                      backgroundColor: "#dbeafe",
                      color: "#1d4ed8",
                      fontSize: 12,
                      fontWeight: 1000,
                      border: "1px solid #93c5fd",
                    }}
                  >
                    Output: Copy-ready
                  </span>

                  <h2 style={{ margin: "10px 0 6px", color: "#0f172a" }}>
                    Your generated output
                  </h2>

                  <p style={{ ...cardMuted, fontSize: 14, margin: 0 }}>
                    Copy and use this in ChatGPT, Gemini, or your workflow.
                  </p>
                </div>

                <PromptOutput output={result.prompt || "No output generated."} />

                <div style={{ marginTop: 14 }}>
                  <div style={{ fontWeight: 1000, marginBottom: 8 }}>Follow-up questions</div>

                  {followUps.length > 0 ? (
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {followUps.map((q, i) => (
                        <button
                          key={i}
                          onClick={() => handleFollowUpClick(q)}
                          style={{
                            padding: "10px 12px",
                            borderRadius: 16,
                            border: "1px solid rgba(15,23,42,0.18)",
                            background: "#fff",
                            cursor: "pointer",
                            fontWeight: 900,
                            color: "#0f172a",
                            textAlign: "left",
                            transition: "transform 0.12s ease",
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.transform = "translateY(-1px)")}
                          onMouseLeave={(e) => (e.currentTarget.style.transform = "translateY(0)")}
                          title="Click to add this question into your command box"
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p style={{ fontStyle: "italic", color: "#64748b", margin: 0 }}>
                      None provided.
                    </p>
                  )}
                </div>
              </section>
            )}
          </div>

          {/* RIGHT: HISTORY */}
          <aside style={{ ...cardStyle, padding: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
              <div>
                <div style={{ fontWeight: 1000, color: "#0f172a" }}>Prompt History</div>
                <div style={{ ...cardMuted, fontSize: 13 }}>
                  Auto-saved on success. Star your best ones.
                </div>
              </div>

              <button
                onClick={() => {
                  if (plan !== "pro") setShowUpgrade(true);
                  clearAllHistory();
                }}
                style={{
                  padding: "8px 12px",
                  borderRadius: 16,
                  border: "1px solid rgba(15,23,42,0.18)",
                  background: "#fff",
                  cursor: "pointer",
                  fontWeight: 1000,
                  color: "#0f172a",
                  transition: "transform 0.12s ease",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.transform = "translateY(-1px)")}
                onMouseLeave={(e) => (e.currentTarget.style.transform = "translateY(0)")}
                title="Clears non-saved items. Saved stay."
              >
                Clear
              </button>
            </div>

            {/* TABS + SEARCH */}
            <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
              {[
                { id: "all" as const, label: `All (${history.length})` },
                {
                  id: "saved" as const,
                  label: `Saved (${history.filter((h) => h.saved).length})`,
                },
              ].map((t) => {
                const active = historyTab === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => setHistoryTab(t.id)}
                    style={{
                      padding: "8px 10px",
                      borderRadius: 16,
                      border: active ? "1px solid #1d4ed8" : "1px solid rgba(15,23,42,0.18)",
                      background: active ? "#dbeafe" : "#fff",
                      color: "#0f172a",
                      fontWeight: 1000,
                      cursor: "pointer",
                      fontSize: 13,
                    }}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>

            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search history…"
              style={{
                width: "100%",
                marginTop: 10,
                padding: "10px 12px",
                borderRadius: 16,
                border: "1px solid rgba(15,23,42,0.18)",
                outline: "none",
                fontSize: 14,
                background: "rgba(255,255,255,0.9)",
              }}
            />

            {/* ACTIONS */}
            <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                onClick={() => {
                  const text = exportData
                    .map(
                      (h) =>
                        `---\n${new Date(h.createdAt).toLocaleString()}\n${h.input}\n\n${h.output}\n`
                    )
                    .join("\n");
                  navigator.clipboard.writeText(text || "");
                }}
                style={{
                  padding: "8px 10px",
                  borderRadius: 16,
                  border: "1px solid rgba(15,23,42,0.18)",
                  background: "#fff",
                  cursor: "pointer",
                  fontWeight: 1000,
                  color: "#0f172a",
                  fontSize: 13,
                }}
              >
                Copy All
              </button>

              <button
                onClick={() => downloadJson("prompt-history.json", exportData)}
                style={{
                  padding: "8px 10px",
                  borderRadius: 16,
                  border: "1px solid rgba(15,23,42,0.18)",
                  background: "#fff",
                  cursor: "pointer",
                  fontWeight: 1000,
                  color: "#0f172a",
                  fontSize: 13,
                }}
              >
                Download JSON
              </button>

              {plan === "free" && (
                <span
                  style={{
                    fontSize: 12,
                    padding: "8px 10px",
                    borderRadius: 16,
                    background: "#fffbeb",
                    border: "1px solid #fde68a",
                    color: "#92400e",
                    fontWeight: 1000,
                  }}
                >
                  Free keeps last {FREE_HISTORY_LIMIT}
                </span>
              )}
            </div>

            {/* LIST */}
            <div style={{ marginTop: 12, maxHeight: 520, overflowY: "auto" }}>
              {filteredHistory.length === 0 ? (
                <div style={{ ...cardMuted, fontSize: 13 }}>
                  No history yet. Generate something and it’ll show here.
                </div>
              ) : (
                filteredHistory.map((h) => {
                  const active = activeHistoryId === h.id;

                  return (
                    <div
                      key={h.id}
                      style={{
                        border: active ? "1px solid #1d4ed8" : "1px solid rgba(15,23,42,0.12)",
                        borderRadius: 18,
                        padding: 12,
                        marginBottom: 10,
                        background: active ? "#eff6ff" : "rgba(255,255,255,0.9)",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                        <button
                          onClick={() => loadHistoryItem(h)}
                          style={{
                            textAlign: "left",
                            background: "transparent",
                            border: "none",
                            cursor: "pointer",
                            padding: 0,
                            flex: 1,
                          }}
                          title="Load this prompt"
                        >
                          <div style={{ fontWeight: 1000, color: "#0f172a", fontSize: 13 }}>
                            {h.preset ? presets.find((p) => p.id === h.preset)?.label : "Custom"}
                          </div>
                          <div style={{ ...cardMuted, fontSize: 12 }}>
                            {new Date(h.createdAt).toLocaleString()}
                          </div>
                          <div
                            style={{
                              marginTop: 6,
                              fontSize: 12,
                              color: "#0f172a",
                              lineHeight: 1.5,
                            }}
                          >
                            {h.input.length > 120 ? `${h.input.slice(0, 120)}…` : h.input}
                          </div>
                        </button>

                        <div style={{ display: "flex", gap: 6, alignItems: "start" }}>
                          <button
                            onClick={() => toggleSaved(h.id)}
                            style={{
                              padding: "6px 10px",
                              borderRadius: 14,
                              border: "1px solid rgba(15,23,42,0.18)",
                              background: h.saved ? "#dcfce7" : "#fff",
                              cursor: "pointer",
                              fontWeight: 1000,
                              color: "#0f172a",
                            }}
                            title={h.saved ? "Unsave" : "Save"}
                          >
                            {h.saved ? "★" : "☆"}
                          </button>

                          <button
                            onClick={() => deleteHistoryItem(h.id)}
                            style={{
                              padding: "6px 10px",
                              borderRadius: 14,
                              border: "1px solid #fecaca",
                              background: "#fff",
                              cursor: "pointer",
                              fontWeight: 1000,
                              color: "#b91c1c",
                            }}
                            title="Delete"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </aside>
        </div>

        <div style={{ marginTop: 16, color: "rgba(226,232,240,0.75)", fontSize: 12 }}>
          Billing is demo-mode for now. Next: Stripe + real accounts.
        </div>
      </main>
    </div>
  );
}
import { useState } from "react";

type PromptSchema = {
  title: string;
  aiRole: string;
  context: string;
  task: string;
  constraints: string;
  outputFormat: string;
  followUpQuestions: string[];
};

export default function App() {
  const [idea, setIdea] = useState("");
  const [result, setResult] = useState<PromptSchema | null>(null);
  const [raw, setRaw] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");

  const handleArchitect = async () => {
    setError("");
    setResult(null);
    setRaw("");

    const trimmed = idea.trim();
    if (!trimmed) {
      setError("Type something first.");
      return;
    }

    try {
      setLoading(true);

      const res = await fetch("/api/transformPrompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userInput: trimmed }),
      });

      const text = await res.text();

      if (!res.ok) {
        // try parse error json, else show raw
        try {
          const errObj = JSON.parse(text);
          setError(errObj?.error || `Request failed (${res.status})`);
        } catch {
          setError(text || `Request failed (${res.status})`);
        }
        return;
      }

      // text should be JSON (Gemini returns JSON string)
      setRaw(text);

      const parsed = JSON.parse(text) as PromptSchema;
      setResult(parsed);
    } catch (e: any) {
      setError(e?.message || "Something broke.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main style={{ maxWidth: 900, margin: "60px auto", padding: 16 }}>
      <h1 style={{ fontSize: 54, marginBottom: 10 }}>PromptArchitect Pro</h1>
      <p style={{ fontSize: 18, marginBottom: 18 }}>
        Turn any idea into a clear, expert-level AI prompt.
      </p>

      <textarea
        placeholder="Enter your idea..."
        value={idea}
        onChange={(e) => setIdea(e.target.value)}
        rows={6}
        style={{
          width: "100%",
          padding: 12,
          fontSize: 16,
          borderRadius: 8,
          border: "1px solid #ccc",
        }}
      />

      <div style={{ marginTop: 16, display: "flex", gap: 12 }}>
        <button
          onClick={handleArchitect}
          disabled={loading}
          style={{
            padding: "12px 18px",
            borderRadius: 10,
            border: "none",
            cursor: loading ? "not-allowed" : "pointer",
            fontWeight: 700,
          }}
        >
          {loading ? "Working..." : "Architect Prompt"}
        </button>

        <button
          onClick={() => {
            setIdea("");
            setResult(null);
            setRaw("");
            setError("");
          }}
          style={{
            padding: "12px 18px",
            borderRadius: 10,
            border: "1px solid #ccc",
            cursor: "pointer",
            fontWeight: 700,
            background: "transparent",
          }}
        >
          Clear
        </button>
      </div>

      {error && (
        <div
          style={{
            marginTop: 18,
            padding: 12,
            borderRadius: 8,
            border: "1px solid crimson",
            color: "crimson",
            whiteSpace: "pre-wrap",
          }}
        >
          {error}
        </div>
      )}

      {result && (
        <div style={{ marginTop: 24 }}>
          <h2 style={{ marginBottom: 10 }}>Architect Master Prompt</h2>

          <div
            style={{
              padding: 16,
              borderRadius: 10,
              border: "1px solid #e5e5e5",
              background: "#fafafa",
            }}
          >
            <p><b>Title:</b> {result.title}</p>
            <p><b>AI Role:</b> {result.aiRole}</p>
            <p><b>Context:</b> {result.context}</p>
            <p><b>Task:</b> {result.task}</p>
            <p><b>Constraints:</b> {result.constraints}</p>
            <p><b>Output Format:</b> {result.outputFormat}</p>

            <p style={{ marginTop: 12 }}><b>Follow-up Questions:</b></p>
            <ul>
              {(result.followUpQuestions || []).map((q, i) => (
                <li key={i}>{q}</li>
              ))}
            </ul>
          </div>

          <details style={{ marginTop: 12 }}>
            <summary style={{ cursor: "pointer", fontWeight: 700 }}>
              View raw JSON
            </summary>
            <pre
              style={{
                marginTop: 10,
                padding: 12,
                borderRadius: 8,
                background: "#111",
                color: "#fff",
                whiteSpace: "pre-wrap",
                overflowX: "auto",
              }}
            >
              {raw}
            </pre>
          </details>
        </div>
      )}
    </main>
  );
}

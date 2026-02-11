import { useState } from "react";

type PromptOutputProps = {
  output: string;
};

export default function PromptOutput({ output }: PromptOutputProps) {
  const [copied, setCopied] = useState(false);

  if (!output) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(output);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // If clipboard fails, do nothing (still stable)
    }
  };

  return (
    <div
      style={{
        marginTop: 12,
        padding: 14,
        borderRadius: 14,
        border: "1px solid #e5e7eb",
        backgroundColor: "#f8fafc",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          marginBottom: 10,
          flexWrap: "wrap",
        }}
      >
        <h3 style={{ margin: 0, color: "#0f172a" }}>Generated prompt</h3>

        <button
          onClick={handleCopy}
          style={{
            padding: "8px 12px",
            borderRadius: 12,
            border: "1px solid #d1d5db",
            background: copied ? "#dcfce7" : "#fff",
            color: "#0f172a",
            fontWeight: 800,
            cursor: "pointer",
          }}
        >
          {copied ? "Copied ✓" : "Copy prompt"}
        </button>
      </div>

      <pre
        style={{
          whiteSpace: "pre-wrap",
          lineHeight: 1.7,
          fontSize: 14,
          maxHeight: 420,
          overflowY: "auto",
          background: "#ffffff",
          padding: 12,
          borderRadius: 12,
          border: "1px solid #e5e7eb",
          margin: 0,
          color: "#0f172a",
        }}
      >
        {output}
      </pre>
    </div>
  );
}
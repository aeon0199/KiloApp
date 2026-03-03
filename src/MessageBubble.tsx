import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { Copy, Check } from "lucide-react";
import type { MessageWithParts } from "./types";
import { formatTime, partText, toolState } from "./utils";

type MessageBubbleProps = {
  message: MessageWithParts;
  onUseQuickReply?: (value: string) => void;
};

function cleanQuickReply(value: string): string {
  return value
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/^"+|"+$/g, "")
    .trim();
}

function extractQuickReplies(texts: string[]): string[] {
  const values: string[] = [];
  let hasChecklist = false;
  let bulletCount = 0;

  for (const text of texts) {
    const lines = text.split(/\r?\n/);
    for (const line of lines) {
      const checklistMatch = line.match(/^\s*[-*]\s+\[(?: |x|X)?\]\s+(.+)$/);
      if (checklistMatch) {
        hasChecklist = true;
        const cleaned = cleanQuickReply(checklistMatch[1]);
        if (cleaned && cleaned.length <= 120) values.push(cleaned);
        continue;
      }

      const bulletMatch = line.match(/^\s*[-*o]\s+(.+)$/);
      if (!bulletMatch) continue;

      const cleaned = cleanQuickReply(bulletMatch[1]);
      if (!cleaned) continue;
      if (cleaned.endsWith(":")) continue;
      if (cleaned.length > 120) continue;
      if (/^https?:\/\//i.test(cleaned)) continue;
      bulletCount += 1;
      values.push(cleaned);
    }
  }

  if (!hasChecklist && bulletCount < 2) return [];
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const value of values) {
    if (seen.has(value)) continue;
    seen.add(value);
    unique.push(value);
  }
  return unique.slice(0, 10);
}

export function MessageBubble({ message, onUseQuickReply }: MessageBubbleProps) {
  const texts = message.parts.map(partText).filter(Boolean);
  const tools = message.parts.map(toolState).filter((t) => t !== null);
  const errorName = message.info.error?.name || "";
  const errorMessage = message.info.error?.data?.message || "";
  const quickReplies = message.info.role === "assistant" ? extractQuickReplies(texts) : [];
  const [copied, setCopied] = useState(false);

  // Don't render empty assistant messages (e.g. reasoning-only while thinking)
  if (texts.length === 0 && tools.length === 0 && message.info.role === "assistant" && !errorName) {
    return null;
  }

  function handleCopy() {
    const allText = texts.join("\n\n");
    navigator.clipboard.writeText(allText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <article className={`message ${message.info.role}`}>
      <div className="bubble">
        <div className="message-head">
          <strong>{message.info.role === "assistant" ? "Kilo" : "You"}</strong>
          <div className="message-head-meta">
            {message.info.role === "assistant" && message.info.agent && (
              <span className="message-runtime-chip">agent: {message.info.agent}</span>
            )}
            {message.info.role === "assistant" && message.info.modelID && (
              <span className="message-runtime-chip">model: {message.info.modelID}</span>
            )}
            <span>{formatTime(message.info.time?.created)}</span>
          </div>
        </div>
        {texts.map((text, idx) => (
          <div key={`${message.info.id}-t-${idx}`} className="message-markdown">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                code({ className, children, ...props }) {
                  const match = /language-(\w+)/.exec(className || "");
                  const codeStr = String(children).replace(/\n$/, "");
                  if (match) {
                    return (
                      <SyntaxHighlighter
                        style={oneDark}
                        language={match[1]}
                        PreTag="div"
                        customStyle={{
                          margin: 0,
                          borderRadius: "6px",
                          fontSize: "var(--code-font-size)",
                          lineHeight: "var(--code-line-height)",
                        }}
                      >
                        {codeStr}
                      </SyntaxHighlighter>
                    );
                  }
                  return (
                    <code className="inline-code" {...props}>
                      {children}
                    </code>
                  );
                },
              }}
            >
              {text}
            </ReactMarkdown>
          </div>
        ))}
        {message.info.role === "assistant" && errorName && (
          <div className="message-error">
            <strong>Run failed</strong>
            <span>{errorMessage || errorName}</span>
          </div>
        )}
        {message.info.role === "assistant" && onUseQuickReply && quickReplies.length > 0 && (
          <div className="quick-replies">
            {quickReplies.map((value, idx) => (
              <button
                type="button"
                key={`${message.info.id}-quick-${idx}`}
                className="quick-reply-btn"
                onClick={() => onUseQuickReply(value)}
              >
                {value}
              </button>
            ))}
          </div>
        )}
        {message.info.role === "assistant" && texts.length > 0 && (
          <button type="button" className="copy-btn" onClick={handleCopy}>
            {copied ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy</>}
          </button>
        )}
        {tools.length > 0 && (
          <div className="tool-row">
            {tools.map((tool, idx) => (
              <div key={`${message.info.id}-tool-${idx}`} className="tool-inline">
                <span className={`tool-inline-dot ${tool.status}`} />
                <span className="tool-inline-label">{tool.name}</span>
                <span className="tool-inline-status">{tool.status}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}

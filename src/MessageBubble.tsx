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
};

export function MessageBubble({ message }: MessageBubbleProps) {
  const texts = message.parts.map(partText).filter(Boolean);
  const tools = message.parts.map(toolState).filter((t) => t !== null);
  const [copied, setCopied] = useState(false);

  // Don't render empty assistant messages (e.g. reasoning-only while thinking)
  if (texts.length === 0 && tools.length === 0 && message.info.role === "assistant") {
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
          <span>{formatTime(message.info.time?.created)}</span>
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

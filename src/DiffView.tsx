import { diffLines } from "diff";

type DiffViewProps = {
  content: string;
  path: string;
  oldContent?: string;
};

export function DiffView({ content, path, oldContent }: DiffViewProps) {
  // If we have old + new content, compute a real diff
  if (oldContent !== undefined) {
    const changes = diffLines(oldContent, content);
    return (
      <div className="diff-view">
        <div className="diff-header">{path}</div>
        <div className="diff-body">
          {changes.map((change, i) => {
            const lines = change.value.replace(/\n$/, "").split("\n");
            return lines.map((line, j) => (
              <div
                key={`${i}-${j}`}
                className={`diff-line ${change.added ? "diff-add" : change.removed ? "diff-del" : ""}`}
              >
                {change.added ? "+" : change.removed ? "-" : " "}{line}
              </div>
            ));
          })}
        </div>
      </div>
    );
  }

  // If content looks like a unified diff, render it directly
  const lines = content.split("\n");
  const looksLikeDiff = lines.some(l => l.startsWith("@@") || (l.startsWith("---") && lines.some(l2 => l2.startsWith("+++"))));

  if (looksLikeDiff) {
    return (
      <div className="diff-view">
        <div className="diff-header">{path}</div>
        <div className="diff-body">
          {lines.map((line, i) => {
            let cls = "diff-line";
            if (line.startsWith("+") && !line.startsWith("+++")) cls += " diff-add";
            else if (line.startsWith("-") && !line.startsWith("---")) cls += " diff-del";
            else if (line.startsWith("@@")) cls += " diff-hunk";
            return <div key={i} className={cls}>{line}</div>;
          })}
        </div>
      </div>
    );
  }

  // Plain content — show as additions (capped at 50 lines)
  return (
    <div className="diff-view">
      <div className="diff-header">{path}</div>
      <div className="diff-body">
        {lines.slice(0, 50).map((line, i) => (
          <div key={i} className="diff-line diff-add">+{line}</div>
        ))}
        {lines.length > 50 && (
          <div className="diff-line diff-info">... {lines.length - 50} more lines</div>
        )}
      </div>
    </div>
  );
}

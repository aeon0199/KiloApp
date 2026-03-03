import { useCallback, useRef } from "react";

type PanelSplitterProps = {
  onResize: (delta: number) => void;
  direction?: "vertical" | "horizontal";
};

export function PanelSplitter({ onResize, direction = "vertical" }: PanelSplitterProps) {
  const startRef = useRef(0);
  const isHorizontal = direction === "horizontal";

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    startRef.current = isHorizontal ? e.clientY : e.clientX;

    const onMouseMove = (e: MouseEvent) => {
      const current = isHorizontal ? e.clientY : e.clientX;
      const delta = current - startRef.current;
      startRef.current = current;
      onResize(delta);
    };

    const onMouseUp = () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    document.body.style.cursor = isHorizontal ? "row-resize" : "col-resize";
    document.body.style.userSelect = "none";
  }, [onResize, isHorizontal]);

  return (
    <div
      className={`panel-splitter ${isHorizontal ? "horizontal" : "vertical"}`}
      onMouseDown={onMouseDown}
    />
  );
}

"use client";

import {
  forwardRef,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {
  ReactSketchCanvas,
  type ReactSketchCanvasRef,
} from "react-sketch-canvas";

export interface SketchPadHandle {
  // Returns base64 PNG (no `data:` prefix) when the user drew something,
  // or null if the canvas is empty.
  exportPng(): Promise<string | null>;
  clear(): void;
}

interface SketchPadProps {
  disabled?: boolean;
}

const SKETCH_STROKE = 3;
const ERASER_STROKE = 14;
const CANVAS_BG = "#fafafa";

const SketchPad = forwardRef<SketchPadHandle, SketchPadProps>(
  function SketchPad({ disabled }, ref) {
    const canvasRef = useRef<ReactSketchCanvasRef | null>(null);
    const [tool, setTool] = useState<"pen" | "eraser">("pen");
    const [hasStrokes, setHasStrokes] = useState(false);

    useImperativeHandle(ref, () => ({
      async exportPng() {
        if (!canvasRef.current || !hasStrokes) return null;
        const dataUrl = await canvasRef.current.exportImage("png");
        const comma = dataUrl.indexOf(",");
        return comma === -1 ? dataUrl : dataUrl.slice(comma + 1);
      },
      clear() {
        canvasRef.current?.clearCanvas();
        setHasStrokes(false);
      },
    }));

    function selectPen() {
      canvasRef.current?.eraseMode(false);
      setTool("pen");
    }

    function selectEraser() {
      canvasRef.current?.eraseMode(true);
      setTool("eraser");
    }

    function undo() {
      canvasRef.current?.undo();
    }

    function clearSketch() {
      canvasRef.current?.clearCanvas();
      setHasStrokes(false);
    }

    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-zinc-700">
            Sketch (optional)
          </label>
          <div className="flex gap-1">
            <ToolButton active={tool === "pen"} onClick={selectPen} disabled={disabled}>
              Pen
            </ToolButton>
            <ToolButton
              active={tool === "eraser"}
              onClick={selectEraser}
              disabled={disabled}
            >
              Eraser
            </ToolButton>
            <ToolButton onClick={undo} disabled={disabled || !hasStrokes}>
              Undo
            </ToolButton>
            <ToolButton onClick={clearSketch} disabled={disabled || !hasStrokes}>
              Skip / Clear
            </ToolButton>
          </div>
        </div>
        <div
          className="overflow-hidden rounded border border-zinc-300"
          style={{ touchAction: "none" }}
        >
          <ReactSketchCanvas
            ref={canvasRef}
            width="100%"
            height="400px"
            strokeColor="#000000"
            strokeWidth={SKETCH_STROKE}
            eraserWidth={ERASER_STROKE}
            canvasColor={CANVAS_BG}
            withTimestamp={false}
            onChange={(paths) => setHasStrokes(paths.length > 0)}
            style={{
              border: "none",
              opacity: disabled ? 0.6 : 1,
              pointerEvents: disabled ? "none" : "auto",
            }}
          />
        </div>
      </div>
    );
  },
);

function ToolButton({
  active,
  disabled,
  onClick,
  children,
}: {
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={
        active
          ? "rounded bg-black px-2 py-1 text-xs font-medium text-white disabled:opacity-50"
          : "rounded border border-zinc-300 px-2 py-1 text-xs font-medium text-zinc-700 disabled:opacity-50"
      }
    >
      {children}
    </button>
  );
}

export default SketchPad;

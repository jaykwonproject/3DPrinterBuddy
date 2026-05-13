"use client";

interface PhaseStepperProps {
  active: 0 | 1 | 2 | 3 | -1;
  done: number; // how many steps completed (0-4)
}

const STEPS = ["Capture", "Calibrate", "Describe", "Result"] as const;

export default function PhaseStepper({ active, done }: PhaseStepperProps) {
  return (
    <ol className="flex w-full items-center gap-2 text-xs">
      {STEPS.map((label, i) => {
        const isDone = i < done;
        const isActive = i === active;
        const stateClass = isActive
          ? "bg-black text-white"
          : isDone
            ? "bg-emerald-500 text-white"
            : "bg-zinc-200 text-zinc-600";
        return (
          <li key={label} className="flex flex-1 items-center gap-2">
            <span
              className={`flex h-6 w-6 flex-none items-center justify-center rounded-full text-[11px] font-semibold ${stateClass}`}
            >
              {i + 1}
            </span>
            <span
              className={
                isActive
                  ? "font-medium text-zinc-900"
                  : isDone
                    ? "text-zinc-700"
                    : "text-zinc-400"
              }
            >
              {label}
            </span>
            {i < STEPS.length - 1 && (
              <span
                className={`h-px flex-1 ${
                  isDone ? "bg-emerald-500" : "bg-zinc-200"
                }`}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}

interface SpinnerProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}

const SIZE_CLASS = {
  sm: "h-3 w-3 border-2",
  md: "h-4 w-4 border-2",
  lg: "h-6 w-6 border-[3px]",
} as const;

export default function Spinner({ size = "md", className = "" }: SpinnerProps) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={`inline-block flex-none animate-spin rounded-full border-zinc-300 border-t-zinc-700 ${SIZE_CLASS[size]} ${className}`}
    />
  );
}

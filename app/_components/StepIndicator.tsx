type Step = "upload" | "review" | "preview" | "build";

const STEPS: { key: Step; label: string }[] = [
  { key: "upload", label: "Upload" },
  { key: "review", label: "Review" },
  { key: "preview", label: "Preview" },
  { key: "build", label: "Build" },
];

export function StepIndicator(props: { current: Step }): React.ReactElement {
  const currentIndex = STEPS.findIndex((s) => s.key === props.current);

  return (
    <nav aria-label="Progress" className="flex items-center gap-0 py-2 mb-6">
      {STEPS.map((step, idx) => {
        const isPast = idx < currentIndex;
        const isCurrent = idx === currentIndex;

        const circleClass = isCurrent
          ? "bg-blue-600 text-white"
          : isPast
            ? "bg-gray-300 text-gray-500"
            : "bg-gray-100 text-gray-300 border border-gray-200";

        const labelClass = isCurrent
          ? "text-blue-700 font-semibold"
          : isPast
            ? "text-gray-400"
            : "text-gray-300";

        return (
          <div key={step.key} className="flex items-center">
            <div className="flex items-center gap-1.5">
              <span
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium leading-none ${circleClass}`}
              >
                {idx + 1}
              </span>
              <span className={`text-sm ${labelClass}`}>{step.label}</span>
            </div>
            {idx < STEPS.length - 1 && (
              <span className="mx-2 text-gray-300 text-xs select-none">›</span>
            )}
          </div>
        );
      })}
    </nav>
  );
}

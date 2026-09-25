"use client";

export interface Step {
  label: string;
  hint: string;
}

interface StepperProps {
  steps: Step[];
  current: number;
}

export function Stepper({ steps, current }: StepperProps) {
  return (
    <ol
      className="grid grid-cols-2 gap-2 sm:grid-cols-[repeat(var(--stc),minmax(0,1fr))]"
      style={{ "--stc": steps.length } as React.CSSProperties}
      aria-label="Builder progress"
    >
      {steps.map((step, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li
            key={step.label}
            aria-current={active ? "step" : undefined}
            className={`rounded-xl border px-3 py-2.5 transition-colors ${
              active
                ? "bg-ivory-950 text-ivory-100 border-ivory-950"
                : done
                  ? "bg-[var(--color-surface)] border-[var(--color-accent-soft)]"
                  : "bg-[var(--color-surface)] border-[var(--color-line)] opacity-70"
            }`}
          >
            <div className="flex items-center gap-2">
              <span
                className={`font-display text-lg font-extrabold leading-none ${
                  active ? "text-bronze-200" : done ? "text-bronze-600" : "text-ivory-500"
                }`}
                aria-hidden="true"
              >
                {done ? "✓" : `0${i + 1}`}
              </span>
              <div className="min-w-0">
                <p
                  className={`text-xs font-semibold truncate ${
                    active ? "text-ivory-100" : "text-ivory-900"
                  }`}
                >
                  {step.label}
                </p>
                <p
                  className={`text-[10px] truncate ${
                    active ? "text-ivory-300" : "text-ivory-600"
                  }`}
                >
                  {step.hint}
                </p>
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

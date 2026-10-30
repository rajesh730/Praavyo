"use client";

import { Check as FaCheck } from "lucide-react";

export default function ProgressIndicator({
  currentStep,
  totalSteps,
  stepLabels,
  onStepClick,
  completedSteps = [],
}) {
  return (
    <div className="mb-5">
      {/* Progress bar */}
      <div className="w-full bg-brand-soft rounded-full h-2 mb-4">
        <div
          className="bg-brand h-2 rounded-full transition-colors"
          style={{ width: `${((currentStep + 1) / totalSteps) * 100}%` }}
        />
      </div>

      {/* Step indicators */}
      <div className="flex justify-between items-center">
        {stepLabels.map((label, index) => {
          const isClickable =
            index <= currentStep || completedSteps.includes(index - 1);
          return (
            <div
              key={index}
              className={`flex flex-col items-center group ${
                isClickable ? "cursor-pointer" : "cursor-not-allowed opacity-60"
              }`}
              onClick={() => onStepClick && isClickable && onStepClick(index)}
            >
              <div
                className={`
              flex items-center justify-center w-10 h-10 rounded-full border mb-2 transition-colors
              ${
                completedSteps.includes(index)
                  ? "bg-brand border-brand text-white"
                  : index === currentStep
                  ? "bg-brand border-brand text-white"
                  : isClickable
                  ? "bg-surface border-line-strong text-muted group-hover:border-brand"
                  : "bg-surface border-line text-muted"
              }
            `}
              >
                {completedSteps.includes(index) ? (
                  <FaCheck className="h-4 w-4" />
                ) : (
                  <span className="text-sm font-semibold">{index + 1}</span>
                )}
              </div>

              <div className="text-center max-w-24">
                <div
                  className={`
                text-xs font-medium leading-tight
                ${isClickable ? "text-brand-strong" : "text-muted"}
              `}
                >
                  {label}
                </div>
                <div className="text-xs text-muted mt-1">
                  {completedSteps.includes(index)
                    ? "Completed"
                    : index === currentStep
                    ? "Current"
                    : "Pending"}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

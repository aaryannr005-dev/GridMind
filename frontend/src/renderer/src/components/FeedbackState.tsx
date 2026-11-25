import type { ReactNode } from "react";

interface FeedbackStateProps {
  kind: "info" | "warning";
  title: string;
  children: ReactNode;
}

export function FeedbackState({ kind, title, children }: FeedbackStateProps) {
  return (
    <div className={`feedback feedback-${kind}`} role="status">
      <span className="feedback-icon" aria-hidden="true">{kind === "info" ? "i" : "!"}</span>
      <div className="feedback-copy">
        <strong>{title}</strong>
        <div className="feedback-message">{children}</div>
      </div>
    </div>
  );
}

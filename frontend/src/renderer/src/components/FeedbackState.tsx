interface FeedbackStateProps {
  kind: "info" | "warning";
  title: string;
  children: string;
}

export function FeedbackState({ kind, title, children }: FeedbackStateProps) {
  return (
    <div className={`feedback feedback-${kind}`} role="status">
      <span className="feedback-icon" aria-hidden="true">{kind === "info" ? "i" : "!"}</span>
      <div><strong>{title}</strong><p>{children}</p></div>
    </div>
  );
}

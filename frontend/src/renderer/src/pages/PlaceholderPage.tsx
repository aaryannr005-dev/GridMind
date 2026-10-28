import { EmptyState } from "../components/EmptyState";
import { FeedbackState } from "../components/FeedbackState";
import type { NavigationItem } from "../types";

interface PlaceholderPageProps { page: NavigationItem; }

export function PlaceholderPage({ page }: PlaceholderPageProps) {
  return (
    <div className="page-stack">
      <div className="page-intro"><span className="eyebrow">{page.eyebrow}</span><h1>{page.label}</h1><p>{page.description}</p></div>
      <FeedbackState kind="warning" title="This area is not implemented yet">
        The Overview and Simulation Lab are available. This screen remains outside the approved Stage 4 scope and does not load data or run calculations.
      </FeedbackState>
      <EmptyState icon="◇" title="Nothing to display yet" description="No feature for this area has been approved for implementation yet." />
    </div>
  );
}

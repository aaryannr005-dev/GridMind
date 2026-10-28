import { EmptyState } from "../components/EmptyState";
import { FeedbackState } from "../components/FeedbackState";
import type { NavigationItem } from "../types";

interface PlaceholderPageProps { page: NavigationItem; }

export function PlaceholderPage({ page }: PlaceholderPageProps) {
  return (
    <div className="page-stack">
      <div className="page-intro"><span className="eyebrow">{page.eyebrow}</span><h1>{page.label}</h1><p>{page.description}</p></div>
      <FeedbackState kind="warning" title="This area is not implemented yet">
        The dashboard can run the labeled sample scenario. This screen remains a navigation placeholder and does not load data or run calculations.
      </FeedbackState>
      <EmptyState icon="◇" title="Nothing to display yet" description="This area will be considered at its approved implementation stage, after the previous stage has been reviewed." />
    </div>
  );
}

import { EmptyState } from "../components/EmptyState";
import { FeedbackState } from "../components/FeedbackState";
import type { NavigationItem } from "../types";

interface PlaceholderPageProps { page: NavigationItem; }

export function PlaceholderPage({ page }: PlaceholderPageProps) {
  return (
    <div className="page-stack">
      <div className="page-intro"><span className="eyebrow">{page.eyebrow}</span><h1>{page.label}</h1><p>{page.description}</p></div>
      <FeedbackState kind="warning" title="Not implemented in Stage 1">
        This screen is a navigation placeholder. It does not load data, run calculations, or claim functionality that is not yet implemented.
      </FeedbackState>
      <EmptyState icon="◇" title="Nothing to display yet" description="This area will be considered at its approved implementation stage, after the previous stage has been reviewed." />
    </div>
  );
}

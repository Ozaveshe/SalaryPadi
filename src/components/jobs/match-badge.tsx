import { CircleCheck, CircleDot } from "lucide-react";

import { matchBadgeView } from "@/lib/match/badge";
import type { MatchResult } from "@/lib/match/types";

export function MatchBadge({ result }: { result: MatchResult }) {
  const view = matchBadgeView(result);
  if (!view) return null;

  const Icon = view.tone === "success" ? CircleCheck : CircleDot;

  return (
    <span
      className={`status status-${view.tone}`}
      title={view.description}
      aria-label={view.description}
    >
      <Icon aria-hidden="true" size={14} strokeWidth={2.5} />
      {view.label}
    </span>
  );
}

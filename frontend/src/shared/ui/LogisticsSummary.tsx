import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import type { AccommodationSummary } from "../eventUtils";

interface LogisticsSummaryProps {
  accommodation: AccommodationSummary;
  peakParticipants?: number;
  showPeak?: boolean;
  className?: string;
}

export const LogisticsSummary = ({
  accommodation,
  peakParticipants = 0,
  showPeak = true,
  className,
}: LogisticsSummaryProps) => {
  const { t } = useTranslation();

  const items = useMemo(() => {
    const entries: Array<{ key: string; label: string; variant?: "highlight" }> = [];
    if (showPeak && peakParticipants > 0) {
      entries.push({
        key: "peak",
        label: t("events.wizard.segments.summaryPeak", { count: peakParticipants }),
        variant: "highlight",
      });
    }
    if (accommodation.needsIndoor) {
      entries.push({
        key: "indoor",
        label: t("events.wizard.segments.summaryIndoor", { count: accommodation.indoorCapacity }),
      });
    }
    if (accommodation.needsTents) {
      entries.push({
        key: "tents",
        label: t("events.wizard.segments.summaryTents", { count: accommodation.tentsCapacity }),
      });
    }
    return entries;
  }, [accommodation.indoorCapacity, accommodation.needsIndoor, accommodation.needsTents, accommodation.tentsCapacity, peakParticipants, showPeak, t]);

  if (items.length === 0) {
    return null;
  }

  return (
    <div className={className ? `logistics-summary ${className}` : "logistics-summary"} role="list">
      {items.map((item) => (
        <span
          key={item.key}
          className={
            item.variant === "highlight"
              ? "logistics-summary__badge logistics-summary__badge--highlight"
              : "logistics-summary__badge"
          }
          role="listitem"
        >
          {item.label}
        </span>
      ))}
    </div>
  );
};

export default LogisticsSummary;

import type { FutureOrderV2WorkshopStageLine } from "../utils/futureOrderV2WorkshopProgress";

interface WorkshopStageListProps {
  orderId: string;
  stageLines: readonly FutureOrderV2WorkshopStageLine[];
}

export const WorkshopStageList = ({ orderId, stageLines }: WorkshopStageListProps) => (
  <ol data-customer-v2-order-stage-history={orderId} className="space-y-1">
    {stageLines.map((line, index) => (
      <li key={`${index}:${line.stageLabel}`} data-customer-v2-order-stage-line>
        <span className="font-semibold text-heritage-green">{line.stageLabel}</span>
        {" · "}
        {line.statusLabel}
      </li>
    ))}
  </ol>
);

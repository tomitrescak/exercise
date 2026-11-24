import { Suspense } from "react";
import { Spinner } from "@/components/ui";
import { HistoryView } from "./history-view";

export default function HistoryPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <HistoryView />
    </Suspense>
  );
}

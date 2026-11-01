import type { Metadata } from "next";
import { AnalyticsView } from "@/components/analytics/AnalyticsView";

export const metadata: Metadata = { title: "Analytics · StableFlow" };

export default function AnalyticsPage() {
  return <AnalyticsView />;
}

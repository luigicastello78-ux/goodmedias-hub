import type { Metadata } from "next";

import { BatchDetail } from "@/components/campaigns/batch-detail";

export const metadata: Metadata = { title: "Campaign batch" };

const CampaignBatchPage = async ({ params }: { params: Promise<{ batchId: string }> }) => {
  const { batchId } = await params;
  return <BatchDetail batchId={batchId} />;
};

export default CampaignBatchPage;

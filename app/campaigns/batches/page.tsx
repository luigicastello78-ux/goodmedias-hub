import type { Metadata } from "next";

import { BatchList } from "@/components/campaigns/batch-list";

export const metadata: Metadata = { title: "Campaign batches" };

const CampaignBatchesPage = () => {
  return <BatchList />;
};

export default CampaignBatchesPage;

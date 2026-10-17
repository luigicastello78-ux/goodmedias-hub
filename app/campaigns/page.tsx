import type { Metadata } from "next";

import { SequenceCampaigns } from "@/components/campaigns/sequence-campaigns";

export const metadata: Metadata = {
  title: "Campaigns",
};

const CampaignsPage = () => {
  return <SequenceCampaigns />;
};

export default CampaignsPage;

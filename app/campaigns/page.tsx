import type { Metadata } from "next";

import { CampaignWorkspace } from "@/components/campaigns/campaign-workspace";

export const metadata: Metadata = {
  title: "Campaigns",
};

const CampaignsPage = () => {
  return <CampaignWorkspace />;
};

export default CampaignsPage;

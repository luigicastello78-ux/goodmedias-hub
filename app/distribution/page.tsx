import type { Metadata } from "next";

import { DistributionWorkspace } from "@/components/distribution/distribution-workspace";

export const metadata: Metadata = {
  title: "Distribution",
};

const DistributionPage = () => {
  return <DistributionWorkspace />;
};

export default DistributionPage;

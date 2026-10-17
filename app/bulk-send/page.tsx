import type { Metadata } from "next";

import { BulkSendWorkspace } from "@/components/bulk-send/bulk-send-workspace";

export const metadata: Metadata = {
  title: "Bulk send",
};

const BulkSendPage = () => {
  return <BulkSendWorkspace />;
};

export default BulkSendPage;

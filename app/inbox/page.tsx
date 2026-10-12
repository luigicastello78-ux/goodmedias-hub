import type { Metadata } from "next";

import { InboxWorkspace } from "@/components/inbox/inbox-workspace";

export const metadata: Metadata = {
  title: "Inbox",
};

const InboxPage = () => {
  return <InboxWorkspace />;
};

export default InboxPage;

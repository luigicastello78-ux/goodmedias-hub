import type { Metadata } from "next";

import { SentDetail } from "@/components/sent/sent-detail";

export const metadata: Metadata = { title: "Sent message" };

const SentMessagePage = async ({ params }: { params: Promise<{ messageId: string }> }) => {
  const { messageId } = await params;
  return <SentDetail messageId={messageId} />;
};

export default SentMessagePage;

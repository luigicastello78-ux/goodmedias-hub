import type { Metadata } from "next";

import { SentList } from "@/components/sent/sent-list";

export const metadata: Metadata = { title: "Sent" };

const SentPage = () => {
  return <SentList />;
};

export default SentPage;

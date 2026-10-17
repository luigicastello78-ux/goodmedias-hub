import type { Metadata } from "next";

import { JobDetail } from "@/components/bulk-send/job-detail";

export const metadata: Metadata = {
  title: "Bulk job",
};

const BulkJobPage = async ({ params }: { params: Promise<{ jobId: string }> }) => {
  const { jobId } = await params;
  return <JobDetail jobId={jobId} />;
};

export default BulkJobPage;

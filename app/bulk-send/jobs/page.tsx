import type { Metadata } from "next";

import { JobList } from "@/components/bulk-send/job-list";

export const metadata: Metadata = {
  title: "Bulk jobs",
};

const BulkJobsPage = () => {
  return <JobList />;
};

export default BulkJobsPage;

import type { ReactNode } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export const StatusAlert = ({
  variant = "default",
  title,
  message,
  action,
}: {
  variant?: "default" | "destructive";
  title: string;
  message: string;
  action?: ReactNode;
}) => {
  return (
    <Alert variant={variant}>
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
      {action ? <div className="col-span-full mt-2">{action}</div> : null}
    </Alert>
  );
};

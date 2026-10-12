"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getMappingError } from "@/lib/campaign-draft";
import { useCampaignStore } from "@/stores/campaign-store";

export const ColumnMapper = () => {
  const headers = useCampaignStore((state) => state.headers);
  const emailColumn = useCampaignStore((state) => state.emailColumn);
  const tokenBindings = useCampaignStore((state) => state.tokenBindings);
  const setEmailColumn = useCampaignStore((state) => state.setEmailColumn);
  const setToken = useCampaignStore((state) => state.setToken);
  const mappingError = getMappingError(emailColumn, tokenBindings);

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Choose the email column. Other columns become tokens such as {"{{first_name}}"}.
      </p>
      <div className="space-y-3">
        {headers.map((header) => {
          const binding = tokenBindings.find((item) => item.sourceColumn === header);
          const emailId = `email-column-${header}`;
          const tokenId = `token-${header}`;
          const isEmailColumn = emailColumn === header;
          return (
            <div
              key={header}
              className="grid gap-3 rounded-lg border border-border p-3 md:grid-cols-[1fr_auto_1fr] md:items-center"
            >
              <p className="text-sm font-medium">{header}</p>
              <div className="flex items-center gap-2">
                <input
                  id={emailId}
                  type="radio"
                  name="email-column"
                  className="size-4 accent-primary"
                  checked={isEmailColumn}
                  onChange={() => setEmailColumn(header)}
                />
                <Label htmlFor={emailId}>Email</Label>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={tokenId}>{isEmailColumn ? "Token" : "Token name"}</Label>
                <Input
                  id={tokenId}
                  value={isEmailColumn ? "" : (binding?.token ?? "")}
                  disabled={isEmailColumn}
                  aria-invalid={!isEmailColumn && Boolean(mappingError)}
                  placeholder={isEmailColumn ? "Not used for the email column" : "first_name"}
                  onChange={(event) => setToken(header, event.target.value)}
                />
              </div>
            </div>
          );
        })}
      </div>
      {headers.length > 0 && mappingError ? (
        <p className="text-sm text-destructive" role="alert">
          {mappingError}
        </p>
      ) : null}
    </div>
  );
};

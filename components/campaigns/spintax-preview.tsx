"use client";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { listTokens, renderPreview } from "@/lib/spintax";
import { useCampaignStore } from "@/stores/campaign-store";

export const SpintaxPreview = () => {
  const rows = useCampaignStore((state) => state.rows);
  const emailColumn = useCampaignStore((state) => state.emailColumn);
  const tokenBindings = useCampaignStore((state) => state.tokenBindings);
  const subjectTemplate = useCampaignStore((state) => state.subjectTemplate);
  const bodyTemplate = useCampaignStore((state) => state.bodyTemplate);
  const previewRowIndex = useCampaignStore((state) => state.previewRowIndex);
  const previewSeed = useCampaignStore((state) => state.previewSeed);
  const setPreviewRowIndex = useCampaignStore((state) => state.setPreviewRowIndex);
  const shufflePreview = useCampaignStore((state) => state.shufflePreview);

  const row = rows[previewRowIndex] ?? rows[0];
  const fields: Record<string, string> = {};
  if (row) {
    for (const binding of tokenBindings) {
      fields[binding.token] = row[binding.sourceColumn] ?? "";
    }
  }

  const usedTokens = [...new Set([...listTokens(subjectTemplate), ...listTokens(bodyTemplate)])];
  const missing = usedTokens.filter((token) => !tokenBindings.some((binding) => binding.token === token));
  const previewCount = Math.min(rows.length, 300);
  const safeIndex = Math.min(previewRowIndex, Math.max(previewCount - 1, 0));

  return (
    <div className="space-y-3 rounded-xl border border-border bg-muted/30 p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="preview-row">Preview row</Label>
          {previewCount > 0 ? (
            <Select value={String(safeIndex)} onValueChange={(value) => setPreviewRowIndex(Number(value))}>
              <SelectTrigger id="preview-row" className="w-56">
                <SelectValue placeholder="Choose a row" />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: previewCount }, (_, index) => {
                  const sample = rows[index];
                  const label = emailColumn && sample ? sample[emailColumn] || `Row ${index + 2}` : `Row ${index + 2}`;
                  return (
                    <SelectItem key={index} value={String(index)}>
                      {label}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          ) : (
            <p id="preview-row" className="text-sm text-muted-foreground">
              Upload a CSV to preview a row.
            </p>
          )}
        </div>
        <Button type="button" variant="outline" size="sm" onClick={shufflePreview} disabled={!subjectTemplate && !bodyTemplate}>
          Shuffle spintax
        </Button>
      </div>
      {missing.length > 0 ? (
        <p className="text-sm text-destructive" role="alert">
          {`These tokens are not mapped: ${missing.join(", ")}.`}
        </p>
      ) : null}
      <div className="space-y-2">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Subject</p>
        <p className="text-sm whitespace-pre-wrap">
          {subjectTemplate ? renderPreview(subjectTemplate, fields, previewSeed) : "Subject preview appears here."}
        </p>
      </div>
      <div className="space-y-2">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Body</p>
        <p className="text-sm whitespace-pre-wrap">
          {bodyTemplate ? renderPreview(bodyTemplate, fields, previewSeed + 17) : "Body preview appears here."}
        </p>
      </div>
    </div>
  );
};

"use client";

import { useState } from "react";
import type { DragEvent } from "react";

import { StatusAlert } from "@/components/status-alert";
import { Button } from "@/components/ui/button";
import { parseCsvFile } from "@/lib/csv";
import { useCampaignStore } from "@/stores/campaign-store";

export const CsvUploader = () => {
  const fileName = useCampaignStore((state) => state.fileName);
  const rowCount = useCampaignStore((state) => state.rows.length);
  const applyCsv = useCampaignStore((state) => state.applyCsv);
  const clearCsv = useCampaignStore((state) => state.clearCsv);
  const [error, setError] = useState<string | null>(null);
  const [isParsing, setIsParsing] = useState(false);

  const handleFile = async (file: File | undefined) => {
    if (!file) {
      return;
    }
    setIsParsing(true);
    setError(null);
    const result = await parseCsvFile(file);
    setIsParsing(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    applyCsv(file.name, result.headers, result.rows, result.warnings);
  };

  const handleDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    void handleFile(event.dataTransfer.files[0]);
  };

  return (
    <div className="space-y-3">
      <label
        htmlFor="csv-upload"
        onDragOver={(event) => event.preventDefault()}
        onDrop={handleDrop}
        className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-muted/40 px-6 py-10 text-center outline-none focus-within:ring-3 focus-within:ring-ring/50"
      >
        <span className="text-sm font-medium">Upload a CSV of prospects</span>
        <span className="text-xs text-muted-foreground">
          Header row required. Up to 1,000 contacts and 2 MB.
        </span>
        <input
          id="csv-upload"
          type="file"
          accept=".csv,text/csv"
          className="sr-only"
          onChange={(event) => {
            void handleFile(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
      </label>
      {isParsing ? (
        <p className="text-sm text-muted-foreground" aria-live="polite">
          Reading the file…
        </p>
      ) : null}
      {fileName ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm">
            <span className="font-medium">{fileName}</span>
            <span className="text-muted-foreground"> · {rowCount} {rowCount === 1 ? "row" : "rows"}</span>
          </p>
          <Button type="button" variant="outline" size="sm" onClick={clearCsv}>
            Remove file
          </Button>
        </div>
      ) : null}
      {error ? <StatusAlert variant="destructive" title="CSV was not imported" message={error} /> : null}
    </div>
  );
};

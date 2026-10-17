"use client";

import { useState } from "react";
import type { DragEvent } from "react";

import { StatusAlert } from "@/components/status-alert";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { prepareBulkContacts } from "@/lib/bulk-contacts";
import { BULK_MAX_CONTACTS, BULK_MAX_CSV_BYTES, PREVIEW_ROW_COUNT } from "@/lib/constants";
import { parseCsvText } from "@/lib/csv";
import { guessEmailColumn } from "@/lib/campaign-draft";
import { useBulkSendStore } from "@/stores/bulk-send-store";

export const BulkUpload = () => {
  const fileName = useBulkSendStore((state) => state.fileName);
  const headers = useBulkSendStore((state) => state.headers);
  const rows = useBulkSendStore((state) => state.rows);
  const emailColumn = useBulkSendStore((state) => state.emailColumn);
  const parseWarnings = useBulkSendStore((state) => state.parseWarnings);
  const applyCsv = useBulkSendStore((state) => state.applyCsv);
  const clearCsv = useBulkSendStore((state) => state.clearCsv);
  const setEmailColumn = useBulkSendStore((state) => state.setEmailColumn);
  const [error, setError] = useState<string | null>(null);
  const [isParsing, setIsParsing] = useState(false);

  const prepared = prepareBulkContacts(rows, emailColumn);
  const preview = rows.slice(0, PREVIEW_ROW_COUNT);

  const handleFile = async (file: File | undefined) => {
    if (!file) {
      return;
    }
    const name = file.name.toLowerCase();
    if (!name.endsWith(".csv") && file.type !== "text/csv" && file.type !== "application/vnd.ms-excel") {
      setError("Upload a .csv file.");
      return;
    }
    if (file.size > BULK_MAX_CSV_BYTES) {
      setError("This file is larger than 8 MB. Split the list and try again.");
      return;
    }

    setIsParsing(true);
    setError(null);
    const result = parseCsvText(await file.text(), {
      maxBytes: BULK_MAX_CSV_BYTES,
      maxRows: BULK_MAX_CONTACTS,
    });
    setIsParsing(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    applyCsv(file.name, result.headers, result.rows, result.warnings);
    setEmailColumn(guessEmailColumn(result.headers));
  };

  const handleDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    void handleFile(event.dataTransfer.files[0]);
  };

  return (
    <div className="space-y-4">
      <label
        htmlFor="bulk-csv-upload"
        onDragOver={(event) => event.preventDefault()}
        onDrop={handleDrop}
        className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-muted/40 px-6 py-10 text-center outline-none focus-within:ring-3 focus-within:ring-ring/50"
      >
        <span className="text-sm font-medium">Drop a CSV here, or choose a file</span>
        <span className="text-xs text-muted-foreground">
          Header row required. Up to {BULK_MAX_CONTACTS.toLocaleString()} contacts and 8 MB.
        </span>
        <input
          id="bulk-csv-upload"
          type="file"
          accept=".csv,text/csv"
          className="sr-only"
          onChange={(event) => {
            void handleFile(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
      </label>
      <a href="/samples/bulk-drip-sample.csv" download className="inline-block text-sm text-primary underline-offset-4 hover:underline">
        Download a sample CSV
      </a>
      {isParsing ? (
        <p className="text-sm text-muted-foreground" aria-live="polite">
          Reading the file…
        </p>
      ) : null}
      {fileName ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm">
            <span className="font-medium">{fileName}</span>
            <span className="text-muted-foreground"> · {rows.length.toLocaleString()} {rows.length === 1 ? "row" : "rows"}</span>
          </p>
          <Button type="button" variant="outline" size="sm" onClick={clearCsv}>
            Remove file
          </Button>
        </div>
      ) : null}
      {error ? <StatusAlert variant="destructive" title="CSV was not imported" message={error} /> : null}
      {parseWarnings.map((warning) => (
        <StatusAlert key={warning} title="Check this file" message={warning} />
      ))}
      {headers.length > 0 ? (
        <div className="space-y-3">
          <div className="max-w-sm space-y-1.5">
            <label htmlFor="bulk-email-column" className="text-sm font-medium">
              Email column
            </label>
            <Select value={emailColumn || undefined} onValueChange={setEmailColumn}>
              <SelectTrigger id="bulk-email-column" className="w-full">
                <SelectValue placeholder="Choose the email column" />
              </SelectTrigger>
              <SelectContent>
                {headers.map((header) => (
                  <SelectItem key={header} value={header}>
                    {header}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!emailColumn ? (
              <p className="text-sm text-muted-foreground">Choose the column that contains email addresses.</p>
            ) : null}
          </div>
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {prepared.contacts.length.toLocaleString()} valid · {prepared.invalidCount.toLocaleString()} invalid · {prepared.duplicateCount.toLocaleString()} duplicate
          </p>
          <Table>
            <TableHeader>
              <TableRow>
                {headers.map((header) => (
                  <TableHead key={header}>{header}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {preview.map((row, index) => (
                <TableRow key={`${row[emailColumn] ?? "row"}-${index}`}>
                  {headers.map((header) => (
                    <TableCell key={header}>{row[header]}</TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {rows.length > preview.length ? (
            <p className="text-xs text-muted-foreground">Showing the first {preview.length} rows.</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};

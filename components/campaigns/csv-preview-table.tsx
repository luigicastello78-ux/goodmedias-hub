"use client";

import { useMemo } from "react";

import { StatusAlert } from "@/components/status-alert";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PREVIEW_ROW_COUNT } from "@/lib/constants";
import { analyzeRows } from "@/lib/campaign-draft";
import { isEmail } from "@/lib/email";
import { useCampaignStore } from "@/stores/campaign-store";

export const CsvPreviewTable = () => {
  const headers = useCampaignStore((state) => state.headers);
  const rows = useCampaignStore((state) => state.rows);
  const emailColumn = useCampaignStore((state) => state.emailColumn);
  const parseWarnings = useCampaignStore((state) => state.parseWarnings);
  const removeRow = useCampaignStore((state) => state.removeRow);
  const removeDuplicateEmails = useCampaignStore((state) => state.removeDuplicateEmails);
  const analysis = useMemo(() => analyzeRows(rows, emailColumn), [rows, emailColumn]);
  const preview = rows.slice(0, PREVIEW_ROW_COUNT);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <p>
          <span className="font-medium">{rows.length}</span> {rows.length === 1 ? "row" : "rows"}
        </p>
        <p>
          <span className="font-medium">{analysis.validCount}</span> ready to send
        </p>
        <p>
          <span className="font-medium">{analysis.invalidRows.length}</span>{" "}
          {analysis.invalidRows.length === 1 ? "invalid email" : "invalid emails"}
        </p>
        <p>
          <span className="font-medium">{analysis.duplicateRows.length}</span>{" "}
          {analysis.duplicateRows.length === 1 ? "duplicate" : "duplicates"}
        </p>
      </div>

      {parseWarnings.map((warning) => (
        <StatusAlert key={warning} title="Check this file" message={warning} />
      ))}

      {analysis.duplicateRows.length > 0 ? (
        <StatusAlert
          title="Duplicate emails"
          message={duplicateMessage(analysis.duplicateRows.length)}
          action={
            <Button type="button" size="sm" variant="outline" onClick={removeDuplicateEmails}>
              Remove duplicate rows
            </Button>
          }
        />
      ) : null}

      {analysis.invalidRows.length > 0 ? (
        <StatusAlert
          title="Invalid emails stay visible"
          message={invalidEmailMessage(analysis.invalidRows)}
        />
      ) : null}

      <div className="overflow-x-auto rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Row</TableHead>
              {headers.map((header) => (
                <TableHead key={header}>{header}</TableHead>
              ))}
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {preview.map((row, index) => {
              const email = emailColumn ? (row[emailColumn] ?? "") : "";
              const invalid = Boolean(emailColumn) && !isEmail(email);
              return (
                <TableRow key={`${index}-${email}`}>
                  <TableCell>{index + 2}</TableCell>
                  {headers.map((header) => (
                    <TableCell
                      key={header}
                      className={header === emailColumn && invalid ? "text-destructive" : undefined}
                    >
                      {row[header]}
                    </TableCell>
                  ))}
                  <TableCell>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-label={`Remove row ${index + 2}`}
                      onClick={() => removeRow(index)}
                    >
                      Remove
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      {rows.length > PREVIEW_ROW_COUNT ? (
        <p className="text-xs text-muted-foreground">
          Showing the first {PREVIEW_ROW_COUNT} of {rows.length} rows. Dispatch uses the full file.
        </p>
      ) : null}
    </div>
  );
};

const duplicateMessage = (count: number): string =>
  count === 1
    ? "1 later row repeats an email. The first row is kept unless you remove the duplicate."
    : `${count} later rows repeat an email. The first row is kept unless you remove the duplicates.`;

const invalidEmailMessage = (indexes: number[]): string => {
  const shown = indexes.slice(0, 8).map((index) => index + 2);
  const extra = indexes.length - shown.length;
  const single = shown.length === 1 && extra === 0;
  const extraLabel = extra > 0 ? `, and ${extra} more` : "";
  return `${single ? "Row" : "Rows"} ${shown.join(", ")}${extraLabel} ${single ? "does" : "do"} not have a valid email and will be excluded.`;
};

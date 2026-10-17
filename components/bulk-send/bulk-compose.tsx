"use client";

import { useEffect, useRef, useState } from "react";

import { StatusAlert } from "@/components/status-alert";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { getErrorMessage, requestJson } from "@/lib/api-client";
import { isEmail } from "@/lib/email";
import { insertAtCursor, restoreCursor } from "@/lib/insert-text";
import { listMissingMergeFields, renderMerge } from "@/lib/merge-fields";
import { useBulkSendStore } from "@/stores/bulk-send-store";
import type { SendersResponse } from "@/types/inbox";

const OPT_OUT_PATTERN = /unsub|opt-?out/i;

export const BulkCompose = () => {
  const headers = useBulkSendStore((state) => state.headers);
  const rows = useBulkSendStore((state) => state.rows);
  const emailColumn = useBulkSendStore((state) => state.emailColumn);
  const fromEmail = useBulkSendStore((state) => state.fromEmail);
  const fromName = useBulkSendStore((state) => state.fromName);
  const subject = useBulkSendStore((state) => state.subject);
  const bodyText = useBulkSendStore((state) => state.bodyText);
  const bodyHtml = useBulkSendStore((state) => state.bodyHtml);
  const cc = useBulkSendStore((state) => state.cc);
  const bcc = useBulkSendStore((state) => state.bcc);
  const previewIndex = useBulkSendStore((state) => state.previewIndex);
  const setFromEmail = useBulkSendStore((state) => state.setFromEmail);
  const setFromName = useBulkSendStore((state) => state.setFromName);
  const setSubject = useBulkSendStore((state) => state.setSubject);
  const setBodyText = useBulkSendStore((state) => state.setBodyText);
  const setBodyHtml = useBulkSendStore((state) => state.setBodyHtml);
  const setCc = useBulkSendStore((state) => state.setCc);
  const setBcc = useBulkSendStore((state) => state.setBcc);
  const setPreviewIndex = useBulkSendStore((state) => state.setPreviewIndex);
  const subjectRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const htmlRef = useRef<HTMLTextAreaElement>(null);
  const focusedField = useRef<"subject" | "body" | "html">("body");
  const [senders, setSenders] = useState<SendersResponse["senders"]>([]);
  const [sendersNote, setSendersNote] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await requestJson<SendersResponse>("/api/n8n/senders");
        if (!cancelled) {
          setSenders(data.senders);
        }
      } catch (error) {
        if (!cancelled) {
          setSendersNote(getErrorMessage(error));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const previewRows = emailColumn
    ? rows.filter((row) => isEmail((row[emailColumn] ?? "").trim()))
    : [];
  const safeIndex = Math.min(previewIndex, Math.max(previewRows.length - 1, 0));
  const previewRow = previewRows[safeIndex] ?? {};
  const missingFields = listMissingMergeFields([subject, bodyText, bodyHtml], headers);
  const senderKnown = senders.some((sender) => sender.email.toLowerCase() === fromEmail.trim().toLowerCase());
  const copy = `${subject}\n${bodyText}\n${bodyHtml}`;
  const needsOptOut = copy.trim().length > 0 && !OPT_OUT_PATTERN.test(copy);

  const handleInsert = (snippet: string) => {
    if (focusedField.current === "subject") {
      const { next, cursor } = insertAtCursor(subject, snippet, subjectRef.current);
      setSubject(next);
      restoreCursor(subjectRef.current, cursor);
      return;
    }
    if (focusedField.current === "html") {
      const { next, cursor } = insertAtCursor(bodyHtml, snippet, htmlRef.current);
      setBodyHtml(next);
      restoreCursor(htmlRef.current, cursor);
      return;
    }
    const { next, cursor } = insertAtCursor(bodyText, snippet, bodyRef.current);
    setBodyText(next);
    restoreCursor(bodyRef.current, cursor);
  };

  return (
    <div className="space-y-4">
      <StatusAlert
        title="Include an opt-out line"
        message="This hub does not have an unsubscribe list. Add an unsubscribe or opt-out line to the template before you send."
      />
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="bulk-from-email">From email</Label>
          <Input
            id="bulk-from-email"
            type="email"
            autoComplete="email"
            value={fromEmail}
            onChange={(event) => setFromEmail(event.target.value)}
            placeholder="alex@goodmedias.com"
            aria-invalid={fromEmail.length > 0 && !isEmail(fromEmail)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="bulk-from-name">From name</Label>
          <Input
            id="bulk-from-name"
            value={fromName}
            onChange={(event) => setFromName(event.target.value)}
            placeholder="Alex"
          />
        </div>
      </div>
      {senders.length > 0 && fromEmail.trim() && !senderKnown ? (
        <StatusAlert
          title="Sender not in the pool"
          message="This address is not in the sender list. n8n will reject it if the SMTP account cannot send as this address."
        />
      ) : null}
      {sendersNote ? <p className="text-sm text-muted-foreground">{sendersNote}</p> : null}
      <div className="flex flex-wrap gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="outline" size="sm" disabled={headers.length === 0}>
              Insert merge field
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {headers.map((header) => (
              <DropdownMenuItem key={header} onSelect={() => handleInsert(`{{${header}}}`)}>
                {`{{${header}}}`}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="bulk-subject">Subject</Label>
        <Input
          id="bulk-subject"
          ref={subjectRef}
          value={subject}
          onFocus={() => {
            focusedField.current = "subject";
          }}
          onChange={(event) => setSubject(event.target.value)}
          placeholder="Quick question, {{firstName|there}}"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="bulk-body">Body</Label>
        <Textarea
          id="bulk-body"
          ref={bodyRef}
          value={bodyText}
          rows={8}
          onFocus={() => {
            focusedField.current = "body";
          }}
          onChange={(event) => setBodyText(event.target.value)}
          placeholder={"Hi {{firstName|there}},\n\nReply stop if you would rather not hear from us."}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="bulk-html">HTML body (optional)</Label>
        <Textarea
          id="bulk-html"
          ref={htmlRef}
          value={bodyHtml}
          rows={5}
          onFocus={() => {
            focusedField.current = "html";
          }}
          onChange={(event) => setBodyHtml(event.target.value)}
          placeholder="<p>Hi {{firstName|there}},</p>"
        />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="bulk-cc">Cc</Label>
          <Input id="bulk-cc" value={cc} onChange={(event) => setCc(event.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="bulk-bcc">Bcc</Label>
          <Input id="bulk-bcc" value={bcc} onChange={(event) => setBcc(event.target.value)} />
        </div>
      </div>
      {needsOptOut ? (
        <StatusAlert
          title="No opt-out line yet"
          message="The subject and body do not mention unsubscribe or opt-out. Add one before starting the job."
        />
      ) : null}
      {missingFields.length > 0 ? (
        <StatusAlert
          title="Merge field has no column"
          message={`${missingFields.join(", ")} is not a CSV column and has no fallback. n8n will leave it blank.`}
        />
      ) : null}
      {previewRows.length > 0 ? (
        <div className="space-y-3 rounded-xl bg-muted/40 p-4">
          <div className="max-w-sm space-y-1.5">
            <Label htmlFor="bulk-preview-contact">Preview contact</Label>
            <Select value={String(safeIndex)} onValueChange={(value) => setPreviewIndex(Number(value))}>
              <SelectTrigger id="bulk-preview-contact" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {previewRows.slice(0, 50).map((row, index) => (
                  <SelectItem key={`${row[emailColumn]}-${index}`} value={String(index)}>
                    {row[emailColumn]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Subject</p>
            <p className="text-sm">{renderMerge(subject, previewRow) || "—"}</p>
          </div>
          <div>
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Text</p>
            <pre className="whitespace-pre-wrap text-sm">{renderMerge(bodyText, previewRow) || "—"}</pre>
          </div>
          {bodyHtml.trim() ? (
            <iframe
              title="HTML preview"
              sandbox=""
              referrerPolicy="no-referrer"
              className="h-40 w-full rounded-lg border bg-white"
              srcDoc={renderMerge(bodyHtml, previewRow, { html: true })}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
};

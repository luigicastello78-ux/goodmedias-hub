"use client";

import { useRef } from "react";

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
import { Textarea } from "@/components/ui/textarea";
import { insertAtCursor, restoreCursor } from "@/lib/insert-text";
import { useInboxStore } from "@/stores/inbox-store";

export const Composer = () => {
  const composer = useInboxStore((state) => state.composer);
  const contactFields = useInboxStore((state) => state.contactFields);
  const dispatchStatus = useInboxStore((state) => state.dispatchStatus);
  const dispatchError = useInboxStore((state) => state.dispatchError);
  const dispatchRetryable = useInboxStore((state) => state.dispatchRetryable);
  const editedSinceError = useInboxStore((state) => state.editedSinceError);
  const providerMessageId = useInboxStore((state) => state.providerMessageId);
  const isComposing = useInboxStore((state) => state.isComposing);
  const selectedThreadId = useInboxStore((state) => state.selectedThreadId);
  const updateComposer = useInboxStore((state) => state.updateComposer);
  const sendManual = useInboxStore((state) => state.sendManual);
  const subjectRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const focusedField = useRef<"subject" | "body">("body");

  if (!isComposing && !selectedThreadId) {
    return null;
  }

  const locked = dispatchStatus === "sending";
  const tokens = Object.keys(contactFields);
  const sendBlocked = dispatchStatus === "error" && !dispatchRetryable && !editedSinceError;
  const showRetry = dispatchStatus === "error" && dispatchRetryable && !editedSinceError;

  const handleInsertToken = (token: string) => {
    const snippet = `{{${token}}}`;
    if (focusedField.current === "subject") {
      const { next, cursor } = insertAtCursor(composer.subject, snippet, subjectRef.current);
      updateComposer({ subject: next });
      restoreCursor(subjectRef.current, cursor);
      return;
    }

    const { next, cursor } = insertAtCursor(composer.bodyText, snippet, bodyRef.current);
    updateComposer({ bodyText: next });
    restoreCursor(bodyRef.current, cursor);
  };

  const handleSend = () => {
    void sendManual();
  };

  return (
    <form
      className="space-y-4 border-t border-border bg-card px-4 py-4 md:px-6"
      aria-busy={locked}
      onSubmit={(event) => {
        event.preventDefault();
        handleSend();
      }}
    >
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="composer-from">From</Label>
          <Input
            id="composer-from"
            type="email"
            autoComplete="off"
            value={composer.fromEmail}
            disabled={locked}
            onChange={(event) => updateComposer({ fromEmail: event.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="composer-to">To</Label>
          <Input
            id="composer-to"
            type="email"
            autoComplete="email"
            value={composer.toEmail}
            disabled={locked}
            onChange={(event) => updateComposer({ toEmail: event.target.value })}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="composer-subject">Subject</Label>
        <Input
          id="composer-subject"
          ref={subjectRef}
          value={composer.subject}
          disabled={locked}
          onFocus={() => {
            focusedField.current = "subject";
          }}
          onChange={(event) => updateComposer({ subject: event.target.value })}
        />
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="composer-body">Message</Label>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="outline" size="sm" disabled={locked || tokens.length === 0}>
                Insert variable
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {tokens.map((token) => (
                <DropdownMenuItem key={token} onSelect={() => handleInsertToken(token)}>
                  {`{{${token}}}`}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {tokens.length === 0 ? (
          <p className="text-xs text-muted-foreground">This conversation has no contact fields.</p>
        ) : (
          <p className="text-xs text-muted-foreground">
            Variables are filled from the conversation before the email is sent.
          </p>
        )}
        <Textarea
          id="composer-body"
          ref={bodyRef}
          value={composer.bodyText}
          disabled={locked}
          rows={8}
          onFocus={() => {
            focusedField.current = "body";
          }}
          onChange={(event) => updateComposer({ bodyText: event.target.value })}
        />
      </div>

      {dispatchStatus === "sending" ? (
        <p className="text-sm text-muted-foreground" aria-live="polite">
          Sending email…
        </p>
      ) : null}

      {dispatchStatus === "sent" && providerMessageId ? (
        <StatusAlert
          title="Email accepted"
          message={`n8n delivered the message. Provider id ${providerMessageId}.`}
        />
      ) : null}

      {dispatchStatus === "error" && dispatchError ? (
        <StatusAlert
          variant="destructive"
          title={dispatchRetryable ? "Send did not complete" : "Send needs a change"}
          message={dispatchError}
          action={
            showRetry ? (
              <Button type="button" size="sm" onClick={handleSend}>
                Retry
              </Button>
            ) : null
          }
        />
      ) : null}

      <div className="flex justify-end">
        <Button type="submit" size="lg" disabled={locked || sendBlocked || showRetry}>
          {dispatchStatus === "sent" ? "Send again" : "Send"}
        </Button>
      </div>
    </form>
  );
};

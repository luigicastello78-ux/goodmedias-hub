"use client";

import { useRef } from "react";

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
import { getTemplateError } from "@/lib/campaign-draft";
import { insertAtCursor, restoreCursor } from "@/lib/insert-text";
import { useCampaignStore } from "@/stores/campaign-store";

export const TemplateEditor = () => {
  const subjectTemplate = useCampaignStore((state) => state.subjectTemplate);
  const bodyTemplate = useCampaignStore((state) => state.bodyTemplate);
  const tokenBindings = useCampaignStore((state) => state.tokenBindings);
  const setSubjectTemplate = useCampaignStore((state) => state.setSubjectTemplate);
  const setBodyTemplate = useCampaignStore((state) => state.setBodyTemplate);
  const subjectRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const focusedField = useRef<"subject" | "body">("body");
  const templateError = getTemplateError(subjectTemplate, bodyTemplate);
  const showError = subjectTemplate.length > 0 || bodyTemplate.length > 0;

  const handleInsert = (snippet: string) => {
    if (focusedField.current === "subject") {
      const { next, cursor } = insertAtCursor(subjectTemplate, snippet, subjectRef.current);
      setSubjectTemplate(next);
      restoreCursor(subjectRef.current, cursor);
      return;
    }
    const { next, cursor } = insertAtCursor(bodyTemplate, snippet, bodyRef.current);
    setBodyTemplate(next);
    restoreCursor(bodyRef.current, cursor);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="outline" size="sm" disabled={tokenBindings.length === 0}>
              Insert token
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {tokenBindings.map((binding) => (
              <DropdownMenuItem
                key={binding.sourceColumn}
                onSelect={() => handleInsert(`{{${binding.token}}}`)}
              >
                {`{{${binding.token}}}`}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button type="button" variant="outline" size="sm" onClick={() => handleInsert("{option A|option B}")}>
          Insert spintax
        </Button>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="campaign-subject">Subject</Label>
        <Input
          id="campaign-subject"
          ref={subjectRef}
          value={subjectTemplate}
          aria-invalid={showError && Boolean(templateError)}
          onFocus={() => {
            focusedField.current = "subject";
          }}
          onChange={(event) => setSubjectTemplate(event.target.value)}
          placeholder="{{first_name}}, quick question"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="campaign-body">Body</Label>
        <Textarea
          id="campaign-body"
          ref={bodyRef}
          rows={10}
          value={bodyTemplate}
          aria-invalid={showError && Boolean(templateError)}
          onFocus={() => {
            focusedField.current = "body";
          }}
          onChange={(event) => setBodyTemplate(event.target.value)}
          placeholder={"{Hi|Hello} {{first_name}}, I had a question about {{company}}."}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        n8n replaces tokens first, then spins {"{option A|option B}"} separately for each contact.
      </p>
      {showError && templateError ? (
        <p className="text-sm text-destructive" role="alert">
          {templateError}
        </p>
      ) : null}
    </div>
  );
};

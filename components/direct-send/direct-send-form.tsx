"use client";

import { useState, type FormEvent } from "react";

import { StatusAlert } from "@/components/status-alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface SendResponse {
  ok: true;
  delivered: string[];
  queued: string[];
  permanentBounces: string[];
}

interface ErrorResponse {
  ok: false;
  error: {
    message: string;
  };
}

const successMessage = (result: SendResponse): string => {
  const parts: string[] = [];
  if (result.delivered.length > 0) {
    parts.push(`Delivered to ${result.delivered.join(", ")}.`);
  }
  if (result.queued.length > 0) {
    parts.push(`Queued for ${result.queued.join(", ")}.`);
  }
  if (result.permanentBounces.length > 0) {
    parts.push(`Bounced for ${result.permanentBounces.join(", ")}.`);
  }
  return parts.join(" ");
};

export const DirectSendForm = () => {
  const [fromEmail, setFromEmail] = useState("");
  const [fromName, setFromName] = useState("");
  const [toEmail, setToEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [feedback, setFeedback] = useState("");

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus("sending");
    setFeedback("");

    try {
      const response = await fetch("/api/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromEmail: fromEmail.trim(),
          fromName: fromName.trim() || undefined,
          toEmail: toEmail.trim(),
          subject: subject.trim(),
          bodyText: bodyText.trim(),
        }),
      });
      const json = (await response.json()) as SendResponse | ErrorResponse;
      if (!response.ok || !json.ok) {
        const message = !json.ok ? json.error.message : "Cloudflare did not accept the email.";
        setStatus("error");
        setFeedback(message);
        return;
      }
      setStatus("sent");
      setFeedback(successMessage(json));
      setSubject("");
      setBodyText("");
    } catch {
      setStatus("error");
      setFeedback("The send request did not reach the server.");
    }
  };

  return (
    <form className="space-y-5" onSubmit={handleSubmit} aria-busy={status === "sending"}>
      <div className="space-y-2">
        <Label htmlFor="from-email">From</Label>
        <Input
          id="from-email"
          name="fromEmail"
          type="email"
          autoComplete="email"
          required
          value={fromEmail}
          onChange={(event) => setFromEmail(event.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="from-name">From name</Label>
        <Input
          id="from-name"
          name="fromName"
          value={fromName}
          onChange={(event) => setFromName(event.target.value)}
          maxLength={120}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="to-email">To</Label>
        <Input
          id="to-email"
          name="toEmail"
          type="email"
          autoComplete="email"
          required
          value={toEmail}
          onChange={(event) => setToEmail(event.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="subject">Subject</Label>
        <Input
          id="subject"
          name="subject"
          required
          value={subject}
          onChange={(event) => setSubject(event.target.value)}
          maxLength={200}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="body">Message</Label>
        <Textarea
          id="body"
          name="bodyText"
          required
          value={bodyText}
          onChange={(event) => setBodyText(event.target.value)}
          className="min-h-40"
        />
      </div>

      {status === "sent" ? <StatusAlert title="Email sent" message={feedback} /> : null}
      {status === "error" ? (
        <StatusAlert variant="destructive" title="Email was not sent" message={feedback} />
      ) : null}

      <Button type="submit" disabled={status === "sending"}>
        {status === "sending" ? "Sending…" : "Send email"}
      </Button>
    </form>
  );
};

import "server-only";

import { z } from "zod";

import { MAX_CSV_ROWS } from "@/lib/constants";
import { getScheduleError } from "@/lib/schedule";
import { findTemplateIssues } from "@/lib/spintax";

const addressSchema = z.object({
  email: z.email("Enter a valid email address."),
  name: z.string().trim().max(120).optional(),
});

const hasUnresolvedToken = (value: string): boolean => value.includes("{{");

export const manualSendRequestSchema = z
  .object({
    idempotencyKey: z.uuid("Idempotency key must be a UUID."),
    requestedAt: z.iso.datetime("requestedAt must be an ISO-8601 timestamp."),
    from: addressSchema,
    to: addressSchema,
    subject: z.string().trim().min(1, "Subject is required.").max(200, "Subject is too long."),
    bodyText: z.string().trim().min(1, "Message body is required.").max(50000, "Message body is too long."),
    bodyHtml: z.string().max(100000).optional(),
    thread: z.object({
      threadId: z.string().trim().min(1).max(200).optional(),
      inReplyTo: z.string().trim().min(1).max(500).optional(),
      references: z.array(z.string().trim().min(1).max(500)).max(50).optional(),
    }),
  })
  .superRefine((value, context) => {
    if (hasUnresolvedToken(value.subject) || hasUnresolvedToken(value.bodyText)) {
      context.addIssue({
        code: "custom",
        message: "Remove unused tokens before sending. The manual payload must be final text.",
        path: ["bodyText"],
      });
    }
  });

export const bulkIngestRequestSchema = z
  .object({
    idempotencyKey: z.uuid("Idempotency key must be a UUID."),
    requestedAt: z.iso.datetime("requestedAt must be an ISO-8601 timestamp."),
    campaignName: z.string().trim().min(1, "Campaign name is required.").max(120),
    subjectTemplate: z.string().trim().min(1, "Subject is required.").max(500),
    bodyTemplate: z.string().trim().min(1, "Message body is required.").max(50000),
    senderPool: z.array(z.email("Sender pool addresses must be valid emails.")).max(50),
    schedule: z.object({
      timezone: z.string().trim().min(1).max(100),
      startAt: z.iso.datetime().nullable(),
      daysOfWeek: z.array(z.number().int().min(0).max(6)).min(1).max(7),
      startHour: z.number().int(),
      endHour: z.number().int(),
      minDelaySeconds: z.number().int(),
      maxDelaySeconds: z.number().int(),
      maxPerDay: z.number().int(),
    }),
    contacts: z
      .array(
        z.object({
          email: z.email("Each contact needs a valid email address."),
          fields: z.record(z.string(), z.string().max(2000)),
        }),
      )
      .min(1, "Add at least one contact.")
      .max(MAX_CSV_ROWS, `A batch can include at most ${MAX_CSV_ROWS} contacts.`),
  })
  .superRefine((value, context) => {
    const scheduleError = getScheduleError(value.schedule);
    if (scheduleError) {
      context.addIssue({
        code: "custom",
        message: scheduleError,
        path: ["schedule"],
      });
    }

    const subjectIssue = findTemplateIssues(value.subjectTemplate);
    if (subjectIssue) {
      context.addIssue({
        code: "custom",
        message: subjectIssue,
        path: ["subjectTemplate"],
      });
    }

    const bodyIssue = findTemplateIssues(value.bodyTemplate);
    if (bodyIssue) {
      context.addIssue({
        code: "custom",
        message: bodyIssue,
        path: ["bodyTemplate"],
      });
    }

    value.contacts.forEach((contact, index) => {
      const keys = Object.keys(contact.fields);
      if (keys.length > 30) {
        context.addIssue({
          code: "custom",
          message: "Each contact can include at most 30 tokens.",
          path: ["contacts", index, "fields"],
        });
      }
      for (const key of keys) {
        if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(key)) {
          context.addIssue({
            code: "custom",
            message: `Token "${key}" must start with a letter and use only letters, numbers, and underscores.`,
            path: ["contacts", index, "fields"],
          });
        }
      }
    });
  });

export const inboxQuerySchema = z.object({
  cursor: z.string().max(200).optional(),
  q: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

const threadSchema = z.object({
  id: z.string(),
  subject: z.string(),
  snippet: z.string(),
  receivedAt: z.string(),
  unread: z.boolean(),
  from: addressSchema,
  to: z.array(addressSchema),
  messageCount: z.number(),
});

export const inboxListResponseSchema = z.object({
  ok: z.literal(true),
  threads: z.array(threadSchema),
  nextCursor: z.string().nullable(),
});

export const threadDetailResponseSchema = z.object({
  ok: z.literal(true),
  thread: threadSchema,
  messages: z.array(
    z.object({
      id: z.string(),
      direction: z.enum(["inbound", "outbound"]),
      from: addressSchema,
      to: z.array(addressSchema),
      subject: z.string(),
      bodyText: z.string(),
      sentAt: z.string(),
      messageIdHeader: z.string().optional(),
      references: z.array(z.string()).optional(),
      fields: z.record(z.string(), z.string()).optional(),
    }),
  ),
});

export const sendersResponseSchema = z.object({
  ok: z.literal(true),
  senders: z.array(addressSchema),
});

export const manualSendResponseSchema = z.object({
  ok: z.literal(true),
  status: z.literal("sent"),
  idempotencyKey: z.string(),
  providerMessageId: z.string(),
  threadId: z.string(),
});

export const bulkIngestResponseSchema = z.object({
  ok: z.literal(true),
  status: z.literal("queued"),
  idempotencyKey: z.string(),
  batchId: z.string(),
  acceptedCount: z.number(),
  rejected: z.array(
    z.object({
      index: z.number(),
      email: z.string(),
      reason: z.string(),
    }),
  ),
});

export const n8nErrorSchema = z.object({
  ok: z.literal(false),
  error: z.object({
    code: z.enum(["UNAUTHORIZED", "VALIDATION", "RATE_LIMITED", "UPSTREAM", "TIMEOUT"]),
    message: z.string(),
    retryable: z.boolean(),
  }),
});

export const firstIssueMessage = (error: z.ZodError): string =>
  error.issues[0]?.message ?? "The request is invalid.";

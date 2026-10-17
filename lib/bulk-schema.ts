import { z } from "zod";

import { fieldByNormalizedName } from "@/lib/bulk-contacts";
import { BULK_MAX_CONTACTS } from "@/lib/constants";
import type { BulkProgressEvent } from "@/types/bulk-send";

const TOO_MANY_CONTACTS =
  "A bulk job can include at most 5000 contacts. Split the file and start another job.";

export const isIanaTimeZone = (value: string): boolean => {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: value });
    return true;
  } catch {
    return false;
  }
};

const sendWindowSchema = z.object({
  timezone: z.string().trim().min(1).max(100),
  startHour: z.number().int().min(0).max(24),
  endHour: z.number().int().min(0).max(24),
  weekdaysOnly: z.boolean(),
});

const templateIsReady = (subject: string, bodyText: string, bodyHtml: string | undefined): boolean =>
  subject.trim().length > 0 && (bodyText.trim().length > 0 || (bodyHtml ?? "").trim().length > 0);

const rowHasOwnCopy = (row: Record<string, string>): boolean => {
  const subject = fieldByNormalizedName(row, "subject");
  const bodyText = fieldByNormalizedName(row, "bodyText");
  const bodyHtml = fieldByNormalizedName(row, "bodyHtml");
  return subject.length > 0 && (bodyText.length > 0 || bodyHtml.length > 0);
};

export const bulkSendRequestSchema = z
  .object({
    jobId: z.uuid("Job id must be a UUID."),
    name: z.string().trim().min(1, "Job name is required.").max(120),
    from: z.object({
      email: z.email("Enter a valid sender email address."),
      name: z.string().trim().max(120).optional(),
    }),
    emailColumn: z.string().trim().min(1, "Choose the email column.").max(200),
    rows: z
      .array(z.record(z.string().max(200), z.string().max(5000)))
      .min(1, "Add at least one contact.")
      .max(BULK_MAX_CONTACTS, TOO_MANY_CONTACTS),
    drip: z.object({
      intervalMinutes: z
        .number()
        .gt(0, "Interval must be greater than 0 minutes.")
        .max(1440, "Interval cannot be more than 1440 minutes."),
      jitterSeconds: z.number().int().min(0).max(3600).default(45),
      preSendPauseSeconds: z
        .object({
          min: z.number().int().min(1).max(600),
          max: z.number().int().min(1).max(600),
        })
        .default({ min: 4, max: 22 }),
    }),
    sendWindow: sendWindowSchema.nullable().optional(),
    template: z.object({
      subject: z.string().max(500).default(""),
      bodyText: z.string().max(50000).default(""),
      bodyHtml: z.string().max(100000).optional(),
    }),
    cc: z.string().max(500).default(""),
    bcc: z.string().max(500).default(""),
  })
  .superRefine((value, context) => {
    if (value.drip.preSendPauseSeconds.min > value.drip.preSendPauseSeconds.max) {
      context.addIssue({
        code: "custom",
        message: "Pause minimum cannot be greater than the maximum.",
        path: ["drip", "preSendPauseSeconds"],
      });
    }

    if (value.sendWindow) {
      if (!isIanaTimeZone(value.sendWindow.timezone)) {
        context.addIssue({
          code: "custom",
          message: "Choose a valid IANA timezone.",
          path: ["sendWindow", "timezone"],
        });
      }
      if (value.sendWindow.startHour >= value.sendWindow.endHour) {
        context.addIssue({
          code: "custom",
          message: "The send window must start before it ends.",
          path: ["sendWindow", "startHour"],
        });
      }
    }

    if (value.rows.some((row) => Object.keys(row).length > 40)) {
      context.addIssue({
        code: "custom",
        message: "Each contact can include at most 40 columns.",
        path: ["rows"],
      });
    }

    if (!templateIsReady(value.template.subject, value.template.bodyText, value.template.bodyHtml)) {
      const everyContactHasCopy = value.rows.every((row) => rowHasOwnCopy(row));
      if (!everyContactHasCopy) {
        context.addIssue({
          code: "custom",
          message: "Add a subject and a text or HTML body, or give every contact its own subject and body.",
          path: ["template", "subject"],
        });
      }
    }
  });

export type BulkSendRequest = z.infer<typeof bulkSendRequestSchema>;

const skippedSchema = z.object({
  row: z.number(),
  email: z.string(),
  reason: z.string(),
});

export const bulkAcceptedSchema = z.object({
  ok: z.literal(true),
  status: z.literal("accepted"),
  jobId: z.string(),
  total: z.number(),
  skippedCount: z.number(),
  skipped: z.array(skippedSchema).default([]),
  intervalMinutes: z.number(),
  jitterSeconds: z.number(),
  estimatedDurationMinutes: z.number(),
  estimatedFinishAt: z.string(),
  executionId: z.string(),
});

export const bulkDuplicateSchema = z.object({
  ok: z.literal(true),
  status: z.literal("duplicate"),
  jobId: z.string(),
  message: z.string().default("This job was already accepted."),
});

export const bulkProgressSchema = z.discriminatedUnion("event", [
  z.object({
    event: z.literal("email_result"),
    jobId: z.string().min(1),
    index: z.number().int().optional(),
    total: z.number().int().optional(),
    email: z.string().min(1),
    status: z.enum(["sent", "failed"]),
    providerMessageId: z.string().nullable().optional(),
    error: z.string().nullable().optional(),
    sentAt: z.string().optional(),
    nextSendInSeconds: z.number().nullable().optional(),
  }),
  z.object({
    event: z.literal("job_completed"),
    jobId: z.string().min(1),
    total: z.number().int(),
    sent: z.number().int(),
    failed: z.number().int(),
    skipped: z.number().int(),
    failures: z
      .array(
        z.object({
          index: z.number().optional(),
          email: z.string(),
          error: z.string(),
        }),
      )
      .default([]),
    finishedAt: z.string(),
  }),
]);

export type ParsedBulkProgress = BulkProgressEvent;

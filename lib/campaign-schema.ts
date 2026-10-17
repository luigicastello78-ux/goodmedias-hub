import { z } from "zod";

const stepSchema = z.object({
  id: z.uuid().optional(),
  itemType: z.enum(["message", "delay"]),
  delayDays: z.number().int().min(0).max(365).default(0),
  delayHours: z.number().int().min(0).max(23).default(0),
  delayMinutes: z.number().int().min(0).max(59).default(0),
  subject: z.string().max(200).default(""),
  bodyText: z.string().max(50000).default(""),
  bodyHtml: z.string().max(100000).default(""),
});

export const campaignDraftSchema = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(1).max(160),
  description: z.string().max(2000).default(""),
  senderEmail: z.email(),
  senderName: z.string().max(120).default(""),
  mergeTagFallbacks: z.record(z.string(), z.string().max(120)).default({}),
  steps: z.array(stepSchema).min(1).max(30),
});

export const personSchema = z.object({
  email: z.email(),
  firstName: z.string().max(120).nullable().optional(),
  lastName: z.string().max(120).nullable().optional(),
  company: z.string().max(160).nullable().optional(),
  phone: z.string().max(40).nullable().optional(),
  jobTitle: z.string().max(160).nullable().optional(),
  status: z.enum(["active", "inactive", "lead", "customer"]).nullable().optional(),
  source: z.string().max(80).nullable().optional(),
  notes: z.string().max(4000).nullable().optional(),
});

export const enrollSchema = z.object({
  people: z.array(personSchema).max(1000).optional(),
  distribution: z
    .object({
      name: z.string().max(160).default("Distribution"),
      executionType: z.enum(["immediate", "drip"]),
      contacts: z.array(personSchema).min(1).max(1000),
      dripContactsPerBatch: z.number().int().min(1).max(500).default(10),
      dripIntervalMinutes: z.number().int().min(1).max(1440).default(5),
      sendWindowEnabled: z.boolean().default(false),
      sendWindowDays: z.array(z.number().int().min(1).max(7)).default([1, 2, 3, 4, 5]),
      sendWindowStartHour: z.number().int().min(0).max(23).default(9),
      sendWindowEndHour: z.number().int().min(1).max(24).default(17),
      sendWindowTimezone: z.string().min(1).max(80).default("UTC"),
    })
    .optional(),
});

export const importSchema = z.object({
  contacts: z.array(personSchema).min(1).max(1000),
});

import type { BulkSchedule } from "@/types/n8n";
import type { ScheduleDraft } from "@/types/campaign";

const readPart = (
  parts: Intl.DateTimeFormatPart[],
  type: Intl.DateTimeFormatPartTypes,
): number => {
  const value = parts.find((part) => part.type === type)?.value;
  if (!value) {
    throw new Error("Invalid timezone");
  }
  return Number(value);
};

const getZonedParts = (date: Date, timeZone: string) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(date);

  let hour = readPart(parts, "hour");
  if (hour === 24) {
    hour = 0;
  }

  return {
    year: readPart(parts, "year"),
    month: readPart(parts, "month"),
    day: readPart(parts, "day"),
    hour,
    minute: readPart(parts, "minute"),
  };
};

export const zonedLocalToIso = (localValue: string, timeZone: string): string => {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(localValue);
  if (!match) {
    throw new Error("Invalid start time");
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const desiredUtc = Date.UTC(year, month - 1, day, hour, minute);
  let utc = desiredUtc;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const parts = getZonedParts(new Date(utc), timeZone);
    const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
    const delta = desiredUtc - asUtc;
    if (delta === 0) {
      return new Date(utc).toISOString();
    }
    utc += delta;
  }

  return new Date(utc).toISOString();
};

export const getScheduleError = (schedule: BulkSchedule): string | null => {
  if (!schedule.timezone.trim()) {
    return "Timezone is required.";
  }

  try {
    Intl.DateTimeFormat("en-US", { timeZone: schedule.timezone }).format(new Date());
  } catch {
    return "Timezone is not recognized.";
  }

  if (schedule.daysOfWeek.length === 0) {
    return "Choose at least one send day.";
  }

  const uniqueDays = new Set(schedule.daysOfWeek);
  if (
    uniqueDays.size !== schedule.daysOfWeek.length ||
    schedule.daysOfWeek.some((day) => !Number.isInteger(day) || day < 0 || day > 6)
  ) {
    return "Send days must be unique values from Sunday through Saturday.";
  }

  if (!Number.isInteger(schedule.startHour) || schedule.startHour < 0 || schedule.startHour > 23) {
    return "Start hour must be between 0 and 23.";
  }

  if (!Number.isInteger(schedule.endHour) || schedule.endHour < 0 || schedule.endHour > 23) {
    return "End hour must be between 0 and 23.";
  }

  if (schedule.startHour >= schedule.endHour) {
    return "The send window must end after it starts.";
  }

  if (!Number.isInteger(schedule.minDelaySeconds) || schedule.minDelaySeconds < 1) {
    return "Minimum delay must be at least 1 second.";
  }

  if (
    !Number.isInteger(schedule.maxDelaySeconds) ||
    schedule.maxDelaySeconds < schedule.minDelaySeconds
  ) {
    return "Maximum delay must be greater than or equal to the minimum delay.";
  }

  if (schedule.maxDelaySeconds > 86400) {
    return "Maximum delay cannot exceed 24 hours.";
  }

  if (!Number.isInteger(schedule.maxPerDay) || schedule.maxPerDay < 1 || schedule.maxPerDay > 5000) {
    return "Daily cap must be between 1 and 5000.";
  }

  if (schedule.startAt !== null && Number.isNaN(Date.parse(schedule.startAt))) {
    return "Start time is not a valid date.";
  }

  return null;
};

export const toSchedulePayload = (
  schedule: ScheduleDraft,
): { ok: true; schedule: BulkSchedule } | { ok: false; error: string } => {
  let startAt: string | null = null;

  if (schedule.startAtLocal.trim()) {
    try {
      startAt = zonedLocalToIso(schedule.startAtLocal, schedule.timezone);
    } catch {
      return { ok: false, error: "Start time is not a valid date for that timezone." };
    }
  }

  const payload: BulkSchedule = {
    timezone: schedule.timezone.trim(),
    startAt,
    daysOfWeek: schedule.daysOfWeek,
    startHour: schedule.startHour,
    endHour: schedule.endHour,
    minDelaySeconds: schedule.minDelaySeconds,
    maxDelaySeconds: schedule.maxDelaySeconds,
    maxPerDay: schedule.maxPerDay,
  };

  const error = getScheduleError(payload);
  if (error) {
    return { ok: false, error };
  }

  return { ok: true, schedule: payload };
};

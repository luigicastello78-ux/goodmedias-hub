export type MergeTagFallbacks = Record<string, string>;

export interface MergeContact {
  firstName?: string | null;
  lastName?: string | null;
  email: string;
  company?: string | null;
  jobTitle?: string | null;
  phone?: string | null;
}

const TAG_PATTERN = /\[([a-z_]+)(?:\|([^\]]*))?\]/gi;

const valueFor = (tag: string, contact: MergeContact): string => {
  switch (tag) {
    case "first_name":
      return contact.firstName?.trim() ?? "";
    case "last_name":
      return contact.lastName?.trim() ?? "";
    case "email":
      return contact.email.trim();
    case "company":
      return contact.company?.trim() ?? "";
    case "job_title":
      return contact.jobTitle?.trim() ?? "";
    case "phone":
      return contact.phone?.trim() ?? "";
    default:
      return "";
  }
};

export const replaceTags = (template: string, contact: MergeContact, fallbacks: MergeTagFallbacks = {}): string =>
  template.replace(TAG_PATTERN, (_match, rawTag: string, inline: string | undefined) => {
    const tag = rawTag.toLowerCase();
    const value = valueFor(tag, contact);
    if (value.length > 0) {
      return value;
    }
    if (inline != null && inline.length > 0) {
      return inline;
    }
    return fallbacks[tag]?.trim() ?? "";
  });

export const delayMs = (days: number, hours: number, minutes: number): number =>
  days * 86_400_000 + hours * 3_600_000 + minutes * 60_000;

const WEEKDAYS: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

export const zonedClock = (date: Date, timeZone: string): { weekday: number; hour: number } => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "numeric",
    hourCycle: "h23",
  }).formatToParts(date);
  const weekday = parts.find((part) => part.type === "weekday")?.value ?? "Mon";
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  return { weekday: WEEKDAYS[weekday] ?? 1, hour: Number.isFinite(hour) ? hour : 0 };
};

export const isInsideSendWindow = (
  date: Date,
  window: { enabled: boolean; days: number[]; startHour: number; endHour: number; timeZone: string },
): boolean => {
  if (!window.enabled) {
    return true;
  }
  const clock = zonedClock(date, window.timeZone);
  return window.days.includes(clock.weekday) && clock.hour >= window.startHour && clock.hour < window.endHour;
};

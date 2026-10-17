"use client";

import { useState } from "react";

import { StatusAlert } from "@/components/status-alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { prepareBulkContacts } from "@/lib/bulk-contacts";
import { TIMEZONE_OPTIONS } from "@/lib/constants";
import { estimateBulkDuration } from "@/lib/bulk-estimate";
import { useBulkSendStore } from "@/stores/bulk-send-store";

const PRESETS = [2, 5, 10, 15] as const;

const parseNumber = (value: string): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const BulkDrip = () => {
  const rows = useBulkSendStore((state) => state.rows);
  const emailColumn = useBulkSendStore((state) => state.emailColumn);
  const jobName = useBulkSendStore((state) => state.jobName);
  const intervalMinutes = useBulkSendStore((state) => state.intervalMinutes);
  const jitterSeconds = useBulkSendStore((state) => state.jitterSeconds);
  const pauseMin = useBulkSendStore((state) => state.pauseMin);
  const pauseMax = useBulkSendStore((state) => state.pauseMax);
  const sendWindowEnabled = useBulkSendStore((state) => state.sendWindowEnabled);
  const timezone = useBulkSendStore((state) => state.timezone);
  const startHour = useBulkSendStore((state) => state.startHour);
  const endHour = useBulkSendStore((state) => state.endHour);
  const weekdaysOnly = useBulkSendStore((state) => state.weekdaysOnly);
  const setJobName = useBulkSendStore((state) => state.setJobName);
  const setIntervalMinutes = useBulkSendStore((state) => state.setIntervalMinutes);
  const setJitterSeconds = useBulkSendStore((state) => state.setJitterSeconds);
  const setPauseMin = useBulkSendStore((state) => state.setPauseMin);
  const setPauseMax = useBulkSendStore((state) => state.setPauseMax);
  const setSendWindowEnabled = useBulkSendStore((state) => state.setSendWindowEnabled);
  const setTimezone = useBulkSendStore((state) => state.setTimezone);
  const setStartHour = useBulkSendStore((state) => state.setStartHour);
  const setEndHour = useBulkSendStore((state) => state.setEndHour);
  const setWeekdaysOnly = useBulkSendStore((state) => state.setWeekdaysOnly);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const contactCount = prepareBulkContacts(rows, emailColumn).contacts.length;
  const estimate = estimateBulkDuration({
    contactCount,
    intervalMinutes,
    pauseMin,
    pauseMax,
    sendWindowEnabled,
  });
  const zones = TIMEZONE_OPTIONS.includes(timezone as (typeof TIMEZONE_OPTIONS)[number])
    ? TIMEZONE_OPTIONS
    : [timezone, ...TIMEZONE_OPTIONS];
  const aggressive = (intervalMinutes > 0 && intervalMinutes < 2) || contactCount > 200;

  return (
    <div className="space-y-5">
      <div className="max-w-md space-y-1.5">
        <Label htmlFor="bulk-job-name">Job name</Label>
        <Input id="bulk-job-name" value={jobName} onChange={(event) => setJobName(event.target.value)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="bulk-interval">Interval in minutes</Label>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((preset) => (
            <Button
              key={preset}
              type="button"
              size="sm"
              variant={intervalMinutes === preset ? "default" : "outline"}
              aria-pressed={intervalMinutes === preset}
              onClick={() => setIntervalMinutes(preset)}
            >
              {preset} min
            </Button>
          ))}
        </div>
        <Input
          id="bulk-interval"
          type="number"
          min={0.1}
          max={1440}
          step="0.5"
          value={intervalMinutes}
          onChange={(event) => setIntervalMinutes(parseNumber(event.target.value))}
          className="max-w-40"
          required
        />
      </div>
      <div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-expanded={advancedOpen}
          onClick={() => setAdvancedOpen((open) => !open)}
        >
          {advancedOpen ? "Hide advanced settings" : "Advanced settings"}
        </Button>
      </div>
      {advancedOpen ? (
        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="bulk-jitter">Jitter seconds</Label>
            <Input
              id="bulk-jitter"
              type="number"
              min={0}
              max={3600}
              value={jitterSeconds}
              onChange={(event) => setJitterSeconds(parseNumber(event.target.value))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bulk-pause-min">Pause min seconds</Label>
            <Input
              id="bulk-pause-min"
              type="number"
              min={1}
              max={600}
              value={pauseMin}
              onChange={(event) => setPauseMin(parseNumber(event.target.value))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bulk-pause-max">Pause max seconds</Label>
            <Input
              id="bulk-pause-max"
              type="number"
              min={1}
              max={600}
              value={pauseMax}
              onChange={(event) => setPauseMax(parseNumber(event.target.value))}
            />
          </div>
        </div>
      ) : null}
      <div className="flex items-center gap-2">
        <Checkbox
          id="bulk-send-window"
          checked={sendWindowEnabled}
          onCheckedChange={(checked) => setSendWindowEnabled(checked === true)}
        />
        <Label htmlFor="bulk-send-window">Only send inside a window</Label>
      </div>
      {sendWindowEnabled ? (
        <div className="grid gap-4 md:grid-cols-4">
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="bulk-timezone">Timezone</Label>
            <Select value={timezone} onValueChange={setTimezone}>
              <SelectTrigger id="bulk-timezone" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {zones.map((zone) => (
                  <SelectItem key={zone} value={zone}>
                    {zone}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bulk-start-hour">Start hour</Label>
            <Input
              id="bulk-start-hour"
              type="number"
              min={0}
              max={24}
              value={startHour}
              onChange={(event) => setStartHour(parseNumber(event.target.value))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bulk-end-hour">End hour</Label>
            <Input
              id="bulk-end-hour"
              type="number"
              min={0}
              max={24}
              value={endHour}
              onChange={(event) => setEndHour(parseNumber(event.target.value))}
            />
          </div>
          <div className="flex items-center gap-2 md:col-span-4">
            <Checkbox
              id="bulk-weekdays"
              checked={weekdaysOnly}
              onCheckedChange={(checked) => setWeekdaysOnly(checked === true)}
            />
            <Label htmlFor="bulk-weekdays">Weekdays only</Label>
          </div>
        </div>
      ) : null}
      <p className="text-sm" aria-live="polite">
        {estimate.label}
      </p>
      {sendWindowEnabled ? (
        <p className="text-sm text-muted-foreground">
          A send window can push the finish later, because n8n waits until the window is open before each email.
        </p>
      ) : null}
      {aggressive ? (
        <StatusAlert
          title="Deliverability"
          message="Very short intervals and large lists are easier for mailbox providers to flag. n8n will not send faster than its own 20 second floor."
        />
      ) : null}
    </div>
  );
};

import { RequireAtLeastOne } from "./types";

export type TimeInput = RequireAtLeastOne<{
    hours?: number;
    minutes?: number;
    seconds?: number;
    milliseconds?: number;
}>;

export function ticks(time: TimeInput): number {
    const hours = time.hours ?? 0;
    const minutes = time.minutes ?? 0;
    const seconds = time.seconds ?? 0;
    const milliseconds = time.milliseconds ?? 0;

    const totalSeconds = (hours * 60 + minutes) * 60 + seconds;
    const ticksFromSeconds = totalSeconds * 60;

    const ticksFromMs = Math.round((milliseconds * 60) / 1000);

    return ticksFromSeconds + ticksFromMs;
}

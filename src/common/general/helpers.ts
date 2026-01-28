import { Pair } from "./types";

export const pair = <T>(left: T, right: T): Pair<T> => [left, right];

export const asArray = <T>(value?: T | T[]): T[] =>
    value === undefined ? [] : Array.isArray(value) ? value : [value];

export const pairList = <T>(...pairs: Array<Pair<T>>) => pairs;

export function repeat<T>(count: number, make: (index: number) => T): T[];
export function repeat<T>(count: number, value: T): T[];
export function repeat<T>(
    count: number,
    valueOrMake: T | ((index: number) => T),
): T[] {
    return Array.from({ length: count }, (_, index) =>
        typeof valueOrMake === "function"
            ? (valueOrMake as (index: number) => T)(index)
            : valueOrMake,
    );
}

export const isPlainObject = (
    value: unknown,
): value is Record<string, unknown> =>
    Boolean(value) && typeof value === "object" && !Array.isArray(value);

export const mergeDeep = <T extends Record<string, unknown>>(
    base: T,
    next: Partial<T>,
): T => {
    const out: Record<string, unknown> = { ...base };

    Object.entries(next).forEach(([key, value]) => {
        if (value === undefined) return;

        const prev = out[key];

        if (isPlainObject(prev) && isPlainObject(value)) {
            out[key] = mergeDeep(prev, value);
            return;
        }

        out[key] = value;
    });

    return out as T;
};

export type Selector<T, R> = (item: T) => R;

export function sortBy<T>(items: T[], selector: Selector<T, number>): T[] {
    return [...items].sort((a, b) => selector(a) - selector(b));
}

export function unique<T>(items: T[]): T[] {
    return items.filter((item, index, list) => list.indexOf(item) === index);
}

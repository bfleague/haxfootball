export type RequireAtLeastOne<T, Keys extends keyof T = keyof T> = Pick<
    T,
    Exclude<keyof T, Keys>
> &
    {
        [K in Keys]-?: Required<Pick<T, K>> &
            Partial<Pick<T, Exclude<Keys, K>>>;
    }[Keys];

export type Pair<T> = readonly [T, T];
export type Quad<T> = readonly [T, T, T, T];

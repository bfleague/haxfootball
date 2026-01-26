import { Pair } from "./types";

export const pair = <T>(left: T, right: T): Pair<T> => [left, right];

import type { CollisionFlag } from "@haxball/stadium";

export const mask = (...flags: CollisionFlag[]): CollisionFlag[] => flags;

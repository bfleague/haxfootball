import { createGlobalHook } from "@runtime/runtime";
import { legacyGlobalSchema } from "@meta/legacy/global";

export const $global = createGlobalHook<typeof legacyGlobalSchema>();

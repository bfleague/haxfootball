import { Kickoff } from "./states/kickoff";
import { KickoffCatch } from "./states/kickoff-catch";
import { KickoffCaught } from "./states/kickoff-caught";
import { Prehike } from "./states/prehike";

export { default as stadium } from "@meta/legacy/stadiums/base";

export const registry = {
    KICKOFF: Kickoff,
    KICKOFF_CATCH: KickoffCatch,
    KICKOFF_CAUGHT: KickoffCaught,
    PREHIKE: Prehike,
};

import { Kickoff } from "./states/kickoff";
import { KickoffCatch } from "./states/kickoff-catch";
export { default as stadium } from "@meta/legacy/stadiums/base";

export const registry = {
    KICKOFF: Kickoff,
    KICKOFF_CATCH: KickoffCatch,
};

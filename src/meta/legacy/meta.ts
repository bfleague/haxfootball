import { Kickoff } from "./states/kickoff";
import { KickoffInFlight } from "./states/kickoff-in-flight";
import { KickoffReturn } from "./states/kickoff-return";
import { Presnap } from "./states/presnap";
import { Snap } from "./states/snap";

export { default as stadium } from "@meta/legacy/stadiums/base";

export const registry = {
    KICKOFF: Kickoff,
    KICKOFF_IN_FLIGHT: KickoffInFlight,
    KICKOFF_RETURN: KickoffReturn,
    PRESNAP: Presnap,
    SNAP: Snap,
};

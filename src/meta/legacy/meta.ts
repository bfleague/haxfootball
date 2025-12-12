import { BlockedPass } from "./states/blocked-pass";
import { Interception } from "./states/interception";
import { Kickoff } from "./states/kickoff";
import { KickoffInFlight } from "./states/kickoff-in-flight";
import { KickoffReturn } from "./states/kickoff-return";
import { LiveBall } from "./states/live-ball";
import { Presnap } from "./states/presnap";
import { Safety } from "./states/safety";
import { Snap } from "./states/snap";
import { SnapInFlight } from "./states/snap-in-flight";

export { default as stadium } from "@meta/legacy/stadium";

export const registry = {
    KICKOFF: Kickoff,
    KICKOFF_IN_FLIGHT: KickoffInFlight,
    KICKOFF_RETURN: KickoffReturn,
    PRESNAP: Presnap,
    SNAP: Snap,
    SAFETY: Safety,
    SNAP_IN_FLIGHT: SnapInFlight,
    LIVE_BALL: LiveBall,
    BLOCKED_PASS: BlockedPass,
    INTERCEPTION: Interception,
};

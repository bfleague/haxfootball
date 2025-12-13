import { PassDeflection } from "./states/pass-deflection";
import { Interception } from "./states/interception";
import { Kickoff } from "./states/kickoff";
import { KickoffInFlight } from "./states/kickoff-in-flight";
import { KickoffReturn } from "./states/kickoff-return";
import { SafetyKickInFlight } from "./states/safety-kick-in-flight";
import { SafetyKickReturn } from "./states/safety-kick-return";
import { LiveBall } from "./states/live-ball";
import { Presnap } from "./states/presnap";
import { Safety } from "./states/safety";
import { Snap } from "./states/snap";
import { SnapInFlight } from "./states/snap-in-flight";
import { BlockedPass } from "./states/blocked-pass";
import { InterceptionAttempt } from "./states/interception-attempt";

export { default as stadium } from "@meta/legacy/stadium";

export const registry = {
    KICKOFF: Kickoff,
    KICKOFF_IN_FLIGHT: KickoffInFlight,
    KICKOFF_RETURN: KickoffReturn,
    SAFETY_KICK_IN_FLIGHT: SafetyKickInFlight,
    SAFETY_KICK_RETURN: SafetyKickReturn,
    PRESNAP: Presnap,
    SNAP: Snap,
    SAFETY: Safety,
    SNAP_IN_FLIGHT: SnapInFlight,
    LIVE_BALL: LiveBall,
    PASS_DEFLECTION: PassDeflection,
    BLOCKED_PASS: BlockedPass,
    INTERCEPTION: Interception,
    INTERCEPTION_ATTEMPT: InterceptionAttempt,
};

import { $effect, $next } from "@common/hooks";
import { other, Team } from "@common/utils";
import { GameState, State } from "@common/models";
import {
    $blockMiddleLineForTeam,
    $blockTeamToEndZone,
    $freeTeams,
    $lockBall,
    $unlockBall,
} from "@meta/legacy/hooks";

// This is a State. It accepts custom parameters and returns
// run and dispose functions to be called each tick/event
// and when the state is exited, respectively. The States
// are similar to state machines.
export function Kickoff({ forTeam = Team.RED }: { forTeam?: Team }): State {
    // These are custom hooks. They are simple functions that can call
    // other hooks inside them. These ones use the $effect hook to setup
    // and cleanup the team blocking.
    //
    // `$blockMiddleLineForTeam` could be implemented like this:
    // ```typescript
    // function $blockMiddleLineForTeam(team: Team) {
    //     $effect(($) => {
    //         $.state.players.filter((p) => p.team === team).forEach((p) => {
    //             $.setPlayerDiscProperties(
    //                 p,
    //                 {
    //                     cGroup: p.team === Team.Red
    //                         ? p.cGroup | $.CollisionFlags.c2
    //                         : p.cGroup | $.CollisionFlags.c3,
    //                 },
    //             );
    //         });
    //     });
    // }
    // ```
    // `$blockTeamToEndZone` would be similar, but blocking
    // `c0` and `c1` for Red and Blue teams, respectively.
    // `$lockBall` would set the ball's invMass to 0.000001.
    $blockMiddleLineForTeam(forTeam);
    $blockTeamToEndZone(other(forTeam));
    $lockBall();

    // The run function is called each tick or on specific events like
    // `onPlayerBallKick`. It receives the current game state as parameter.
    // The game state is lazily constructed from Haxball room function calls
    // with the help of getters and memoization to avoid unnecessary
    // computations.
    function run(state: GameState) {
        const playerKickingBall = state.players.some((p) => p.isKickingBall);

        if (playerKickingBall) {
            // The $effect hook allows us to run code that interacts
            // with the game room, like sending messages, changing physics,
            // updating stats, etc. Also, they're lazily executed at the end
            // of the current tick.
            $effect(($) => {
                $.send("The kickoff has been made!");
                // Stats are useful for tracking important events in the game.
                // They're not Haxball-native, but can be used for analytics
                // or achievements.
                $.stat("KICKOFF_MADE");
            });

            // The $next hook allows us to transition to another state. Here,
            // we're transitioning to the KICKOFF_CATCH state, passing
            // some parameters to it. This returns `never` because the current
            // state will be exited immediately. It also is lazily executed
            // at the end of the current tick, after all $effect hooks.
            // This is defined in `src/meta/legacy/states/kickoff-catch.ts`,
            // here it's referenced by its name as a string to allow
            // for easy dependency injection and management.
            $next({
                to: "KICKOFF_CATCH",
                params: {
                    kicker: playerKickingBall,
                    kickingTeam: playerKickingBall.team,
                },
            });
        }
    }

    // The dispose function is called when the state is exited. Here, we
    // free the blocked teams using the $freeTeams custom hook.
    function dispose() {
        $freeTeams();
        $unlockBall();
    }

    // Finally, we return the run and dispose functions.
    return {
        run,
        dispose,
    };
}

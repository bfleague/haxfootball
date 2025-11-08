import { $effect, $config } from "@common/hooks";
import { opposite, Team, getDistance } from "@common/utils";
import { State, Player } from "@common/models";
import { Config } from "@meta/legacy/config.ts";

export function KickoffCatch({
    kicker,
    kickingTeam,
}: {
    kicker: Player;
    kickingTeam: Team;
}) {
    // The $config custom hook allows us to access configuration values
    // defined elsewhere in the codebase. Here we pass the `Config` type
    // to get type safety and autocompletion. We set the configuration
    // values at state machine initialization time.
    const config = $config<Config>();

    function run(state: State) {
        const catcher = state.players.some(
            (p) =>
                p.team === opposite(kickingTeam) &&
                (p.isKickingBall ||
                    getDistance(p, state.ball) < config.TOUCHING_DISTANCE),
        );

        if (catcher) {
            $effect(($) => {
                $.send(`Player ${catcher.name} has caught the kickoff!`);
                $.stat("KICKOFF_CAUGHT");
                // Stops the game, killing the state machine.
                // In a real implementation, we would likely
                // transition to another state instead, but for simplicity
                // we'll just stop the game here.
                $.stop();
            });
        }
    }

    return {
        run,
    };
}

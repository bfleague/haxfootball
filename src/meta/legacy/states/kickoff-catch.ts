import { $effect } from "@common/hooks";
import { other, Team, getDistance } from "@common/utils";
import { State, Player } from "@common/models";
import { $config } from "@meta/legacy/hooks";

export function KickoffCatch({
    kicker,
    kickingTeam,
}: {
    kicker: Player;
    kickingTeam: Team;
}) {
    // The $config custom hook allows us to access configuration values
    // defined elsewhere in the codebase.
    const config = $config();

    function run(state: State) {
        const catcher = state.players.some(
            (p) =>
                p.team === other(kickingTeam) &&
                (p.isKickingBall ||
                    getDistance(p, state.ball) < config.TOUCHING_DISTANCE),
        );

        if (catcher) {
            $effect(($) => {
                $.send(`Player ${catcher.name} has caught the kickoff!`);
                $.stat("KICKOFF_CAUGHT");
                // Stops the game, killing the state machine.
                $.stop();
            });
        }
    }

    return {
        run,
    };
}

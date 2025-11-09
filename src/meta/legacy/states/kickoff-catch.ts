import { $effect, $next } from "@common/hooks";
import { type FieldTeam } from "@common/models";
import { opposite, findCatchingBallPlayer } from "@common/utils";
import type { GameState } from "@common/engine";
// import type { Config } from "@meta/legacy/config";

export function KickoffCatch({ kickingTeam }: { kickingTeam: FieldTeam }) {
    // const cfg = $config<Config>();

    function run(state: GameState) {
        const receivingTeam = opposite(kickingTeam);

        const catcher = findCatchingBallPlayer(
            state.ball,
            state.players.filter((p) => p.team === receivingTeam),
        );

        if (catcher) {
            $effect(($) => {
                $.send("Kickoff caught!");
                $.stat("KICKOFF_CAUGHT");
            });

            $next({
                to: "KICKOFF_CAUGHT",
                params: { playerId: catcher.id, receivingTeam },
            });
        }
    }

    return { run };
}

import { $effect, $config } from "@common/hooks";
import { Team } from "@common/models";
import { opposite, getDistance } from "@common/utils";
import type { GameState } from "@common/engine";
import type { Config } from "@meta/legacy/config";

export function KickoffCatch({ kickingTeam }: { kickingTeam: Team }) {
    const cfg = $config<Config>();

    function run(state: GameState) {
        const receivingTeam = opposite(kickingTeam);

        const catcher = state.players.find(
            (p) =>
                p.team === receivingTeam &&
                (p.isKickingBall ||
                    getDistance(p, state.ball) <= cfg.TOUCHING_DISTANCE),
        );

        if (catcher) {
            $effect(($) => {
                $.send("Kickoff caught!");
                $.stat("KICKOFF_CAUGHT");
                $.stopGame();
            });
        }
    }

    return { run };
}

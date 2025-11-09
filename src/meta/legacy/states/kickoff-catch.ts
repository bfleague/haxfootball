import { $effect, $config, $next } from "@common/hooks";
import { type FieldTeam } from "@common/models";
import { opposite, getDistance } from "@common/utils";
import type { GameState } from "@common/engine";
import type { Config } from "@meta/legacy/config";

export function KickoffCatch({ kickingTeam }: { kickingTeam: FieldTeam }) {
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
            });

            $next({
                to: "KICKOFF_CAUGHT",
                params: { playerId: catcher.id, receivingTeam },
            });
        }
    }

    return { run };
}

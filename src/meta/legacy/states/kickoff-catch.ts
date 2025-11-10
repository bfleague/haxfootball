import { $effect, $next } from "@common/hooks";
import { type FieldTeam } from "@common/models";
import { opposite, findBallCatcher } from "@common/utils";
import type { GameState } from "@common/engine";
import { t } from "@lingui/core/macro";

export function KickoffCatch({ kickingTeam }: { kickingTeam: FieldTeam }) {
    function run(state: GameState) {
        // TODO: Out of bounds check

        const receivingTeam = opposite(kickingTeam);

        const catcher = findBallCatcher(
            state.ball,
            state.players.filter((p) => p.team === receivingTeam),
        );

        if (catcher) {
            $effect(($) => {
                $.send(t`Kickoff caught!`);
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

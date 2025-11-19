import { $effect, $next } from "@common/hooks";
import { opposite, findBallCatcher } from "@common/utils";
import type { GameState } from "@common/engine";
import { t } from "@lingui/core/macro";
import { getFieldPosition, isOutOfBounds } from "@meta/legacy/utils/stadium";
import { DownState } from "@meta/legacy/utils/game";

export function SnapInFlight({ downState }: { downState: DownState }) {
    const { offensiveTeam } = downState;

    function run(state: GameState) {
        if (isOutOfBounds(state.ball)) {
            const fieldPos = getFieldPosition(state.ball.x);

            $effect(($) => {
                $.send(t`Ball went out of bounds!`);
                $.stat("BALL_OUT_OF_BOUNDS");
            });

            $next({
                to: "PRESNAP",
                params: {
                    offensiveTeam,
                    fieldPos,
                },
            });
        }

        const receivingTeam = opposite(offensiveTeam);

        const catcher = findBallCatcher(
            state.ball,
            state.players.filter((p) => p.team === receivingTeam),
        );

        if (catcher) {
            $effect(($) => {
                $.send(t`Pass caught by ${catcher.name}!`);
                $.stat("PASS_CATCHED");
            });

            $next({
                to: "LIVE_BALL",
                params: { playerId: catcher.id, offensiveTeam },
            });
        }

        // TODO: Catch by offensive team and interceptions
    }

    return { run };
}

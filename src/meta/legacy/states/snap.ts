import type { GameState } from "@common/engine";
import { $setBallMoveable, $unlockBall } from "@meta/legacy/hooks/physics";
import { $setLineOfScrimmage, $unsetLineOfScrimmage } from "../hooks/game";
import { DownState } from "../utils/game";
import { findBallCatcher } from "@common/utils";
import { $effect, $next } from "@common/runtime";

export function Snap({
    quarterbackId,
    downState,
}: {
    quarterbackId: number;
    downState: DownState;
}) {
    const { fieldPos, offensiveTeam } = downState;

    $setBallMoveable();
    $unlockBall();
    $setLineOfScrimmage(fieldPos);

    function run(state: GameState) {
        // TODO: Snap logic

        const catcher = findBallCatcher(
            state.ball,
            state.players.filter((p) => p.id !== quarterbackId),
        );

        if (catcher) {
            if (catcher.team === offensiveTeam) {
                $effect(($) => {
                    $.send(`Pass caught by ${catcher.name}!`);
                    $.stat("PASS_CATCHED");
                });

                $next({
                    to: "LIVE_BALL",
                    params: { playerId: catcher.id, downState },
                });
            }
        }
    }

    function dispose() {
        // TODO: Cleanup logic

        $unsetLineOfScrimmage();
    }

    return { run, dispose };
}

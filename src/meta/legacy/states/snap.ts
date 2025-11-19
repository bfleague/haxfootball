import type { GameState } from "@common/engine";
import { $setBallMoveable, $unlockBall } from "@meta/legacy/hooks/physics";
import {
    $setFirstDownLine,
    $setLineOfScrimmage,
    $unsetFirstDownLine,
    $unsetLineOfScrimmage,
} from "@meta/legacy/hooks/game";
import { DownState } from "@meta/legacy/utils/game";
import { $effect, $next } from "@common/runtime";

export function Snap({
    quarterbackId,
    downState,
}: {
    quarterbackId: number;
    downState: DownState;
}) {
    const { fieldPos, offensiveTeam, downAndDistance } = downState;

    $setBallMoveable();
    $unlockBall();
    $setLineOfScrimmage(fieldPos);
    $setFirstDownLine(offensiveTeam, fieldPos, downAndDistance.distance);

    function run(state: GameState) {
        const quarterback = state.players.find((p) => p.id === quarterbackId);
        if (!quarterback) return;

        if (quarterback.isKickingBall) {
            $effect(($) => {
                $.stat("SNAP_KICKED_BALL");
            });

            $next({
                to: "SNAP_IN_FLIGHT",
                params: { downState },
            });
        }
    }

    function dispose() {
        $unsetLineOfScrimmage();
        $unsetFirstDownLine();
    }

    return { run, dispose };
}

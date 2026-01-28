import { GameState } from "@runtime/engine";
import { $dispose, $next } from "@runtime/runtime";
import { DownState } from "@meta/legacy/utils/down";
import { ticks } from "@common/general/time";
import {
    $setBallActive,
    $setBallInactive,
    $setFirstDownLine,
    $setLineOfScrimmage,
    $unsetFirstDownLine,
    $unsetLineOfScrimmage,
} from "@meta/legacy/hooks/game";

const TIME_TO_BLOCKED_PASS_STATE = ticks({ milliseconds: 200 });

export function PassDeflection({
    blockTime,
    blockerId,
    downState,
    isKickingBall: isInitialKickingBall,
}: {
    blockTime: number;
    blockerId: number;
    downState: DownState;
    isKickingBall: boolean;
}) {
    const { offensiveTeam, fieldPos, downAndDistance } = downState;

    $setLineOfScrimmage(fieldPos);
    $setFirstDownLine(offensiveTeam, fieldPos, downAndDistance.distance);
    $setBallInactive();

    $dispose(() => {
        $unsetLineOfScrimmage();
        $setBallActive();
        $unsetFirstDownLine();
    });

    // TODO: Check if player leaves

    function run(state: GameState) {
        const blocker = state.players.find((p) => p.id === blockerId);
        if (!blocker) return;

        if (isInitialKickingBall || blocker.isKickingBall) {
            $next({
                to: "INTERCEPTION_ATTEMPT",
                params: {
                    playerId: blockerId,
                    kickTime: state.tickNumber,
                    downState,
                },
            });
        }

        if (state.tickNumber - blockTime >= TIME_TO_BLOCKED_PASS_STATE) {
            $next({
                to: "BLOCKED_PASS",
                params: {
                    blockerId: blockerId,
                    downState,
                },
            });
        }
    }

    return { run };
}

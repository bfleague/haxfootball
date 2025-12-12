import { GameState, GameStateBall } from "@common/engine";
import { FieldTeam } from "@common/models";
import { $before, $dispose, $effect } from "@common/runtime";
import { AVATARS, Line, PointLike, ticks } from "@common/utils";
import {
    $hideInterceptionPath,
    $setBallActive,
    $setBallInactive,
    $showInterceptionPath,
} from "@meta/legacy/hooks/game";

const MAX_PATH_DURATION = ticks({ seconds: 2 });

export function Interception({
    playerId,
    ballState,
    intersectionPoint,
    offensiveTeam,
}: {
    playerId: number;
    ballPath: Line;
    ballState: GameStateBall;
    intersectionPoint: PointLike;
    offensiveTeam: FieldTeam;
}) {
    $setBallInactive();

    const { tickNumber: initialTickNumber } = $before();

    $effect(($) => {
        $.setAvatar(playerId, AVATARS.BALL);
    });

    $dispose(() => {
        $effect(($) => {
            $.setAvatar(playerId, null);
        });
    });

    function showPath() {
        $showInterceptionPath({
            start: { x: ballState.x, y: ballState.y },
            end: { x: intersectionPoint.x, y: intersectionPoint.y },
        });
    }

    function run(state: GameState) {
        const elapsedTicks = state.tickNumber - initialTickNumber;

        if (elapsedTicks < MAX_PATH_DURATION) {
            showPath();
        } else {
            $hideInterceptionPath();
        }
    }

    function dispose() {
        $hideInterceptionPath();
        $setBallActive();
    }

    return { run, dispose };
}

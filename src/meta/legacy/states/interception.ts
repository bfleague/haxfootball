import { GameState, GameStateBall } from "@common/engine";
import { FieldTeam } from "@common/models";
import { $before, $dispose, $effect } from "@common/runtime";
import { AVATARS, Line, getMidpoint, ticks } from "@common/utils";
import {
    getBallPath,
    intersectRayWithSegment,
} from "@meta/legacy/utils/stadium";
import {
    $hideInterceptionPath,
    $setBallActive,
    $setBallInactive,
    $showInterceptionPath,
} from "@meta/legacy/hooks/game";

const MAX_PATH_DURATION = ticks({ seconds: 2 });

export function Interception({
    playerId,
    ballPath,
    ballState,
    // offensiveTeam,
}: {
    playerId: number;
    ballPath: Line;
    ballState: GameStateBall;
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
        const ray = getBallPath(
            ballState.x,
            ballState.y,
            ballState.xspeed,
            ballState.yspeed,
        );

        const intersection = intersectRayWithSegment(ray, ballPath);

        const target = intersection.intersects
            ? intersection.point
            : getMidpoint(ballPath.start, ballPath.end);

        $showInterceptionPath({
            start: { x: ballState.x, y: ballState.y },
            end: { x: target.x, y: target.y },
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

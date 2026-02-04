import { GameState } from "@runtime/engine";
import { $before, $dispose, $effect, $next } from "@runtime/runtime";
import { DownState } from "@meta/legacy/utils/down";
import { ticks } from "@common/general/time";
import { opposite } from "@common/game/game";
import { $lockBall, $unlockBall } from "@meta/legacy/hooks/physics";
import { getDistance, PointLike } from "@common/math/geometry";
import {
    type GoalPostIntersection,
    type GoalPostIntersectionResult,
    getBallPath,
    intersectsGoalPosts,
} from "@meta/legacy/utils/stadium";
import {
    $setBallActive,
    $setBallInactive,
    $setFirstDownLine,
    $setLineOfScrimmage,
    $unsetFirstDownLine,
    $unsetLineOfScrimmage,
} from "@meta/legacy/hooks/game";
import { t } from "@lingui/core/macro";

const TIME_TO_CHECK_INTERCEPTION = ticks({ milliseconds: 200 });

type GoalPostIntersectionCandidate = {
    point: PointLike;
    distance: number;
};

const isGoalPostIntersection = (
    result: GoalPostIntersectionResult,
): result is GoalPostIntersection => result.intersects;

export function InterceptionAttempt({
    kickTime,
    playerId,
    downState,
}: {
    kickTime: number;
    playerId: number;
    downState: DownState;
}) {
    $lockBall();

    const { offensiveTeam, fieldPos, downAndDistance } = downState;

    $setLineOfScrimmage(fieldPos);
    $setFirstDownLine(offensiveTeam, fieldPos, downAndDistance.distance);
    $setBallInactive();

    $dispose(() => {
        $unlockBall();
        $unsetLineOfScrimmage();
        $setBallActive();
        $unsetFirstDownLine();
    });

    const { ball: ballState } = $before();

    // TODO: Check if player leaves

    function run(state: GameState) {
        const blocker = state.players.find((p) => p.id === playerId);
        if (!blocker) return;

        if (state.tickNumber - kickTime >= TIME_TO_CHECK_INTERCEPTION) {
            const ball = state.ball;
            const ballPath = getBallPath(
                ball.x,
                ball.y,
                ball.xspeed,
                ball.yspeed,
            );

            const goals = [
                downState.offensiveTeam,
                opposite(downState.offensiveTeam),
            ] as const;

            const intersections = goals
                .map((goal) => intersectsGoalPosts(ballPath, goal))
                .filter(isGoalPostIntersection)
                .map<GoalPostIntersectionCandidate>((result) => ({
                    point: result.point,
                    distance: getDistance(result.point, ballPath.origin),
                }))
                .sort((a, b) => a.distance - b.distance);

            const intersection = intersections[0];

            if (intersection) {
                $effect(($) => {
                    $.send(t`Interception by ${blocker.name}!`);
                });

                $next({
                    to: "INTERCEPTION",
                    params: {
                        playerId: playerId,
                        intersectionPoint: intersection.point,
                        ballState,
                        playerTeam: blocker.team,
                    },
                });
            } else {
                $next({
                    to: "BLOCKED_PASS",
                    params: {
                        blockerId: playerId,
                        downState,
                    },
                });
            }
        }
    }

    return { run };
}

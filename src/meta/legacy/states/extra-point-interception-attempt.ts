import type { GameState } from "@runtime/engine";
import { $before, $dispose, $effect, $next } from "@runtime/runtime";
import { ticks } from "@common/general/time";
import { getDistance, type PointLike } from "@common/math/geometry";
import { type FieldTeam } from "@runtime/models";
import { t } from "@lingui/core/macro";
import { opposite, type FieldPosition } from "@common/game/game";
import {
    type GoalPostIntersection,
    type GoalPostIntersectionResult,
    getBallPath,
    intersectsGoalPosts,
} from "@meta/legacy/utils/stadium";
import {
    $setBallActive,
    $setBallInactive,
    $setLineOfScrimmage,
    $unsetFirstDownLine,
    $unsetLineOfScrimmage,
} from "@meta/legacy/hooks/game";
import { $lockBall, $unlockBall } from "@meta/legacy/hooks/physics";

const TIME_TO_CHECK_INTERCEPTION = ticks({ milliseconds: 200 });

type GoalPostIntersectionCandidate = {
    point: PointLike;
    distance: number;
};

const isGoalPostIntersection = (
    result: GoalPostIntersectionResult,
): result is GoalPostIntersection => result.intersects;

export function ExtraPointInterceptionAttempt({
    kickTime,
    playerId,
    offensiveTeam,
    fieldPos,
}: {
    kickTime: number;
    playerId: number;
    offensiveTeam: FieldTeam;
    fieldPos: FieldPosition;
}) {
    $lockBall();
    $setLineOfScrimmage(fieldPos);
    $unsetFirstDownLine();
    $setBallInactive();

    $dispose(() => {
        $unlockBall();
        $unsetLineOfScrimmage();
        $unsetFirstDownLine();
        $setBallActive();
    });

    const { ball: ballState } = $before();

    function run(state: GameState) {
        const blocker = state.players.find((player) => player.id === playerId);
        if (!blocker) return;

        if (state.tickNumber - kickTime < TIME_TO_CHECK_INTERCEPTION) return;

        const ball = state.ball;
        const ballPath = getBallPath(
            ball.x,
            ball.y,
            ball.xspeed,
            ball.yspeed,
        );
        const goals = [offensiveTeam, opposite(offensiveTeam)] as const;
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
                to: "EXTRA_POINT_RUN",
                params: {
                    playerId: blocker.id,
                    ballTeam: blocker.team,
                    originalOffensiveTeam: offensiveTeam,
                    fieldPos,
                    interceptionPath: {
                        start: {
                            x: ballState.x,
                            y: ballState.y,
                        },
                        end: {
                            x: intersection.point.x,
                            y: intersection.point.y,
                        },
                    },
                },
            });
        } else {
            $next({
                to: "EXTRA_POINT_BLOCKED_PASS",
                params: {
                    blockerId: blocker.id,
                    offensiveTeam,
                    fieldPos,
                },
            });
        }
    }

    return { run };
}

import { GameState } from "@runtime/engine";
import { FieldTeam } from "@runtime/models";
import { $before, $dispose, $effect, $next } from "@runtime/runtime";
import { DownState } from "@meta/legacy/utils/down";
import { ticks } from "@common/general/time";
import { opposite } from "@common/game/game";
import { $lockBall, $unlockBall } from "@meta/legacy/hooks/physics";
import { getGoalLine } from "@meta/legacy/utils/stadium";
import { cross } from "@common/math/geometry";
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

type Point = { x: number; y: number };
type SegmentHit = { intersects: true; point: Point; distance: number };
type SegmentNoHit = { intersects: false };
type SegmentIntersection = SegmentHit | SegmentNoHit;

const intersectSegmentWithGoalLine = (
    start: Point,
    end: Point,
    team: FieldTeam,
): SegmentIntersection => {
    const line = getGoalLine(team);
    const r = { x: end.x - start.x, y: end.y - start.y };
    const s = {
        x: line.end.x - line.start.x,
        y: line.end.y - line.start.y,
    };
    const rxs = cross(r, s);

    if (Math.abs(rxs) < 1e-10) {
        return { intersects: false };
    }

    const qp = { x: line.start.x - start.x, y: line.start.y - start.y };
    const t = cross(qp, s) / rxs;
    const u = cross(qp, r) / rxs;

    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
        const point = { x: start.x + t * r.x, y: start.y + t * r.y };
        const dx = point.x - start.x;
        const dy = point.y - start.y;

        return {
            intersects: true,
            point,
            distance: Math.hypot(dx, dy),
        };
    }

    return { intersects: false };
};

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
            const start = { x: ballState.x, y: ballState.y };
            const end = { x: state.ball.x, y: state.ball.y };
            const goalTeams = [
                downState.offensiveTeam,
                opposite(downState.offensiveTeam),
            ];

            const intersections = goalTeams
                .map((team) => {
                    const result = intersectSegmentWithGoalLine(
                        start,
                        end,
                        team,
                    );
                    return result.intersects ? result : null;
                })
                .filter((entry): entry is SegmentHit => entry !== null);

            const [closest] = intersections.sort(
                (a, b) => a.distance - b.distance,
            );

            if (closest) {
                $effect(($) => {
                    $.send(t`Interception by ${blocker.name}!`);
                });

                $next({
                    to: "INTERCEPTION",
                    params: {
                        playerId: playerId,
                        intersectionPoint: closest.point,
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

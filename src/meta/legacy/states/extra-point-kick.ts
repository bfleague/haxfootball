import type { GameState } from "@runtime/engine";
import { ticks } from "@common/general/time";
import { opposite } from "@common/game/game";
import { t } from "@lingui/core/macro";
import { $dispose, $effect, $next } from "@runtime/runtime";
import { $global } from "@meta/legacy/hooks/global";
import { $setBallActive } from "@meta/legacy/hooks/game";
import { $lockBall, $unlockBall } from "@meta/legacy/hooks/physics";
import { type FieldTeam } from "@runtime/models";
import { SCORES } from "@meta/legacy/utils/scoring";
import {
    calculateDirectionalGain,
    getGoalLine,
    isOutOfBounds,
    isWithinGoalPosts,
} from "@meta/legacy/utils/stadium";

const EXTRA_POINT_RESULT_DELAY = ticks({ seconds: 2 });
const EXTRA_POINT_SUCCESS_DELAY = ticks({ seconds: 2 });
const BALL_STOPPED_SPEED = 0.05;
const BALL_STOPPED_SPEED_SQUARED = BALL_STOPPED_SPEED * BALL_STOPPED_SPEED;

export function ExtraPointKick({
    offensiveTeam,
}: {
    offensiveTeam: FieldTeam;
}) {
    const defensiveTeam = opposite(offensiveTeam);
    const goalLine = getGoalLine(defensiveTeam);
    const goalLineX = goalLine.start.x;

    $lockBall();
    $setBallActive();

    $dispose(() => {
        $unlockBall();
    });

    function run(state: GameState) {
        if (isOutOfBounds(state.ball)) {
            $effect(($) => {
                $.send(t`Extra point went out of bounds.`);
            });

            $next({
                to: "KICKOFF",
                params: {
                    forTeam: offensiveTeam,
                },
                wait: EXTRA_POINT_RESULT_DELAY,
            });
        }

        const crossedGoalLine =
            calculateDirectionalGain(offensiveTeam, state.ball.x - goalLineX) >=
            0;

        if (crossedGoalLine) {
            if (isWithinGoalPosts(state.ball, defensiveTeam)) {
                $global((state) =>
                    state.incrementScore(offensiveTeam, SCORES.EXTRA_POINT),
                );

                $effect(($) => {
                    $.send(t`Extra point is good!`);
                });

                $next({
                    to: "KICKOFF",
                    params: {
                        forTeam: offensiveTeam,
                    },
                    wait: EXTRA_POINT_SUCCESS_DELAY,
                });
            }

            $effect(($) => {
                $.send(t`Extra point attempt is no good.`);
            });

            $next({
                to: "KICKOFF",
                params: {
                    forTeam: offensiveTeam,
                },
                wait: EXTRA_POINT_RESULT_DELAY,
            });
        }

        const speedSquared =
            state.ball.xspeed * state.ball.xspeed +
            state.ball.yspeed * state.ball.yspeed;
        const isStopped = speedSquared <= BALL_STOPPED_SPEED_SQUARED;

        if (isStopped) {
            $effect(($) => {
                $.send(t`Extra point attempt is no good.`);
            });

            $next({
                to: "KICKOFF",
                params: {
                    forTeam: offensiveTeam,
                },
                wait: EXTRA_POINT_RESULT_DELAY,
            });
        }
    }

    return { run };
}

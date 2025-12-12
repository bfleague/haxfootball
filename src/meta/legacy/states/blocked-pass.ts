import { GameState } from "@common/engine";
import { $dispose, $effect, $next } from "@common/runtime";
import {
    DownState,
    incrementDownState,
    processDownEventIncrement,
} from "@meta/legacy/utils/game";
import { AVATARS, opposite, ticks } from "@common/utils";
import { $lockBall, $unlockBall } from "@meta/legacy/hooks/physics";
import { getBallPath, intersectsGoalPosts } from "@meta/legacy/utils/stadium";
import {
    $setBallActive,
    $setBallInactive,
    $setFirstDownLine,
    $setLineOfScrimmage,
    $unsetFirstDownLine,
    $unsetLineOfScrimmage,
} from "@meta/legacy/hooks/game";

const TIME_TO_BLOCKED_PASS_STATE = ticks({ milliseconds: 200 });

export function BlockedPass({
    blockTime,
    blockerId,
    downState,
}: {
    blockTime: number;
    blockerId: number;
    downState: DownState;
}) {
    $lockBall();

    const { offensiveTeam, fieldPos, downAndDistance } = downState;

    $setLineOfScrimmage(fieldPos);
    $setFirstDownLine(offensiveTeam, fieldPos, downAndDistance.distance);
    $setBallInactive();

    // TODO: Check if player leaves

    function run(state: GameState) {
        const blocker = state.players.find((p) => p.id === blockerId);
        if (!blocker) return;

        if (state.tickNumber - blockTime >= TIME_TO_BLOCKED_PASS_STATE) {
            const ball = state.ball;
            const ballPath = getBallPath(
                ball.x,
                ball.y,
                ball.xspeed,
                ball.yspeed,
            );
            const offensiveGoal = opposite(downState.offensiveTeam);
            const intersection = intersectsGoalPosts(ballPath, offensiveGoal);

            if (intersection.intersects) {
                $effect(($) => {
                    $.send(`Interception by ${blocker.name}!`);
                });

                $next({
                    to: "INTERCEPTION",
                    params: {
                        playerId: blockerId,
                        ballPath: intersection.line,
                        offensiveTeam: blocker.team,
                    },
                });
            } else {
                const { event, downState: nextDownState } =
                    incrementDownState(downState);

                $effect(($) => {
                    $.setAvatar(blockerId, AVATARS.CONSTRUCTION);
                });

                $dispose(() => {
                    $effect(($) => {
                        $.setAvatar(blockerId, null);
                    });
                });

                processDownEventIncrement({
                    event,
                    onNextDown() {
                        $effect(($) => {
                            $.send(`Pass blocked by ${blocker.name}, no gain!`);
                        });
                    },
                    onTurnoverOnDowns() {
                        $effect(($) => {
                            $.send(
                                `Pass blocked by ${blocker.name}, turnover on downs!`,
                            );
                        });
                    },
                });

                $next({
                    to: "PRESNAP",
                    params: {
                        downState: nextDownState,
                    },
                    wait: ticks({ seconds: 1 }),
                });
            }
        }
    }

    function dispose() {
        $unlockBall();
        $unsetLineOfScrimmage();
        $setBallActive();
        $unsetFirstDownLine();
    }

    return { run, dispose };
}

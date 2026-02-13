import type {
    GameState,
    GameStateBall,
    GameStatePlayer,
} from "@runtime/engine";
import { $before, $dispose, $effect, $next } from "@runtime/runtime";
import { ticks } from "@common/general/time";
import { type FieldTeam } from "@runtime/models";
import { t } from "@lingui/core/macro";
import { opposite, type FieldPosition } from "@common/game/game";
import {
    $setBallActive,
    $setBallInactive,
    $setLineOfScrimmage,
    $unsetFirstDownLine,
    $unsetLineOfScrimmage,
} from "@meta/legacy/hooks/game";
import { $lockBall, $unlockBall } from "@meta/legacy/hooks/physics";
import {
    getProjectedInterceptionPoint,
    getTravelInterceptionPoint,
} from "@meta/legacy/utils/interception";
import { PointLike } from "@common/math/geometry";

const TIME_TO_CHECK_INTERCEPTION = ticks({ milliseconds: 200 });

export function ExtraPointInterceptionAttempt({
    kickTime,
    playerId,
    offensiveTeam,
    fieldPos,
    kickBallState,
}: {
    kickTime: number;
    playerId: number;
    offensiveTeam: FieldTeam;
    fieldPos: FieldPosition;
    kickBallState: GameStateBall;
}) {
    $lockBall();
    $setLineOfScrimmage(fieldPos);
    $unsetFirstDownLine();
    $setBallInactive();

    const goals = [offensiveTeam, opposite(offensiveTeam)] as const;

    $dispose(() => {
        $unlockBall();
        $unsetLineOfScrimmage();
        $unsetFirstDownLine();
        $setBallActive();
    });

    function $advanceToInterception(args: {
        blocker: GameStatePlayer;
        intersectionPoint: PointLike;
    }) {
        $effect(($) => {
            $.send(t`🛡️ INTERCEPTION by ${args.blocker.name}!`);
        });

        $next({
            to: "EXTRA_POINT_RUN",
            params: {
                playerId: args.blocker.id,
                ballTeam: args.blocker.team,
                originalOffensiveTeam: offensiveTeam,
                fieldPos,
                interceptionPath: {
                    start: {
                        x: kickBallState.x,
                        y: kickBallState.y,
                    },
                    end: {
                        x: args.intersectionPoint.x,
                        y: args.intersectionPoint.y,
                    },
                },
            },
        });
    }

    function run(state: GameState) {
        const blocker = state.players.find((player) => player.id === playerId);
        if (!blocker) return;

        const intersectionFromTravel = getTravelInterceptionPoint({
            previousBall: $before().ball,
            currentBall: state.ball,
            goals,
        });

        if (intersectionFromTravel) {
            $advanceToInterception({
                blocker,
                intersectionPoint: intersectionFromTravel,
            });
        }

        if (state.tickNumber - kickTime < TIME_TO_CHECK_INTERCEPTION) return;

        const projectedIntersection = getProjectedInterceptionPoint({
            ball: state.ball,
            goals,
        });

        if (projectedIntersection) {
            $advanceToInterception({
                blocker,
                intersectionPoint: projectedIntersection,
            });
        }

        $next({
            to: "EXTRA_POINT_BLOCKED_PASS",
            params: {
                blockerId: blocker.id,
                offensiveTeam,
                fieldPos,
            },
        });
    }

    return { run };
}

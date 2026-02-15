import { $dispose, $effect, $next } from "@runtime/hooks";
import { ticks } from "@common/general/time";
import { findBallCatcher } from "@common/game/game";
import type { GameState } from "@runtime/engine";
import { t } from "@lingui/core/macro";
import { cn } from "@meta/legacy/shared/message";
import { isBallOutOfBounds } from "@meta/legacy/shared/stadium";
import { $createSharedCommandHandler } from "@meta/legacy/shared/commands";
import {
    advanceDownState,
    DownState,
    withLastBallYAtCenter,
} from "@meta/legacy/shared/down";
import {
    $setBallActive,
    $setBallInactive,
    $setFirstDownLine,
    $setLineOfScrimmage,
    $unsetFirstDownLine,
    $unsetLineOfScrimmage,
} from "@meta/legacy/hooks/game";
import type { CommandSpec } from "@runtime/commands";
import { COLOR } from "@common/general/color";

export function SnapInFlight({ downState }: { downState: DownState }) {
    const { offensiveTeam, fieldPos, downAndDistance } = downState;

    $setLineOfScrimmage(fieldPos);
    $setFirstDownLine(offensiveTeam, fieldPos, downAndDistance.distance);

    $dispose(() => {
        $unsetLineOfScrimmage();
        $unsetFirstDownLine();
    });

    function command(player: PlayerObject, spec: CommandSpec) {
        return $createSharedCommandHandler({
            options: {
                undo: true,
                info: { downState },
            },
            player,
            spec,
        });
    }

    function run(state: GameState) {
        if (isBallOutOfBounds(state.ball)) {
            const { downState: baseDownState, event } =
                advanceDownState(downState);
            const nextDownState = withLastBallYAtCenter(baseDownState);

            $setBallInactive();

            $dispose(() => {
                $setBallActive();
            });

            $effect(($) => {
                switch (event.type) {
                    case "FIRST_DOWN":
                        $.send({
                            message: cn(
                                "🏁",
                                nextDownState,
                                t`ball out of bounds`,
                                t`FIRST DOWN!`,
                            ),
                            color: COLOR.WARNING,
                        });

                        break;
                    case "NEXT_DOWN":
                        $.send({
                            message: cn(
                                "🚪",
                                nextDownState,
                                t`ball out of bounds`,
                                t`no gain.`,
                            ),
                            color: COLOR.WARNING,
                        });

                        break;
                    case "TURNOVER_ON_DOWNS":
                        $.send({
                            message: cn(
                                "❌",
                                nextDownState,
                                t`ball out of bounds`,
                                t`TURNOVER ON DOWNS!`,
                            ),
                            color: COLOR.WARNING,
                        });

                        break;
                }
            });

            $next({
                to: "PRESNAP",
                params: {
                    downState: nextDownState,
                },
                wait: ticks({ seconds: 2 }),
            });
        }

        const offensiveCatcher = findBallCatcher(
            state.ball,
            state.players.filter((p) => p.team === offensiveTeam),
        );

        if (offensiveCatcher) {
            $effect(($) => {
                $.send({
                    message: t`🏈 Pass complete to ${offensiveCatcher.name}!`,
                    color: COLOR.MOMENTUM,
                });
            });

            $next({
                to: "LIVE_BALL",
                params: { playerId: offensiveCatcher.id, downState },
            });
        }

        const defensiveCatcher = findBallCatcher(
            state.ball,
            state.players.filter((p) => p.team !== offensiveTeam),
        );

        if (defensiveCatcher) {
            $next({
                to: "PASS_DEFLECTION",
                params: {
                    blockTime: state.tickNumber,
                    blockerId: defensiveCatcher.id,
                    isKickingBall: defensiveCatcher.isKickingBall,
                    downState,
                },
            });
        }
    }

    return { run, command };
}

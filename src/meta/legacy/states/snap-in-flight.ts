import { $dispose, $effect, $next } from "@runtime/hooks";
import { ticks } from "@common/general/time";
import type { GameState, GameStatePlayer } from "@runtime/engine";
import { t } from "@lingui/core/macro";
import { cn } from "@meta/legacy/shared/message";
import { isBallOutOfBounds } from "@meta/legacy/shared/stadium";
import { $createSharedCommandHandler } from "@meta/legacy/shared/commands";
import {
    findEligibleBallCatcher,
    findTouchdownAwareBallCatcher,
    findOutOfBoundsBallCatcher,
} from "@meta/legacy/shared/reception";
import {
    advanceDownState,
    DownState,
    withLastBallYAtCenter,
} from "@meta/legacy/shared/down";
import { isTouchdown } from "@meta/legacy/shared/scoring";
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

type Frame = {
    state: GameState;
    outOfBoundsCatcher: GameStatePlayer | null;
    offensiveCatcher: GameStatePlayer | null;
    defensiveCatcher: GameStatePlayer | null;
};

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

    function buildFrame(state: GameState): Frame {
        const offensivePlayers = state.players.filter(
            (player) => player.team === offensiveTeam,
        );
        const defensivePlayers = state.players.filter(
            (player) => player.team !== offensiveTeam,
        );
        const offensiveCatcher = findTouchdownAwareBallCatcher(
            state.ball,
            offensivePlayers,
            offensiveTeam,
        );
        const isTouchdownCatch =
            offensiveCatcher !== null &&
            isTouchdown({ player: offensiveCatcher, offensiveTeam });

        return {
            state,
            outOfBoundsCatcher: isTouchdownCatch
                ? null
                : findOutOfBoundsBallCatcher(
                      state.ball,
                      state.players.filter(
                          (player) => player.id !== offensiveCatcher?.id,
                      ),
                  ),
            offensiveCatcher,
            defensiveCatcher: findEligibleBallCatcher(
                state.ball,
                defensivePlayers,
            ),
        };
    }

    function $advanceToPresnapWithDownMessage(args: {
        nextDownState: DownState;
        event: ReturnType<typeof advanceDownState>["event"];
        middleMessage: string;
    }) {
        $effect(($) => {
            switch (args.event.type) {
                case "FIRST_DOWN":
                    $.send({
                        message: cn(
                            "🏁",
                            args.nextDownState,
                            args.middleMessage,
                            t`FIRST DOWN!`,
                        ),
                        color: COLOR.WARNING,
                    });

                    break;
                case "NEXT_DOWN":
                    $.send({
                        message: cn(
                            "🚪",
                            args.nextDownState,
                            args.middleMessage,
                            t`no gain.`,
                        ),
                        color: COLOR.WARNING,
                    });

                    break;
                case "TURNOVER_ON_DOWNS":
                    $.send({
                        message: cn(
                            "❌",
                            args.nextDownState,
                            args.middleMessage,
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
                downState: args.nextDownState,
            },
            wait: ticks({ seconds: 2 }),
        });
    }

    function $handleOutOfBoundsReception(frame: Frame) {
        if (isBallOutOfBounds(frame.state.ball)) return;
        if (!frame.outOfBoundsCatcher) return;

        const { downState: baseDownState, event } = advanceDownState(downState);
        const nextDownState = withLastBallYAtCenter(baseDownState);

        $setBallInactive();

        $dispose(() => {
            $setBallActive();
        });

        $advanceToPresnapWithDownMessage({
            nextDownState,
            event,
            middleMessage: t`out-of-bounds reception by ${frame.outOfBoundsCatcher.name}`,
        });
    }

    function $handleBallOutOfBounds(frame: Frame) {
        if (!isBallOutOfBounds(frame.state.ball)) return;

        const { downState: baseDownState, event } = advanceDownState(downState);
        const nextDownState = withLastBallYAtCenter(baseDownState);

        $setBallInactive();

        $dispose(() => {
            $setBallActive();
        });

        $advanceToPresnapWithDownMessage({
            nextDownState,
            event,
            middleMessage: t`ball out of bounds`,
        });
    }

    function $handleOffensiveReception(frame: Frame) {
        if (!frame.offensiveCatcher) return;
        const catcher = frame.offensiveCatcher;

        $effect(($) => {
            $.send({
                message: t`🏈 Pass complete to ${catcher.name}!`,
                color: COLOR.MOMENTUM,
            });
        });

        $next({
            to: "LIVE_BALL",
            params: { playerId: catcher.id, downState },
        });
    }

    function $handleDefensiveCatch(frame: Frame) {
        if (!frame.defensiveCatcher) return;

        $next({
            to: "PASS_DEFLECTION",
            params: {
                blockTime: frame.state.tickNumber,
                blockerId: frame.defensiveCatcher.id,
                isKickingBall: frame.defensiveCatcher.isKickingBall,
                downState,
            },
        });
    }

    function run(state: GameState) {
        const frame = buildFrame(state);

        $handleBallOutOfBounds(frame);
        $handleOutOfBoundsReception(frame);
        $handleOffensiveReception(frame);
        $handleDefensiveCatch(frame);
    }

    return { run, command };
}

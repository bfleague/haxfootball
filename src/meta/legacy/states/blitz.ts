import type { GameState, GameStatePlayer } from "@runtime/engine";
import { $dispose, $effect, $next } from "@runtime/runtime";
import { ticks } from "@common/time";
import { AVATARS, findBallCatchers, findCatchers } from "@common/game";
import {
    advanceDownState,
    DownState,
    processDownEvent,
    withLastBallY,
} from "@meta/legacy/utils/down";
import { cn, formatNames } from "@meta/legacy/utils/message";
import {
    applyOffensivePenalty,
    processOffensivePenalty,
} from "@meta/legacy/utils/penalty";
import {
    calculateDirectionalGain,
    getFieldPosition,
    getPositionFromFieldPosition,
    isInMainField,
    isOutOfBounds,
} from "@meta/legacy/utils/stadium";
import { t } from "@lingui/core/macro";
import {
    $setBallActive,
    $setBallInactive,
    $setFirstDownLine,
    $setLineOfScrimmage,
    $unsetFirstDownLine,
    $unsetLineOfScrimmage,
} from "@meta/legacy/hooks/game";

const OFFENSIVE_FOUL_PENALTY_YARDS = 5;

type Frame = {
    state: GameState;
    quarterback: GameStatePlayer;
    defenders: GameStatePlayer[];
    quarterbackCrossedLineOfScrimmage: boolean;
};

export function Blitz({
    downState,
    quarterbackId,
    ballIsDead = false,
}: {
    downState: DownState;
    quarterbackId: number;
    ballIsDead?: boolean;
}) {
    const { offensiveTeam, fieldPos, downAndDistance } = downState;
    const lineOfScrimmageX = getPositionFromFieldPosition(fieldPos);

    $setLineOfScrimmage(fieldPos);
    $setFirstDownLine(offensiveTeam, fieldPos, downAndDistance.distance);

    if (ballIsDead) {
        $setBallInactive();
    } else {
        $setBallActive();
    }

    $dispose(() => {
        $effect(($) => {
            $.setAvatar(quarterbackId, null);
        });

        $unsetLineOfScrimmage();
        $unsetFirstDownLine();
        $setBallActive();
    });

    $effect(($) => {
        $.setAvatar(quarterbackId, AVATARS.BALL);
    });

    function buildFrame(state: GameState): Frame | null {
        const quarterback = state.players.find((p) => p.id === quarterbackId);
        if (!quarterback) return null;

        const defenders = state.players.filter(
            (player) => player.team !== offensiveTeam,
        );

        const quarterbackCrossedLineOfScrimmage =
            calculateDirectionalGain(
                offensiveTeam,
                quarterback.x - lineOfScrimmageX,
            ) > 0;

        return {
            state,
            quarterback,
            defenders,
            quarterbackCrossedLineOfScrimmage,
        };
    }

    function $handleQuarterbackKick(frame: Frame) {
        if (ballIsDead || !frame.quarterback.isKickingBall) return;

        $next({
            to: "SNAP_IN_FLIGHT",
            params: { downState },
        });
    }

    function $handleOffensiveIllegalTouching(frame: Frame) {
        const offensiveTouchers = findBallCatchers(
            frame.state.ball,
            frame.state.players.filter(
                (player) =>
                    player.team === offensiveTeam &&
                    player.id !== frame.quarterback.id,
            ),
        );

        if (offensiveTouchers.length === 0) return;

        const offenderNames = formatNames(offensiveTouchers);

        const penaltyResult = applyOffensivePenalty(
            downState,
            -OFFENSIVE_FOUL_PENALTY_YARDS,
        );

        processOffensivePenalty({
            event: penaltyResult.event,
            onNextDown() {
                $effect(($) => {
                    $.send(
                        cn(
                            penaltyResult.downState,
                            t`Illegal touching by ${offenderNames}, ${OFFENSIVE_FOUL_PENALTY_YARDS} yard penalty. Loss of down.`,
                        ),
                    );
                });
            },
            onTurnoverOnDowns() {
                $effect(($) => {
                    $.send(
                        cn(
                            penaltyResult.downState,
                            t`Illegal touching by ${offenderNames}, ${OFFENSIVE_FOUL_PENALTY_YARDS} yard penalty. Turnover on downs.`,
                        ),
                    );
                });
            },
        });

        $next({
            to: "PRESNAP",
            params: {
                downState: penaltyResult.downState,
            },
        });
    }

    function $handleDefensiveTouching(frame: Frame) {
        if (ballIsDead) return;

        const defensiveTouchers = findBallCatchers(
            frame.state.ball,
            frame.defenders,
        );

        if (defensiveTouchers.length === 0) return;

        $setBallInactive();
        $next({
            to: "BLITZ",
            params: {
                downState,
                quarterbackId,
                ballIsDead: true,
            },
        });
    }

    function $handleQuarterbackCrossedLine(frame: Frame) {
        if (!frame.quarterbackCrossedLineOfScrimmage) return;

        $effect(($) => {
            $.send(
                t`Quarterback has crossed the line of scrimmage, starting quarterback run.`,
            );
        });

        $next({
            to: "QUARTERBACK_RUN",
            params: {
                playerId: quarterbackId,
                downState,
            },
        });
    }

    function $handleQuarterbackOutOfBounds(frame: Frame) {
        if (!isOutOfBounds(frame.quarterback)) return;

        const fieldPos = getFieldPosition(frame.quarterback.x);

        if (isInMainField(frame.quarterback)) {
            const { downState: baseDownState, event } = advanceDownState(
                downState,
                fieldPos,
            );
            const nextDownState = withLastBallY(
                baseDownState,
                frame.quarterback.y,
            );

            processDownEvent({
                event,
                onFirstDown() {
                    $effect(($) => {
                        $.send(cn(nextDownState, t`First down!`));
                    });
                },
                onNextDown: {
                    onYardsGained(yardsGained: number) {
                        $effect(($) => {
                            $.send(
                                cn(
                                    nextDownState,
                                    t`Next down after a gain of ${yardsGained} yards!`,
                                ),
                            );
                        });
                    },
                    onNoGain() {
                        $effect(($) => {
                            $.send(
                                cn(nextDownState, t`Next down with no gain!`),
                            );
                        });
                    },
                    onLoss(yardsLost: number) {
                        $effect(($) => {
                            $.send(
                                cn(
                                    nextDownState,
                                    t`Next down after a loss of ${yardsLost} yards!`,
                                ),
                            );
                        });
                    },
                },
                onTurnoverOnDowns() {
                    $effect(($) => {
                        $.send(cn(nextDownState, t`Turnover on downs!`));
                    });
                },
            });

            $effect(($) => {
                $.setAvatar(quarterbackId, AVATARS.CANCEL);
            });

            $dispose(() => {
                $effect(($) => {
                    $.setAvatar(quarterbackId, null);
                });
            });

            $next({
                to: "PRESNAP",
                params: {
                    downState: nextDownState,
                },
                wait: ticks({ seconds: 1 }),
            });
        } else {
            $effect(($) => {
                $.send(
                    t`${frame.quarterback.name} went out of bounds in the end zone for a safety!`,
                );

                $.setAvatar(quarterbackId, AVATARS.CLOWN);
            });

            $dispose(() => {
                $effect(($) => {
                    $.setAvatar(quarterbackId, null);
                });
            });

            $next({
                to: "SAFETY",
                params: {
                    kickingTeam: offensiveTeam,
                },
                wait: ticks({ seconds: 2 }),
            });
        }
    }

    function $handleQuarterbackSacked(frame: Frame) {
        const catchers = findCatchers(frame.quarterback, frame.defenders);
        if (catchers.length === 0) return;

        const catcherNames = formatNames(catchers);
        const fieldPos = getFieldPosition(frame.quarterback.x);

        const { downState: baseDownState, event } = advanceDownState(
            downState,
            fieldPos,
        );
        const nextDownState = withLastBallY(baseDownState, frame.quarterback.y);

        processDownEvent({
            event,
            onFirstDown() {
                $effect(($) => {
                    $.send(
                        cn(
                            nextDownState,
                            t`${frame.quarterback.name} sacked by ${catcherNames} for a first down!`,
                        ),
                    );
                });
            },
            onNextDown: {
                onYardsGained(yardsGained: number) {
                    $effect(($) => {
                        $.send(
                            cn(
                                nextDownState,
                                t`${frame.quarterback.name} sacked by ${catcherNames} for a gain of ${yardsGained} yards, next down!`,
                            ),
                        );
                    });
                },
                onNoGain() {
                    $effect(($) => {
                        $.send(
                            cn(
                                nextDownState,
                                t`${frame.quarterback.name} sacked by ${catcherNames} with no gain, next down!`,
                            ),
                        );
                    });
                },
                onLoss(yardsLost: number) {
                    $effect(($) => {
                        $.send(
                            cn(
                                nextDownState,
                                t`${frame.quarterback.name} sacked by ${catcherNames} for a loss of ${yardsLost} yards, next down!`,
                            ),
                        );
                    });
                },
            },
            onTurnoverOnDowns() {
                $effect(($) => {
                    $.send(
                        cn(
                            nextDownState,
                            t`${frame.quarterback.name} sacked by ${catcherNames}, turnover on downs!`,
                        ),
                    );
                });
            },
        });

        $effect(($) => {
            $.setAvatar(quarterbackId, AVATARS.CANCEL);

            catchers.forEach((player) => {
                $.setAvatar(player.id, AVATARS.MUSCLE);
            });
        });

        $dispose(() => {
            $effect(($) => {
                $.setAvatar(quarterbackId, null);

                catchers.forEach((player) => {
                    $.setAvatar(player.id, null);
                });
            });
        });

        $next({
            to: "PRESNAP",
            params: {
                downState: nextDownState,
            },
            wait: ticks({ seconds: 1 }),
        });
    }

    function run(state: GameState) {
        const frame = buildFrame(state);
        if (!frame) return;

        $handleQuarterbackKick(frame);
        $handleOffensiveIllegalTouching(frame);
        $handleDefensiveTouching(frame);
        $handleQuarterbackCrossedLine(frame);
        $handleQuarterbackOutOfBounds(frame);
        $handleQuarterbackSacked(frame);
    }

    return { run };
}

import type { GameState, GameStatePlayer } from "@runtime/engine";
import { $dispose, $effect, $next } from "@runtime/runtime";
import { ticks } from "@common/general/time";
import { AVATARS, findBallCatchers, findCatchers } from "@common/game/game";
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
                            t`❌ Illegal touch by ${offenderNames} • ${OFFENSIVE_FOUL_PENALTY_YARDS}-yard penalty • loss of down.`,
                        ),
                    );
                });
            },
            onTurnoverOnDowns() {
                $effect(($) => {
                    $.send(
                        cn(
                            penaltyResult.downState,
                            t`❌ Illegal touch by ${offenderNames} • ${OFFENSIVE_FOUL_PENALTY_YARDS}-yard penalty • turnover on downs.`,
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
                t`🏃 QB crossed the LOS • quarterback run is live.`,
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
                        $.send(cn(nextDownState, t`• FIRST DOWN!`));
                    });
                },
                onNextDown: {
                    onYardsGained(yardsGained: number) {
                        $effect(($) => {
                            $.send(
                                cn(
                                    nextDownState,
                                    t`• ${yardsGained}-yard gain • next down.`,
                                ),
                            );
                        });
                    },
                    onNoGain() {
                        $effect(($) => {
                            $.send(
                                cn(nextDownState, t`• No gain • next down.`),
                            );
                        });
                    },
                    onLoss(yardsLost: number) {
                        $effect(($) => {
                            $.send(
                                cn(
                                    nextDownState,
                                    t`• ${yardsLost}-yard loss • next down.`,
                                ),
                            );
                        });
                    },
                },
                onTurnoverOnDowns() {
                    $effect(($) => {
                        $.send(cn(nextDownState, t`• TURNOVER ON DOWNS!`));
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
                    t`🚪 QB ${frame.quarterback.name} went out in the end zone • SAFETY!`,
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
                            t`💥 QB ${frame.quarterback.name} sacked by ${catcherNames} • FIRST DOWN!`,
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
                                t`💥 QB ${frame.quarterback.name} sacked by ${catcherNames} • ${yardsGained} yard gain • next down.`,
                            ),
                        );
                    });
                },
                onNoGain() {
                    $effect(($) => {
                        $.send(
                            cn(
                                nextDownState,
                                t`💥 QB ${frame.quarterback.name} sacked by ${catcherNames} • no gain • next down.`,
                            ),
                        );
                    });
                },
                onLoss(yardsLost: number) {
                    $effect(($) => {
                        $.send(
                            cn(
                                nextDownState,
                                t`💥 QB ${frame.quarterback.name} sacked by ${catcherNames} • ${yardsLost} yard loss • next down.`,
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
                            t`💥 QB ${frame.quarterback.name} sacked by ${catcherNames} • TURNOVER ON DOWNS!`,
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

import type { GameState } from "@common/engine";
import { $dispose, $effect, $next } from "@common/runtime";
import { AVATARS, findBallCatchers, findCatchers, ticks } from "@common/utils";
import {
    advanceDownState,
    DownState,
    processDownEvent,
} from "@meta/legacy/utils/down";
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

    $effect(($) => {
        $.setAvatar(quarterbackId, AVATARS.BALL);
    });

    function run(state: GameState) {
        const quarterback = state.players.find((p) => p.id === quarterbackId);
        if (!quarterback) return;

        const defenders = state.players.filter(
            (player) => player.team !== offensiveTeam,
        );

        if (!ballIsDead && quarterback.isKickingBall) {
            $next({
                to: "SNAP_IN_FLIGHT",
                params: { downState },
            });
        }

        const offensiveTouchers = findBallCatchers(
            state.ball,
            state.players.filter(
                (player) =>
                    player.team === offensiveTeam &&
                    player.id !== quarterbackId,
            ),
        );

        if (offensiveTouchers.length > 0) {
            const offenderNames = offensiveTouchers
                .map((player) => player.name)
                .join(", ");

            const baseMessage =
                offenderNames.length > 0
                    ? t`Illegal touching by ${offenderNames}, 5 yard penalty.`
                    : t`Illegal touching, 5 yard penalty.`;

            const penaltyResult = applyOffensivePenalty(
                downState,
                -OFFENSIVE_FOUL_PENALTY_YARDS,
            );

            processOffensivePenalty({
                event: penaltyResult.event,
                onNextDown() {
                    $effect(($) => {
                        $.send(`${baseMessage} ${t`Loss of down.`}`);
                    });
                },
                onTurnoverOnDowns() {
                    $effect(($) => {
                        $.send(`${baseMessage} ${t`Turnover on downs.`}`);
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

        if (!ballIsDead) {
            const defensiveTouchers = findBallCatchers(state.ball, defenders);

            if (defensiveTouchers.length > 0) {
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
        }

        const quarterbackCrossedLineOfScrimmage =
            calculateDirectionalGain(
                offensiveTeam,
                quarterback.x - lineOfScrimmageX,
            ) > 0;

        if (quarterbackCrossedLineOfScrimmage) {
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

        if (isOutOfBounds(quarterback)) {
            const fieldPos = getFieldPosition(quarterback.x);

            if (isInMainField(quarterback)) {
                const { downState: nextDownState, event } = advanceDownState(
                    downState,
                    fieldPos,
                );

                processDownEvent({
                    event,
                    onFirstDown() {
                        $effect(($) => {
                            $.send(
                                t`First down at yard line ${fieldPos.yards}!`,
                            );
                        });
                    },
                    onNextDown: {
                        onYardsGained(yardsGained: number) {
                            $effect(($) => {
                                $.send(
                                    t`Next down at yard line ${fieldPos.yards} after a gain of ${yardsGained} yards!`,
                                );
                            });
                        },
                        onNoGain() {
                            $effect(($) => {
                                $.send(
                                    t`Next down at yard line ${fieldPos.yards} with no gain!`,
                                );
                            });
                        },
                        onLoss(yardsLost: number) {
                            $effect(($) => {
                                $.send(
                                    t`Next down at yard line ${fieldPos.yards} after a loss of ${yardsLost} yards!`,
                                );
                            });
                        },
                    },
                    onTurnoverOnDowns() {
                        $effect(($) => {
                            $.send(
                                t`Turnover on downs at yard line ${fieldPos.yards}!`,
                            );
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
                        t`${quarterback.name} went out of bounds in the end zone for a safety!`,
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

        const catchers = findCatchers(quarterback, defenders);

        if (catchers.length > 0) {
            const catcherNames = catchers
                .map((player) => player.name)
                .join(", ");
            const fieldPos = getFieldPosition(quarterback.x);

            const { downState: nextDownState, event } = advanceDownState(
                downState,
                fieldPos,
            );

            processDownEvent({
                event,
                onFirstDown() {
                    $effect(($) => {
                        $.send(
                            t`${quarterback.name} sacked by ${catcherNames} for a first down at yard line ${fieldPos.yards}!`,
                        );
                    });
                },
                onNextDown: {
                    onYardsGained(yardsGained: number) {
                        $effect(($) => {
                            $.send(
                                t`${quarterback.name} sacked by ${catcherNames} for a gain of ${yardsGained} yards, next down at yard line ${fieldPos.yards}!`,
                            );
                        });
                    },
                    onNoGain() {
                        $effect(($) => {
                            $.send(
                                t`${quarterback.name} sacked by ${catcherNames} with no gain, next down at yard line ${fieldPos.yards}!`,
                            );
                        });
                    },
                    onLoss(yardsLost: number) {
                        $effect(($) => {
                            $.send(
                                t`${quarterback.name} sacked by ${catcherNames} for a loss of ${yardsLost} yards, next down at yard line ${fieldPos.yards}!`,
                            );
                        });
                    },
                },
                onTurnoverOnDowns() {
                    $effect(($) => {
                        $.send(
                            t`${quarterback.name} sacked by ${catcherNames}, turnover on downs at yard line ${fieldPos.yards}!`,
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
    }

    function dispose() {
        $effect(($) => {
            $.setAvatar(quarterbackId, null);
        });

        $unsetLineOfScrimmage();
        $unsetFirstDownLine();
        $setBallActive();
    }

    return { run, dispose };
}

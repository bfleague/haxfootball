import type { GameState } from "@common/engine";
import {
    advanceDownState,
    DownState,
    processDownEvent,
    isTouchdown,
    SCORES,
} from "@meta/legacy/utils/game";
import { $dispose, $effect, $next } from "@common/runtime";
import { AVATARS, findCatchers, opposite, ticks } from "@common/utils";
import {
    getFieldPosition,
    isInMainField,
    isOutOfBounds,
} from "@meta/legacy/utils/stadium";
import { t } from "@lingui/core/macro";
import {
    $setFirstDownLine,
    $setLineOfScrimmage,
    $unsetFirstDownLine,
    $unsetLineOfScrimmage,
} from "@meta/legacy/hooks/game";
import { $setBallActive, $setBallInactive } from "@meta/legacy/hooks/game";
import { $global } from "@meta/legacy/hooks/global";

export function LiveBall({
    playerId,
    downState,
}: {
    playerId: number;
    downState: DownState;
}) {
    const { offensiveTeam, fieldPos, downAndDistance } = downState;

    $setLineOfScrimmage(fieldPos);
    $setFirstDownLine(offensiveTeam, fieldPos, downAndDistance.distance);
    $setBallInactive();

    // TODO: Fumble

    $effect(($) => {
        $.setAvatar(playerId, AVATARS.BALL);
    });

    function run(state: GameState) {
        const player = state.players.find((p) => p.id === playerId);
        if (!player) return;

        if (
            isTouchdown({
                player,
                offensiveTeam,
            })
        ) {
            $global((state) =>
                state.incrementScore(offensiveTeam, SCORES.TOUCHDOWN),
            );

            $effect(($) => {
                $.send(t`Touchdown ${player.name}!`);
                $.stat("LIVE_BALL_TOUCHDOWN");
                $.setAvatar(playerId, AVATARS.FIRE);
            });

            $dispose(() => {
                $effect(($) => {
                    $.setAvatar(playerId, null);
                });
            });

            $next({
                to: "KICKOFF",
                params: {
                    forTeam: offensiveTeam,
                },
                wait: ticks({ seconds: 3 }),
            });
        }

        if (isOutOfBounds(player)) {
            const fieldPos = getFieldPosition(player.x);

            if (isInMainField(player)) {
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
                            $.stat(
                                "LIVE_BALL_OUT_OF_BOUNDS_FIRST_DOWN_YARD_LINE",
                            );
                        });
                    },
                    onNextDown: {
                        onYardsGained(yardsGained: number) {
                            $effect(($) => {
                                $.send(
                                    t`Next down at yard line ${fieldPos.yards} after a gain of ${yardsGained} yards!`,
                                );
                                $.stat(
                                    "LIVE_BALL_OUT_OF_BOUNDS_NEXT_DOWN_YARD_LINE",
                                );
                            });
                        },
                        onNoGain() {
                            $effect(($) => {
                                $.send(
                                    t`Next down at yard line ${fieldPos.yards} with no gain!`,
                                );
                                $.stat(
                                    "LIVE_BALL_OUT_OF_BOUNDS_NEXT_DOWN_NO_GAIN_YARD_LINE",
                                );
                            });
                        },
                        onLoss(yardsLost: number) {
                            $effect(($) => {
                                $.send(
                                    t`Next down at yard line ${fieldPos.yards} after a loss of ${yardsLost} yards!`,
                                );
                                $.stat(
                                    "LIVE_BALL_OUT_OF_BOUNDS_NEXT_DOWN_LOSS_YARD_LINE",
                                );
                            });
                        },
                    },
                    onTurnoverOnDowns() {
                        $effect(($) => {
                            $.send(
                                t`Turnover on downs at yard line ${fieldPos.yards}!`,
                            );
                            $.stat(
                                "LIVE_BALL_OUT_OF_BOUNDS_TURNOVER_ON_DOWNS_YARD_LINE",
                            );
                        });
                    },
                });

                $effect(($) => {
                    $.setAvatar(playerId, AVATARS.CANCEL);
                });

                $dispose(() => {
                    $effect(($) => {
                        $.setAvatar(playerId, null);
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
                        t`${player.name} went out of bounds in the end zone for a safety!`,
                    );

                    $.stat("LIVE_BALL_OUT_OF_BOUNDS_SAFETY");
                    $.setAvatar(playerId, AVATARS.CLOWN);
                });

                $dispose(() => {
                    $effect(($) => {
                        $.setAvatar(playerId, null);
                    });
                });

                $next({
                    to: "SAFETY",
                    params: {
                        kickingTeam: opposite(offensiveTeam),
                    },
                    wait: ticks({ seconds: 2 }),
                });
            }
        }

        const catchers = findCatchers(
            player,
            state.players.filter((p) => p.team === opposite(offensiveTeam)),
        );

        if (catchers.length > 0) {
            const catcherNames = catchers.map((p) => p.name).join(", ");
            const fieldPos = getFieldPosition(player.x);

            const { downState: nextDownState, event } = advanceDownState(
                downState,
                fieldPos,
            );

            processDownEvent({
                event,
                onFirstDown() {
                    $effect(($) => {
                        $.send(
                            t`${player.name} tackled by ${catcherNames} for a first down at yard line ${fieldPos.yards}!`,
                        );
                        $.stat("LIVE_BALL_TACKLE_FIRST_DOWN_YARD_LINE");
                    });
                },
                onNextDown: {
                    onYardsGained(yardsGained: number) {
                        $effect(($) => {
                            $.send(
                                t`${player.name} tackled by ${catcherNames} for a gain of ${yardsGained} yards, next down at yard line ${fieldPos.yards}!`,
                            );
                            $.stat("LIVE_BALL_TACKLE_NEXT_DOWN_YARD_LINE");
                        });
                    },
                    onNoGain() {
                        $effect(($) => {
                            $.send(
                                t`${player.name} tackled by ${catcherNames} with no gain, next down at yard line ${fieldPos.yards}!`,
                            );
                            $.stat(
                                "LIVE_BALL_TACKLE_NEXT_DOWN_NO_GAIN_YARD_LINE",
                            );
                        });
                    },
                    onLoss(yardsLost: number) {
                        $effect(($) => {
                            $.send(
                                t`${player.name} tackled by ${catcherNames} for a loss of ${yardsLost} yards, next down at yard line ${fieldPos.yards}!`,
                            );
                            $.stat("LIVE_BALL_TACKLE_NEXT_DOWN_LOSS_YARD_LINE");
                        });
                    },
                },
                onTurnoverOnDowns() {
                    $effect(($) => {
                        $.send(
                            t`${player.name} tackled by ${catcherNames}, turnover on downs at yard line ${fieldPos.yards}!`,
                        );
                        $.stat("LIVE_BALL_TACKLE_TURNOVER_ON_DOWNS_YARD_LINE");
                    });
                },
            });

            $effect(($) => {
                $.setAvatar(playerId, AVATARS.CANCEL);

                catchers.forEach((p) => {
                    $.setAvatar(p.id, AVATARS.MUSCLE);
                });
            });

            $dispose(() => {
                $effect(($) => {
                    $.setAvatar(playerId, null);

                    catchers.forEach((p) => {
                        $.setAvatar(p.id, null);
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
            $.setAvatar(playerId, null);
        });

        $unsetLineOfScrimmage();
        $unsetFirstDownLine();
        $setBallActive();
    }

    return { run, dispose };
}

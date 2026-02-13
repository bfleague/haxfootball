import type { GameState, GameStatePlayer } from "@runtime/engine";
import {
    advanceDownState,
    DownState,
    getInitialDownState,
    processDownEvent,
    withLastBallY,
} from "@meta/legacy/utils/down";
import { cn, formatNames } from "@meta/legacy/utils/message";
import { isTouchdown, SCORES } from "@meta/legacy/utils/scoring";
import { $before, $dispose, $effect, $next } from "@runtime/runtime";
import { ticks } from "@common/general/time";
import { AVATARS, findCatchers, opposite } from "@common/game/game";
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

const FUMBLE_CATCHER_DISTANCE = 1.0;

type Frame = {
    state: GameState;
    player: GameStatePlayer;
    defenders: GameStatePlayer[];
};

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

    function $detectFumble() {
        const beforeState = $before();
        const receiver = beforeState.players.find((p) => p.id === playerId);
        if (!receiver) return null;

        const defenders = beforeState.players.filter(
            (p) => p.team === opposite(offensiveTeam),
        );
        const immediateCatchers = findCatchers(
            receiver,
            defenders,
            FUMBLE_CATCHER_DISTANCE,
        );

        if (immediateCatchers.length < 2) return null;

        return {
            fieldPos: getFieldPosition(receiver.x),
            catcherNames: formatNames(immediateCatchers),
            catcherIds: immediateCatchers.map((p) => p.id),
        };
    }

    const fumbleInfo = $detectFumble();

    $effect(($) => {
        $.setAvatar(playerId, AVATARS.BALL);
    });

    $dispose(() => {
        $effect(($) => {
            $.setAvatar(playerId, null);
        });

        $unsetLineOfScrimmage();
        $unsetFirstDownLine();
        $setBallActive();
    });

    function $handleFumble(state: GameState) {
        if (!fumbleInfo) return;

        const player = state.players.find((p) => p.id === playerId);
        if (!player) return;

        const { fieldPos, catcherNames, catcherIds } = fumbleInfo;
        const nextDownState = getInitialDownState(
            opposite(offensiveTeam),
            fieldPos,
            player.y,
        );

        $effect(($) => {
            $.send(
                t`🏈💥 ${player.name} loses it on contact by ${catcherNames} • turnover at the ${fieldPos.yards}-yard line!`,
            );
            $.stat("LIVE_BALL_FUMBLE");
            $.setAvatar(playerId, AVATARS.DIZZY);
            catcherIds.forEach((catcherId) => {
                $.setAvatar(catcherId, AVATARS.MUSCLE);
            });
        });

        $dispose(() => {
            $effect(($) => {
                $.setAvatar(playerId, null);
                catcherIds.forEach((catcherId) => {
                    $.setAvatar(catcherId, null);
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

    function buildFrame(state: GameState): Frame | null {
        const player = state.players.find((p) => p.id === playerId);
        if (!player) return null;

        const defenders = state.players.filter(
            (p) => p.team === opposite(offensiveTeam),
        );

        return { state, player, defenders };
    }

    function $handleTouchdown(frame: Frame) {
        if (
            !isTouchdown({
                player: frame.player,
                offensiveTeam,
            })
        ) {
            return;
        }

        $global((state) =>
            state.incrementScore(offensiveTeam, SCORES.TOUCHDOWN),
        );

        $effect(($) => {
            $.send(t`🔥 TOUCHDOWN by ${frame.player.name}!`);
            $.stat("LIVE_BALL_TOUCHDOWN");
            $.setAvatar(playerId, AVATARS.FIRE);
        });

        $dispose(() => {
            $effect(($) => {
                $.setAvatar(playerId, null);
            });
        });

        $next({
            to: "EXTRA_POINT",
            params: {
                offensiveTeam,
            },
            wait: ticks({ seconds: 3 }),
        });
    }

    function $handleOutOfBounds(frame: Frame) {
        if (!isOutOfBounds(frame.player)) return;

        const fieldPos = getFieldPosition(frame.player.x);

        if (isInMainField(frame.player)) {
            const { downState: baseDownState, event } = advanceDownState(
                downState,
                fieldPos,
            );
            const nextDownState = withLastBallY(baseDownState, frame.player.y);

            processDownEvent({
                event,
                onFirstDown() {
                    $effect(($) => {
                        $.send(cn(nextDownState, t`• FIRST DOWN!`));
                        $.stat("LIVE_BALL_OUT_OF_BOUNDS_FIRST_DOWN_YARD_LINE");
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
                            $.stat(
                                "LIVE_BALL_OUT_OF_BOUNDS_NEXT_DOWN_YARD_LINE",
                            );
                        });
                    },
                    onNoGain() {
                        $effect(($) => {
                            $.send(
                                cn(nextDownState, t`• No gain • next down.`),
                            );
                            $.stat(
                                "LIVE_BALL_OUT_OF_BOUNDS_NEXT_DOWN_NO_GAIN_YARD_LINE",
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
                            $.stat(
                                "LIVE_BALL_OUT_OF_BOUNDS_NEXT_DOWN_LOSS_YARD_LINE",
                            );
                        });
                    },
                },
                onTurnoverOnDowns() {
                    $effect(($) => {
                        $.send(cn(nextDownState, t`• TURNOVER ON DOWNS!`));
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
                    t`🚪 ${frame.player.name} went out in the end zone • SAFETY!`,
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
                    kickingTeam: offensiveTeam,
                },
                wait: ticks({ seconds: 2 }),
            });
        }
    }

    function $handleTackle(frame: Frame) {
        const catchers = findCatchers(frame.player, frame.defenders);
        if (catchers.length === 0) return;

        const catcherNames = formatNames(catchers);
        const fieldPos = getFieldPosition(frame.player.x);

        const { downState: baseDownState, event } = advanceDownState(
            downState,
            fieldPos,
        );
        const nextDownState = withLastBallY(baseDownState, frame.player.y);

        processDownEvent({
            event,
            onFirstDown() {
                $effect(($) => {
                    $.send(
                        cn(
                            nextDownState,
                            t`💥 ${frame.player.name} brought down by ${catcherNames} • FIRST DOWN!`,
                        ),
                    );
                    $.stat("LIVE_BALL_TACKLE_FIRST_DOWN_YARD_LINE");
                });
            },
            onNextDown: {
                onYardsGained(yardsGained: number) {
                    $effect(($) => {
                        $.send(
                            cn(
                                nextDownState,
                                t`💥 ${frame.player.name} brought down by ${catcherNames} • ${yardsGained} yard gain • next down.`,
                            ),
                        );
                        $.stat("LIVE_BALL_TACKLE_NEXT_DOWN_YARD_LINE");
                    });
                },
                onNoGain() {
                    $effect(($) => {
                        $.send(
                            cn(
                                nextDownState,
                                t`💥 ${frame.player.name} brought down by ${catcherNames} • no gain • next down.`,
                            ),
                        );
                        $.stat("LIVE_BALL_TACKLE_NEXT_DOWN_NO_GAIN_YARD_LINE");
                    });
                },
                onLoss(yardsLost: number) {
                    $effect(($) => {
                        $.send(
                            cn(
                                nextDownState,
                                t`💥 ${frame.player.name} brought down by ${catcherNames} • ${yardsLost} yard loss • next down.`,
                            ),
                        );
                        $.stat("LIVE_BALL_TACKLE_NEXT_DOWN_LOSS_YARD_LINE");
                    });
                },
            },
            onTurnoverOnDowns() {
                $effect(($) => {
                    $.send(
                        cn(
                            nextDownState,
                            t`💥 ${frame.player.name} brought down by ${catcherNames} • TURNOVER ON DOWNS!`,
                        ),
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

    function run(state: GameState) {
        if (fumbleInfo) {
            $handleFumble(state);
        }

        const frame = buildFrame(state);
        if (!frame) return;

        $handleTouchdown(frame);
        $handleOutOfBounds(frame);
        $handleTackle(frame);
    }

    return { run };
}

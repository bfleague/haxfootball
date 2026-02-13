import { $dispose, $effect, $next } from "@runtime/hooks";
import type { FieldTeam } from "@runtime/models";
import { ticks } from "@common/general/time";
import { AVATARS, findCatchers, opposite } from "@common/game/game";
import type { GameState, GameStatePlayer } from "@runtime/engine";
import { t } from "@lingui/core/macro";
import {
    getFieldPosition,
    isCompletelyInsideMainField,
    isInMainField,
    isOutOfBounds,
    isPartiallyOutsideMainField,
    TOUCHBACK_YARD_LINE,
} from "@meta/legacy/utils/stadium";
import { getInitialDownState } from "@meta/legacy/utils/down";
import { isTouchdown, SCORES } from "@meta/legacy/utils/scoring";
import { formatNames } from "@meta/legacy/utils/message";
import { $setBallActive, $setBallInactive } from "@meta/legacy/hooks/game";
import { $global } from "@meta/legacy/hooks/global";

type EndzoneState = "TOUCHBACK" | "SAFETY";
type Frame = {
    player: GameStatePlayer;
    defenders: GameStatePlayer[];
};

export function SafetyKickReturn({
    playerId,
    receivingTeam,
    endzoneState = "TOUCHBACK",
}: {
    playerId: number;
    receivingTeam: FieldTeam;
    endzoneState?: EndzoneState;
}) {
    $effect(($) => {
        $.setAvatar(playerId, AVATARS.BALL);
    });

    $dispose(() => {
        $effect(($) => {
            $.setAvatar(playerId, null);
        });

        $setBallActive();
    });

    $setBallInactive();

    function leave(player: GameStatePlayer) {
        if (player.id === playerId) {
            if (isInMainField(player)) {
                const fieldPos = getFieldPosition(player.x);

                $effect(($) => {
                    $.send(
                        t`🚪 ${player.name} left during the safety-kick return!`,
                    );

                    $.stat("SAFETY_KICK_RETURN_LEFT_ROOM");
                });

                $next({
                    to: "PRESNAP",
                    params: {
                        downState: getInitialDownState(
                            receivingTeam,
                            fieldPos,
                            player.y,
                        ),
                    },
                    wait: ticks({ seconds: 1 }),
                });
            } else {
                switch (endzoneState) {
                    case "TOUCHBACK":
                        $effect(($) => {
                            $.send(
                                t`🚪 ${player.name} left from the end zone • touchback.`,
                            );

                            $.stat("SAFETY_KICK_RETURN_TOUCHBACK_LEFT_ROOM");
                        });

                        $next({
                            to: "PRESNAP",
                            params: {
                                downState: getInitialDownState(receivingTeam, {
                                    yards: TOUCHBACK_YARD_LINE,
                                    side: receivingTeam,
                                }),
                            },
                            wait: ticks({ seconds: 1 }),
                        });
                    case "SAFETY":
                        $effect(($) => {
                            $.send(
                                t`🚪 ${player.name} left from the end zone • SAFETY!`,
                            );

                            $.stat("SAFETY_KICK_RETURN_SAFETY_LEFT_ROOM");
                        });

                        $global((state) =>
                            state.incrementScore(
                                opposite(receivingTeam),
                                SCORES.SAFETY,
                            ),
                        );

                        $next({
                            to: "SAFETY",
                            params: {
                                kickingTeam: opposite(receivingTeam),
                            },
                            wait: ticks({ seconds: 2 }),
                        });
                }
            }
        }
    }

    function buildFrame(state: GameState): Frame | null {
        const player = state.players.find((p) => p.id === playerId);
        if (!player) return null;

        const defenders = state.players.filter(
            (p) => p.team === opposite(receivingTeam),
        );

        return { player, defenders };
    }

    function $advanceEndzoneState(frame: Frame) {
        if (
            !isCompletelyInsideMainField(frame.player) ||
            endzoneState !== "TOUCHBACK"
        ) {
            return;
        }

        $next({
            to: "SAFETY_KICK_RETURN",
            params: {
                playerId,
                receivingTeam,
                endzoneState: "SAFETY",
            },
        });
    }

    function $handleTouchdown(frame: Frame) {
        if (
            !isTouchdown({
                player: frame.player,
                offensiveTeam: receivingTeam,
            })
        ) {
            return;
        }

        $global((state) =>
            state.incrementScore(receivingTeam, SCORES.TOUCHDOWN),
        );

        $effect(($) => {
            $.send(t`🔥 Safety-kick return touchdown by ${frame.player.name}!`);
            $.stat("SAFETY_KICK_RETURN_TOUCHDOWN");
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
                offensiveTeam: receivingTeam,
            },
            wait: ticks({ seconds: 3 }),
        });
    }

    function $handleOutOfBounds(frame: Frame) {
        if (!isOutOfBounds(frame.player)) return;

        const fieldPos = getFieldPosition(frame.player.x);

        if (isCompletelyInsideMainField(frame.player)) {
            $effect(($) => {
                $.send(
                    t`🚪 ${frame.player.name} stepped out on the safety-kick return.`,
                );

                $.stat("SAFETY_KICK_RETURN_OUT_OF_BOUNDS");

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
                    downState: getInitialDownState(
                        receivingTeam,
                        fieldPos,
                        frame.player.y,
                    ),
                },
                wait: ticks({ seconds: 1 }),
            });
        } else {
            $effect(($) => {
                $.send(
                    t`🚪 ${frame.player.name} went out in the end zone • SAFETY!`,
                );

                $.stat("SAFETY_KICK_RETURN_SAFETY");

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
                    kickingTeam: receivingTeam,
                },
                wait: ticks({ seconds: 2 }),
            });
        }
    }

    function $handleTackle(frame: Frame) {
        const catchers = findCatchers(frame.player, frame.defenders);

        if (catchers.length === 0) return;

        if (isPartiallyOutsideMainField(frame.player)) {
            switch (endzoneState) {
                case "TOUCHBACK":
                    $effect(($) => {
                        $.send(
                            t`🛑 ${frame.player.name} is down in the end zone • touchback.`,
                        );

                        $.stat("SAFETY_KICK_RETURN_TOUCHBACK_TACKLED");

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
                            downState: getInitialDownState(receivingTeam, {
                                yards: TOUCHBACK_YARD_LINE,
                                side: receivingTeam,
                            }),
                        },
                        wait: ticks({ seconds: 1 }),
                    });
                case "SAFETY":
                    $effect(($) => {
                        $.send(
                            t`🛑 ${frame.player.name} is down in the end zone • SAFETY!`,
                        );

                        $.stat("SAFETY_KICK_RETURN_SAFETY_TACKLED");

                        $.setAvatar(playerId, AVATARS.CLOWN);
                    });

                    $dispose(() => {
                        $effect(($) => {
                            $.setAvatar(playerId, null);
                        });
                    });

                    $global((state) =>
                        state.incrementScore(
                            opposite(receivingTeam),
                            SCORES.SAFETY,
                        ),
                    );

                    $next({
                        to: "SAFETY",
                        params: {
                            kickingTeam: opposite(receivingTeam),
                        },
                        wait: ticks({ seconds: 2 }),
                    });
            }
        } else {
            const catcherNames = formatNames(catchers);
            const fieldPos = getFieldPosition(frame.player.x);

            $effect(($) => {
                $.send(t`💥 ${frame.player.name} brought down by ${catcherNames}!`);
                $.stat("SAFETY_KICK_RETURN_TACKLED");

                catchers.forEach((p) => {
                    $.setAvatar(p.id, AVATARS.MUSCLE);
                });

                $.setAvatar(playerId, AVATARS.CANCEL);
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
                    downState: getInitialDownState(
                        receivingTeam,
                        fieldPos,
                        frame.player.y,
                    ),
                },
                wait: ticks({ seconds: 1 }),
            });
        }
    }

    function run(state: GameState) {
        const frame = buildFrame(state);
        if (!frame) return;

        $advanceEndzoneState(frame);
        $handleTouchdown(frame);
        $handleOutOfBounds(frame);
        $handleTackle(frame);
    }

    return { run, leave };
}

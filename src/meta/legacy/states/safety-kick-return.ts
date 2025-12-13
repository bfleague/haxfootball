import { $dispose, $effect, $next } from "@common/hooks";
import type { FieldTeam } from "@common/models";
import { opposite, AVATARS, findCatchers, ticks } from "@common/utils";
import type { GameState, GameStatePlayer } from "@common/engine";
import { t } from "@lingui/core/macro";
import {
    getFieldPosition,
    isInMainField,
    isOutOfBounds,
    TOUCHBACK_YARD_LINE,
} from "@meta/legacy/utils/stadium";
import {
    getInitialDownState,
    isTouchdown,
    SCORES,
} from "@meta/legacy/utils/game";
import { $setBallActive, $setBallInactive } from "@meta/legacy/hooks/game";
import { $global } from "@meta/legacy/hooks/global";

type EndzoneState = "TOUCHBACK" | "SAFETY";

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

    $setBallInactive();

    function leave(player: GameStatePlayer) {
        if (player.id === playerId) {
            if (isInMainField(player)) {
                const fieldPos = getFieldPosition(player.x);

                $effect(($) => {
                    $.send(
                        t`${player.name} left the room during safety kick return!`,
                    );

                    $.stat("SAFETY_KICK_RETURN_LEFT_ROOM");
                });

                $next({
                    to: "PRESNAP",
                    params: {
                        downState: getInitialDownState(receivingTeam, fieldPos),
                    },
                    wait: ticks({ seconds: 1 }),
                });
            } else {
                switch (endzoneState) {
                    case "TOUCHBACK":
                        $effect(($) => {
                            $.send(
                                t`${player.name} left the room in the end zone for a touchback!`,
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
                                t`${player.name} left the room in the end zone for a safety!`,
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

    function run(state: GameState) {
        const player = state.players.find((p) => p.id === playerId);
        if (!player) return;

        if (isInMainField(player) && endzoneState === "TOUCHBACK") {
            $next({
                to: "SAFETY_KICK_RETURN",
                params: {
                    playerId,
                    receivingTeam,
                    endzoneState: "SAFETY",
                },
            });
        }

        if (
            isTouchdown({
                player,
                offensiveTeam: receivingTeam,
            })
        ) {
            $global((state) =>
                state.incrementScore(receivingTeam, SCORES.TOUCHDOWN),
            );

            $effect(($) => {
                $.send(t`Safety kick return touchdown by ${player.name}!`);
                $.stat("SAFETY_KICK_RETURN_TOUCHDOWN");
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
                    forTeam: receivingTeam,
                },
                wait: ticks({ seconds: 3 }),
            });
        }

        if (isOutOfBounds(player)) {
            const fieldPos = getFieldPosition(player.x);

            if (isInMainField(player)) {
                $effect(($) => {
                    $.send(
                        t`${player.name} went out of bounds during safety kick return!`,
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
                        downState: getInitialDownState(receivingTeam, fieldPos),
                    },
                    wait: ticks({ seconds: 1 }),
                });
            } else {
                $effect(($) => {
                    $.send(
                        t`${player.name} went out of bounds in the end zone for a safety!`,
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

        const catchers = findCatchers(
            player,
            state.players.filter((p) => p.team === opposite(receivingTeam)),
        );

        if (catchers.length > 0) {
            const isInEndZone = !isInMainField(player);

            if (isInEndZone) {
                switch (endzoneState) {
                    case "TOUCHBACK":
                        $effect(($) => {
                            $.send(
                                t`${player.name} tackled in the end zone for a touchback!`,
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
                                t`${player.name} tackled in the end zone for a safety!`,
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
                const catcherNames = catchers.map((p) => p.name).join(", ");
                const fieldPos = getFieldPosition(player.x);

                $effect(($) => {
                    $.send(t`${player.name} tackled by ${catcherNames}!`);
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
                        downState: getInitialDownState(receivingTeam, fieldPos),
                    },
                    wait: ticks({ seconds: 1 }),
                });
            }
        }
    }

    function dispose() {
        $effect(($) => {
            $.setAvatar(playerId, null);
        });

        $setBallActive();
    }

    return { run, leave, dispose };
}

import type {
    GameState,
    GameStateBall,
    GameStatePlayer,
} from "@runtime/engine";
import { FieldTeam } from "@runtime/models";
import { $before, $dispose, $effect, $next } from "@runtime/runtime";
import { PointLike } from "@common/math";
import { ticks } from "@common/time";
import { AVATARS, findCatchers, opposite } from "@common/game";
import {
    $hideInterceptionPath,
    $setBallActive,
    $setBallInactive,
    $showInterceptionPath,
} from "@meta/legacy/hooks/game";
import {
    getFieldPosition,
    isCompletelyInsideMainField,
    isPartiallyOutsideMainField,
    isOutOfBounds,
    TOUCHBACK_YARD_LINE,
} from "@meta/legacy/utils/stadium";
import { getInitialDownState } from "@meta/legacy/utils/down";
import { isTouchdown, SCORES } from "@meta/legacy/utils/scoring";
import { formatNames } from "@meta/legacy/utils/message";
import { $global } from "@meta/legacy/hooks/global";
import { t } from "@lingui/core/macro";

const MAX_PATH_DURATION = ticks({ seconds: 2 });

type EndzoneState = "TOUCHBACK" | "SAFETY";
type InterceptionFrame = {
    state: GameState;
    player: GameStatePlayer;
    defenders: GameStatePlayer[];
};

export function Interception({
    playerId,
    ballState,
    intersectionPoint,
    playerTeam,
    endzoneState = "TOUCHBACK",
}: {
    playerId: number;
    ballState: GameStateBall;
    intersectionPoint: PointLike;
    playerTeam: FieldTeam;
    endzoneState?: EndzoneState;
}) {
    $setBallInactive();

    const { tickNumber: initialTickNumber } = $before();

    $effect(($) => {
        $.setAvatar(playerId, AVATARS.BALL);
    });

    $dispose(() => {
        $effect(($) => {
            $.setAvatar(playerId, null);
        });
    });

    $showInterceptionPath({
        start: { x: ballState.x, y: ballState.y },
        end: { x: intersectionPoint.x, y: intersectionPoint.y },
    });

    $dispose(() => {
        $hideInterceptionPath();
        $setBallActive();
    });

    function buildInterceptionFrame(
        state: GameState,
    ): InterceptionFrame | null {
        const player = state.players.find((p) => p.id === playerId);
        if (!player) return null;

        const defenders = state.players.filter(
            (p) => p.team === opposite(playerTeam),
        );

        return { state, player, defenders };
    }

    function $maybeHideInterceptionPath(state: GameState) {
        const elapsedTicks = state.tickNumber - initialTickNumber;

        if (elapsedTicks >= MAX_PATH_DURATION) {
            $hideInterceptionPath();
        }
    }

    function $advanceEndzoneState(frame: InterceptionFrame) {
        if (
            !isCompletelyInsideMainField(frame.player) ||
            endzoneState !== "TOUCHBACK"
        ) {
            return;
        }

        $next({
            to: "INTERCEPTION",
            params: {
                playerId,
                intersectionPoint,
                ballState,
                playerTeam,
                endzoneState: "SAFETY",
            },
        });
    }

    function $handleTouchdown(frame: InterceptionFrame) {
        if (
            !isTouchdown({
                player: frame.player,
                offensiveTeam: playerTeam,
            })
        ) {
            return;
        }

        $global((state) => state.incrementScore(playerTeam, SCORES.TOUCHDOWN));

        $effect(($) => {
            $.send(t`Pick six by ${frame.player.name}!`);
            $.stat("INTERCEPTION_TOUCHDOWN");
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
                forTeam: playerTeam,
            },
            wait: ticks({ seconds: 3 }),
        });
    }

    function $handleOutOfBounds(frame: InterceptionFrame) {
        if (!isOutOfBounds(frame.player)) return;

        const fieldPos = getFieldPosition(frame.player.x);

        if (isCompletelyInsideMainField(frame.player)) {
            $effect(($) => {
                $.send(
                    t`${frame.player.name} went out of bounds during interception return!`,
                );

                $.stat("INTERCEPTION_OUT_OF_BOUNDS");

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
                        playerTeam,
                        fieldPos,
                        frame.player.y,
                    ),
                },
                wait: ticks({ seconds: 1 }),
            });
        } else {
            $effect(($) => {
                $.send(
                    t`${frame.player.name} went out of bounds in the end zone for a safety!`,
                );

                $.stat("INTERCEPTION_SAFETY");

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
                    kickingTeam: playerTeam,
                },
                wait: ticks({ seconds: 2 }),
            });
        }
    }

    function $handleTackle(frame: InterceptionFrame) {
        const catchers = findCatchers(frame.player, frame.defenders);

        if (catchers.length === 0) return;

        if (isPartiallyOutsideMainField(frame.player)) {
            switch (endzoneState) {
                case "TOUCHBACK":
                    $effect(($) => {
                        $.send(
                            t`${frame.player.name} tackled in the end zone for a touchback!`,
                        );

                        $.stat("INTERCEPTION_TOUCHBACK_TACKLED");

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
                            downState: getInitialDownState(playerTeam, {
                                yards: TOUCHBACK_YARD_LINE,
                                side: playerTeam,
                            }),
                        },
                        wait: ticks({ seconds: 1 }),
                    });
                case "SAFETY":
                    $effect(($) => {
                        $.send(
                            t`${frame.player.name} tackled in the end zone for a safety!`,
                        );

                        $.stat("INTERCEPTION_SAFETY_TACKLED");

                        $.setAvatar(playerId, AVATARS.CLOWN);
                    });

                    $dispose(() => {
                        $effect(($) => {
                            $.setAvatar(playerId, null);
                        });
                    });

                    $global((state) =>
                        state.incrementScore(
                            opposite(playerTeam),
                            SCORES.SAFETY,
                        ),
                    );

                    $next({
                        to: "SAFETY",
                        params: {
                            kickingTeam: playerTeam,
                        },
                        wait: ticks({ seconds: 2 }),
                    });
            }
        } else {
            const catcherNames = formatNames(catchers);
            const fieldPos = getFieldPosition(frame.player.x);

            $effect(($) => {
                $.send(t`${frame.player.name} tackled by ${catcherNames}!`);
                $.stat("INTERCEPTION_TACKLED");

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
                        playerTeam,
                        fieldPos,
                        frame.player.y,
                    ),
                },
                wait: ticks({ seconds: 1 }),
            });
        }
    }

    function run(state: GameState) {
        $maybeHideInterceptionPath(state);

        const frame = buildInterceptionFrame(state);
        if (!frame) return;

        $advanceEndzoneState(frame);
        $handleTouchdown(frame);
        $handleOutOfBounds(frame);
        $handleTackle(frame);
    }

    return { run };
}

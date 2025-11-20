import type { GameState } from "@common/engine";
import { advanceDownState, DownState } from "@meta/legacy/utils/game";
import { $effect, $next } from "@common/runtime";
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

export function LiveBall({
    playerId,
    downState,
}: {
    playerId: number;
    downState: DownState;
}) {
    const { offensiveTeam, fieldPos, downAndDistance } = downState;

    const avatarsToClear: number[] = [];

    $setLineOfScrimmage(fieldPos);
    $setFirstDownLine(offensiveTeam, fieldPos, downAndDistance.distance);
    $setBallInactive();

    // TODO: Fumble

    $effect(($) => {
        $.setAvatar(playerId, AVATARS.BALL);
        avatarsToClear.push(playerId);
    });

    function run(state: GameState) {
        const player = state.players.find((p) => p.id === playerId);
        if (!player) return;

        // TODO: Touchdown

        if (isOutOfBounds(player)) {
            const fieldPos = getFieldPosition(player.x);

            if (isInMainField(player)) {
                const { downState: nextDownState, event } = advanceDownState(
                    downState,
                    fieldPos,
                );

                $effect(($) => {
                    switch (event.type) {
                        case "FIRST_DOWN":
                            $.send(
                                t`${player.name} went out of bounds, first down!`,
                            );
                            $.stat("LIVE_BALL_OUT_OF_BOUNDS_FIRST_DOWN");
                            break;
                        case "NEXT_DOWN":
                            if (event.yardsGained === 0) {
                                $.send(
                                    t`${player.name} went out of bounds with no gain!`,
                                );
                            }

                            if (event.yardsGained > 0) {
                                $.send(
                                    t`${player.name} went out of bounds for a gain of ${event.yardsGained} yards!`,
                                );
                            }

                            if (event.yardsGained < 0) {
                                $.send(
                                    t`${player.name} went out of bounds for a loss of ${-event.yardsGained} yards!`,
                                );
                            }

                            $.stat("LIVE_BALL_OUT_OF_BOUNDS_NEXT_DOWN");
                            break;
                        case "TURNOVER_ON_DOWNS":
                            $.send(
                                t`${player.name} went out of bounds, turnover on downs!`,
                            );
                            $.stat("LIVE_BALL_OUT_OF_BOUNDS_TURNOVER_ON_DOWNS");
                            break;
                        default:
                            break;
                    }

                    $.setAvatar(playerId, AVATARS.CANCEL);
                    avatarsToClear.push(playerId);
                });

                $next({
                    to: "PRESNAP",
                    params: {
                        downState: nextDownState,
                    },
                    wait: ticks({ seconds: 2 }),
                });
            } else {
                $effect(($) => {
                    $.send(
                        t`${player.name} went out of bounds in the end zone for a safety!`,
                    );

                    $.stat("LIVE_BALL_OUT_OF_BOUNDS_SAFETY");

                    $.setAvatar(playerId, AVATARS.CLOWN);
                    avatarsToClear.push(playerId);
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

            $effect(($) => {
                switch (event.type) {
                    case "FIRST_DOWN":
                        $.send(
                            t`${player.name} tackled by ${catcherNames} for a first down!`,
                        );
                        $.stat("LIVE_BALL_TACKLE_FIRST_DOWN");
                        break;
                    case "NEXT_DOWN":
                        if (event.yardsGained === 0) {
                            $.send(
                                t`${player.name} tackled by ${catcherNames} with no gain!`,
                            );
                        }

                        if (event.yardsGained > 0) {
                            $.send(
                                t`${player.name} tackled by ${catcherNames} for a gain of ${event.yardsGained} yards!`,
                            );
                        }

                        if (event.yardsGained < 0) {
                            $.send(
                                t`${player.name} tackled by ${catcherNames} for a loss of ${-event.yardsGained} yards!`,
                            );
                        }

                        $.stat("LIVE_BALL_TACKLE_NEXT_DOWN");
                        break;
                    case "TURNOVER_ON_DOWNS":
                        $.send(
                            t`${player.name} tackled by ${catcherNames}, turnover on downs!`,
                        );
                        $.stat("LIVE_BALL_TURNOVER_ON_DOWNS");
                        break;
                    default:
                        break;
                }

                $.setAvatar(playerId, AVATARS.CANCEL);

                catchers.forEach((p) => {
                    $.setAvatar(p.id, AVATARS.MUSCLE);
                });

                avatarsToClear.push(...catchers.map((p) => p.id));
            });

            $next({
                to: "PRESNAP",
                params: {
                    downState: nextDownState,
                },
                wait: ticks({ seconds: 2 }),
            });
        }
    }

    function dispose() {
        $effect(($) => {
            avatarsToClear.forEach((id) => {
                $.setAvatar(id, null);
            });
        });

        $unsetLineOfScrimmage();
        $unsetFirstDownLine();
        $setBallActive();
    }

    return { run, dispose };
}

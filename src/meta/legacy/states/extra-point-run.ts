import type { GameState, GameStatePlayer } from "@runtime/engine";
import { $before, $dispose, $effect, $next } from "@runtime/runtime";
import { ticks } from "@common/general/time";
import {
    AVATARS,
    findCatchers,
    opposite,
    type FieldPosition,
} from "@common/game/game";
import { type Line } from "@common/math/geometry";
import { t } from "@lingui/core/macro";
import { type FieldTeam } from "@runtime/models";
import { isTouchdown, SCORES } from "@meta/legacy/utils/scoring";
import {
    isInExtraPointZone,
    isOutOfBounds,
} from "@meta/legacy/utils/stadium";
import {
    $hideInterceptionPath,
    $setBallActive,
    $setBallInactive,
    $setLineOfScrimmage,
    $showInterceptionPath,
    $unsetFirstDownLine,
    $unsetLineOfScrimmage,
} from "@meta/legacy/hooks/game";
import { $global } from "@meta/legacy/hooks/global";

const MAX_PATH_DURATION = ticks({ seconds: 2 });

type Frame = {
    player: GameStatePlayer;
    defenders: GameStatePlayer[];
};

export function ExtraPointRun({
    playerId,
    ballTeam,
    originalOffensiveTeam,
    fieldPos,
    interceptionPath,
}: {
    playerId: number;
    ballTeam: FieldTeam;
    originalOffensiveTeam: FieldTeam;
    fieldPos: FieldPosition;
    interceptionPath?: Line;
}) {
    $setLineOfScrimmage(fieldPos);
    $unsetFirstDownLine();
    $setBallInactive();

    const { tickNumber: initialTickNumber } = $before();

    if (interceptionPath) {
        $showInterceptionPath(interceptionPath);
    }

    $effect(($) => {
        $.setAvatar(playerId, AVATARS.BALL);
    });

    $dispose(() => {
        $effect(($) => {
            $.setAvatar(playerId, null);
        });

        if (interceptionPath) {
            $hideInterceptionPath();
        }

        $unsetLineOfScrimmage();
        $unsetFirstDownLine();
        $setBallActive();
    });

    function buildFrame(state: GameState): Frame | null {
        const player = state.players.find((p) => p.id === playerId);
        if (!player) return null;

        const defenders = state.players.filter(
            (p) => p.team === opposite(ballTeam),
        );

        return { player, defenders };
    }

    function $completeAttempt() {
        $next({
            to: "KICKOFF",
            params: {
                forTeam: originalOffensiveTeam,
            },
            wait: ticks({ seconds: 2 }),
        });
    }

    function $handleTouchdown(frame: Frame) {
        if (
            !isTouchdown({
                player: frame.player,
                offensiveTeam: ballTeam,
            })
        ) {
            return;
        }

        $global((state) =>
            state.incrementScore(ballTeam, SCORES.TWO_POINT),
        );

        $effect(($) => {
            if (ballTeam === originalOffensiveTeam) {
                $.send(t`Two-point conversion is good!`);
            } else {
                $.send(t`Defensive return for two points!`);
            }
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
                forTeam: originalOffensiveTeam,
            },
            wait: ticks({ seconds: 2 }),
        });
    }

    function $handleOutsideExtraPointZone(frame: Frame) {
        if (ballTeam !== originalOffensiveTeam) return;

        if (isInExtraPointZone(frame.player, originalOffensiveTeam)) return;

        $effect(($) => {
            $.send(t`Two-point conversion failed.`);
            $.setAvatar(playerId, AVATARS.CANCEL);
        });

        $dispose(() => {
            $effect(($) => {
                $.setAvatar(playerId, null);
            });
        });

        $completeAttempt();
    }

    function $handleOutOfBounds(frame: Frame) {
        if (!isOutOfBounds(frame.player)) return;

        $effect(($) => {
            $.send(t`Two-point conversion failed.`);
            $.setAvatar(playerId, AVATARS.CANCEL);
        });

        $dispose(() => {
            $effect(($) => {
                $.setAvatar(playerId, null);
            });
        });

        $completeAttempt();
    }

    function $handleTackle(frame: Frame) {
        const catchers = findCatchers(frame.player, frame.defenders);
        if (catchers.length === 0) return;

        $effect(($) => {
            $.send(t`Two-point conversion failed.`);
            $.setAvatar(playerId, AVATARS.CANCEL);

            catchers.forEach((player) => {
                $.setAvatar(player.id, AVATARS.MUSCLE);
            });
        });

        $dispose(() => {
            $effect(($) => {
                $.setAvatar(playerId, null);

                catchers.forEach((player) => {
                    $.setAvatar(player.id, null);
                });
            });
        });

        $completeAttempt();
    }

    function run(state: GameState) {
        const frame = buildFrame(state);
        if (!frame) return;

        if (interceptionPath) {
            const elapsedTicks = state.tickNumber - initialTickNumber;
            if (elapsedTicks >= MAX_PATH_DURATION) {
                $hideInterceptionPath();
            }
        }

        $handleTouchdown(frame);
        $handleOutsideExtraPointZone(frame);
        $handleOutOfBounds(frame);
        $handleTackle(frame);
    }

    return { run };
}

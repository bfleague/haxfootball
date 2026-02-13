import type { GameState, GameStatePlayer } from "@runtime/engine";
import { $dispose, $effect, $next } from "@runtime/runtime";
import { ticks } from "@common/general/time";
import {
    AVATARS,
    findCatchers,
    opposite,
    type FieldPosition,
} from "@common/game/game";
import { t } from "@lingui/core/macro";
import { cn } from "@meta/legacy/utils/message";
import { type FieldTeam } from "@runtime/models";
import { isTouchdown, SCORES } from "@meta/legacy/utils/scoring";
import { isInExtraPointZone, isOutOfBounds } from "@meta/legacy/utils/stadium";
import {
    $setBallActive,
    $setBallInactive,
    $setLineOfScrimmage,
    $unsetFirstDownLine,
    $unsetLineOfScrimmage,
} from "@meta/legacy/hooks/game";
import { $global } from "@meta/legacy/hooks/global";

type Frame = {
    player: GameStatePlayer;
    defenders: GameStatePlayer[];
};

export function ExtraPointQuarterbackRun({
    playerId,
    ballTeam,
    originalOffensiveTeam,
    fieldPos,
}: {
    playerId: number;
    ballTeam: FieldTeam;
    originalOffensiveTeam: FieldTeam;
    fieldPos: FieldPosition;
}) {
    $setLineOfScrimmage(fieldPos);
    $unsetFirstDownLine();
    $setBallInactive();

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

        $global((state) => state.incrementScore(ballTeam, SCORES.TWO_POINT));

        $effect(($) => {
            if (ballTeam === originalOffensiveTeam) {
                $.send(t`✅ Two-point try is good!`);
            } else {
                $.send(cn(t`🏈 Defense takes it back`, t`TWO POINTS!`));
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
            $.send(t`❌ Two-point try failed.`);
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
            $.send(t`❌ Two-point try failed.`);
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
            $.send(t`❌ Two-point try failed.`);
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

        $handleTouchdown(frame);
        $handleOutsideExtraPointZone(frame);
        $handleOutOfBounds(frame);
        $handleTackle(frame);
    }

    return { run };
}

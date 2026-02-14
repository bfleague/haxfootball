import { $dispose, $effect, $next } from "@runtime/hooks";
import type { FieldTeam } from "@runtime/models";
import { ticks } from "@common/general/time";
import { AVATARS, findBallCatcher, opposite } from "@common/game/game";
import type { GameState, GameStatePlayer } from "@runtime/engine";
import { t } from "@lingui/core/macro";
import { cn } from "@meta/legacy/utils/message";
import {
    getFieldPosition,
    intersectsEndZone,
    isBallOutOfBounds,
    TOUCHBACK_YARD_LINE,
} from "@meta/legacy/utils/stadium";
import { getInitialDownState } from "@meta/legacy/utils/down";
import { $setBallMoveableByPlayer } from "@meta/legacy/hooks/physics";
import { $setBallActive, $setBallInactive } from "@meta/legacy/hooks/game";

export function PuntInFlight({ kickingTeam }: { kickingTeam: FieldTeam }) {
    function join(player: GameStatePlayer) {
        $setBallMoveableByPlayer(player.id);
    }

    function run(state: GameState) {
        if (isBallOutOfBounds(state.ball)) {
            const receivingTeam = opposite(kickingTeam);
            const isTouchback = intersectsEndZone(state.ball, receivingTeam);

            $setBallInactive();

            $dispose(() => {
                $setBallActive();
            });

            if (isTouchback) {
                $effect(($) => {
                    $.send(cn(t`Punt out in the end zone`, t`touchback.`));
                    $.stat("PUNT_OUT_OF_BOUNDS_TOUCHBACK");
                });

                $next({
                    to: "PRESNAP",
                    params: {
                        downState: getInitialDownState(receivingTeam, {
                            yards: TOUCHBACK_YARD_LINE,
                            side: receivingTeam,
                        }),
                    },
                    wait: ticks({ seconds: 2 }),
                });
            }

            const fieldPos = getFieldPosition(state.ball.x);

            $effect(($) => {
                $.send(
                    cn(
                        t`🚪 Punt out of bounds`,
                        t`ball spotted at the ${fieldPos.yards}-yard line.`,
                    ),
                );
                $.stat("PUNT_OUT_OF_BOUNDS");
            });

            $next({
                to: "PRESNAP",
                params: {
                    downState: getInitialDownState(receivingTeam, fieldPos),
                },
                wait: ticks({ seconds: 2 }),
            });
        }

        const receivingTeam = opposite(kickingTeam);

        const catcher = findBallCatcher(
            state.ball,
            state.players.filter((p) => p.team === receivingTeam),
        );

        if (catcher) {
            $effect(($) => {
                $.send(t`🏈 Punt return by ${catcher.name}!`);
                $.stat("PUNT_RETURNED");
            });

            $next({
                to: "PUNT_RETURN",
                params: { playerId: catcher.id, receivingTeam },
            });
        }

        const kickingTeamCatcher = findBallCatcher(
            state.ball,
            state.players.filter((p) => p.team === kickingTeam),
        );

        if (kickingTeamCatcher) {
            $effect(($) => {
                $.send(
                    cn(
                        t`❌ Illegal touch`,
                        t`punt caught first by the kicking team (${kickingTeamCatcher.name}).`,
                    ),
                );
                $.stat("PUNT_CAUGHT_BY_KICKING_TEAM");
                $.setAvatar(kickingTeamCatcher.id, AVATARS.CANCEL);
            });

            $next({
                to: "PRESNAP",
                params: {
                    downState: getInitialDownState(
                        receivingTeam,
                        getFieldPosition(kickingTeamCatcher.x),
                        kickingTeamCatcher.y,
                    ),
                },
                wait: ticks({ seconds: 2 }),
            });
        }
    }

    return { run, join };
}

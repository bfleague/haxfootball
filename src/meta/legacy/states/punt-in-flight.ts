import { $dispose, $effect, $next } from "@runtime/hooks";
import type { FieldTeam } from "@runtime/models";
import { ticks } from "@common/general/time";
import { AVATARS, findBallCatcher, opposite } from "@common/game/game";
import type { GameState, GameStatePlayer } from "@runtime/engine";
import { t } from "@lingui/core/macro";
import { cn } from "@meta/legacy/shared/message";
import {
    getFieldPosition,
    intersectsEndZone,
    isBallOutOfBounds,
    TOUCHBACK_YARD_LINE,
} from "@meta/legacy/shared/stadium";
import { getInitialDownState } from "@meta/legacy/shared/down";
import { $setBallMoveableByPlayer } from "@meta/legacy/hooks/physics";
import { $setBallActive, $setBallInactive } from "@meta/legacy/hooks/game";
import { $createSharedCommandHandler } from "@meta/legacy/shared/commands";
import type { CommandSpec } from "@runtime/commands";

export function PuntInFlight({ kickingTeam }: { kickingTeam: FieldTeam }) {
    function join(player: GameStatePlayer) {
        $setBallMoveableByPlayer(player.id);
    }

    function command(player: PlayerObject, spec: CommandSpec) {
        return $createSharedCommandHandler({
            options: {
                undo: true,
                info: { stateMessage: t`Punt in flight` },
            },
            player,
            spec,
        });
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

    return { run, join, command };
}

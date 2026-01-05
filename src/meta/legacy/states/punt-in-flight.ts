import { $dispose, $effect, $next } from "@common/hooks";
import type { FieldTeam } from "@common/models";
import { opposite, findBallCatcher, ticks, AVATARS } from "@common/utils";
import type { GameState, GameStatePlayer } from "@common/engine";
import { t } from "@lingui/core/macro";
import {
    getFieldPosition,
    intersectsEndZone,
    isOutOfBounds,
    TOUCHBACK_YARD_LINE,
} from "@meta/legacy/utils/stadium";
import { getInitialDownState } from "@meta/legacy/utils/game";
import { $setBallMoveableByPlayer } from "@meta/legacy/hooks/physics";
import { $setBallActive, $setBallInactive } from "@meta/legacy/hooks/game";

export function PuntInFlight({ kickingTeam }: { kickingTeam: FieldTeam }) {
    function join(player: GameStatePlayer) {
        $setBallMoveableByPlayer(player.id);
    }

    function run(state: GameState) {
        if (isOutOfBounds(state.ball)) {
            const receivingTeam = opposite(kickingTeam);
            const isTouchback = intersectsEndZone(state.ball, receivingTeam);

            $setBallInactive();

            $dispose(() => {
                $setBallActive();
            });

            if (isTouchback) {
                $effect(($) => {
                    $.send(
                        t`Punt went out of bounds in the end zone for a touchback.`,
                    );
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
                    t`Punt went out of bounds, ball placed at ${fieldPos.yards} yard line.`,
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
                $.send(t`Punt return attempt by ${catcher.name}!`);
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
                    t`Punt caught by kicking team player ${kickingTeamCatcher.name}!`,
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
                    ),
                },
                wait: ticks({ seconds: 2 }),
            });
        }
    }

    return { run, join };
}

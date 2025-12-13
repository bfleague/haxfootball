import { $dispose, $effect, $next } from "@common/hooks";
import { type FieldTeam } from "@common/models";
import { opposite, findBallCatcher, ticks } from "@common/utils";
import type { GameState, GameStatePlayer } from "@common/engine";
import { t } from "@lingui/core/macro";
import {
    isOutOfBounds,
    KICKOFF_OUT_OF_BOUNDS_YARD_LINE,
} from "@meta/legacy/utils/stadium";
import { getInitialDownState } from "@meta/legacy/utils/game";
import { $setBallMoveableByPlayer } from "@meta/legacy/hooks/physics";
import { $setBallActive, $setBallInactive } from "@meta/legacy/hooks/game";

export function KickoffInFlight({ kickingTeam }: { kickingTeam: FieldTeam }) {
    function join(player: GameStatePlayer) {
        $setBallMoveableByPlayer(player.id);
    }

    function run(state: GameState) {
        if (isOutOfBounds(state.ball)) {
            $setBallInactive();

            $dispose(() => {
                $setBallActive();
            });

            $effect(($) => {
                $.send(
                    t`Kickoff went out of bounds, ball placed at ${KICKOFF_OUT_OF_BOUNDS_YARD_LINE} yard line.`,
                );
                $.stat("KICKOFF_OUT_OF_BOUNDS");
            });

            $next({
                to: "PRESNAP",
                params: {
                    downState: getInitialDownState(opposite(kickingTeam), {
                        yards: KICKOFF_OUT_OF_BOUNDS_YARD_LINE,
                        side: opposite(kickingTeam),
                    }),
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
                $.send(t`Kickoff return attempt by ${catcher.name}!`);
                $.stat("KICKOFF_RETURNED");
            });

            $next({
                to: "KICKOFF_RETURN",
                params: { playerId: catcher.id, receivingTeam },
            });
        }
    }

    return { run, join };
}

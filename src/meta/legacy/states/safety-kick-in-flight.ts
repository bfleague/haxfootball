import { $dispose, $effect, $next } from "@runtime/hooks";
import { type FieldTeam } from "@runtime/models";
import { ticks } from "@common/general/time";
import { AVATARS, findBallCatcher, opposite } from "@common/game/game";
import type { GameState, GameStatePlayer } from "@runtime/engine";
import { t } from "@lingui/core/macro";
import {
    getFieldPosition,
    isOutOfBounds,
    KICKOFF_OUT_OF_BOUNDS_YARD_LINE,
} from "@meta/legacy/utils/stadium";
import { getInitialDownState } from "@meta/legacy/utils/down";
import { $setBallMoveableByPlayer } from "@meta/legacy/hooks/physics";
import { $setBallActive, $setBallInactive } from "@meta/legacy/hooks/game";

export function SafetyKickInFlight({
    kickingTeam,
}: {
    kickingTeam: FieldTeam;
}) {
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
                    t`❌ Safety kick out of bounds • ball spotted at the ${KICKOFF_OUT_OF_BOUNDS_YARD_LINE}-yard line.`,
                );
                $.stat("SAFETY_KICK_OUT_OF_BOUNDS");
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
                $.send(t`🏈 Safety-kick return by ${catcher.name}!`);
                $.stat("SAFETY_KICK_RETURNED");
            });

            $next({
                to: "SAFETY_KICK_RETURN",
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
                    t`❌ Illegal touch • safety kick caught first by the kicking team (${kickingTeamCatcher.name}).`,
                );
                $.stat("SAFETY_KICK_CAUGHT_BY_KICKING_TEAM");
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

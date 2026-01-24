import { $dispose, $effect, $next } from "@common/hooks";
import { Team, type FieldTeam } from "@common/models";
import { distributeOnLine, getMidpoint, opposite } from "@common/utils";
import {
    $trapTeamInMidField,
    $trapTeamInEndZone,
    $untrapAllTeams,
    $setBallKickForce,
    $setBallMoveable,
    $setBallUnmoveable,
    $trapPlayerInMidField,
    $trapPlayerInEndZone,
    $setBallInMiddleOfField,
    $setBallUnmoveableByPlayer,
} from "@meta/legacy/hooks/physics";
import type { GameState, GameStatePlayer } from "@common/engine";

const KICKOFF_START_LINE = {
    [Team.RED]: {
        start: { x: -150, y: -150 },
        end: { x: -150, y: 150 },
    },
    [Team.BLUE]: {
        start: { x: 150, y: -150 },
        end: { x: 150, y: 150 },
    },
};

export function Kickoff({ forTeam = Team.RED }: { forTeam?: FieldTeam }) {
    $setBallInMiddleOfField();
    $trapTeamInMidField(forTeam);
    $trapTeamInEndZone(opposite(forTeam));
    $setBallKickForce("strong");
    $setBallUnmoveable();

    $effect(($) => {
        const players = $.getPlayerList()
            .filter((p) => p.team === forTeam)
            .map((p) => ({ ...p.position, id: p.id }));

        distributeOnLine(players, KICKOFF_START_LINE[forTeam]).forEach(
            ({ id, x, y }) => {
                $.setPlayerDiscProperties(id, {
                    x,
                    y,
                });
            },
        );
    });

    $dispose(() => {
        $untrapAllTeams();
        $setBallMoveable();
        $setBallKickForce("normal");
    });

    function join(player: GameStatePlayer) {
        if (player.team === forTeam) {
            $effect(($) => {
                const midpoint = getMidpoint(
                    KICKOFF_START_LINE[forTeam].start,
                    KICKOFF_START_LINE[forTeam].end,
                );

                $.setPlayerDiscProperties(player.id, {
                    x: midpoint.x,
                    y: midpoint.y,
                });
            });

            $trapPlayerInMidField(player.id);
            $setBallUnmoveableByPlayer(player.id);
        } else {
            $trapPlayerInEndZone(player.id);
            $setBallUnmoveableByPlayer(player.id);
        }
    }

    function run(state: GameState) {
        const kicker = state.players.find((p) => p.isKickingBall);

        if (kicker) {
            $effect(($) => {
                $.stat("KICKOFF");
            });

            $next({
                to: "KICKOFF_IN_FLIGHT",
                params: { kickingTeam: forTeam },
            });
        }
    }

    return { join, run };
}

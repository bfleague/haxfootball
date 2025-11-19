import { Team, type FieldTeam } from "@common/models";
import type { GameState } from "@common/engine";
import { distributeOnLine, FieldPosition, opposite } from "@common/utils";
import {
    $setBallKickForce,
    $setBallMoveable,
    $setBallUnmoveable,
    $trapTeamInEndZone,
    $untrapAllTeams,
} from "@meta/legacy/hooks/physics";
import { $effect } from "@common/hooks";
import { getPositionFromFieldPosition } from "@meta/legacy/utils/stadium";

const KICKING_TEAM_POSITIONS_OFFSET = {
    start: { x: -50, y: -150 },
    end: { x: -50, y: 150 },
};

const YARD_LINE_FOR_SAFETY = 25;

export function Safety({ kickingTeam }: { kickingTeam: FieldTeam }) {
    $trapTeamInEndZone(opposite(kickingTeam));
    $setBallKickForce("strong");
    $setBallUnmoveable();

    // TODO: Safety points

    const safetyFieldPos: FieldPosition = {
        yards: YARD_LINE_FOR_SAFETY,
        side: kickingTeam,
    };

    const ballPos = {
        x: getPositionFromFieldPosition(safetyFieldPos),
        y: 0,
    };

    $effect(($) => {
        $.setBall({ ...ballPos, xspeed: 0, yspeed: 0 });
    });

    $effect(($) => {
        const kickingTeamPlayers = $.getPlayerList()
            .filter((p) => p.team === kickingTeam)
            .sort((a, b) => a.position.y - b.position.y)
            .map((p) => ({ ...p.position, id: p.id }));

        distributeOnLine(kickingTeamPlayers, {
            start: {
                x:
                    ballPos.x +
                    KICKING_TEAM_POSITIONS_OFFSET.start.x *
                        (kickingTeam === Team.RED ? 1 : -1),
                y: KICKING_TEAM_POSITIONS_OFFSET.start.y,
            },
            end: {
                x:
                    ballPos.x +
                    KICKING_TEAM_POSITIONS_OFFSET.end.x *
                        (kickingTeam === Team.RED ? 1 : -1),
                y: KICKING_TEAM_POSITIONS_OFFSET.end.y,
            },
        }).forEach(({ id, x, y }) => {
            $.setPlayerDiscProperties(id, { x, y });
        });
    });

    function run(state: GameState) {
        // TODO: Safety logic
    }

    function dispose() {
        $untrapAllTeams();
        $setBallMoveable();
    }

    return { run, dispose };
}

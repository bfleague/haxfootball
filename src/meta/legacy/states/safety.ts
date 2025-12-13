import { Team, type FieldTeam } from "@common/models";
import type { GameState } from "@common/engine";
import { distributeOnLine, FieldPosition, opposite } from "@common/utils";
import {
    $setBallKickForce,
    $setBallMoveable,
    $setBallUnmoveable,
    $lockBall,
    $unlockBall,
    $trapTeamInEndZone,
    $untrapAllTeams,
} from "@meta/legacy/hooks/physics";
import { $effect } from "@common/hooks";
import {
    calculateDirectionalGain,
    getPositionFromFieldPosition,
} from "@meta/legacy/utils/stadium";
import { $global } from "@meta/legacy/hooks/global";
import { SCORES } from "@meta/legacy/utils/game";
import { $next } from "@common/runtime";
import { t } from "@lingui/core/macro";

const KICKING_TEAM_POSITIONS_OFFSET = {
    start: { x: -50, y: -150 },
    end: { x: -50, y: 150 },
};

const YARD_LINE_FOR_SAFETY = 25;

export function Safety({ kickingTeam }: { kickingTeam: FieldTeam }) {
    $trapTeamInEndZone(opposite(kickingTeam));
    $setBallKickForce("strong");
    $setBallUnmoveable();

    $global((state) =>
        state.incrementScore(opposite(kickingTeam), SCORES.SAFETY),
    );

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

    const getPlayersBeyondBallLine = (state: GameState) =>
        state.players.filter(
            (player) =>
                player.team === kickingTeam &&
                calculateDirectionalGain(
                    kickingTeam,
                    player.x - state.ball.x,
                ) > 0,
        );

    function run(state: GameState) {
        const playersPastBall = getPlayersBeyondBallLine(state);
        const hasPlayersPastBall = playersPastBall.length > 0;

        if (hasPlayersPastBall) {
            $lockBall();
        } else {
            $unlockBall();
            $setBallKickForce("strong");
        }

        const kicker = state.players.find(
            (player) => player.isKickingBall && player.team === kickingTeam,
        );

        if (!kicker) return;

        if (hasPlayersPastBall) {
            $effect(($) => {
                $.send(
                    t`You cannot kick while a teammate is beyond the ball line.`,
                    kicker.id,
                );
            });

            return;
        }

        $effect(($) => {
            $.stat("SAFETY_KICK");
        });

        $next({
            to: "SAFETY_KICK_IN_FLIGHT",
            params: { kickingTeam },
        });
    }

    function dispose() {
        $untrapAllTeams();
        $setBallMoveable();
        $unlockBall();
        $setBallKickForce("normal");
    }

    return { run, dispose };
}

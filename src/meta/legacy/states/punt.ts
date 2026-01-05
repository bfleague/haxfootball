import type { GameState } from "@common/engine";
import { Team, type FieldTeam } from "@common/models";
import { distributeOnLine, opposite } from "@common/utils";
import { t } from "@lingui/core/macro";
import { $effect } from "@common/hooks";
import { $next } from "@common/runtime";
import {
    $lockBall,
    $setBallKickForce,
    $setBallMoveable,
    $setBallUnmoveable,
    $trapTeamInEndZone,
    $untrapAllTeams,
    $unlockBall,
} from "@meta/legacy/hooks/physics";
import { DownState } from "@meta/legacy/utils/game";
import {
    calculateDirectionalGain,
    getPositionFromFieldPosition,
} from "@meta/legacy/utils/stadium";

const KICKING_TEAM_POSITIONS_OFFSET = {
    start: { x: -50, y: -150 },
    end: { x: -50, y: 150 },
};

export function Punt({ downState }: { downState: DownState }) {
    const { offensiveTeam, fieldPos } = downState;
    const kickingTeam: FieldTeam = offensiveTeam;

    $trapTeamInEndZone(opposite(kickingTeam));
    $setBallKickForce("strong");
    $setBallUnmoveable();

    const ballPos = {
        x: getPositionFromFieldPosition(fieldPos),
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
                calculateDirectionalGain(kickingTeam, player.x - state.ball.x) >
                    0,
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
            $.stat("PUNT");
        });

        $next({
            to: "PUNT_IN_FLIGHT",
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

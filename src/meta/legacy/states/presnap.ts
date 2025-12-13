import { Team, type FieldTeam } from "@common/models";
import type { GameState, GameStatePlayer } from "@common/engine";
import { distributeOnLine, getDistance } from "@common/utils";
import {
    BALL_OFFSET_YARDS,
    ballWithRadius,
    calculateDirectionalGain,
    calculateSnapBallPosition,
} from "@meta/legacy/utils/stadium";
import { $before, $effect, $next } from "@common/runtime";
import {
    $lockBall,
    $setBallMoveable,
    $setBallUnmoveable,
    $unlockBall,
} from "@meta/legacy/hooks/physics";
import { t } from "@lingui/core/macro";
import {
    $setFirstDownLine,
    $setLineOfScrimmage,
    $unsetFirstDownLine,
    $unsetLineOfScrimmage,
} from "@meta/legacy/hooks/game";
import { DownState, MAX_DOWNS } from "@meta/legacy/utils/game";
import assert from "node:assert";

const HIKING_DISTANCE_LIMIT = 30;

const DEFAULT_INITIAL_RELATIVE_OFFENSIVE_POSITIONS = {
    start: { x: 150, y: -100 },
    end: { x: 100, y: 100 },
};

const DEFAULT_INITIAL_RELATIVE_DEFENSIVE_POSITIONS = {
    start: { x: -100, y: -100 },
    end: { x: -100, y: 100 },
};

function $setInitialPlayerPositions(
    offensiveTeam: FieldTeam,
    ballPos: Position,
) {
    $effect(($) => {
        distributeOnLine(
            $.getPlayerList()
                .filter((p) => p.team === offensiveTeam)
                .sort((a, b) => a.position.y - b.position.y)
                .map((p) => ({ ...p.position, id: p.id })),
            {
                start: {
                    x:
                        ballPos.x +
                        DEFAULT_INITIAL_RELATIVE_OFFENSIVE_POSITIONS.start.x *
                            (offensiveTeam === Team.RED ? -1 : 1),
                    y: DEFAULT_INITIAL_RELATIVE_OFFENSIVE_POSITIONS.start.y,
                },
                end: {
                    x:
                        ballPos.x +
                        DEFAULT_INITIAL_RELATIVE_OFFENSIVE_POSITIONS.end.x *
                            (offensiveTeam === Team.RED ? -1 : 1),
                    y: DEFAULT_INITIAL_RELATIVE_OFFENSIVE_POSITIONS.end.y,
                },
            },
        ).forEach(({ id, x, y }) => {
            $.setPlayerDiscProperties(id, {
                x,
                y,
            });
        });

        const defensiveTeam = offensiveTeam === Team.RED ? Team.BLUE : Team.RED;

        distributeOnLine(
            $.getPlayerList()
                .filter((p) => p.team === defensiveTeam)
                .sort((a, b) => a.position.y - b.position.y)
                .map((p) => ({ ...p.position, id: p.id })),
            {
                start: {
                    x:
                        ballPos.x +
                        DEFAULT_INITIAL_RELATIVE_DEFENSIVE_POSITIONS.start.x *
                            (offensiveTeam === Team.RED ? -1 : 1),
                    y: DEFAULT_INITIAL_RELATIVE_DEFENSIVE_POSITIONS.start.y,
                },
                end: {
                    x:
                        ballPos.x +
                        DEFAULT_INITIAL_RELATIVE_DEFENSIVE_POSITIONS.end.x *
                            (offensiveTeam === Team.RED ? -1 : 1),
                    y: DEFAULT_INITIAL_RELATIVE_DEFENSIVE_POSITIONS.end.y,
                },
            },
        ).forEach(({ id, x, y }) => {
            $.setPlayerDiscProperties(id, {
                x,
                y,
            });
        });
    });
}

export function Presnap({ downState }: { downState: DownState }) {
    const { offensiveTeam, downAndDistance, fieldPos } = downState;

    assert(
        downAndDistance.down >= 1 &&
            downAndDistance.down <= MAX_DOWNS &&
            downAndDistance.distance >= 0,
        "Invalid down and distance",
    );

    const ballPosWithOffset = calculateSnapBallPosition(
        offensiveTeam,
        fieldPos,
        BALL_OFFSET_YARDS,
    );

    const ballPos = calculateSnapBallPosition(offensiveTeam, fieldPos);

    $setBallUnmoveable();
    $lockBall();
    $setLineOfScrimmage(fieldPos);
    $setFirstDownLine(offensiveTeam, fieldPos, downAndDistance.distance);

    $effect(($) => {
        $.setBall({ ...ballPosWithOffset, xspeed: 0, yspeed: 0 });
    });

    $setInitialPlayerPositions(offensiveTeam, ballPos);

    function getOffensivePlayersBeyondLineOfScrimmage(): GameStatePlayer[] {
        const state = $before();

        return state.players.filter(
            (statePlayer) =>
                statePlayer.team === offensiveTeam &&
                calculateDirectionalGain(
                    offensiveTeam,
                    statePlayer.x - ballPos.x,
                ) > 0,
        );
    }

    function chat(player: GameStatePlayer, message: string) {
        const isHikeCommand = message.toLowerCase().includes("hike");

        if (!isHikeCommand) {
            return;
        }

        if (player.team !== offensiveTeam) {
            return;
        }

        if (
            getDistance(player, ballWithRadius(ballPosWithOffset)) >
            HIKING_DISTANCE_LIMIT
        ) {
            $effect(($) => {
                $.send(t`You are too far from the ball to hike it!`, player.id);
            });

            return;
        }

        const offensivePlayersPastLine =
            getOffensivePlayersBeyondLineOfScrimmage();

        if (offensivePlayersPastLine.length > 0) {
            $effect(($) => {
                $.send(
                    t`You cannot hike while a teammate is beyond the line of scrimmage.`,
                    player.id,
                );
            });

            return;
        }

        $effect(($) => {
            $.send(t`${player.name} hikes the ball!`);
        });

        $next({
            to: "SNAP",
            params: {
                downState,
                quarterbackId: player.id,
            },
        });
    }

    function run(_state: GameState) {
        // TODO: Prehike logic
    }

    function dispose() {
        $setBallMoveable();
        $unlockBall();
        $unsetLineOfScrimmage();
        $unsetFirstDownLine();
    }

    return { run, dispose, chat };
}

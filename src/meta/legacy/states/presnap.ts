import { Team, type FieldTeam } from "@runtime/models";
import type { GameState, GameStatePlayer } from "@runtime/engine";
import { distributeOnLine, getDistance } from "@common/math/geometry";
import { CommandHandleResult, CommandSpec } from "@runtime/commands";
import {
    BALL_OFFSET_YARDS,
    ballWithRadius,
    calculateDirectionalGain,
    calculateSnapBallPosition,
} from "@meta/legacy/utils/stadium";
import { $before, $dispose, $effect, $next } from "@runtime/runtime";
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
import { DownState, MAX_DOWNS } from "@meta/legacy/utils/down";
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
                xspeed: 0,
                yspeed: 0,
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
                xspeed: 0,
                yspeed: 0,
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

    $dispose(() => {
        $setBallMoveable();
        $unlockBall();
        $unsetLineOfScrimmage();
        $unsetFirstDownLine();
    });

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
        const normalizedMessage = message.trim().toLowerCase();
        const isHikeCommand = normalizedMessage.includes("hike");

        if (isHikeCommand) {
            if (player.team !== offensiveTeam) {
                return;
            }

            if (
                getDistance(player, ballWithRadius(ballPosWithOffset)) >
                HIKING_DISTANCE_LIMIT
            ) {
                $effect(($) => {
                    $.send(
                        t`You are too far from the ball to hike it!`,
                        player.id,
                    );
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
    }

    function command(
        player: GameStatePlayer,
        command: CommandSpec,
    ): CommandHandleResult {
        switch (command.name) {
            case "fg": {
                if (player.team !== offensiveTeam) {
                    $effect(($) => {
                        $.send(
                            t`Only the offensive team can attempt a field goal.`,
                            player.id,
                        );
                    });

                    return { handled: true };
                }

                if (
                    getDistance(player, ballWithRadius(ballPosWithOffset)) >
                    HIKING_DISTANCE_LIMIT
                ) {
                    $effect(($) => {
                        $.send(
                            t`You are too far from the ball to attempt a field goal.`,
                            player.id,
                        );
                    });

                    return { handled: true };
                }

                $effect(($) => {
                    $.send(t`${player.name} lines up for a field goal!`);
                });

                $next({
                    to: "FIELD_GOAL",
                    params: { downState, kickerId: player.id },
                });
            }
            case "punt": {
                if (player.team !== offensiveTeam) {
                    $effect(($) => {
                        $.send(
                            t`Only the offensive team can punt the ball.`,
                            player.id,
                        );
                    });

                    return { handled: true };
                }

                if (
                    getDistance(player, ballWithRadius(ballPosWithOffset)) >
                    HIKING_DISTANCE_LIMIT
                ) {
                    $effect(($) => {
                        $.send(
                            t`You are too far from the ball to punt it!`,
                            player.id,
                        );
                    });

                    return { handled: true };
                }

                const offensivePlayersPastLine =
                    getOffensivePlayersBeyondLineOfScrimmage();

                if (offensivePlayersPastLine.length > 0) {
                    $effect(($) => {
                        $.send(
                            t`You cannot punt while a teammate is beyond the line of scrimmage.`,
                            player.id,
                        );
                    });

                    return { handled: true };
                }

                $effect(($) => {
                    $.send(t`${player.name} punts the ball!`);
                });

                $next({
                    to: "PUNT",
                    params: { downState },
                });
            }
            default:
                return { handled: false };
        }
    }

    function run(_state: GameState) {
        // TODO: Prehike logic
    }

    return { run, chat, command };
}

import { type FieldTeam, isFieldTeam } from "@runtime/models";
import type { GameState, GameStatePlayer } from "@runtime/engine";
import { getDistance } from "@common/math/geometry";
import { CommandHandleResult, CommandSpec } from "@runtime/commands";
import {
    BALL_OFFSET_YARDS,
    ballWithRadius,
    calculateDirectionalGain,
    calculateSnapBallPosition,
    isInRedZone,
} from "@meta/legacy/shared/stadium";
import { $before, $dispose, $effect, $next } from "@runtime/runtime";
import {
    $lockBall,
    $setBallMoveable,
    $setBallUnmoveable,
    $unlockBall,
} from "@meta/legacy/hooks/physics";
import { t } from "@lingui/core/macro";
import { cn } from "@meta/legacy/shared/message";
import {
    $setFirstDownLine,
    $setLineOfScrimmage,
    $unsetFirstDownLine,
    $unsetLineOfScrimmage,
} from "@meta/legacy/hooks/game";
import { DownState, MAX_DOWNS } from "@meta/legacy/shared/down";
import assert from "node:assert";
import { $global } from "@meta/legacy/hooks/global";
import {
    buildInitialPlayerPositions,
    type InitialPositioningRelativeLines,
} from "@meta/legacy/shared/initial-positioning";

const HIKING_DISTANCE_LIMIT = 30;

const DEFAULT_INITIAL_RELATIVE_POSITIONS: InitialPositioningRelativeLines = {
    offensive: {
        start: { x: 100, y: -100 },
        end: { x: 100, y: 100 },
    },
    defensive: {
        start: { x: -100, y: -100 },
        end: { x: -100, y: 100 },
    },
};

function $setInitialPlayerPositions(
    offensiveTeam: FieldTeam,
    ballPos: Position,
) {
    const snapProfile = $global().snapProfile;

    $effect(($) => {
        const players = $.getPlayerList().flatMap((player) => {
            if (!isFieldTeam(player.team)) {
                return [];
            }

            return [
                {
                    id: player.id,
                    team: player.team,
                    position: {
                        x: player.position.x,
                        y: player.position.y,
                    },
                },
            ];
        });

        buildInitialPlayerPositions({
            players,
            offensiveTeam,
            ballPos,
            relativeLines: DEFAULT_INITIAL_RELATIVE_POSITIONS,
            snapProfile,
        }).forEach(({ id, x, y }) => {
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
                        t`⚠️ You are too far from the ball to snap it.`,
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
                        t`⚠️ You cannot snap while a teammate is past the LOS.`,
                        player.id,
                    );
                });

                return;
            }

            $effect(($) => {
                $.send(cn(t`🏈 ${player.name} snaps it`, t`ball is live!`));
            });

            $global((state) => state.clearSnapProfile());

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
                            t`⚠️ Only the offense may call for a field goal.`,
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
                            t`⚠️ You are too far from the ball to attempt the field goal.`,
                            player.id,
                        );
                    });

                    return { handled: true };
                }

                $effect(($) => {
                    $.send(t`🥅 ${player.name} sets up for the field goal!`);
                });

                $next({
                    to: "FIELD_GOAL",
                    params: { downState, kickerId: player.id },
                });
            }
            case "punt": {
                if (player.team !== offensiveTeam) {
                    $effect(($) => {
                        $.send(t`⚠️ Only the offense may punt.`, player.id);
                    });

                    return { handled: true };
                }

                if (
                    getDistance(player, ballWithRadius(ballPosWithOffset)) >
                    HIKING_DISTANCE_LIMIT
                ) {
                    $effect(($) => {
                        $.send(
                            t`⚠️ You are too far from the ball to punt.`,
                            player.id,
                        );
                    });

                    return { handled: true };
                }

                if (isInRedZone(offensiveTeam, downState.fieldPos)) {
                    $effect(($) => {
                        $.send(
                            t`⚠️ You cannot punt from the opponent red zone.`,
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
                            t`⚠️ You cannot punt while a teammate is past the LOS.`,
                            player.id,
                        );
                    });

                    return { handled: true };
                }

                $effect(($) => {
                    $.send(t`🦵 ${player.name} punts it away!`);
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

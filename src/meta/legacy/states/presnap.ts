import { type FieldTeam, isFieldTeam } from "@runtime/models";
import type { GameState, GameStatePlayer } from "@runtime/engine";
import { CommandHandleResult, CommandSpec } from "@runtime/commands";
import { getDistance } from "@common/math/geometry";
import {
    BALL_OFFSET_YARDS,
    ballWithRadius,
    calculateDirectionalGain,
    calculateSnapBallPosition,
    isInRedZone,
} from "@meta/legacy/shared/stadium";
import {
    $before,
    $checkpoint,
    $dispose,
    $effect,
    $next,
} from "@runtime/runtime";
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
import { $createSharedCommandHandler } from "@meta/legacy/shared/commands";

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

function isTooFarFromBall(position: Position | undefined, ballPos: Position) {
    return (
        !position ||
        getDistance(position, ballWithRadius(ballPos)) > HIKING_DISTANCE_LIMIT
    );
}

function $setInitialPlayerPositions(
    offensiveTeam: FieldTeam,
    ballPos: Position,
    targetPlayerId?: number,
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

        const initialPlayerPositions = buildInitialPlayerPositions({
            players,
            offensiveTeam,
            ballPos,
            relativeLines: DEFAULT_INITIAL_RELATIVE_POSITIONS,
            snapProfile,
        });

        const playerPositions =
            typeof targetPlayerId === "number"
                ? initialPlayerPositions.filter(
                      ({ id }) => id === targetPlayerId,
                  )
                : initialPlayerPositions;

        playerPositions.forEach(({ id, x, y }) => {
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

    $checkpoint({
        to: "PRESNAP",
        params: { downState },
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

    function join(player: GameStatePlayer) {
        $setInitialPlayerPositions(offensiveTeam, ballPos, player.id);
    }

    function chat(player: PlayerObject, message: string): false | void {
        const normalizedMessage = message.trim().toLowerCase();
        const isHikeCommand = normalizedMessage === "hike";

        if (isHikeCommand) {
            if (player.team !== offensiveTeam) {
                return;
            }

            if (isTooFarFromBall(player.position, ballPosWithOffset)) {
                $effect(($) => {
                    $.send(
                        t`⚠️ You are too far from the ball to snap it.`,
                        player.id,
                    );
                });

                return false;
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

                for (const teammate of offensivePlayersPastLine) {
                    $effect(($) => {
                        $.send({
                            message: t`⚠️ You must get back behind the line of scrimmage to allow the snap!`,
                            to: teammate.id,
                            sound: "notification",
                        });
                    });
                }

                return false;
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
        player: PlayerObject,
        spec: CommandSpec,
    ): CommandHandleResult {
        switch (spec.name) {
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

                if (isTooFarFromBall(player.position, ballPosWithOffset)) {
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

                if (isTooFarFromBall(player.position, ballPosWithOffset)) {
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
            case "reposition": {
                if (!player.admin) {
                    $effect(($) => {
                        $.send(
                            t`⚠️ Only admins can call for repositioning.`,
                            player.id,
                        );
                    });

                    return { handled: true };
                }

                $effect(($) => {
                    $.send(
                        t`📍 ${player.name} repositions the players and ball.`,
                        player.id,
                    );
                });

                $setInitialPlayerPositions(offensiveTeam, ballPos);

                return { handled: true };
            }
            default:
                return $createSharedCommandHandler({
                    options: {
                        undo: true,
                        info: { downState },
                    },
                    player,
                    spec,
                });
        }
    }

    function run(_state: GameState) {
        // TODO: Prehike logic
    }

    return { run, chat, command, join };
}

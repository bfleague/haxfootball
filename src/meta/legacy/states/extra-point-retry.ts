import type { GameState } from "@runtime/engine";
import { $checkpoint, $dispose, $effect, $next, $tick } from "@runtime/runtime";
import { ticks } from "@common/general/time";
import { opposite, type FieldPosition } from "@common/game/game";
import { getDistance } from "@common/math/geometry";
import { type FieldTeam, isFieldTeam } from "@runtime/models";
import { t } from "@lingui/core/macro";
import {
    BALL_OFFSET_YARDS,
    ballWithRadius,
    calculateSnapBallPosition,
} from "@meta/legacy/shared/stadium";
import {
    $setBallActive,
    $setBallInactive,
    $setLineOfScrimmage,
    $unsetFirstDownLine,
    $unsetLineOfScrimmage,
} from "@meta/legacy/hooks/game";
import {
    $setBallMoveable,
    $setBallUnmoveable,
} from "@meta/legacy/hooks/physics";
import {
    buildInitialPlayerPositions,
    type InitialPositioningRelativeLines,
} from "@meta/legacy/shared/initial-positioning";
import { $global } from "@meta/legacy/hooks/global";
import { $createSharedCommandHandler } from "@meta/legacy/shared/commands";
import type { CommandSpec } from "@runtime/commands";
import { COLOR } from "@common/general/color";

const EXTRA_POINT_DECISION_WINDOW = ticks({ seconds: 10 });
const EXTRA_POINT_YARD_LINE = 10;
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
) {
    const { snapProfile } = $global();

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

type ExtraPointRetryFrame = {
    elapsedTicks: number;
};

export function ExtraPointRetry({
    offensiveTeam,
    fieldPos: fieldPosParam,
    defensiveFouls = 0,
}: {
    offensiveTeam: FieldTeam;
    fieldPos?: FieldPosition;
    defensiveFouls?: number;
}) {
    const fieldPos: FieldPosition = fieldPosParam ?? {
        yards: EXTRA_POINT_YARD_LINE,
        side: opposite(offensiveTeam),
    };
    const ballPosWithOffset = calculateSnapBallPosition(
        offensiveTeam,
        fieldPos,
        BALL_OFFSET_YARDS,
    );
    const formationBallPos = calculateSnapBallPosition(offensiveTeam, fieldPos);

    $setLineOfScrimmage(fieldPos);
    $unsetFirstDownLine();
    $setBallActive();
    $setBallUnmoveable();

    $effect(($) => {
        $.setBall({ ...ballPosWithOffset, xspeed: 0, yspeed: 0 });
    });
    $setInitialPlayerPositions(offensiveTeam, formationBallPos);

    $dispose(() => {
        $unsetLineOfScrimmage();
        $unsetFirstDownLine();
        $setBallActive();
        $setBallMoveable();
    });

    $checkpoint({
        to: "EXTRA_POINT_RETRY",
        params: {
            offensiveTeam,
            fieldPos,
            defensiveFouls,
        },
    });

    function chat(player: PlayerObject, message: string) {
        const normalizedMessage = message.trim().toLowerCase();
        const isHikeCommand = normalizedMessage.includes("hike");

        if (!isHikeCommand || player.team !== offensiveTeam) return;

        if (isTooFarFromBall(player.position, ballPosWithOffset)) {
            $effect(($) => {
                $.send({
                    message: t`⚠️ You are too far from the ball to snap it.`,
                    to: player.id,
                    color: COLOR.CRITICAL,
                });
            });

            return;
        }

        $effect(($) => {
            $.send({
                message: t`*️⃣ ${player.name} starts the two-point try!`,
                color: COLOR.ACTION,
            });
        });

        $next({
            to: "EXTRA_POINT_SNAP",
            params: {
                offensiveTeam,
                quarterbackId: player.id,
                fieldPos,
                defensiveFouls,
            },
        });
    }

    function buildFrame(): ExtraPointRetryFrame {
        const { self: elapsedTicks } = $tick();

        return { elapsedTicks };
    }

    function $handleAttemptExpired(frame: ExtraPointRetryFrame) {
        if (frame.elapsedTicks < EXTRA_POINT_DECISION_WINDOW) return;

        $setBallInactive();

        $effect(($) => {
            $.send({ message: t`⏱️ PAT window expired.`, color: COLOR.ALERT });
        });

        $next({
            to: "KICKOFF",
            params: {
                forTeam: offensiveTeam,
            },
            wait: ticks({ seconds: 2 }),
        });
    }

    function command(player: PlayerObject, spec: CommandSpec) {
        return $createSharedCommandHandler({
            options: {
                undo: true,
                info: { stateMessage: t`Extra point` },
            },
            player,
            spec,
        });
    }

    function run(_state: GameState) {
        const frame = buildFrame();
        $handleAttemptExpired(frame);
    }

    return { run, chat, command };
}

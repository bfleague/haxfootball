import type { GameState, GameStatePlayer } from "@runtime/engine";
import { $before, $dispose, $effect, $next } from "@runtime/runtime";
import { ticks } from "@common/general/time";
import { opposite, type FieldPosition } from "@common/game/game";
import { getDistance } from "@common/math/geometry";
import { type FieldTeam, isFieldTeam } from "@runtime/models";
import { t } from "@lingui/core/macro";
import { cn } from "@meta/legacy/utils/message";
import {
    BALL_OFFSET_YARDS,
    ballWithRadius,
    calculateDirectionalGain,
    calculateSnapBallPosition,
    getPositionFromFieldPosition,
} from "@meta/legacy/utils/stadium";
import {
    $setBallActive,
    $setLineOfScrimmage,
    $unsetFirstDownLine,
    $unsetLineOfScrimmage,
} from "@meta/legacy/hooks/game";
import {
    $setBallUnmoveable,
    $setBallMoveable,
} from "@meta/legacy/hooks/physics";
import {
    buildInitialPlayerPositions,
    type InitialPositioningRelativeLines,
} from "@meta/legacy/utils/initial-positioning";
import { $global } from "@meta/legacy/hooks/global";

const LOADING_DURATION = ticks({ seconds: 0.5 });
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

export function ExtraPoint({
    offensiveTeam,
    fieldPos: fieldPosParam,
    defensiveFouls = 0,
    twoPointLocked = false,
    startedAt,
}: {
    offensiveTeam: FieldTeam;
    fieldPos?: FieldPosition;
    defensiveFouls?: number;
    twoPointLocked?: boolean;
    startedAt?: number;
}) {
    const fieldPos: FieldPosition = fieldPosParam ?? {
        yards: EXTRA_POINT_YARD_LINE,
        side: opposite(offensiveTeam),
    };
    const lineOfScrimmageX = getPositionFromFieldPosition(fieldPos);
    const ballPosWithOffset = calculateSnapBallPosition(
        offensiveTeam,
        fieldPos,
        BALL_OFFSET_YARDS,
    );
    const formationBallPos = calculateSnapBallPosition(offensiveTeam, fieldPos);
    const startTick =
        typeof startedAt === "number" ? startedAt : $before().tickNumber;

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

    const getOffensivePlayersBeyondLineOfScrimmage = (): GameStatePlayer[] => {
        const state = $before();

        return state.players.filter(
            (player) =>
                player.team === offensiveTeam &&
                calculateDirectionalGain(
                    offensiveTeam,
                    player.x - lineOfScrimmageX,
                ) > 0,
        );
    };

    function chat(player: GameStatePlayer, message: string) {
        const normalizedMessage = message.trim().toLowerCase();
        const isHikeCommand = normalizedMessage.includes("hike");

        if (!isHikeCommand || player.team !== offensiveTeam) return;

        if (twoPointLocked) {
            $effect(($) => {
                $.send(
                    cn(
                        t`⚠️ Two-point try is no longer available`,
                        t`kick the PAT.`,
                    ),
                    player.id,
                );
            });

            return;
        }

        const offensivePlayersBeyondLine =
            getOffensivePlayersBeyondLineOfScrimmage();

        if (offensivePlayersBeyondLine.length > 0) {
            $effect(($) => {
                $.send(
                    cn(
                        t`❌ Offense crossed the LOS`,
                        t`two-point try is no longer available.`,
                    ),
                    player.id,
                );
            });

            $next({
                to: "EXTRA_POINT",
                params: {
                    offensiveTeam,
                    fieldPos,
                    defensiveFouls,
                    twoPointLocked: true,
                    startedAt: startTick,
                },
            });
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

        $effect(($) => {
            $.send(t`*️⃣ ${player.name} starts the two-point try!`);
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

    type Frame = {
        state: GameState;
        elapsedTicks: number;
        kicker: GameStatePlayer | undefined;
    };

    function buildFrame(state: GameState): Frame {
        const elapsedTicks = state.tickNumber - startTick;
        const kicker = state.players.find(
            (player) => player.team === offensiveTeam && player.isKickingBall,
        );

        return { state, elapsedTicks, kicker };
    }

    function $handleAttemptExpired(frame: Frame) {
        if (frame.elapsedTicks < EXTRA_POINT_DECISION_WINDOW) return;

        $effect(($) => {
            $.send(t`⏱️ PAT window expired.`);
        });

        $next({
            to: "KICKOFF",
            params: {
                forTeam: offensiveTeam,
            },
            wait: ticks({ seconds: 2 }),
        });
    }

    function $handleKick(frame: Frame) {
        if (!frame.kicker) return;

        $next({
            to: "EXTRA_POINT_KICK",
            params: {
                offensiveTeam,
            },
        });
    }

    function $handleEarlyOffenseCrossedLine(frame: Frame) {
        if (twoPointLocked || frame.elapsedTicks >= LOADING_DURATION) return;

        const offensivePlayersBeyondLine = frame.state.players.filter(
            (player) =>
                player.team === offensiveTeam &&
                calculateDirectionalGain(
                    offensiveTeam,
                    player.x - lineOfScrimmageX,
                ) > 0,
        );

        if (offensivePlayersBeyondLine.length === 0) return;

        $effect(($) => {
            $.send(
                cn(
                    t`❌ Offense crossed the LOS`,
                    t`two-point try is no longer available.`,
                ),
            );
        });

        $next({
            to: "EXTRA_POINT",
            params: {
                offensiveTeam,
                fieldPos,
                defensiveFouls,
                twoPointLocked: true,
                startedAt: startTick,
            },
        });
    }

    function run(state: GameState) {
        const frame = buildFrame(state);

        $handleAttemptExpired(frame);
        $handleKick(frame);
        $handleEarlyOffenseCrossedLine(frame);
    }

    return { run, chat };
}

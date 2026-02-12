import type { GameState, GameStatePlayer } from "@runtime/engine";
import { $before, $dispose, $effect, $next } from "@runtime/runtime";
import { ticks } from "@common/general/time";
import { opposite, type FieldPosition } from "@common/game/game";
import { distributeOnLine, getDistance } from "@common/math/geometry";
import { Team, type FieldTeam } from "@runtime/models";
import { t } from "@lingui/core/macro";
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

const LOADING_DURATION = ticks({ seconds: 0.5 });
const EXTRA_POINT_DECISION_WINDOW = ticks({ seconds: 10 });
const EXTRA_POINT_YARD_LINE = 10;
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
                    t`Two-point conversion is no longer available; try the kick.`,
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
                    t`Offense crossed the line of scrimmage; two-point conversion no longer available.`,
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
                $.send(t`You are too far from the ball to hike it!`, player.id);
            });

            return;
        }

        $effect(($) => {
            $.send(t`${player.name} starts a two-point conversion attempt!`);
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

    function run(state: GameState) {
        const elapsedTicks = state.tickNumber - startTick;

        if (elapsedTicks >= EXTRA_POINT_DECISION_WINDOW) {
            $effect(($) => {
                $.send(t`Extra point attempt expired.`);
            });

            $next({
                to: "KICKOFF",
                params: {
                    forTeam: offensiveTeam,
                },
                wait: ticks({ seconds: 2 }),
            });
        }

        const kicker = state.players.find(
            (player) => player.team === offensiveTeam && player.isKickingBall,
        );

        if (kicker) {
            $next({
                to: "EXTRA_POINT_KICK",
                params: {
                    offensiveTeam,
                },
            });
        }

        if (!twoPointLocked && elapsedTicks < LOADING_DURATION) {
            const offensivePlayersBeyondLine = state.players.filter(
                (player) =>
                    player.team === offensiveTeam &&
                    calculateDirectionalGain(
                        offensiveTeam,
                        player.x - lineOfScrimmageX,
                    ) > 0,
            );

            if (offensivePlayersBeyondLine.length) {
                $effect(($) => {
                    $.send(
                        t`Offense crossed the line of scrimmage; two-point conversion no longer available.`,
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
        }
    }

    return { run, chat };
}

import type { GameState } from "@common/engine";
import { ticks } from "@common/utils";
import { $setBallMoveable, $unlockBall } from "@meta/legacy/hooks/physics";
import {
    $hideCrowdingBoxes,
    $setFirstDownLine,
    $setLineOfScrimmage,
    $showCrowdingBoxes,
    $unsetFirstDownLine,
    $unsetLineOfScrimmage,
} from "@meta/legacy/hooks/game";
import {
    applyPenaltyYards,
    CrowdingData,
    DownState,
} from "@meta/legacy/utils/game";
import { $before, $dispose, $effect, $next } from "@common/runtime";
import {
    calculateDirectionalGain,
    getPositionFromFieldPosition,
} from "@meta/legacy/utils/stadium";
import { t } from "@lingui/core/macro";
import { evaluateCrowding, getCrowdingMessage } from "../utils/crowding";

const DEFENSIVE_OFFSIDE_FOUL_PENALTY_YARDS = 5;
const BLITZ_DELAY_TICKS = ticks({ seconds: 12 });
const BLITZ_EARLY_DELAY_TICKS = ticks({ seconds: 3 });
const BLITZ_EARLY_MOVE_DISTANCE = 2;

export function Snap({
    quarterbackId,
    downState,
    crowdingData = { outer: [], inner: [] },
    ballSpawn,
    ballMovedAt,
}: {
    quarterbackId: number;
    downState: DownState;
    crowdingData?: CrowdingData;
    ballSpawn?: Position;
    ballMovedAt?: number | null;
}) {
    const { fieldPos, offensiveTeam, downAndDistance } = downState;

    const beforeState = $before();
    const downStartedAt = beforeState.tickNumber;
    const defaultBlitzAllowedAt = downStartedAt + BLITZ_DELAY_TICKS;
    const snapBallSpawn = ballSpawn ?? {
        x: beforeState.ball.x,
        y: beforeState.ball.y,
    };
    const recordedBallMovedAt =
        typeof ballMovedAt === "number" ? ballMovedAt : null;

    $setBallMoveable();
    $unlockBall();
    $setLineOfScrimmage(fieldPos);
    $setFirstDownLine(offensiveTeam, fieldPos, downAndDistance.distance);

    function run(state: GameState) {
        const quarterback = state.players.find((p) => p.id === quarterbackId);
        if (!quarterback) return;

        const canRecordBallMove =
            !quarterback.isKickingBall &&
            recordedBallMovedAt === null &&
            state.tickNumber < defaultBlitzAllowedAt;

        const movedDistance = canRecordBallMove
            ? Math.hypot(
                  state.ball.x - snapBallSpawn.x,
                  state.ball.y - snapBallSpawn.y,
              )
            : 0;

        const nextBallMovedAt =
            canRecordBallMove && movedDistance > BLITZ_EARLY_MOVE_DISTANCE
                ? state.tickNumber
                : recordedBallMovedAt;

        const blitzAllowedAt =
            nextBallMovedAt === null
                ? defaultBlitzAllowedAt
                : Math.min(
                      defaultBlitzAllowedAt,
                      nextBallMovedAt + BLITZ_EARLY_DELAY_TICKS,
                  );

        const blitzAllowed = state.tickNumber >= blitzAllowedAt;

        const lineOfScrimmageX = getPositionFromFieldPosition(fieldPos);

        const defensivePlayers = state.players.filter(
            (player) => player.team !== offensiveTeam,
        );

        const defensiveCrossedLine = defensivePlayers.some(
            (player) =>
                calculateDirectionalGain(
                    offensiveTeam,
                    player.x - lineOfScrimmageX,
                ) < 0,
        );

        const quarterbackCrossedLine =
            calculateDirectionalGain(
                offensiveTeam,
                quarterback.x - lineOfScrimmageX,
            ) > 0;

        if (!blitzAllowed && defensiveCrossedLine) {
            $effect(($) => {
                $.send(t`Defensive offside, 5 yard penalty.`);
            });

            $next({
                to: "PRESNAP",
                params: {
                    downState: applyPenaltyYards(
                        downState,
                        DEFENSIVE_OFFSIDE_FOUL_PENALTY_YARDS,
                    ),
                },
            });
        }

        const crowding = blitzAllowed
            ? null
            : evaluateCrowding({
                  state,
                  quarterbackId,
                  downState,
                  crowdingData,
              });

        if (crowding && crowding.hasFoul) {
            $showCrowdingBoxes(offensiveTeam, fieldPos);

            $effect(($) => {
                $.pauseGame(true);
                $.pauseGame(false);
                $.send(getCrowdingMessage(crowding.foulInfo));
            });

            $dispose(() => {
                $hideCrowdingBoxes();
            });

            $next({
                to: "PRESNAP",
                params: { downState: crowding.nextDownState },
                disposal: "AFTER_RESUME",
            });
        }

        if (quarterback.isKickingBall) {
            $effect(($) => {
                $.stat("SNAP_KICKED_BALL");
            });

            $next({
                to: "SNAP_IN_FLIGHT",
                params: { downState },
            });
        }

        if (blitzAllowed && quarterbackCrossedLine) {
            $effect(($) => {
                $.send(
                    t`Quarterback has crossed the line of scrimmage, starting quarterback run.`,
                );
            });

            $next({
                to: "QUARTERBACK_RUN",
                params: {
                    playerId: quarterbackId,
                    downState,
                },
            });
        }

        if (blitzAllowed && defensiveCrossedLine) {
            $next({
                to: "BLITZ",
                params: {
                    downState,
                    quarterbackId,
                },
            });
        }

        const shouldUpdateSnap =
            crowding?.shouldUpdate || nextBallMovedAt !== recordedBallMovedAt;

        if (shouldUpdateSnap) {
            $next({
                to: "SNAP",
                params: {
                    downState,
                    quarterbackId,
                    crowdingData: crowding
                        ? crowding.updatedCrowdingData
                        : crowdingData,
                    ballSpawn: snapBallSpawn,
                    ballMovedAt: nextBallMovedAt,
                },
            });
        }
    }

    function dispose() {
        $unsetLineOfScrimmage();
        $unsetFirstDownLine();
        $hideCrowdingBoxes();
    }

    return { run, dispose };
}

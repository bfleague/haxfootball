import type { GameState } from "@common/engine";
import { getDistance, ticks } from "@common/utils";
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
    CrowdingData,
    CrowdingEntry,
    DISTANCE_TO_FIRST_DOWN,
    DownState,
    FIRST_DOWN,
} from "@meta/legacy/utils/game";
import { $before, $dispose, $effect, $next } from "@common/runtime";
import {
    calculateYardsGained,
    calculateDirectionalGain,
    calculateSnapBallPosition,
    getFieldPosition,
    getPositionFromFieldPosition,
    isInCrowdingArea,
    isInInnerCrowdingArea,
} from "@meta/legacy/utils/stadium";
import { t } from "@lingui/core/macro";

const CROWDING_OUTER_FOUL_TICKS = ticks({ seconds: 3 });
const CROWDING_INNER_WEIGHT = 5;
const CROWDING_GRACE_TICKS = ticks({ seconds: 1 });
const CROWDING_BLOCK_DISTANCE = 15;
const DEFENSIVE_OFFSIDE_FOUL_PENALTY_YARDS = 5;
const CROWDING_PENALTY_YARDS = 5;
const CROWDING_TICKS_PER_SECOND = ticks({ seconds: 1 });
const BLITZ_DELAY_TICKS = ticks({ seconds: 12 });
const BLITZ_EARLY_DELAY_TICKS = ticks({ seconds: 3 });
const BLITZ_EARLY_MOVE_DISTANCE = 2;

export type CrowdingFoulContribution = {
    playerId: number;
    weightedTicks: number;
};

export type CrowdingFoulInfo = {
    contributions: CrowdingFoulContribution[];
    players: Array<{ id: number; name: string }>;
};

type CrowdingEvaluation =
    | {
          updatedCrowdingData: CrowdingData;
          shouldUpdate: boolean;
          hasFoul: true;
          foulInfo: CrowdingFoulInfo;
          nextDownState: DownState;
      }
    | {
          updatedCrowdingData: CrowdingData;
          shouldUpdate: boolean;
          hasFoul: false;
          foulInfo: null;
          nextDownState: null;
      };

const emptyCrowdingData = (startedAt?: number): CrowdingData =>
    startedAt === undefined
        ? { outer: [], inner: [] }
        : { outer: [], inner: [], startedAt };

const updateCrowdingEntries = (
    entries: CrowdingEntry[],
    playerIds: number[],
    tick: number,
): CrowdingEntry[] => {
    const hasOpenEntry = (playerId: number) =>
        entries.some(
            (entry) =>
                entry.playerId === playerId && entry.endedAt === undefined,
        );

    const closedEntries = entries.map((entry) => {
        if (entry.endedAt !== undefined) return entry;

        return playerIds.includes(entry.playerId)
            ? entry
            : { ...entry, endedAt: tick };
    });

    const newEntries = playerIds
        .filter((playerId) => !hasOpenEntry(playerId))
        .map((playerId) => ({ playerId, startedAt: tick }));

    return [...closedEntries, ...newEntries];
};

const getEntryDuration = (
    entry: CrowdingEntry,
    tick: number,
    minStartAt: number,
) =>
    Math.max(
        0,
        (entry.endedAt ?? tick) - Math.max(entry.startedAt, minStartAt),
    );

const unique = (values: number[]) =>
    values.filter((value, index, list) => list.indexOf(value) === index);

const sumEntryTicksForPlayer = (
    entries: CrowdingEntry[],
    playerId: number,
    tick: number,
    minStartAt: number,
) =>
    entries
        .filter((entry) => entry.playerId === playerId)
        .map((entry) => getEntryDuration(entry, tick, minStartAt))
        .reduce((total, value) => total + value, 0);

const getCrowdingContributions = (
    data: CrowdingData,
    tick: number,
    minStartAt: number,
): Array<{ playerId: number; weightedTicks: number }> => {
    const playerIds = unique([
        ...data.outer.map((entry) => entry.playerId),
        ...data.inner.map((entry) => entry.playerId),
    ]);

    return playerIds
        .map((playerId) => {
            const outerTicks = sumEntryTicksForPlayer(
                data.outer,
                playerId,
                tick,
                minStartAt,
            );
            const innerTicks = sumEntryTicksForPlayer(
                data.inner,
                playerId,
                tick,
                minStartAt,
            );
            const weightedTicks =
                outerTicks + innerTicks * CROWDING_INNER_WEIGHT;

            return { playerId, weightedTicks };
        })
        .filter((entry) => entry.weightedTicks > 0);
};

const sameEntry = (left: CrowdingEntry, right: CrowdingEntry) =>
    left.playerId === right.playerId &&
    left.startedAt === right.startedAt &&
    left.endedAt === right.endedAt;

const sameEntries = (left: CrowdingEntry[], right: CrowdingEntry[]) =>
    left.length === right.length &&
    left.every((entry, index) => {
        const other = right[index];
        return other ? sameEntry(entry, other) : false;
    });

const sameCrowdingData = (left: CrowdingData, right: CrowdingData) =>
    left.startedAt === right.startedAt &&
    sameEntries(left.outer, right.outer) &&
    sameEntries(left.inner, right.inner);

const applyDefensiveCrowdingPenalty = (
    downState: DownState,
    yards: number,
): DownState => {
    const { offensiveTeam, fieldPos, downAndDistance } = downState;
    const penaltyFieldPos = getFieldPosition(
        calculateSnapBallPosition(offensiveTeam, fieldPos, -yards).x,
    );
    const yardsGained = calculateYardsGained(
        offensiveTeam,
        fieldPos,
        penaltyFieldPos,
    );
    const newDistance = downAndDistance.distance - yardsGained;

    if (newDistance <= 0) {
        return {
            offensiveTeam,
            fieldPos: penaltyFieldPos,
            downAndDistance: {
                down: FIRST_DOWN,
                distance: DISTANCE_TO_FIRST_DOWN,
            },
        };
    }

    return {
        offensiveTeam,
        fieldPos: penaltyFieldPos,
        downAndDistance: {
            down: downAndDistance.down,
            distance: newDistance,
        },
    };
};

const evaluateCrowding = ({
    state,
    quarterbackId,
    downState,
    crowdingData,
}: {
    state: GameState;
    quarterbackId: number;
    downState: DownState;
    crowdingData: CrowdingData;
}): CrowdingEvaluation => {
    const { offensiveTeam, fieldPos } = downState;
    const startedAt = crowdingData.startedAt ?? state.tickNumber;
    const graceEndsAt = startedAt + CROWDING_GRACE_TICKS;

    const nonQuarterbacks = state.players.filter(
        (player) => player.id !== quarterbackId,
    );
    const offensivePlayers = nonQuarterbacks.filter(
        (player) => player.team === offensiveTeam,
    );
    const defensivePlayers = nonQuarterbacks.filter(
        (player) => player.team !== offensiveTeam,
    );

    const offensiveInCrowding = offensivePlayers.some((player) =>
        isInCrowdingArea(player, offensiveTeam, fieldPos),
    );

    const defensiveStatuses = defensivePlayers.map((player) => {
        const blockDistance =
            player.radius > 0 ? player.radius : CROWDING_BLOCK_DISTANCE;
        const isBlocked = offensivePlayers.some(
            (offensivePlayer) =>
                getDistance(offensivePlayer, player) <= blockDistance,
        );
        const inInner =
            !isBlocked &&
            isInInnerCrowdingArea(player, offensiveTeam, fieldPos);
        const inCrowding =
            !isBlocked &&
            (inInner || isInCrowdingArea(player, offensiveTeam, fieldPos));

        return { player, inInner, inCrowding };
    });

    const defensiveInnerIds = defensiveStatuses
        .filter((status) => status.inInner)
        .map((status) => status.player.id);

    const defensiveOuterIds = defensiveStatuses
        .filter((status) => status.inCrowding && !status.inInner)
        .map((status) => status.player.id);

    const defensiveInCrowding = defensiveStatuses.some(
        (status) => status.inCrowding,
    );

    const shouldResetCrowding = offensiveInCrowding || !defensiveInCrowding;

    const updatedCrowdingData = shouldResetCrowding
        ? emptyCrowdingData(startedAt)
        : {
              outer: updateCrowdingEntries(
                  crowdingData.outer,
                  defensiveOuterIds,
                  state.tickNumber,
              ),
              inner: updateCrowdingEntries(
                  crowdingData.inner,
                  defensiveInnerIds,
                  state.tickNumber,
              ),
              startedAt: startedAt,
          };

    const contributions = shouldResetCrowding
        ? []
        : getCrowdingContributions(
              updatedCrowdingData,
              state.tickNumber,
              graceEndsAt,
          );

    const totalWeightedTicks = contributions.reduce(
        (total, entry) => total + entry.weightedTicks,
        0,
    );

    const isFoul =
        !shouldResetCrowding && totalWeightedTicks >= CROWDING_OUTER_FOUL_TICKS;

    const shouldUpdate = !sameCrowdingData(crowdingData, updatedCrowdingData);

    const base = {
        updatedCrowdingData,
        shouldUpdate,
    };

    return isFoul
        ? {
              ...base,
              hasFoul: true,
              foulInfo: { contributions, players: state.players },
              nextDownState: applyDefensiveCrowdingPenalty(
                  downState,
                  CROWDING_PENALTY_YARDS,
              ),
          }
        : {
              ...base,
              hasFoul: false,
              foulInfo: null,
              nextDownState: null,
          };
};

export function $sendCrowdingFoul(info: CrowdingFoulInfo) {
    const offenderDetails = info.contributions
        .filter((entry) => entry.weightedTicks > 0)
        .map(({ playerId, weightedTicks }) => {
            const playerName =
                info.players.find((player) => player.id === playerId)?.name ??
                "Unknown";
            const seconds = (weightedTicks / CROWDING_TICKS_PER_SECOND).toFixed(
                1,
            );
            return `${playerName}: ${seconds}s`;
        })
        .join(", ");

    const message =
        offenderDetails.length > 0
            ? t`Defensive crowding foul (${offenderDetails}), 5 yard penalty and loss of down.`
            : t`Defensive crowding foul, 5 yard penalty and loss of down.`;

    $effect(($) => {
        $.send(message);
    });
}

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
                    downState: applyDefensiveCrowdingPenalty(
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
            });

            $dispose(() => {
                $hideCrowdingBoxes();
            });

            $sendCrowdingFoul(crowding.foulInfo);

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

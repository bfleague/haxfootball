import type { GameState } from "@common/engine";
import {
    AVATARS,
    findBallCatchers,
    findCatchers,
    getDistance,
    ticks,
} from "@common/utils";
import { $setBallMoveable, $unlockBall } from "@meta/legacy/hooks/physics";
import {
    $hideCrowdingBoxes,
    $setFirstDownLine,
    $setLineOfScrimmage,
    $showCrowdingBoxes,
    $unsetFirstDownLine,
    $unsetLineOfScrimmage,
} from "@meta/legacy/hooks/game";
import { DownState } from "@meta/legacy/utils/down";
import { cn } from "@meta/legacy/utils/message";
import {
    applyDefensivePenalty,
    applyOffensivePenalty,
    processDefensivePenaltyEvent,
    processOffensivePenalty,
} from "@meta/legacy/utils/penalty";
import { SCORES } from "@meta/legacy/utils/scoring";
import { $before, $dispose, $effect, $next } from "@common/runtime";
import {
    calculateDirectionalGain,
    getPositionFromFieldPosition,
    isInCrowdingArea,
    isInInnerCrowdingArea,
    isOutOfBounds,
} from "@meta/legacy/utils/stadium";
import { $global } from "@meta/legacy/hooks/global";
import { t } from "@lingui/core/macro";

const CROWDING_OUTER_FOUL_TICKS = ticks({ seconds: 3 });
const CROWDING_INNER_WEIGHT = 5;
const CROWDING_GRACE_TICKS = ticks({ seconds: 1 });
const DEFAULT_CROWDING_BLOCK_DISTANCE = 15;
const CROWDING_PENALTY_YARDS = 5;
const CROWDING_TICKS_PER_SECOND = ticks({ seconds: 1 });

export type CrowdingEntry = {
    playerId: number;
    startedAt: number;
    endedAt?: number;
};

export type CrowdingData = {
    outer: CrowdingEntry[];
    inner: CrowdingEntry[];
    startedAt?: number;
};

type CrowdingPlayer = GameState["players"][number];

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

type DefenderCrowdingState = {
    id: number;
    inInner: boolean;
    inCrowding: boolean;
};

const createEmptyCrowdingData = (startedAt?: number): CrowdingData =>
    startedAt === undefined
        ? { outer: [], inner: [] }
        : { outer: [], inner: [], startedAt };

const updateCrowdingIntervals = (
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

const getCrowdingEntryDurationTicks = (
    entry: CrowdingEntry,
    tick: number,
    minStartAt: number,
) =>
    Math.max(
        0,
        (entry.endedAt ?? tick) - Math.max(entry.startedAt, minStartAt),
    );

const uniqueNumbers = (values: number[]) =>
    values.filter((value, index, list) => list.indexOf(value) === index);

const setPlayerAvatars = (
    playerIds: number[],
    setAvatar: (playerId: number, avatar: string | null) => void,
    avatar: string | null,
) => {
    playerIds.forEach((playerId) => {
        setAvatar(playerId, avatar);
    });
};

const sumPlayerCrowdingTicks = (
    entries: CrowdingEntry[],
    playerId: number,
    tick: number,
    minStartAt: number,
) =>
    entries
        .filter((entry) => entry.playerId === playerId)
        .map((entry) => getCrowdingEntryDurationTicks(entry, tick, minStartAt))
        .reduce((total, value) => total + value, 0);

const buildCrowdingFoulContributions = (
    data: CrowdingData,
    tick: number,
    minStartAt: number,
): Array<{ playerId: number; weightedTicks: number }> => {
    const playerIds = uniqueNumbers([
        ...data.outer.map((entry) => entry.playerId),
        ...data.inner.map((entry) => entry.playerId),
    ]);

    return playerIds
        .map((playerId) => {
            const outerTicks = sumPlayerCrowdingTicks(
                data.outer,
                playerId,
                tick,
                minStartAt,
            );
            const innerTicks = sumPlayerCrowdingTicks(
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

const getCrowdingDefenderBlockDistance = (player: CrowdingPlayer) =>
    player.radius > 0 ? player.radius : DEFAULT_CROWDING_BLOCK_DISTANCE;

const isCrowdingDefenderBlocked = (
    defensivePlayer: CrowdingPlayer,
    offensivePlayers: CrowdingPlayer[],
) =>
    offensivePlayers.some(
        (offensivePlayer) =>
            getDistance(offensivePlayer, defensivePlayer) <=
            getCrowdingDefenderBlockDistance(defensivePlayer),
    );

const getDefenderCrowdingState = (
    player: CrowdingPlayer,
    offensivePlayers: CrowdingPlayer[],
    offensiveTeam: DownState["offensiveTeam"],
    fieldPos: DownState["fieldPos"],
): DefenderCrowdingState => {
    const isBlocked = isCrowdingDefenderBlocked(player, offensivePlayers);
    const inInner =
        !isBlocked && isInInnerCrowdingArea(player, offensiveTeam, fieldPos);
    const inCrowding =
        !isBlocked &&
        (inInner || isInCrowdingArea(player, offensiveTeam, fieldPos));

    return { id: player.id, inInner, inCrowding };
};

const sameCrowdingEntry = (left: CrowdingEntry, right: CrowdingEntry) =>
    left.playerId === right.playerId &&
    left.startedAt === right.startedAt &&
    left.endedAt === right.endedAt;

const sameCrowdingEntries = (left: CrowdingEntry[], right: CrowdingEntry[]) =>
    left.length === right.length &&
    left.every((entry, index) => {
        const other = right[index];
        return other ? sameCrowdingEntry(entry, other) : false;
    });

const sameCrowdingData = (left: CrowdingData, right: CrowdingData) =>
    left.startedAt === right.startedAt &&
    sameCrowdingEntries(left.outer, right.outer) &&
    sameCrowdingEntries(left.inner, right.inner);

export const evaluateCrowding = ({
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
    const crowdingWindowStartTick = crowdingData.startedAt ?? state.tickNumber;
    const graceWindowEndsAtTick =
        crowdingWindowStartTick + CROWDING_GRACE_TICKS;

    const nonQuarterbacks = state.players.filter(
        (player) => player.id !== quarterbackId,
    );
    const offensePlayers = nonQuarterbacks.filter(
        (player) => player.team === offensiveTeam,
    );
    const defensePlayers = nonQuarterbacks.filter(
        (player) => player.team !== offensiveTeam,
    );

    const offenseInCrowdingArea = offensePlayers.some((player) =>
        isInCrowdingArea(player, offensiveTeam, fieldPos),
    );

    const defenderCrowdingStates = defensePlayers.map((player) =>
        getDefenderCrowdingState(
            player,
            offensePlayers,
            offensiveTeam,
            fieldPos,
        ),
    );

    const innerZoneDefenderIds = defenderCrowdingStates
        .filter((status) => status.inInner)
        .map((status) => status.id);

    const outerZoneDefenderIds = defenderCrowdingStates
        .filter((status) => status.inCrowding && !status.inInner)
        .map((status) => status.id);

    const hasDefenderInCrowdingZone = defenderCrowdingStates.some(
        (status) => status.inCrowding,
    );

    const shouldRestartCrowdingWindow =
        offenseInCrowdingArea || !hasDefenderInCrowdingZone;

    const updatedCrowdingData = shouldRestartCrowdingWindow
        ? createEmptyCrowdingData(crowdingWindowStartTick)
        : {
              outer: updateCrowdingIntervals(
                  crowdingData.outer,
                  outerZoneDefenderIds,
                  state.tickNumber,
              ),
              inner: updateCrowdingIntervals(
                  crowdingData.inner,
                  innerZoneDefenderIds,
                  state.tickNumber,
              ),
              startedAt: crowdingWindowStartTick,
          };

    const crowdingFoulContributions = shouldRestartCrowdingWindow
        ? []
        : buildCrowdingFoulContributions(
              updatedCrowdingData,
              state.tickNumber,
              graceWindowEndsAtTick,
          );

    const totalWeightedCrowdingFoulTicks = crowdingFoulContributions.reduce(
        (total, entry) => total + entry.weightedTicks,
        0,
    );

    const isCrowdingFoul =
        !shouldRestartCrowdingWindow &&
        totalWeightedCrowdingFoulTicks >= CROWDING_OUTER_FOUL_TICKS;

    const shouldRefreshCrowdingData = !sameCrowdingData(
        crowdingData,
        updatedCrowdingData,
    );

    const evaluationBase = {
        updatedCrowdingData,
        shouldUpdate: shouldRefreshCrowdingData,
    };

    return isCrowdingFoul
        ? {
              ...evaluationBase,
              hasFoul: true,
              foulInfo: {
                  contributions: crowdingFoulContributions,
                  players: state.players,
              },
              nextDownState: applyDefensivePenalty(
                  downState,
                  CROWDING_PENALTY_YARDS,
              ).downState,
          }
        : {
              ...evaluationBase,
              hasFoul: false,
              foulInfo: null,
              nextDownState: null,
          };
};

export function getCrowdingMessage(info: CrowdingFoulInfo) {
    const offenderSummaryText = info.contributions
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

    return offenderSummaryText.length > 0
        ? t`Defensive crowding foul (${offenderSummaryText}), 5 yard penalty.`
        : t`Defensive crowding foul, 5 yard penalty.`;
}

const DEFENSIVE_OFFSIDE_PENALTY_YARDS = 5;
const DEFENSIVE_TOUCHING_PENALTY_YARDS = 5;
const OFFENSIVE_FOUL_PENALTY_YARDS = 5;
const BLITZ_BASE_DELAY_TICKS = ticks({ seconds: 12 });
const BLITZ_EARLY_DELAY_TICKS = ticks({ seconds: 3 });
const BLITZ_EARLY_MOVE_THRESHOLD_PX = 2;

export function Snap({
    quarterbackId,
    downState,
    crowdingData = { outer: [], inner: [] },
    ballMovedAt: _ballMovedAt,
}: {
    quarterbackId: number;
    downState: DownState;
    crowdingData?: CrowdingData;
    ballMovedAt?: number | null;
}) {
    const { fieldPos, offensiveTeam, downAndDistance } = downState;

    const beforeState = $before();
    const downStartTick = beforeState.tickNumber;
    const defaultBlitzAllowedTick = downStartTick + BLITZ_BASE_DELAY_TICKS;
    const ballMovedAt = typeof _ballMovedAt === "number" ? _ballMovedAt : null;
    const ballSpawnPosition = {
        x: beforeState.ball.x,
        y: beforeState.ball.y,
    };

    const isBallBeyondMoveThreshold = (ball: { x: number; y: number }) =>
        Math.hypot(ball.x - ballSpawnPosition.x, ball.y - ballSpawnPosition.y) >
        BLITZ_EARLY_MOVE_THRESHOLD_PX;

    $setBallMoveable();
    $unlockBall();
    $setLineOfScrimmage(fieldPos);
    $setFirstDownLine(offensiveTeam, fieldPos, downAndDistance.distance);

    function run(state: GameState) {
        const quarterback = state.players.find((p) => p.id === quarterbackId);
        if (!quarterback) return;

        const shouldRecordBallMoveTick =
            !quarterback.isKickingBall &&
            ballMovedAt === null &&
            state.tickNumber < defaultBlitzAllowedTick;

        const didBallExceedMoveThreshold =
            shouldRecordBallMoveTick && isBallBeyondMoveThreshold(state.ball);

        const nextBallMoveTick = didBallExceedMoveThreshold
            ? state.tickNumber
            : ballMovedAt;

        const blitzAllowedTick =
            nextBallMoveTick === null
                ? defaultBlitzAllowedTick
                : Math.min(
                      defaultBlitzAllowedTick,
                      nextBallMoveTick + BLITZ_EARLY_DELAY_TICKS,
                  );

        const isBlitzAllowed = state.tickNumber >= blitzAllowedTick;

        const lineOfScrimmageX = getPositionFromFieldPosition(fieldPos);

        const defenders = state.players.filter(
            (player) => player.team !== offensiveTeam,
        );

        const offensivePlayers = state.players.filter(
            (player) =>
                player.team === offensiveTeam && player.id !== quarterbackId,
        );

        const offsideDefender = defenders.find(
            (player) =>
                calculateDirectionalGain(
                    offensiveTeam,
                    player.x - lineOfScrimmageX,
                ) < 0,
        );
        const defenseCrossedLineOfScrimmage = !!offsideDefender;

        const quarterbackCrossedLineOfScrimmage =
            calculateDirectionalGain(
                offensiveTeam,
                quarterback.x - lineOfScrimmageX,
            ) > 0;

        const ballDirectionalGain = calculateDirectionalGain(
            offensiveTeam,
            state.ball.x - lineOfScrimmageX,
        );
        const ballBeyondLineOfScrimmage = ballDirectionalGain > 0;
        const ballBehindLineOfScrimmage = ballDirectionalGain < 0;

        if (!isBlitzAllowed && defenseCrossedLineOfScrimmage) {
            const penaltyResult = applyDefensivePenalty(
                downState,
                DEFENSIVE_OFFSIDE_PENALTY_YARDS,
            );

            processDefensivePenaltyEvent({
                event: penaltyResult.event,
                onSameDown() {
                    $effect(($) => {
                        $.send(
                            cn(
                                penaltyResult.downState,
                                t`Defensive offside, 5 yard penalty.`,
                            ),
                        );
                    });
                    $next({
                        to: "PRESNAP",
                        params: {
                            downState: penaltyResult.downState,
                        },
                    });
                },
                onFirstDown() {
                    $effect(($) => {
                        $.send(
                            cn(
                                penaltyResult.downState,
                                t`Defensive offside, 5 yard penalty and automatic first down.`,
                            ),
                        );
                    });
                    $next({
                        to: "PRESNAP",
                        params: {
                            downState: penaltyResult.downState,
                        },
                    });
                },
                onTouchdown() {
                    const offsideDefenderId = offsideDefender?.id;

                    $global((state) =>
                        state.incrementScore(offensiveTeam, SCORES.TOUCHDOWN),
                    );

                    $effect(($) => {
                        $.send(
                            cn(
                                penaltyResult.downState,
                                t`Defensive offside, 5 yard penalty and automatic touchdown.`,
                            ),
                        );

                        if (offsideDefenderId !== undefined) {
                            $.setAvatar(offsideDefenderId, AVATARS.CLOWN);
                        }
                    });

                    if (offsideDefenderId !== undefined) {
                        $dispose(() => {
                            $effect(($) => {
                                $.setAvatar(offsideDefenderId, null);
                            });
                        });
                    }

                    $next({
                        to: "KICKOFF",
                        params: {
                            forTeam: offensiveTeam,
                        },
                        wait: ticks({ seconds: 3 }),
                    });
                },
            });
        }

        const crowdingResult = isBlitzAllowed
            ? null
            : evaluateCrowding({
                  state,
                  quarterbackId,
                  downState,
                  crowdingData,
              });

        if (crowdingResult && crowdingResult.hasFoul) {
            const penaltyResult = applyDefensivePenalty(
                downState,
                CROWDING_PENALTY_YARDS,
            );

            const baseMessage = getCrowdingMessage(crowdingResult.foulInfo);

            const crowdingOffenderIds = uniqueNumbers(
                crowdingResult.foulInfo.contributions
                    .filter((entry) => entry.weightedTicks > 0)
                    .map((entry) => entry.playerId),
            );

            const hasCrowdingOffenders = crowdingOffenderIds.length > 0;

            $showCrowdingBoxes(offensiveTeam, fieldPos);

            $dispose(() => {
                $hideCrowdingBoxes();
            });

            processDefensivePenaltyEvent({
                event: penaltyResult.event,
                onSameDown() {
                    $effect(($) => {
                        $.pauseGame(true);
                        $.pauseGame(false);
                        $.send(cn(penaltyResult.downState, baseMessage));
                    });
                    $next({
                        to: "PRESNAP",
                        params: { downState: penaltyResult.downState },
                        disposal: "AFTER_RESUME",
                    });
                },
                onFirstDown() {
                    $effect(($) => {
                        $.pauseGame(true);
                        $.pauseGame(false);
                        $.send(
                            cn(
                                penaltyResult.downState,
                                `${baseMessage} ${t`Automatic first down.`}`,
                            ),
                        );
                    });
                    $next({
                        to: "PRESNAP",
                        params: { downState: penaltyResult.downState },
                        disposal: "AFTER_RESUME",
                    });
                },
                onTouchdown() {
                    $global((state) =>
                        state.incrementScore(offensiveTeam, SCORES.TOUCHDOWN),
                    );
                    $effect(($) => {
                        $.send(
                            cn(
                                penaltyResult.downState,
                                `${baseMessage} ${t`Automatic touchdown.`}`,
                            ),
                        );

                        if (hasCrowdingOffenders) {
                            setPlayerAvatars(
                                crowdingOffenderIds,
                                $.setAvatar,
                                AVATARS.CLOWN,
                            );
                        }
                    });

                    if (hasCrowdingOffenders) {
                        $dispose(() => {
                            $effect(($) => {
                                setPlayerAvatars(
                                    crowdingOffenderIds,
                                    $.setAvatar,
                                    null,
                                );
                            });
                        });
                    }

                    $next({
                        to: "KICKOFF",
                        params: {
                            forTeam: offensiveTeam,
                        },
                        wait: ticks({ seconds: 3 }),
                    });
                },
            });
        }

        const defensiveTouchers = findBallCatchers(state.ball, defenders);

        if (defensiveTouchers.length > 0) {
            const offenderNames = defensiveTouchers
                .map((player) => player.name)
                .join(", ");

            const baseMessage =
                offenderNames.length > 0
                    ? t`Defensive illegal touching by ${offenderNames}, 5 yard penalty.`
                    : t`Defensive illegal touching, 5 yard penalty.`;

            const penaltyResult = applyDefensivePenalty(
                downState,
                DEFENSIVE_TOUCHING_PENALTY_YARDS,
            );

            const defensiveToucherIds = defensiveTouchers.map(
                (player) => player.id,
            );

            const hasDefensiveTouchers = defensiveToucherIds.length > 0;

            processDefensivePenaltyEvent({
                event: penaltyResult.event,
                onSameDown() {
                    $effect(($) => {
                        $.send(cn(penaltyResult.downState, baseMessage));
                    });
                    $next({
                        to: "PRESNAP",
                        params: {
                            downState: penaltyResult.downState,
                        },
                    });
                },
                onFirstDown() {
                    $effect(($) => {
                        $.send(
                            cn(
                                penaltyResult.downState,
                                offenderNames.length > 0
                                    ? t`Defensive illegal touching by ${offenderNames}, 5 yard penalty and automatic first down.`
                                    : t`Defensive illegal touching, 5 yard penalty and automatic first down.`,
                            ),
                        );
                    });
                    $next({
                        to: "PRESNAP",
                        params: {
                            downState: penaltyResult.downState,
                        },
                    });
                },
                onTouchdown() {
                    $global((state) =>
                        state.incrementScore(offensiveTeam, SCORES.TOUCHDOWN),
                    );
                    $effect(($) => {
                        $.send(
                            cn(
                                penaltyResult.downState,
                                `${baseMessage} ${t`Automatic touchdown.`}`,
                            ),
                        );
                        if (hasDefensiveTouchers) {
                            setPlayerAvatars(
                                defensiveToucherIds,
                                $.setAvatar,
                                AVATARS.CLOWN,
                            );
                        }
                    });

                    if (hasDefensiveTouchers) {
                        $dispose(() => {
                            $effect(($) => {
                                setPlayerAvatars(
                                    defensiveToucherIds,
                                    $.setAvatar,
                                    null,
                                );
                            });
                        });
                    }

                    $next({
                        to: "KICKOFF",
                        params: {
                            forTeam: offensiveTeam,
                        },
                        wait: ticks({ seconds: 3 }),
                    });
                },
            });
        }

        if (!quarterback.isKickingBall) {
            const offensiveTouchers = findCatchers(
                quarterback,
                offensivePlayers,
            );

            if (offensiveTouchers.length > 0 && offensiveTouchers[0]) {
                const runner = offensiveTouchers[0];

                $effect(($) => {
                    $.send(
                        t`${runner.name} takes the handoff and starts a run!`,
                    );
                });

                $next({
                    to: "RUN",
                    params: {
                        playerId: runner.id,
                        downState,
                    },
                });
            }
        }

        if (ballBehindLineOfScrimmage) {
            const illegalTouchers = findBallCatchers(
                state.ball,
                offensivePlayers,
            );

            if (illegalTouchers.length > 0) {
                const offenderNames = illegalTouchers
                    .map((player) => player.name)
                    .join(", ");

                const baseMessage =
                    offenderNames.length > 0
                        ? t`Illegal touching by ${offenderNames}, 5 yard penalty.`
                        : t`Illegal touching, 5 yard penalty.`;

                const penaltyResult = applyOffensivePenalty(
                    downState,
                    -OFFENSIVE_FOUL_PENALTY_YARDS,
                );

                processOffensivePenalty({
                    event: penaltyResult.event,
                    onNextDown() {
                        $effect(($) => {
                            $.send(
                                cn(
                                    penaltyResult.downState,
                                    `${baseMessage} ${t`Loss of down.`}`,
                                ),
                            );
                        });
                    },
                    onTurnoverOnDowns() {
                        $effect(($) => {
                            $.send(
                                cn(
                                    penaltyResult.downState,
                                    `${baseMessage} ${t`Turnover on downs.`}`,
                                ),
                            );
                        });
                    },
                });

                $next({
                    to: "PRESNAP",
                    params: {
                        downState: penaltyResult.downState,
                    },
                });
            }
        }

        if (!quarterback.isKickingBall && isOutOfBounds(state.ball)) {
            const baseMessage = t`Ball moved out of bounds, 5 yard penalty.`;
            const penaltyResult = applyOffensivePenalty(
                downState,
                -OFFENSIVE_FOUL_PENALTY_YARDS,
            );

            processOffensivePenalty({
                event: penaltyResult.event,
                onNextDown() {
                    $effect(($) => {
                        $.send(
                            cn(
                                penaltyResult.downState,
                                `${baseMessage} ${t`Loss of down.`}`,
                            ),
                        );
                    });
                },
                onTurnoverOnDowns() {
                    $effect(($) => {
                        $.send(
                            cn(
                                penaltyResult.downState,
                                `${baseMessage} ${t`Turnover on downs.`}`,
                            ),
                        );
                    });
                },
            });

            $next({
                to: "PRESNAP",
                params: {
                    downState: penaltyResult.downState,
                },
            });
        }

        if (!quarterback.isKickingBall && ballBeyondLineOfScrimmage) {
            if (!isBlitzAllowed) {
                const baseMessage = t`Illegal advance beyond the line of scrimmage, 5 yard penalty.`;

                const penaltyResult = applyOffensivePenalty(
                    downState,
                    -OFFENSIVE_FOUL_PENALTY_YARDS,
                );

                processOffensivePenalty({
                    event: penaltyResult.event,
                    onNextDown() {
                        $effect(($) => {
                            $.send(
                                cn(
                                    penaltyResult.downState,
                                    `${baseMessage} ${t`Loss of down.`}`,
                                ),
                            );
                        });
                    },
                    onTurnoverOnDowns() {
                        $effect(($) => {
                            $.send(
                                cn(
                                    penaltyResult.downState,
                                    `${baseMessage} ${t`Turnover on downs.`}`,
                                ),
                            );
                        });
                    },
                });

                $next({
                    to: "PRESNAP",
                    params: {
                        downState: penaltyResult.downState,
                    },
                });
            }

            $effect(($) => {
                $.send(
                    t`Ball has crossed the line of scrimmage, starting quarterback run.`,
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

        if (!quarterback.isKickingBall && quarterbackCrossedLineOfScrimmage) {
            if (!isBlitzAllowed) {
                const baseMessage = t`Illegal advance beyond the line of scrimmage, 5 yard penalty.`;

                const penaltyResult = applyOffensivePenalty(
                    downState,
                    -OFFENSIVE_FOUL_PENALTY_YARDS,
                );

                processOffensivePenalty({
                    event: penaltyResult.event,
                    onNextDown() {
                        $effect(($) => {
                            $.send(
                                cn(
                                    penaltyResult.downState,
                                    `${baseMessage} ${t`Loss of down.`}`,
                                ),
                            );
                        });
                    },
                    onTurnoverOnDowns() {
                        $effect(($) => {
                            $.send(
                                cn(
                                    penaltyResult.downState,
                                    `${baseMessage} ${t`Turnover on downs.`}`,
                                ),
                            );
                        });
                    },
                });

                $next({
                    to: "PRESNAP",
                    params: {
                        downState: penaltyResult.downState,
                    },
                });
            }

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

        if (quarterback.isKickingBall) {
            $effect(($) => {
                $.stat("SNAP_KICKED_BALL");
            });

            $next({
                to: "SNAP_IN_FLIGHT",
                params: { downState },
            });
        }

        if (isBlitzAllowed && defenseCrossedLineOfScrimmage) {
            $effect(($) => {
                $.send(t`Defense is attempting a blitz!`);
            });

            $next({
                to: "BLITZ",
                params: {
                    downState,
                    quarterbackId,
                },
            });
        }

        const shouldRefreshSnapState =
            crowdingResult?.shouldUpdate || nextBallMoveTick !== ballMovedAt;

        if (shouldRefreshSnapState) {
            $next({
                to: "SNAP",
                params: {
                    downState,
                    quarterbackId,
                    crowdingData: crowdingResult
                        ? crowdingResult.updatedCrowdingData
                        : crowdingData,
                    ballMovedAt: nextBallMoveTick,
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

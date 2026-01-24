import type { GameState, GameStatePlayer } from "@common/engine";
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
import { cn, formatNames } from "@meta/legacy/utils/message";
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

type SnapFrame = {
    state: GameState;
    quarterback: Crowding.CrowdingPlayer;
    defenders: Crowding.CrowdingPlayer[];
    offensivePlayers: Crowding.CrowdingPlayer[];
    offsideDefender: Crowding.CrowdingPlayer | undefined;
    defenseCrossedLineOfScrimmage: boolean;
    quarterbackCrossedLineOfScrimmage: boolean;
    ballBeyondLineOfScrimmage: boolean;
    ballBehindLineOfScrimmage: boolean;
    isBlitzAllowed: boolean;
    nextBallMoveTick: number | null;
};

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

namespace Crowding {
    const CROWDING_OUTER_FOUL_TICKS = ticks({ seconds: 3 });
    const CROWDING_INNER_WEIGHT = 5;
    const CROWDING_GRACE_TICKS = ticks({ seconds: 1 });
    const DEFAULT_CROWDING_BLOCK_DISTANCE = 15;
    export const CROWDING_PENALTY_YARDS = 5;

    type CrowdingEntry = {
        playerId: number;
        startedAt: number;
        endedAt?: number;
    };

    export type CrowdingData = {
        outer: CrowdingEntry[];
        inner: CrowdingEntry[];
        startedAt?: number;
    };

    export type CrowdingPlayer = GameStatePlayer;

    type CrowdingFoulContribution = {
        playerId: number;
        weightedTicks: number;
    };

    export type CrowdingFoulInfo = {
        contributions: CrowdingFoulContribution[];
        players: Array<{ id: number; name: string }>;
    };

    export type CrowdingEvaluation =
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

    const sumPlayerCrowdingTicks = (
        entries: CrowdingEntry[],
        playerId: number,
        tick: number,
        minStartAt: number,
    ) =>
        entries
            .filter((entry) => entry.playerId === playerId)
            .map((entry) =>
                getCrowdingEntryDurationTicks(entry, tick, minStartAt),
            )
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
            !isBlocked &&
            isInInnerCrowdingArea(player, offensiveTeam, fieldPos);
        const inCrowding =
            !isBlocked &&
            (inInner || isInCrowdingArea(player, offensiveTeam, fieldPos));

        return { id: player.id, inInner, inCrowding };
    };

    const sameCrowdingEntry = (left: CrowdingEntry, right: CrowdingEntry) =>
        left.playerId === right.playerId &&
        left.startedAt === right.startedAt &&
        left.endedAt === right.endedAt;

    const sameCrowdingEntries = (
        left: CrowdingEntry[],
        right: CrowdingEntry[],
    ) =>
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
        const crowdingWindowStartTick =
            crowdingData.startedAt ?? state.tickNumber;
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
}

const getCrowdingOffenderNames = (info: Crowding.CrowdingFoulInfo): string => {
    const offenderContributions = info.contributions.filter(
        (entry) => entry.weightedTicks > 0,
    );

    const totalWeightedTicks = offenderContributions.reduce(
        (total, entry) => total + entry.weightedTicks,
        0,
    );

    const offenderSummaryText = formatNames(
        offenderContributions.map(({ playerId, weightedTicks }) => {
            const playerName =
                info.players.find((player) => player.id === playerId)?.name ??
                "Unknown";
            const percent =
                totalWeightedTicks > 0
                    ? Math.round((weightedTicks / totalWeightedTicks) * 100)
                    : 0;
            return { name: `${playerName} (${percent}%)` };
        }),
    );

    return offenderSummaryText;
};

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
    crowdingData?: Crowding.CrowdingData;
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

    function buildSnapFrame(state: GameState): SnapFrame | null {
        const quarterback = state.players.find((p) => p.id === quarterbackId);
        if (!quarterback) return null;

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

        return {
            state,
            quarterback,
            defenders,
            offensivePlayers,
            offsideDefender,
            defenseCrossedLineOfScrimmage,
            quarterbackCrossedLineOfScrimmage,
            ballBeyondLineOfScrimmage,
            ballBehindLineOfScrimmage,
            isBlitzAllowed,
            nextBallMoveTick,
        };
    }

    function $handleDefensiveOffside(frame: SnapFrame) {
        if (frame.isBlitzAllowed || !frame.defenseCrossedLineOfScrimmage) {
            return;
        }

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
                            t`Defensive offside, ${DEFENSIVE_OFFSIDE_PENALTY_YARDS} yard penalty.`,
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
                            t`Defensive offside, ${DEFENSIVE_OFFSIDE_PENALTY_YARDS} yard penalty and automatic first down.`,
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
                const offsideDefenderId = frame.offsideDefender?.id;

                $global((state) =>
                    state.incrementScore(offensiveTeam, SCORES.TOUCHDOWN),
                );

                $effect(($) => {
                    $.send(
                        cn(
                            penaltyResult.downState,
                            t`Defensive offside, ${DEFENSIVE_OFFSIDE_PENALTY_YARDS} yard penalty and automatic touchdown.`,
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

    function $getCrowdingResult(
        frame: SnapFrame,
    ): Crowding.CrowdingEvaluation | null {
        if (frame.isBlitzAllowed) return null;

        return Crowding.evaluateCrowding({
            state: frame.state,
            quarterbackId,
            downState,
            crowdingData,
        });
    }

    function $handleCrowdingFoul(
        crowdingResult: Crowding.CrowdingEvaluation | null,
    ) {
        if (!crowdingResult || !crowdingResult.hasFoul) return;

        const penaltyResult = applyDefensivePenalty(
            downState,
            Crowding.CROWDING_PENALTY_YARDS,
        );

        const crowdingOffenderNames = getCrowdingOffenderNames(
            crowdingResult.foulInfo,
        );

        const crowdingOffenderIds = uniqueNumbers(
            crowdingResult.foulInfo.contributions
                .filter((entry) => entry.weightedTicks > 0)
                .map((entry) => entry.playerId),
        );

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
                    $.send(
                        cn(
                            penaltyResult.downState,
                            t`Defensive crowding foul by ${crowdingOffenderNames}, ${Crowding.CROWDING_PENALTY_YARDS} yard penalty.`,
                        ),
                    );
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
                            t`Defensive crowding foul (${crowdingOffenderNames}), ${Crowding.CROWDING_PENALTY_YARDS} yard penalty. Automatic first down.`,
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
                            t`Defensive crowding foul (${crowdingOffenderNames}), ${Crowding.CROWDING_PENALTY_YARDS} yard penalty. Automatic touchdown.`,
                        ),
                    );

                    setPlayerAvatars(
                        crowdingOffenderIds,
                        $.setAvatar,
                        AVATARS.CLOWN,
                    );
                });

                $dispose(() => {
                    $effect(($) => {
                        setPlayerAvatars(
                            crowdingOffenderIds,
                            $.setAvatar,
                            null,
                        );
                    });
                });

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

    function $handleDefensiveTouching(frame: SnapFrame) {
        const defensiveTouchers = findBallCatchers(
            frame.state.ball,
            frame.defenders,
        );

        if (defensiveTouchers.length === 0) return;

        const offenderNames = formatNames(defensiveTouchers);

        const penaltyResult = applyDefensivePenalty(
            downState,
            DEFENSIVE_TOUCHING_PENALTY_YARDS,
        );

        const defensiveToucherIds = defensiveTouchers.map(
            (player) => player.id,
        );

        processDefensivePenaltyEvent({
            event: penaltyResult.event,
            onSameDown() {
                $effect(($) => {
                    $.send(
                        cn(
                            penaltyResult.downState,
                            t`Defensive illegal touching by ${offenderNames}, ${DEFENSIVE_TOUCHING_PENALTY_YARDS} yard penalty.`,
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
                            t`Defensive illegal touching by ${offenderNames}, ${DEFENSIVE_TOUCHING_PENALTY_YARDS} yard penalty and automatic first down.`,
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
                            t`Defensive illegal touching by ${offenderNames}, ${DEFENSIVE_TOUCHING_PENALTY_YARDS} yard penalty. Automatic touchdown.`,
                        ),
                    );
                    setPlayerAvatars(
                        defensiveToucherIds,
                        $.setAvatar,
                        AVATARS.CLOWN,
                    );
                });

                $dispose(() => {
                    $effect(($) => {
                        setPlayerAvatars(
                            defensiveToucherIds,
                            $.setAvatar,
                            null,
                        );
                    });
                });

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

    function $handleHandoff(frame: SnapFrame) {
        if (frame.quarterback.isKickingBall) return;

        const offensiveTouchers = findCatchers(
            frame.quarterback,
            frame.offensivePlayers,
        );

        if (offensiveTouchers.length === 0 || !offensiveTouchers[0]) return;

        const runner = offensiveTouchers[0];

        $effect(($) => {
            $.send(t`${runner.name} takes the handoff and starts a run!`);
        });

        $next({
            to: "RUN",
            params: {
                playerId: runner.id,
                downState,
            },
        });
    }

    function $handleIllegalTouchingBehindLine(frame: SnapFrame) {
        if (!frame.ballBehindLineOfScrimmage) return;

        const illegalTouchers = findBallCatchers(
            frame.state.ball,
            frame.offensivePlayers,
        );

        if (illegalTouchers.length === 0) return;

        const offenderNames = formatNames(illegalTouchers);

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
                            t`Illegal touching by ${offenderNames}, ${OFFENSIVE_FOUL_PENALTY_YARDS} yard penalty. Loss of down.`,
                        ),
                    );
                });
            },
            onTurnoverOnDowns() {
                $effect(($) => {
                    $.send(
                        cn(
                            penaltyResult.downState,
                            t`Illegal touching by ${offenderNames}, ${OFFENSIVE_FOUL_PENALTY_YARDS} yard penalty. Turnover on downs.`,
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

    function $handleBallOutOfBounds(frame: SnapFrame) {
        if (frame.quarterback.isKickingBall) return;
        if (!isOutOfBounds(frame.state.ball)) return;

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
                            t`Ball moved out of bounds, ${OFFENSIVE_FOUL_PENALTY_YARDS} yard penalty. Loss of down.`,
                        ),
                    );
                });
            },
            onTurnoverOnDowns() {
                $effect(($) => {
                    $.send(
                        cn(
                            penaltyResult.downState,
                            t`Ball moved out of bounds, ${OFFENSIVE_FOUL_PENALTY_YARDS} yard penalty. Turnover on downs.`,
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

    function $penalizeIllegalAdvance() {
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
                            t`Illegal advance beyond the line of scrimmage, ${OFFENSIVE_FOUL_PENALTY_YARDS} yard penalty. Loss of down.`,
                        ),
                    );
                });
            },
            onTurnoverOnDowns() {
                $effect(($) => {
                    $.send(
                        cn(
                            penaltyResult.downState,
                            t`Illegal advance beyond the line of scrimmage, ${OFFENSIVE_FOUL_PENALTY_YARDS} yard penalty. Turnover on downs.`,
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

    function $handleBallBeyondLineOfScrimmage(frame: SnapFrame) {
        if (frame.quarterback.isKickingBall) return;
        if (!frame.ballBeyondLineOfScrimmage) return;

        if (!frame.isBlitzAllowed) {
            $penalizeIllegalAdvance();
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

    function $handleQuarterbackBeyondLineOfScrimmage(frame: SnapFrame) {
        if (frame.quarterback.isKickingBall) return;
        if (!frame.quarterbackCrossedLineOfScrimmage) return;

        if (!frame.isBlitzAllowed) {
            $penalizeIllegalAdvance();
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

    function $handleSnapKick(frame: SnapFrame) {
        if (!frame.quarterback.isKickingBall) return;

        $effect(($) => {
            $.stat("SNAP_KICKED_BALL");
        });

        $next({
            to: "SNAP_IN_FLIGHT",
            params: { downState },
        });
    }

    function $handleBlitz(frame: SnapFrame) {
        if (!frame.isBlitzAllowed || !frame.defenseCrossedLineOfScrimmage) {
            return;
        }

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

    function $refreshSnapState(
        frame: SnapFrame,
        crowdingResult: Crowding.CrowdingEvaluation | null,
    ) {
        const shouldRefreshSnapState =
            crowdingResult?.shouldUpdate ||
            frame.nextBallMoveTick !== ballMovedAt;

        if (!shouldRefreshSnapState) return;

        $next({
            to: "SNAP",
            params: {
                downState,
                quarterbackId,
                crowdingData: crowdingResult
                    ? crowdingResult.updatedCrowdingData
                    : crowdingData,
                ballMovedAt: frame.nextBallMoveTick,
            },
        });
    }

    function run(state: GameState) {
        const frame = buildSnapFrame(state);
        if (!frame) return;

        $handleDefensiveOffside(frame);

        const crowdingResult = $getCrowdingResult(frame);

        $handleCrowdingFoul(crowdingResult);
        $handleDefensiveTouching(frame);
        $handleHandoff(frame);
        $handleIllegalTouchingBehindLine(frame);
        $handleBallOutOfBounds(frame);
        $handleBallBeyondLineOfScrimmage(frame);
        $handleQuarterbackBeyondLineOfScrimmage(frame);
        $handleSnapKick(frame);
        $handleBlitz(frame);
        $refreshSnapState(frame, crowdingResult);
    }

    function dispose() {
        $unsetLineOfScrimmage();
        $unsetFirstDownLine();
        $hideCrowdingBoxes();
    }

    return { run, dispose };
}

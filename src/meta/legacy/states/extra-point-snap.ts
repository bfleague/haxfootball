import type { GameState, GameStatePlayer } from "@runtime/engine";
import { $before, $dispose, $effect, $next } from "@runtime/runtime";
import { ticks } from "@common/general/time";
import {
    AVATARS,
    findBallCatchers,
    findCatchers,
    setPlayerAvatars,
    type FieldPosition,
} from "@common/game/game";
import { t } from "@lingui/core/macro";
import { cn, formatNames } from "@meta/legacy/shared/message";
import { type FieldTeam } from "@runtime/models";
import {
    DISTANCE_TO_FIRST_DOWN,
    type DownState,
} from "@meta/legacy/shared/down";
import {
    applyDefensivePenalty,
    processDefensivePenaltyEvent,
} from "@meta/legacy/shared/penalty";
import { SCORES } from "@meta/legacy/shared/scoring";
import {
    calculateDirectionalGain,
    getPositionFromFieldPosition,
    isBallOutOfBounds,
    isInExtraPointZone,
} from "@meta/legacy/shared/stadium";
import {
    $setBallActive,
    $setLineOfScrimmage,
    $showCrowdingBoxes,
    $unsetFirstDownLine,
    $hideCrowdingBoxes,
    $unsetLineOfScrimmage,
} from "@meta/legacy/hooks/game";
import { $setBallMoveable, $unlockBall } from "@meta/legacy/hooks/physics";
import { $global } from "@meta/legacy/hooks/global";
import * as Crowding from "@meta/legacy/shared/crowding";
import { unique } from "@common/general/helpers";
import { $createSharedCommandHandler } from "@meta/legacy/shared/commands";
import {
    DEFAULT_PUSHING_CONTACT_DISTANCE,
    DEFAULT_PUSHING_MIN_BACKFIELD_STEP,
    detectPushingFoul,
} from "@meta/legacy/shared/pushing";
import type { CommandSpec } from "@runtime/commands";
import { COLOR } from "@common/general/color";

const DEFENSIVE_FOUL_PENALTY_YARDS = 5;
const EXTRA_POINT_QB_RUN_DELAY = ticks({ seconds: 12 });
const BLITZ_BASE_DELAY_TICKS = ticks({ seconds: 12 });
const BLITZ_EARLY_DELAY_TICKS = ticks({ seconds: 3 });
const BLITZ_EARLY_MOVE_THRESHOLD_PX = 2;

type Frame = {
    state: GameState;
    previousState: GameState;
    lineOfScrimmageX: number;
    quarterback: GameStatePlayer;
    defenders: GameStatePlayer[];
    offensivePlayers: GameStatePlayer[];
    defenseCrossedLineOfScrimmage: boolean;
    quarterbackCrossedLineOfScrimmage: boolean;
    ballBehindLineOfScrimmage: boolean;
    isQuarterbackEligibleToRun: boolean;
    isBlitzAllowed: boolean;
    nextBallMoveTick: number | null;
};

export function ExtraPointSnap({
    quarterbackId,
    offensiveTeam,
    fieldPos,
    defensiveFouls = 0,
    crowdingData = { outer: [], inner: [] },
    ballMovedAt: _ballMovedAt,
    startedAt,
}: {
    quarterbackId: number;
    offensiveTeam: FieldTeam;
    fieldPos: FieldPosition;
    defensiveFouls?: number;
    crowdingData?: Crowding.CrowdingData;
    ballMovedAt?: number | null;
    startedAt?: number;
}) {
    const beforeState = $before();
    const startTick =
        typeof startedAt === "number" ? startedAt : beforeState.tickNumber;
    const defaultBlitzAllowedTick = startTick + BLITZ_BASE_DELAY_TICKS;
    const ballMovedAt = typeof _ballMovedAt === "number" ? _ballMovedAt : null;
    const ballSpawnPosition = {
        x: beforeState.ball.x,
        y: beforeState.ball.y,
    };
    const lineOfScrimmageX = getPositionFromFieldPosition(fieldPos);

    const isBallBeyondMoveThreshold = (ball: { x: number; y: number }) =>
        Math.hypot(ball.x - ballSpawnPosition.x, ball.y - ballSpawnPosition.y) >
        BLITZ_EARLY_MOVE_THRESHOLD_PX;

    $setBallMoveable();
    $unlockBall();
    $setBallActive();
    $setLineOfScrimmage(fieldPos);
    $unsetFirstDownLine();

    $dispose(() => {
        $unsetLineOfScrimmage();
        $unsetFirstDownLine();
        $hideCrowdingBoxes();
    });

    const penaltyDownState: DownState = {
        offensiveTeam,
        fieldPos,
        downAndDistance: {
            down: 1,
            distance: DISTANCE_TO_FIRST_DOWN,
        },
        redZoneFouls: defensiveFouls,
        lastBallY: 0,
    };

    function buildFrame(state: GameState): Frame | null {
        const previousState = $before();
        const quarterback = state.players.find((p) => p.id === quarterbackId);
        if (!quarterback) return null;

        const defenders = state.players.filter(
            (player) => player.team !== offensiveTeam,
        );
        const offensivePlayers = state.players.filter(
            (player) =>
                player.team === offensiveTeam && player.id !== quarterbackId,
        );

        const defenseCrossedLineOfScrimmage = defenders.some(
            (player) =>
                calculateDirectionalGain(
                    offensiveTeam,
                    player.x - lineOfScrimmageX,
                ) < 0,
        );

        const quarterbackCrossedLineOfScrimmage =
            calculateDirectionalGain(
                offensiveTeam,
                quarterback.x - lineOfScrimmageX,
            ) > 0;

        const ballDirectionalGain = calculateDirectionalGain(
            offensiveTeam,
            state.ball.x - lineOfScrimmageX,
        );
        const ballBehindLineOfScrimmage = ballDirectionalGain < 0;

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

        const isQuarterbackEligibleToRun =
            state.tickNumber - startTick >= EXTRA_POINT_QB_RUN_DELAY;

        return {
            state,
            previousState,
            lineOfScrimmageX,
            quarterback,
            defenders,
            offensivePlayers,
            defenseCrossedLineOfScrimmage,
            quarterbackCrossedLineOfScrimmage,
            ballBehindLineOfScrimmage,
            isQuarterbackEligibleToRun,
            isBlitzAllowed,
            nextBallMoveTick,
        };
    }

    function $handlePushingFoul(frame: Frame) {
        const pushingFoul = detectPushingFoul({
            currentState: frame.state,
            previousState: frame.previousState,
            offensiveTeam,
            quarterbackId,
            lineOfScrimmageX: frame.lineOfScrimmageX,
            isBlitzAllowed: frame.isBlitzAllowed,
            pushingContactDistance: DEFAULT_PUSHING_CONTACT_DISTANCE,
            minBackfieldStep: DEFAULT_PUSHING_MIN_BACKFIELD_STEP,
        });

        if (!pushingFoul) return;

        const pusherNames = formatNames(pushingFoul.pushers);
        const pusherIds = pushingFoul.pushers.map((player) => player.id);

        $effect(($) => {
            $.send({
                message: cn(
                    t`❌ Pushing foul by ${pusherNames}`,
                    t`two-point try failed.`,
                ),
                color: COLOR.WARNING,
            });

            setPlayerAvatars(pusherIds, $.setAvatar, AVATARS.CLOWN);
        });

        $dispose(() => {
            $effect(($) => {
                setPlayerAvatars(pusherIds, $.setAvatar, null);
            });
        });

        $failTwoPointAttempt();
    }

    function $failTwoPointAttempt() {
        $next({
            to: "KICKOFF",
            params: {
                forTeam: offensiveTeam,
            },
            wait: ticks({ seconds: 2 }),
        });
    }

    function $retryExtraPointAttempt(
        nextFieldPos: FieldPosition,
        nextDefensiveFouls: number,
        options?: { disposal?: "IMMEDIATE" | "DELAYED" | "AFTER_RESUME" },
    ) {
        $next({
            to: "EXTRA_POINT",
            params: {
                offensiveTeam,
                fieldPos: nextFieldPos,
                defensiveFouls: nextDefensiveFouls,
            },
            ...(options?.disposal ? { disposal: options.disposal } : {}),
        });
    }

    function $awardTwoPointConversion() {
        $global((state) =>
            state.incrementScore(offensiveTeam, SCORES.TWO_POINT),
        );

        $next({
            to: "KICKOFF",
            params: {
                forTeam: offensiveTeam,
            },
            wait: ticks({ seconds: 2 }),
        });
    }

    function $handleBallOutsideZone(state: GameState) {
        if (isInExtraPointZone(state.ball, offensiveTeam)) return;

        $effect(($) => {
            $.send({
                message: t`❌ Two-point try failed.`,
                color: COLOR.WARNING,
            });
        });

        $failTwoPointAttempt();
    }

    function $handleDefensiveOffside(frame: Frame) {
        if (frame.isBlitzAllowed || !frame.defenseCrossedLineOfScrimmage) {
            return;
        }

        const penaltyResult = applyDefensivePenalty(
            penaltyDownState,
            DEFENSIVE_FOUL_PENALTY_YARDS,
        );
        const nextFieldPos = penaltyResult.downState.fieldPos;
        const nextDefensiveFouls = penaltyResult.downState.redZoneFouls;

        processDefensivePenaltyEvent({
            event: penaltyResult.event,
            onSameDown(yardsGained) {
                $effect(($) => {
                    $.send({
                        message: cn(
                            t`❌ Defensive offside`,
                            t`${yardsGained}-yard penalty`,
                            t`replay the try.`,
                        ),
                        color: COLOR.WARNING,
                    });
                });
                $retryExtraPointAttempt(nextFieldPos, nextDefensiveFouls);
            },
            onFirstDown(yardsGained) {
                $effect(($) => {
                    $.send({
                        message: cn(
                            t`❌ Defensive offside`,
                            t`${yardsGained}-yard penalty`,
                            t`replay the try.`,
                        ),
                        color: COLOR.WARNING,
                    });
                });
                $retryExtraPointAttempt(nextFieldPos, nextDefensiveFouls);
            },
            onTouchdown() {
                $awardTwoPointConversion();

                const { scores } = $global();

                $effect(($) => {
                    $.send({
                        message: cn(
                            "❌",
                            scores,
                            t`defensive offside`,
                            t`two-point try awarded.`,
                        ),
                        color: COLOR.WARNING,
                    });
                });
            },
        });
    }

    function $handleDefensiveTouching(frame: Frame) {
        const defensiveTouchers = findBallCatchers(
            frame.state.ball,
            frame.defenders,
        );

        if (defensiveTouchers.length === 0) return;

        const penaltyResult = applyDefensivePenalty(
            penaltyDownState,
            DEFENSIVE_FOUL_PENALTY_YARDS,
        );
        const nextFieldPos = penaltyResult.downState.fieldPos;
        const nextDefensiveFouls = penaltyResult.downState.redZoneFouls;

        processDefensivePenaltyEvent({
            event: penaltyResult.event,
            onSameDown(yardsGained) {
                $effect(($) => {
                    $.send({
                        message: cn(
                            t`❌ Defensive illegal touch`,
                            t`${yardsGained}-yard penalty`,
                            t`replay the try.`,
                        ),
                        color: COLOR.WARNING,
                    });
                });
                $retryExtraPointAttempt(nextFieldPos, nextDefensiveFouls);
            },
            onFirstDown(yardsGained) {
                $effect(($) => {
                    $.send({
                        message: cn(
                            t`❌ Defensive illegal touch`,
                            t`${yardsGained}-yard penalty`,
                            t`replay the try.`,
                        ),
                        color: COLOR.WARNING,
                    });
                });
                $retryExtraPointAttempt(nextFieldPos, nextDefensiveFouls);
            },
            onTouchdown() {
                $awardTwoPointConversion();

                const { scores } = $global();

                $effect(($) => {
                    $.send({
                        message: cn(
                            "❌",
                            scores,
                            t`defensive illegal touch`,
                            t`two-point try awarded.`,
                        ),
                        color: COLOR.WARNING,
                    });
                });
            },
        });
    }

    function $getCrowdingResult(
        frame: Frame,
    ): Crowding.CrowdingEvaluation | null {
        if (frame.isBlitzAllowed) return null;

        return Crowding.evaluateCrowding({
            state: frame.state,
            quarterbackId,
            downState: penaltyDownState,
            crowdingData,
        });
    }

    function $handleCrowdingFoul(
        crowdingResult: Crowding.CrowdingEvaluation | null,
    ) {
        if (!crowdingResult || !crowdingResult.hasFoul) return;

        const penaltyResult = applyDefensivePenalty(
            penaltyDownState,
            Crowding.CROWDING_PENALTY_YARDS,
        );
        const nextFieldPos = penaltyResult.downState.fieldPos;
        const nextDefensiveFouls = penaltyResult.downState.redZoneFouls;

        const crowdingOffenderNames = Crowding.getCrowdingOffenderNames(
            crowdingResult.foulInfo,
        );

        const crowdingOffenderIds = unique(
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
            onSameDown(yardsGained) {
                $effect(($) => {
                    $.pauseGame(true);
                    $.pauseGame(false);
                    $.send({
                        message: cn(
                            t`❌ Crowd abuse by ${crowdingOffenderNames}`,
                            t`${yardsGained}-yard penalty`,
                            t`replay the try.`,
                        ),
                        color: COLOR.WARNING,
                    });
                });
                $retryExtraPointAttempt(nextFieldPos, nextDefensiveFouls, {
                    disposal: "AFTER_RESUME",
                });
            },
            onFirstDown(yardsGained) {
                $effect(($) => {
                    $.pauseGame(true);
                    $.pauseGame(false);
                    $.send({
                        message: cn(
                            t`❌ Crowd abuse (${crowdingOffenderNames})`,
                            t`${yardsGained}-yard penalty`,
                            t`replay the try.`,
                        ),
                        color: COLOR.WARNING,
                    });
                });
                $retryExtraPointAttempt(nextFieldPos, nextDefensiveFouls, {
                    disposal: "AFTER_RESUME",
                });
            },
            onTouchdown() {
                $awardTwoPointConversion();

                const { scores } = $global();

                $effect(($) => {
                    $.send({
                        message: cn(
                            "❌",
                            scores,
                            t`crowd abuse by ${crowdingOffenderNames}`,
                            t`two-point try awarded.`,
                        ),
                        color: COLOR.WARNING,
                    });
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
            },
        });
    }

    function $refreshExtraPointSnap(
        frame: Frame,
        crowdingResult: Crowding.CrowdingEvaluation | null,
    ) {
        const shouldRefreshExtraPointSnap =
            crowdingResult?.shouldUpdate ||
            frame.nextBallMoveTick !== ballMovedAt;

        if (!shouldRefreshExtraPointSnap) return;

        $next({
            to: "EXTRA_POINT_SNAP",
            params: {
                quarterbackId,
                offensiveTeam,
                fieldPos,
                defensiveFouls,
                crowdingData: crowdingResult
                    ? crowdingResult.updatedCrowdingData
                    : crowdingData,
                ballMovedAt: frame.nextBallMoveTick,
                startedAt: startTick,
            },
        });
    }

    function $handleHandoff(frame: Frame) {
        if (frame.quarterback.isKickingBall) return;

        const offensiveTouchers = findCatchers(
            frame.quarterback,
            frame.offensivePlayers,
        );

        if (offensiveTouchers.length === 0 || !offensiveTouchers[0]) return;

        const runner = offensiveTouchers[0];

        $effect(($) => {
            $.send({
                message: t`🏃 ${runner.name} takes the handoff!`,
                color: COLOR.ACTION,
            });
            $.setAvatar(quarterbackId, null);
        });

        $next({
            to: "EXTRA_POINT_RUN",
            params: {
                playerId: runner.id,
                ballTeam: offensiveTeam,
                originalOffensiveTeam: offensiveTeam,
                fieldPos,
            },
        });
    }

    function $handleOffensiveIllegalTouching(frame: Frame) {
        if (!frame.ballBehindLineOfScrimmage) return;

        const offensiveTouchers = findBallCatchers(
            frame.state.ball,
            frame.offensivePlayers,
        );

        if (offensiveTouchers.length === 0) return;

        $effect(($) => {
            $.send({
                message: cn(t`❌ Offensive foul`, t`two-point try failed.`),
                color: COLOR.WARNING,
            });
        });

        $failTwoPointAttempt();
    }

    function $handleBallOutOfBounds(frame: Frame) {
        if (!isBallOutOfBounds(frame.state.ball)) return;

        $effect(($) => {
            $.send({
                message: t`❌ Two-point try failed.`,
                color: COLOR.WARNING,
            });
        });

        $failTwoPointAttempt();
    }

    function $handleSnapKick(frame: Frame) {
        if (!frame.quarterback.isKickingBall) return;

        $next({
            to: "EXTRA_POINT_SNAP_IN_FLIGHT",
            params: {
                offensiveTeam,
                fieldPos,
            },
        });
    }

    function $handleQuarterbackRun(frame: Frame) {
        if (!frame.isQuarterbackEligibleToRun) return;
        if (!frame.quarterbackCrossedLineOfScrimmage) return;

        $effect(($) => {
            $.send({
                message: t`🏃 QB ${frame.quarterback.name} keeps it and runs!`,
                color: COLOR.ACTION,
            });
        });

        $next({
            to: "EXTRA_POINT_QUARTERBACK_RUN",
            params: {
                playerId: quarterbackId,
                ballTeam: offensiveTeam,
                originalOffensiveTeam: offensiveTeam,
                fieldPos,
            },
        });
    }

    function $handleBlitz(frame: Frame) {
        if (!frame.isBlitzAllowed || !frame.defenseCrossedLineOfScrimmage) {
            return;
        }

        $effect(($) => {
            $.send({
                message: t`🚨 Defense is bringing the blitz!`,
                color: COLOR.CRITICAL,
            });
        });

        $next({
            to: "EXTRA_POINT_BLITZ",
            params: {
                quarterbackId,
                offensiveTeam,
                fieldPos,
                startedAt: startTick,
            },
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

    function run(state: GameState) {
        $handleBallOutsideZone(state);

        const frame = buildFrame(state);
        if (!frame) return;

        $handlePushingFoul(frame);
        $handleDefensiveOffside(frame);
        const crowdingResult = $getCrowdingResult(frame);
        $handleCrowdingFoul(crowdingResult);
        $handleDefensiveTouching(frame);
        $handleHandoff(frame);
        $handleOffensiveIllegalTouching(frame);
        $handleBallOutOfBounds(frame);
        $handleSnapKick(frame);
        $handleQuarterbackRun(frame);
        $handleBlitz(frame);
        $refreshExtraPointSnap(frame, crowdingResult);
    }

    return { run, command };
}

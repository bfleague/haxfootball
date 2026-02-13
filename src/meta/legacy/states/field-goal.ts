import type {
    GameState,
    GameStateBall,
    GameStatePlayer,
} from "@runtime/engine";
import { Team } from "@runtime/models";
import {
    distributeOnLine,
    findClosest,
    getDistance,
    verticalLine,
} from "@common/math/geometry";
import { ticks } from "@common/general/time";
import { findBallCatchers, findCatchers, opposite } from "@common/game/game";
import { t } from "@lingui/core/macro";
import { $before, $dispose, $effect, $next } from "@runtime/runtime";
import {
    $setFirstDownLine,
    $setLineOfScrimmage,
    $unsetFirstDownLine,
    $unsetLineOfScrimmage,
    $setBallActive,
} from "@meta/legacy/hooks/game";
import {
    $lockBall,
    $setBallMoveable,
    $unlockBall,
} from "@meta/legacy/hooks/physics";
import { DownState, getInitialDownState } from "@meta/legacy/utils/down";
import { formatNames } from "@meta/legacy/utils/message";
import {
    BALL_OFFSET_YARDS,
    calculateDirectionalGain,
    calculateSnapBallPosition,
    clampToHashCenterY,
    getBallPath,
    getGoalLine,
    getPositionFromFieldPosition,
    getRayIntersectionWithOuterField,
    intersectsGoalPosts,
    offsetXByYards,
    YARD_LENGTH,
} from "@meta/legacy/utils/stadium";
import { sortBy } from "@common/general/helpers";

const FIELD_GOAL_LINE_HEIGHT = 200;
const OFFENSE_LINE_OFFSET_YARDS = 20;
const DEFENSE_LINE_OFFSET_YARDS = 15;
const CENTER_OFFSET_YARDS = 10;
const KICKER_OFFSET_YARDS = -6;
const KICKER_Y_OFFSET_YARDS = 0.5;
const FAKE_FIELD_GOAL_DELAY = ticks({ seconds: 2 });
const FIELD_GOAL_RESULT_DELAY = ticks({ seconds: 2 });

type Formation = {
    offenseLine: GameStatePlayer[];
    defenseLine: GameStatePlayer[];
    center: GameStatePlayer | null;
    kicker: GameStatePlayer | null;
};

type Frame = {
    state: GameState;
    kicker: GameStatePlayer;
    defenders: GameStatePlayer[];
    offensiveTeammates: GameStatePlayer[];
    offensiveBallTouchers: GameStatePlayer[];
    defensiveBallTouchers: GameStatePlayer[];
    defensiveKickerTouchers: GameStatePlayer[];
    kickerCrossedLine: boolean;
    canFake: boolean;
    ballCrossedLine: boolean;
};

export function FieldGoal({
    kickerId,
    downState,
}: {
    kickerId: number;
    downState: DownState;
}) {
    const { offensiveTeam, fieldPos, downAndDistance } = downState;
    const lastBallY = downState.lastBallY;
    const ballY = clampToHashCenterY(lastBallY);
    const ballPos = {
        ...calculateSnapBallPosition(
            offensiveTeam,
            fieldPos,
            BALL_OFFSET_YARDS,
        ),
        y: ballY,
    };
    const lineOfScrimmageX = getPositionFromFieldPosition(fieldPos);
    const direction: 1 | -1 = offensiveTeam === Team.RED ? 1 : -1;
    const kickerYOffset =
        (offensiveTeam === Team.RED ? 1 : -1) *
        KICKER_Y_OFFSET_YARDS *
        YARD_LENGTH;
    const failureDownState = getInitialDownState(
        opposite(offensiveTeam),
        fieldPos,
        downState.lastBallY,
    );

    $setBallMoveable();
    $unlockBall();
    $setBallActive();
    $setLineOfScrimmage(fieldPos);
    $setFirstDownLine(offensiveTeam, fieldPos, downAndDistance.distance);

    $effect(($) => {
        $.setBall({ ...ballPos, xspeed: 0, yspeed: 0 });
    });

    $dispose(() => {
        $unlockBall();
        $unsetLineOfScrimmage();
        $unsetFirstDownLine();
    });

    const beforeState = $before();

    const startTick = beforeState.tickNumber;
    const offensivePlayers = beforeState.players.filter(
        (player) => player.team === offensiveTeam && player.id !== kickerId,
    );
    const defenders = beforeState.players.filter(
        (player) => player.team === opposite(offensiveTeam),
    );
    const center = findClosest(ballPos, offensivePlayers);
    const defenseLine = center
        ? offensivePlayers.filter((player) => player.id !== center.id)
        : offensivePlayers;
    const offenseLine = defenders;
    const kicker = beforeState.players.find((player) => player.id === kickerId);
    const formation: Formation = {
        offenseLine,
        defenseLine,
        center,
        kicker: kicker ?? null,
    };
    const rawOffenseLineX = offsetXByYards(
        ballPos.x,
        direction,
        OFFENSE_LINE_OFFSET_YARDS,
    );
    const rawDefenseLineX = offsetXByYards(
        ballPos.x,
        direction,
        DEFENSE_LINE_OFFSET_YARDS,
    );
    const goalLineX = getGoalLine(opposite(offensiveTeam)).start.x;
    const offenseLineIsClosest =
        Math.abs(goalLineX - rawOffenseLineX) <=
        Math.abs(goalLineX - rawDefenseLineX);
    const offenseLineX = offenseLineIsClosest
        ? rawOffenseLineX
        : rawDefenseLineX;
    const defenseLineX = offenseLineIsClosest
        ? rawDefenseLineX
        : rawOffenseLineX;

    $effect(($) => {
        if (formation.offenseLine.length > 0) {
            const line = verticalLine(
                offenseLineX,
                ballPos.y,
                FIELD_GOAL_LINE_HEIGHT,
            );

            distributeOnLine(
                sortBy(formation.offenseLine, (p) => p.y),
                line,
            ).forEach(({ id, x, y }) => {
                $.setPlayerDiscProperties(id, { x, y, xspeed: 0, yspeed: 0 });
            });
        }

        if (formation.defenseLine.length > 0) {
            const line = verticalLine(
                defenseLineX,
                ballPos.y,
                FIELD_GOAL_LINE_HEIGHT,
            );

            distributeOnLine(
                sortBy(formation.defenseLine, (p) => p.y),
                line,
            ).forEach(({ id, x, y }) => {
                $.setPlayerDiscProperties(id, { x, y, xspeed: 0, yspeed: 0 });
            });
        }

        if (formation.center) {
            const centerX = offsetXByYards(
                ballPos.x,
                direction,
                CENTER_OFFSET_YARDS,
            );

            $.setPlayerDiscProperties(formation.center.id, {
                x: centerX,
                y: ballPos.y,
                xspeed: 0,
                yspeed: 0,
            });
        }

        if (formation.kicker) {
            const kickerX = offsetXByYards(
                ballPos.x,
                direction,
                KICKER_OFFSET_YARDS,
            );

            $.setPlayerDiscProperties(formation.kicker.id, {
                x: kickerX,
                y: ballPos.y + kickerYOffset,
                xspeed: 0,
                yspeed: 0,
            });
        }
    });

    const isEarlyOutOfBounds = (ball: GameStateBall): boolean => {
        const ray = getBallPath(ball.x, ball.y, ball.xspeed, ball.yspeed);
        const goalIntersection = intersectsGoalPosts(
            ray,
            opposite(offensiveTeam),
        );
        const outOfBoundsPoint = getRayIntersectionWithOuterField(ray);

        if (!outOfBoundsPoint) return false;
        if (!goalIntersection.intersects) return true;

        const goalDistance = getDistance(ray.origin, goalIntersection.point);
        const outDistance = getDistance(ray.origin, outOfBoundsPoint);

        return outDistance < goalDistance;
    };

    function buildFrame(state: GameState): Frame | null {
        const kicker = state.players.find((player) => player.id === kickerId);
        if (!kicker) return null;

        const defenders = state.players.filter(
            (player) => player.team === opposite(offensiveTeam),
        );
        const offensiveTeammates = state.players.filter(
            (player) => player.team === offensiveTeam && player.id !== kickerId,
        );

        const offensiveBallTouchers = findBallCatchers(
            state.ball,
            offensiveTeammates,
        );
        const defensiveBallTouchers = findBallCatchers(state.ball, defenders);
        const defensiveKickerTouchers = findCatchers(kicker, defenders);

        const kickerCrossedLine =
            calculateDirectionalGain(
                offensiveTeam,
                kicker.x - lineOfScrimmageX,
            ) > 0;
        const canFake = state.tickNumber - startTick >= FAKE_FIELD_GOAL_DELAY;
        const ballCrossedLine =
            calculateDirectionalGain(
                offensiveTeam,
                state.ball.x - lineOfScrimmageX,
            ) > 0;

        return {
            state,
            kicker,
            defenders,
            offensiveTeammates,
            offensiveBallTouchers,
            defensiveBallTouchers,
            defensiveKickerTouchers,
            kickerCrossedLine,
            canFake,
            ballCrossedLine,
        };
    }

    function $handleKick(frame: Frame) {
        if (!frame.kicker.isKickingBall) return;

        $lockBall();

        if (isEarlyOutOfBounds(frame.state.ball)) {
            $effect(($) => {
                $.send(t`❌ Field goal went out of bounds.`);
            });

            $next({
                to: "PRESNAP",
                params: {
                    downState: failureDownState,
                },
                wait: FIELD_GOAL_RESULT_DELAY,
            });
        }

        $next({
            to: "FIELD_GOAL_IN_FLIGHT",
            params: {
                downState,
            },
        });
    }

    function $handleIllegalTouching(frame: Frame) {
        if (frame.offensiveBallTouchers.length === 0) return;

        const offenderNames = formatNames(frame.offensiveBallTouchers);

        $effect(($) => {
            $.send(
                t`❌ Illegal touch by ${offenderNames} before the kick • field goal is dead.`,
            );
        });

        $next({
            to: "PRESNAP",
            params: {
                downState: failureDownState,
            },
            wait: FIELD_GOAL_RESULT_DELAY,
        });
    }

    function $handleDefensiveTouching(frame: Frame) {
        if (frame.defensiveBallTouchers.length === 0) return;

        const offenderNames = formatNames(frame.defensiveBallTouchers);

        $effect(($) => {
            $.send(
                t`❌ Defensive touch by ${offenderNames} before the kick • field goal is dead.`,
            );
        });

        $next({
            to: "PRESNAP",
            params: {
                downState: failureDownState,
            },
            wait: FIELD_GOAL_RESULT_DELAY,
        });
    }

    function $handleDefensiveContact(frame: Frame) {
        if (frame.defensiveKickerTouchers.length === 0) return;

        const offenderNames = formatNames(frame.defensiveKickerTouchers);

        $effect(($) => {
            $.send(
                t`❌ Defensive contact by ${offenderNames} on ${frame.kicker.name} before the kick • field goal is dead.`,
            );
        });

        $next({
            to: "PRESNAP",
            params: {
                downState: failureDownState,
            },
            wait: FIELD_GOAL_RESULT_DELAY,
        });
    }

    function $handleFakeFieldGoal(frame: Frame) {
        if (!frame.kickerCrossedLine) return;

        if (frame.canFake) {
            $effect(($) => {
                $.send(t`🎭 ${frame.kicker.name} sells the fake field goal!`);
            });

            $next({
                to: "FAKE_FIELD_GOAL",
                params: {
                    playerId: frame.kicker.id,
                    downState,
                },
            });
        }

        if (!frame.canFake) {
            $effect(($) => {
                $.send(
                    t`❌ ${frame.kicker.name} crossed the LOS early • field goal is dead.`,
                );
            });

            $next({
                to: "PRESNAP",
                params: {
                    downState: failureDownState,
                },
                wait: FIELD_GOAL_RESULT_DELAY,
            });
        }
    }

    function $handleBallCrossedLine(frame: Frame) {
        if (frame.kicker.isKickingBall || !frame.ballCrossedLine) return;

        $effect(($) => {
            $.send(
                t`❌ Ball crossed the LOS before the kick • field goal is dead.`,
            );
        });

        $next({
            to: "PRESNAP",
            params: {
                downState: failureDownState,
            },
            wait: FIELD_GOAL_RESULT_DELAY,
        });
    }

    function run(state: GameState) {
        const frame = buildFrame(state);
        if (!frame) return;

        $handleKick(frame);
        $handleIllegalTouching(frame);
        $handleDefensiveTouching(frame);
        $handleDefensiveContact(frame);
        $handleFakeFieldGoal(frame);
        $handleBallCrossedLine(frame);
    }

    return { run };
}

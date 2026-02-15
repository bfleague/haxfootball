import type { GameState, GameStatePlayer } from "@runtime/engine";
import { $before, $dispose, $effect, $next } from "@runtime/runtime";
import { ticks } from "@common/general/time";
import { AVATARS, findBallCatchers, findCatchers } from "@common/game/game";
import { type FieldTeam } from "@runtime/models";
import { t } from "@lingui/core/macro";
import { cn } from "@meta/legacy/shared/message";
import { type FieldPosition } from "@common/game/game";
import { $createSharedCommandHandler } from "@meta/legacy/shared/commands";
import {
    calculateDirectionalGain,
    getPositionFromFieldPosition,
    isInExtraPointZone,
    isOutOfBounds,
} from "@meta/legacy/shared/stadium";
import {
    $setBallActive,
    $setBallInactive,
    $setLineOfScrimmage,
    $unsetFirstDownLine,
    $unsetLineOfScrimmage,
} from "@meta/legacy/hooks/game";
import type { CommandSpec } from "@runtime/commands";

const EXTRA_POINT_QB_RUN_DELAY = ticks({ seconds: 12 });

type Frame = {
    state: GameState;
    quarterback: GameStatePlayer;
    defenders: GameStatePlayer[];
    quarterbackCrossedLineOfScrimmage: boolean;
    isQuarterbackEligibleToRun: boolean;
};

export function ExtraPointBlitz({
    offensiveTeam,
    fieldPos,
    quarterbackId,
    ballIsDead = false,
    startedAt,
}: {
    offensiveTeam: FieldTeam;
    fieldPos: FieldPosition;
    quarterbackId: number;
    ballIsDead?: boolean;
    startedAt?: number;
}) {
    const lineOfScrimmageX = getPositionFromFieldPosition(fieldPos);
    const startTick =
        typeof startedAt === "number" ? startedAt : $before().tickNumber;

    $setLineOfScrimmage(fieldPos);
    $unsetFirstDownLine();

    if (ballIsDead) {
        $setBallInactive();
    } else {
        $setBallActive();
    }

    $effect(($) => {
        $.setAvatar(quarterbackId, AVATARS.BALL);
    });

    $dispose(() => {
        $effect(($) => {
            $.setAvatar(quarterbackId, null);
        });

        $unsetLineOfScrimmage();
        $unsetFirstDownLine();
        $setBallActive();
    });

    function buildFrame(state: GameState): Frame | null {
        const quarterback = state.players.find((p) => p.id === quarterbackId);
        if (!quarterback) return null;

        const defenders = state.players.filter(
            (player) => player.team !== offensiveTeam,
        );

        const quarterbackCrossedLineOfScrimmage =
            calculateDirectionalGain(
                offensiveTeam,
                quarterback.x - lineOfScrimmageX,
            ) > 0;

        const isQuarterbackEligibleToRun =
            state.tickNumber - startTick >= EXTRA_POINT_QB_RUN_DELAY;

        return {
            state,
            quarterback,
            defenders,
            quarterbackCrossedLineOfScrimmage,
            isQuarterbackEligibleToRun,
        };
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

    function $handleQuarterbackKick(frame: Frame) {
        if (ballIsDead || !frame.quarterback.isKickingBall) return;

        $next({
            to: "EXTRA_POINT_SNAP_IN_FLIGHT",
            params: {
                offensiveTeam,
                fieldPos,
            },
        });
    }

    function $handleOffensiveIllegalTouching(frame: Frame) {
        const offensiveTouchers = findBallCatchers(
            frame.state.ball,
            frame.state.players.filter(
                (player) =>
                    player.team === offensiveTeam &&
                    player.id !== frame.quarterback.id,
            ),
        );

        if (offensiveTouchers.length === 0) return;

        $effect(($) => {
            $.send(cn(t`❌ Offensive foul`, t`two-point try failed.`));
        });

        $failTwoPointAttempt();
    }

    function $handleDefensiveTouching(frame: Frame) {
        if (ballIsDead) return;

        const defensiveTouchers = findBallCatchers(
            frame.state.ball,
            frame.defenders,
        );

        if (defensiveTouchers.length === 0) return;

        $setBallInactive();
        $next({
            to: "EXTRA_POINT_BLITZ",
            params: {
                offensiveTeam,
                fieldPos,
                quarterbackId,
                ballIsDead: true,
                startedAt: startTick,
            },
        });
    }

    function $handleQuarterbackCrossedLine(frame: Frame) {
        if (!frame.quarterbackCrossedLineOfScrimmage) return;
        if (!frame.isQuarterbackEligibleToRun) return;

        $effect(($) => {
            $.send(t`🏃 QB ${frame.quarterback.name} keeps it and runs!`);
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

    function $handleOutsideExtraPointZone(frame: Frame) {
        if (isInExtraPointZone(frame.quarterback, offensiveTeam)) return;

        $effect(($) => {
            $.send(t`❌ Two-point try failed.`);
            $.setAvatar(quarterbackId, AVATARS.CANCEL);
        });

        $dispose(() => {
            $effect(($) => {
                $.setAvatar(quarterbackId, null);
            });
        });

        $failTwoPointAttempt();
    }

    function $handleQuarterbackOutOfBounds(frame: Frame) {
        if (!isOutOfBounds(frame.quarterback)) return;

        $effect(($) => {
            $.send(t`❌ Two-point try failed.`);
            $.setAvatar(quarterbackId, AVATARS.CANCEL);
        });

        $dispose(() => {
            $effect(($) => {
                $.setAvatar(quarterbackId, null);
            });
        });

        $failTwoPointAttempt();
    }

    function $handleQuarterbackSacked(frame: Frame) {
        const catchers = findCatchers(frame.quarterback, frame.defenders);
        if (catchers.length === 0) return;

        $effect(($) => {
            $.send(t`❌ Two-point try failed.`);
            $.setAvatar(quarterbackId, AVATARS.CANCEL);

            catchers.forEach((player) => {
                $.setAvatar(player.id, AVATARS.MUSCLE);
            });
        });

        $dispose(() => {
            $effect(($) => {
                $.setAvatar(quarterbackId, null);

                catchers.forEach((player) => {
                    $.setAvatar(player.id, null);
                });
            });
        });

        $failTwoPointAttempt();
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
        const frame = buildFrame(state);
        if (!frame) return;

        $handleQuarterbackKick(frame);
        $handleOffensiveIllegalTouching(frame);
        $handleDefensiveTouching(frame);
        $handleQuarterbackCrossedLine(frame);
        $handleOutsideExtraPointZone(frame);
        $handleQuarterbackOutOfBounds(frame);
        $handleQuarterbackSacked(frame);
    }

    return { run, command };
}

import type { GameState } from "@runtime/engine";
import { $dispose, $effect, $next } from "@runtime/runtime";
import { ticks } from "@common/general/time";
import { findBallCatcher, type FieldPosition } from "@common/game/game";
import { t } from "@lingui/core/macro";
import { type FieldTeam } from "@runtime/models";
import {
    isInExtraPointZone,
    isBallOutOfBounds,
} from "@meta/legacy/utils/stadium";
import {
    $setLineOfScrimmage,
    $unsetFirstDownLine,
    $unsetLineOfScrimmage,
} from "@meta/legacy/hooks/game";

export function ExtraPointSnapInFlight({
    offensiveTeam,
    fieldPos,
}: {
    offensiveTeam: FieldTeam;
    fieldPos: FieldPosition;
}) {
    $setLineOfScrimmage(fieldPos);
    $unsetFirstDownLine();

    $dispose(() => {
        $unsetLineOfScrimmage();
        $unsetFirstDownLine();
    });

    function run(state: GameState) {
        if (isBallOutOfBounds(state.ball)) {
            $effect(($) => {
                $.send(t`❌ Two-point try failed.`);
            });

            $next({
                to: "KICKOFF",
                params: {
                    forTeam: offensiveTeam,
                },
                wait: ticks({ seconds: 2 }),
            });
        }

        const offensiveCatcher = findBallCatcher(
            state.ball,
            state.players.filter((p) => p.team === offensiveTeam),
        );

        if (offensiveCatcher) {
            $effect(($) => {
                $.send(t`🏈 Two-point pass complete to ${offensiveCatcher.name}!`);
            });

            $next({
                to: "EXTRA_POINT_RUN",
                params: {
                    playerId: offensiveCatcher.id,
                    ballTeam: offensiveTeam,
                    originalOffensiveTeam: offensiveTeam,
                    fieldPos,
                },
            });
        }

        const defensiveCatcher = findBallCatcher(
            state.ball,
            state.players.filter((p) => p.team !== offensiveTeam),
        );

        if (defensiveCatcher) {
            $next({
                to: "EXTRA_POINT_PASS_DEFLECTION",
                params: {
                    blockTime: state.tickNumber,
                    blockerId: defensiveCatcher.id,
                    isKickingBall: defensiveCatcher.isKickingBall,
                    offensiveTeam,
                    fieldPos,
                },
            });
        }

        if (!isInExtraPointZone(state.ball, offensiveTeam)) {
            $effect(($) => {
                $.send(t`❌ Two-point try failed.`);
            });

            $next({
                to: "KICKOFF",
                params: {
                    forTeam: offensiveTeam,
                },
                wait: ticks({ seconds: 2 }),
            });
        }
    }

    return { run };
}

import { $dispose, $effect, $next } from "@common/hooks";
import { findBallCatcher, ticks } from "@common/utils";
import type { GameState } from "@common/engine";
import { t } from "@lingui/core/macro";
import { isOutOfBounds } from "@meta/legacy/utils/stadium";
import { advanceDownState, DownState } from "@meta/legacy/utils/game";
import {
    $setBallActive,
    $setBallInactive,
    $setFirstDownLine,
    $setLineOfScrimmage,
    $unsetFirstDownLine,
    $unsetLineOfScrimmage,
} from "@meta/legacy/hooks/game";

export function SnapInFlight({ downState }: { downState: DownState }) {
    const { offensiveTeam, fieldPos, downAndDistance } = downState;

    $setLineOfScrimmage(fieldPos);
    $setFirstDownLine(offensiveTeam, fieldPos, downAndDistance.distance);

    function run(state: GameState) {
        if (isOutOfBounds(state.ball)) {
            const { downState: nextDownState, event } =
                advanceDownState(downState);

            $setBallInactive();

            $dispose(() => {
                $setBallActive();
            });

            $effect(($) => {
                switch (event.type) {
                    case "FIRST_DOWN":
                        $.send(t`Ball went out of bounds, first down!`);
                        $.stat("SNAP_IN_FLIGHT_OUT_OF_BOUNDS_FIRST_DOWN");
                        break;
                    case "NEXT_DOWN":
                        if (event.yardsGained === 0) {
                            $.send(t`Ball went out of bounds, no gain!`);
                            $.stat("SNAP_IN_FLIGHT_OUT_OF_BOUNDS_NO_GAIN");
                        } else {
                            $.send(t`Ball went out of bounds, next down!`);
                            $.stat("SNAP_IN_FLIGHT_OUT_OF_BOUNDS_NEXT_DOWN");
                        }
                        break;
                    case "TURNOVER_ON_DOWNS":
                        $.send(
                            t`Turnover on downs as ball went out of bounds!`,
                        );
                        $.stat(
                            "SNAP_IN_FLIGHT_OUT_OF_BOUNDS_TURNOVER_ON_DOWNS",
                        );
                        break;
                }
            });

            $next({
                to: "PRESNAP",
                params: {
                    downState: nextDownState,
                },
                wait: ticks({ seconds: 2 }),
            });
        }

        const catcher = findBallCatcher(
            state.ball,
            state.players.filter((p) => p.team === offensiveTeam),
        );

        if (catcher) {
            $effect(($) => {
                $.send(t`Pass caught by ${catcher.name}!`);
                $.stat("PASS_CATCHED");
            });

            $next({
                to: "LIVE_BALL",
                params: { playerId: catcher.id, downState },
            });
        }

        // TODO: Catch by offensive team and interceptions
    }

    function dispose() {
        $unsetLineOfScrimmage();
        $unsetFirstDownLine();
    }

    return { run, dispose };
}

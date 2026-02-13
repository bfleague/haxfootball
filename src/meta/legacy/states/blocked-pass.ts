import { GameState } from "@runtime/engine";
import { $dispose, $effect, $next } from "@runtime/runtime";
import {
    DownState,
    incrementDownState,
    processDownEventIncrement,
    withLastBallYAtCenter,
} from "@meta/legacy/utils/down";
import { ticks } from "@common/general/time";
import { AVATARS } from "@common/game/game";
import {
    $setBallActive,
    $setBallInactive,
    $setFirstDownLine,
    $setLineOfScrimmage,
    $unsetFirstDownLine,
    $unsetLineOfScrimmage,
} from "@meta/legacy/hooks/game";
import { t } from "@lingui/core/macro";

export function BlockedPass({
    blockerId,
    downState,
}: {
    blockerId: number;
    downState: DownState;
}) {
    const { offensiveTeam, fieldPos, downAndDistance } = downState;

    $setLineOfScrimmage(fieldPos);
    $setFirstDownLine(offensiveTeam, fieldPos, downAndDistance.distance);
    $setBallInactive();

    $dispose(() => {
        $unsetLineOfScrimmage();
        $setBallActive();
        $unsetFirstDownLine();
    });

    function run(state: GameState) {
        const blocker = state.players.find((p) => p.id === blockerId);
        if (!blocker) return;

        const { event, downState: baseDownState } =
            incrementDownState(downState);
        const nextDownState = withLastBallYAtCenter(baseDownState);

        $effect(($) => {
            $.setAvatar(blockerId, AVATARS.CONSTRUCTION);
        });

        $dispose(() => {
            $effect(($) => {
                $.setAvatar(blockerId, null);
            });
        });

        processDownEventIncrement({
            event,
            onNextDown() {
                $effect(($) => {
                    $.send(t`🚧 Pass batted by ${blocker.name} • no gain.`);
                });
            },
            onTurnoverOnDowns() {
                $effect(($) => {
                    $.send(
                        t`🚧 Pass batted by ${blocker.name} • TURNOVER ON DOWNS!`,
                    );
                });
            },
        });

        $next({
            to: "PRESNAP",
            params: {
                downState: nextDownState,
            },
            wait: ticks({ seconds: 1 }),
        });
    }

    return { run };
}

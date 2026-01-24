import { GameState } from "@common/engine";
import { $dispose, $effect, $next } from "@common/runtime";
import {
    DownState,
    incrementDownState,
    processDownEventIncrement,
} from "@meta/legacy/utils/down";
import { AVATARS, ticks } from "@common/utils";
import {
    $setBallActive,
    $setBallInactive,
    $setFirstDownLine,
    $setLineOfScrimmage,
    $unsetFirstDownLine,
    $unsetLineOfScrimmage,
} from "@meta/legacy/hooks/game";

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

        const { event, downState: nextDownState } =
            incrementDownState(downState);

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
                    $.send(`Pass blocked by ${blocker.name}, no gain!`);
                });
            },
            onTurnoverOnDowns() {
                $effect(($) => {
                    $.send(
                        `Pass blocked by ${blocker.name}, turnover on downs!`,
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

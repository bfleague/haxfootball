import type { GameState } from "@runtime/engine";
import { $dispose, $effect, $next } from "@runtime/runtime";
import { ticks } from "@common/general/time";
import { AVATARS, type FieldPosition } from "@common/game/game";
import { t } from "@lingui/core/macro";
import { type FieldTeam } from "@runtime/models";
import {
    $setBallActive,
    $setBallInactive,
    $setLineOfScrimmage,
    $unsetFirstDownLine,
    $unsetLineOfScrimmage,
} from "@meta/legacy/hooks/game";

export function ExtraPointBlockedPass({
    blockerId,
    offensiveTeam,
    fieldPos,
}: {
    blockerId: number;
    offensiveTeam: FieldTeam;
    fieldPos: FieldPosition;
}) {
    $setLineOfScrimmage(fieldPos);
    $unsetFirstDownLine();
    $setBallInactive();

    $dispose(() => {
        $unsetLineOfScrimmage();
        $unsetFirstDownLine();
        $setBallActive();
    });

    function run(state: GameState) {
        const blocker = state.players.find((player) => player.id === blockerId);
        if (!blocker) return;

        $effect(($) => {
            $.setAvatar(blockerId, AVATARS.CONSTRUCTION);
            $.send(t`🚧 Pass batted by ${blocker.name} • two-point try failed.`);
        });

        $dispose(() => {
            $effect(($) => {
                $.setAvatar(blockerId, null);
            });
        });

        $next({
            to: "KICKOFF",
            params: {
                forTeam: offensiveTeam,
            },
            wait: ticks({ seconds: 2 }),
        });
    }

    return { run };
}

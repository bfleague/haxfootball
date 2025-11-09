import { $effect, $config } from "@common/hooks";
import type { FieldTeam } from "@common/models";
import { opposite, getDistance, AVATARS } from "@common/utils";
import type { GameState } from "@common/engine";
import type { Config } from "@meta/legacy/config";

export function KickoffCaught({
    playerId,
    receivingTeam,
}: {
    playerId: number;
    receivingTeam: FieldTeam;
}) {
    const cfg = $config<Config>();

    $effect(($) => {
        $.setAvatar(playerId, AVATARS.BALL);
    });

    function run(state: GameState) {
        const player = state.players.find((p) => p.id === playerId);

        if (!player) return;

        const catcher = state.players.find(
            (p) =>
                p.team === opposite(receivingTeam) &&
                getDistance(p, player) <= cfg.TOUCHING_DISTANCE,
        );

        if (catcher) {
            $effect(($) => {
                $.send(`${player.name} caught by ${catcher.name}!`);
                $.stat("KICKOFF_CAUGHT");
                $.stopGame();
            });
        }
    }

    function dispose() {
        $effect(($) => {
            $.setAvatar(playerId, null);
        });
    }

    return { run, dispose };
}

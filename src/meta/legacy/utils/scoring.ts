import { opposite, PointLike } from "@common/utils";
import {
    calculateDirectionalGain,
    getPositionFromFieldPosition,
    intersectsEndZone,
    isOutOfBounds,
} from "./stadium";
import { FieldTeam } from "@common/models";

export const SCORES = {
    SAFETY: 2,
    TOUCHDOWN: 7, // Includes PAT
    FIELD_GOAL: 3,
};

export function isTouchdown({
    player,
    offensiveTeam,
}: {
    player: PointLike;
    offensiveTeam: FieldTeam;
}) {
    const scoringSide = opposite(offensiveTeam);
    const goalLineX = getPositionFromFieldPosition({
        side: scoringSide,
        yards: 0,
    });

    const radius = Math.max(0, player.radius ?? 0);
    const brokePlane =
        calculateDirectionalGain(offensiveTeam, player.x - goalLineX) +
            radius >=
        0;

    const isTouchdown =
        !isOutOfBounds(player) &&
        brokePlane &&
        intersectsEndZone(player, scoringSide);

    return isTouchdown;
}

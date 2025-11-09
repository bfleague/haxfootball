import { Team, type FieldTeam } from "@common/models";

export function opposite(t: FieldTeam): FieldTeam {
    return t === Team.RED ? Team.BLUE : Team.RED;
}

type PointLike = { x: number; y: number; radius?: number | null };

export function getDistance(a: PointLike, b: PointLike): number {
    const dx = a.x - b.x;
    const dy = a.y - b.y;

    const center = Math.hypot(dx, dy);

    const ar = typeof a.radius === "number" ? a.radius : 0;
    const br = typeof b.radius === "number" ? b.radius : 0;

    const surfaceDistance = center - ar - br;

    return surfaceDistance > 0 ? surfaceDistance : 0;
}

export const AVATARS = {
    BALL: "🏈",
};

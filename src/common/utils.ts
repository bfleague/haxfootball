import { Team } from "@common/models";

export function opposite(t: Team): Team {
    if (t === Team.RED) return Team.BLUE;
    if (t === Team.BLUE) return Team.RED;
    return t;
}

export function getDistance(
    a: { x: number; y: number },
    b: { x: number; y: number },
): number {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.hypot(dx, dy);
}

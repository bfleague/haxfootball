import { Team, type FieldTeam } from "@common/models";

export const AVATARS = {
    BALL: "🏈",
};

export const DEFAULT_TOUCHING_DISTANCE = 0.5;

export function opposite(t: FieldTeam): FieldTeam {
    return t === Team.RED ? Team.BLUE : Team.RED;
}

type PointLike = { x: number; y: number; radius?: number | null };
type IdentifiedPointLike = PointLike & { id: number };
type MaybeKickableIdentifiedPointLike = IdentifiedPointLike & {
    isKickingBall?: boolean;
};

export function getDistance(a: PointLike, b: PointLike): number {
    const dx = a.x - b.x;
    const dy = a.y - b.y;

    const center = Math.hypot(dx, dy);

    const ar = typeof a.radius === "number" ? a.radius : 0;
    const br = typeof b.radius === "number" ? b.radius : 0;

    const surfaceDistance = center - ar - br;

    return surfaceDistance > 0 ? surfaceDistance : 0;
}

export function findCatchingBallPlayers<
    T extends MaybeKickableIdentifiedPointLike,
>(ball: PointLike, players: T[], maxDistance = DEFAULT_TOUCHING_DISTANCE): T[] {
    return players.filter((p) => {
        const distance = getDistance(p, ball);

        return p.isKickingBall || distance <= maxDistance;
    });
}

export function findCatchingBallPlayer<
    T extends MaybeKickableIdentifiedPointLike,
>(
    ball: PointLike,
    players: T[],
    maxDistance = DEFAULT_TOUCHING_DISTANCE,
): T | null {
    for (const p of players) {
        const distance = getDistance(p, ball);

        if (p.isKickingBall || distance <= maxDistance) {
            return p;
        }
    }

    return null;
}

export function findCollidingPlayers<
    T extends MaybeKickableIdentifiedPointLike,
>(
    a: MaybeKickableIdentifiedPointLike,
    players: T[],
    maxDistance = DEFAULT_TOUCHING_DISTANCE,
): T[] {
    return players.filter((p) => {
        if (p.id === a.id) return false;

        const distance = getDistance(p, a);
        return distance <= maxDistance;
    });
}

export function findCollidingPlayer<T extends MaybeKickableIdentifiedPointLike>(
    a: MaybeKickableIdentifiedPointLike,
    players: T[],
    maxDistance = DEFAULT_TOUCHING_DISTANCE,
): T | null {
    for (const p of players) {
        if (p.id === a.id) continue;

        const distance = getDistance(p, a);

        if (distance <= maxDistance) {
            return p;
        }
    }

    return null;
}

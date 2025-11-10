import { Team, type FieldTeam } from "@common/models";

export const AVATARS = {
    BALL: "🏈",
};

export const DEFAULT_TOUCHING_DISTANCE = 0.5;

export function opposite(t: FieldTeam): FieldTeam {
    return t === Team.RED ? Team.BLUE : Team.RED;
}

export type PointLike = { x: number; y: number; radius?: number | null };
type IdentifiedPointLike = PointLike & { id: number };
type MaybeKickableIdentifiedPointLike = IdentifiedPointLike & {
    isKickingBall?: boolean;
};

export type LineDistributionMode =
    | "space-between"
    | "space-around"
    | "space-evenly";

export interface DistributePointLikesOptions {
    mode?: LineDistributionMode;
}

export function getDistance(a: PointLike, b: PointLike): number {
    const dx = a.x - b.x;
    const dy = a.y - b.y;

    const center = Math.hypot(dx, dy);

    const ar = typeof a.radius === "number" ? a.radius : 0;
    const br = typeof b.radius === "number" ? b.radius : 0;

    const surfaceDistance = center - ar - br;

    return surfaceDistance > 0 ? surfaceDistance : 0;
}

export function getMidpoint(a: PointLike, b: PointLike): PointLike {
    const radiusA = typeof a.radius === "number" ? a.radius : null;
    const radiusB = typeof b.radius === "number" ? b.radius : null;
    let radius: number | null = null;

    if (radiusA !== null && radiusB !== null) {
        radius = (radiusA + radiusB) / 2;
    } else if (radiusA !== null) {
        radius = radiusA;
    } else if (radiusB !== null) {
        radius = radiusB;
    }

    return {
        x: (a.x + b.x) / 2,
        y: (a.y + b.y) / 2,
        radius,
    };
}

export function findBallCatchers<T extends MaybeKickableIdentifiedPointLike>(
    ball: PointLike,
    players: T[],
    maxDistance = DEFAULT_TOUCHING_DISTANCE,
): T[] {
    return players.filter((p) => {
        const distance = getDistance(p, ball);

        return p.isKickingBall || distance <= maxDistance;
    });
}

export function findBallCatcher<T extends MaybeKickableIdentifiedPointLike>(
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

export function findCatchers<T extends MaybeKickableIdentifiedPointLike>(
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

export function findCatcher<T extends MaybeKickableIdentifiedPointLike>(
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

export function distributeOnLine<T extends PointLike>(
    points: T[],
    line: { start: PointLike; end: PointLike },
    options?: DistributePointLikesOptions,
): T[] {
    const count = points.length;

    if (count === 0) return [];

    const start = line.start;
    const end = line.end;
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.hypot(dx, dy);

    if (length === 0) {
        return points.map((point) => ({
            ...point,
            x: start.x,
            y: start.y,
        }));
    }

    const dirX = dx / length;
    const dirY = dy / length;
    const radii = points.map((point) => Math.max(0, point.radius ?? 0));
    const totalDiameter = radii.reduce((sum, radius) => sum + radius * 2, 0);
    const available = Math.max(0, length - totalDiameter);
    const mode = options?.mode ?? "space-evenly";

    let gapStart: number;
    let gapBetween: number;

    if (count === 1) {
        const gap = available / 2;
        gapStart = gap;
        gapBetween = 0;
    } else {
        const baseGap = (() => {
            switch (mode) {
                case "space-between":
                    return available / Math.max(1, count - 1);
                case "space-around":
                    return available / (count * 2);
                case "space-evenly":
                default:
                    return available / (count + 1);
            }
        })();

        switch (mode) {
            case "space-between":
                gapStart = 0;
                gapBetween = baseGap;
                break;
            case "space-around":
                gapStart = baseGap;
                gapBetween = baseGap * 2;
                break;
            case "space-evenly":
            default:
                gapStart = baseGap;
                gapBetween = baseGap;
                break;
        }
    }

    const firstRadius = radii[0] ?? 0;
    let cursor = gapStart + firstRadius;

    return points.map((point, index) => {
        const x = start.x + dirX * cursor;
        const y = start.y + dirY * cursor;
        const leftRadius = radii[index] ?? 0;
        const rightRadius = radii[index + 1] ?? 0;
        const next =
            index < count - 1 ? leftRadius + gapBetween + rightRadius : 0;

        cursor += next;

        return {
            ...point,
            x,
            y,
        };
    });
}

import { FieldTeam, Team } from "@runtime/models";
import { getDistance, PointLike } from "./math";

export const AVATARS = {
    BALL: "🏈",
    CANCEL: "❌",
    MUSCLE: "💪",
    CLOWN: "🤡",
    FIRE: "🔥",
    CONSTRUCTION: "🚧",
    DIZZY: "😵",
};

export const DEFAULT_TOUCHING_DISTANCE = 0.5;

export function opposite(t: FieldTeam): FieldTeam {
    return t === Team.RED ? Team.BLUE : Team.RED;
}

export type FieldPosition = { yards: number; side: FieldTeam };

type IdentifiedPointLike = PointLike & { id: number };
type MaybeKickableIdentifiedPointLike = IdentifiedPointLike & {
    isKickingBall?: boolean;
};

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

export function calculateFieldPosition(
    x: number,
    startX: number,
    endX: number,
    yardLength: number,
): FieldPosition {
    if (x < startX) return { side: Team.RED, yards: 1 };
    if (x > endX) return { side: Team.BLUE, yards: 1 };

    const yardsFromCenter = Math.round(x / yardLength);
    const yardsComplement = 50 - Math.abs(yardsFromCenter);

    return {
        side: yardsFromCenter < 0 ? Team.RED : Team.BLUE,
        yards: yardsComplement || 1,
    };
}

export function calculatePositionFromFieldPosition(
    position: FieldPosition,
    startX: number,
    endX: number,
    yardLength: number,
): number {
    if (position.side === Team.RED) {
        return startX + yardLength * position.yards;
    } else {
        return endX - yardLength * position.yards;
    }
}

export type SetAvatarFn = (playerId: number, avatar: string | null) => void;

export function setPlayerAvatars(
    playerIds: number[],
    setAvatar: SetAvatarFn,
    avatar: string | null,
): void {
    playerIds.forEach((playerId) => {
        setAvatar(playerId, avatar);
    });
}

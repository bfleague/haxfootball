import { Team, type FieldTeam } from "@common/models";
import {
    calculateFieldPosition,
    calculatePositionFromFieldPosition,
    FieldPosition,
    Line,
    PointLike,
    Ray,
} from "@common/utils";

const MapMeasures = {
    END_ZONE_RED: {
        topLeft: { x: -930, y: -266 },
        bottomRight: { x: -775, y: 266 },
    },
    END_ZONE_BLUE: {
        topLeft: { x: 930, y: -266 },
        bottomRight: { x: 775, y: 266 },
    },
    RED_ZONE_RED: {
        topLeft: { x: -775, y: -266 },
        bottomRight: { x: -462, y: 266 },
    },
    RED_ZONE_BLUE: {
        topLeft: { x: 775, y: 266 },
        bottomRight: { x: 462, y: -266 },
    },
    INNER_FIELD: {
        topLeft: { x: -775, y: -266 },
        bottomRight: { x: 775, y: 266 },
    },
    OUTER_FIELD: {
        topLeft: { x: -930, y: -266 },
        bottomRight: { x: 930, y: 266 },
    },
    RED_GOAL_LINE: {
        start: { x: -930, y: -60 },
        end: { x: -930, y: 60 },
    },
    BLUE_GOAL_LINE: {
        start: { x: 930, y: -60 },
        end: { x: 930, y: 60 },
    },
    GOAL_POST_RADIUS: 4,
    HASHES_HEIGHT: {
        upperY: -80,
        lowerY: 80,
    },
    SINGLE_HASH_HEIGHT: 20,
    RED_END_ZONE_START_POSITION_X: -775,
    BLUE_END_ZONE_START_POSITION_X: 775,
    RED_END_ZONE_LINE_CENTER: { x: -775, y: 0 },
    BLUE_END_ZONE_LINE_CENTER: { x: 775, y: 0 },
    YARD: 15.5,
    HASH_SUBDIVISION: 31,
    YARDS_BETWEEN_0_MARK_AND_GOAL_LINE: 10,
};

export const BALL_RADIUS = 7.125;
export const BALL_OFFSET_YARDS = 2;

export const SPECIAL_HIDDEN_POSITION = {
    x: 2000,
    y: 2000,
};

export const TOUCHBACK_YARD_LINE = 25;
export const KICKOFF_OUT_OF_BOUNDS_YARD_LINE = 40;

export const BALL_DISC_ID = 0;
export const BALL_ACTIVE_COLOR = 0x631515;
export const BALL_INACTIVE_COLOR = 0x808080;

const SPECIAL_DISC_IDS = {
    LOS: [7, 8],
    FIRST_DOWN: [5, 6],
    INTERCEPTION_PATH: [50, 51],
} as const;

export function getFieldPosition(
    x: number,
    startX = MapMeasures.RED_END_ZONE_START_POSITION_X,
    endX = MapMeasures.BLUE_END_ZONE_START_POSITION_X,
    yardLength = MapMeasures.YARD,
): FieldPosition {
    return calculateFieldPosition(x, startX, endX, yardLength);
}

export function isInMainField(position: Position): boolean {
    return (
        position.x >= MapMeasures.INNER_FIELD.topLeft.x &&
        position.x <= MapMeasures.INNER_FIELD.bottomRight.x
    );
}

export function intersectsMainField(position: PointLike): boolean {
    const minX = Math.min(
        MapMeasures.INNER_FIELD.topLeft.x,
        MapMeasures.INNER_FIELD.bottomRight.x,
    );
    const maxX = Math.max(
        MapMeasures.INNER_FIELD.topLeft.x,
        MapMeasures.INNER_FIELD.bottomRight.x,
    );
    const minY = Math.min(
        MapMeasures.INNER_FIELD.topLeft.y,
        MapMeasures.INNER_FIELD.bottomRight.y,
    );
    const maxY = Math.max(
        MapMeasures.INNER_FIELD.topLeft.y,
        MapMeasures.INNER_FIELD.bottomRight.y,
    );
    const radius = Math.max(0, position.radius ?? 0);

    const closestX = Math.min(Math.max(position.x, minX), maxX);
    const closestY = Math.min(Math.max(position.y, minY), maxY);
    const dx = position.x - closestX;
    const dy = position.y - closestY;

    return dx * dx + dy * dy <= radius * radius;
}

export function isPartiallyOutsideMainField(position: PointLike): boolean {
    const minX = Math.min(
        MapMeasures.INNER_FIELD.topLeft.x,
        MapMeasures.INNER_FIELD.bottomRight.x,
    );
    const maxX = Math.max(
        MapMeasures.INNER_FIELD.topLeft.x,
        MapMeasures.INNER_FIELD.bottomRight.x,
    );
    const minY = Math.min(
        MapMeasures.INNER_FIELD.topLeft.y,
        MapMeasures.INNER_FIELD.bottomRight.y,
    );
    const maxY = Math.max(
        MapMeasures.INNER_FIELD.topLeft.y,
        MapMeasures.INNER_FIELD.bottomRight.y,
    );
    const radius = Math.max(0, position.radius ?? 0);

    return (
        position.x - radius < minX ||
        position.x + radius > maxX ||
        position.y - radius < minY ||
        position.y + radius > maxY
    );
}

export function isCompletelyInsideMainField(position: PointLike): boolean {
    return !isPartiallyOutsideMainField(position);
}

export function isCompletelyOutsideMainField(position: PointLike): boolean {
    return !intersectsMainField(position);
}

export function getPositionFromFieldPosition(
    fieldPos: FieldPosition,
    startX = MapMeasures.RED_END_ZONE_LINE_CENTER.x,
    endX = MapMeasures.BLUE_END_ZONE_LINE_CENTER.x,
    yardLength = MapMeasures.YARD,
): number {
    return calculatePositionFromFieldPosition(
        fieldPos,
        startX,
        endX,
        yardLength,
    );
}

export function calculateSnapBallPosition(
    forTeam: Team,
    fieldPos: FieldPosition,
    offsetYards = 0,
    yardLength = MapMeasures.YARD,
): Position {
    return {
        x:
            getPositionFromFieldPosition(fieldPos) +
            yardLength * offsetYards * (forTeam === Team.RED ? -1 : 1),
        y: 0,
    };
}

export function ballWithRadius(
    position: Position,
    radius = BALL_RADIUS,
): PointLike {
    return {
        x: position.x,
        y: position.y,
        radius,
    };
}

export function isOutOfBounds(position: Position): boolean {
    return (
        position.x < MapMeasures.OUTER_FIELD.topLeft.x ||
        position.x > MapMeasures.OUTER_FIELD.bottomRight.x ||
        position.y < MapMeasures.OUTER_FIELD.topLeft.y ||
        position.y > MapMeasures.OUTER_FIELD.bottomRight.y
    );
}

function getEndZone(side: FieldTeam) {
    return side === Team.RED
        ? MapMeasures.END_ZONE_RED
        : MapMeasures.END_ZONE_BLUE;
}

export function intersectsEndZone(
    position: PointLike,
    endZoneSide: FieldTeam,
): boolean {
    const endZone = getEndZone(endZoneSide);
    const minX = Math.min(endZone.topLeft.x, endZone.bottomRight.x);
    const maxX = Math.max(endZone.topLeft.x, endZone.bottomRight.x);
    const minY = Math.min(endZone.topLeft.y, endZone.bottomRight.y);
    const maxY = Math.max(endZone.topLeft.y, endZone.bottomRight.y);
    const radius = Math.max(0, position.radius ?? 0);

    const closestX = Math.min(Math.max(position.x, minX), maxX);
    const closestY = Math.min(Math.max(position.y, minY), maxY);
    const dx = position.x - closestX;
    const dy = position.y - closestY;

    return dx * dx + dy * dy <= radius * radius;
}

export function getLineOfScrimmage(): { id: number }[];
export function getLineOfScrimmage(
    fieldPos: FieldPosition,
): { id: number; position: Position }[];
export function getLineOfScrimmage(
    fieldPos?: FieldPosition,
): { id: number; position?: Position }[] {
    if (fieldPos === undefined) {
        return [
            { id: SPECIAL_DISC_IDS.LOS[0] },
            { id: SPECIAL_DISC_IDS.LOS[1] },
        ];
    }

    const x = getPositionFromFieldPosition(fieldPos);
    const offset = 2;
    const upperHashY = MapMeasures.INNER_FIELD.topLeft.y + offset;
    const lowerHashY = MapMeasures.INNER_FIELD.bottomRight.y - offset;

    return [
        { id: SPECIAL_DISC_IDS.LOS[0], position: { x, y: upperHashY } },
        { id: SPECIAL_DISC_IDS.LOS[1], position: { x, y: lowerHashY } },
    ];
}

export function getFirstDownLine(): { id: number }[];
export function getFirstDownLine(
    offensiveTeam: Team,
    fieldPos: FieldPosition,
    distance: number,
): { id: number; position: Position }[];
export function getFirstDownLine(
    offensiveTeam?: Team,
    fieldPos?: FieldPosition,
    distance?: number,
): { id: number; position?: Position }[] {
    if (
        offensiveTeam === undefined ||
        fieldPos === undefined ||
        distance === undefined
    ) {
        return [
            { id: SPECIAL_DISC_IDS.FIRST_DOWN[0] },
            { id: SPECIAL_DISC_IDS.FIRST_DOWN[1] },
        ];
    }

    const losX = getPositionFromFieldPosition(fieldPos);
    const yardsInX = distance * MapMeasures.YARD;
    const direction = offensiveTeam === Team.RED ? 1 : -1;
    const x = losX + yardsInX * direction;

    const offset = 2;
    const upperHashY = MapMeasures.INNER_FIELD.topLeft.y + offset;
    const lowerHashY = MapMeasures.INNER_FIELD.bottomRight.y - offset;

    return [
        { id: SPECIAL_DISC_IDS.FIRST_DOWN[0], position: { x, y: upperHashY } },
        { id: SPECIAL_DISC_IDS.FIRST_DOWN[1], position: { x, y: lowerHashY } },
    ];
}

export function getInterceptionPath(): { id: number }[];
export function getInterceptionPath(
    line: Line,
): { id: number; position: Position }[];
export function getInterceptionPath(
    line?: Line,
): { id: number; position?: Position }[] {
    if (!line) {
        return [
            { id: SPECIAL_DISC_IDS.INTERCEPTION_PATH[0] },
            { id: SPECIAL_DISC_IDS.INTERCEPTION_PATH[1] },
        ];
    }

    return [
        {
            id: SPECIAL_DISC_IDS.INTERCEPTION_PATH[0],
            position: { x: line.start.x, y: line.start.y },
        },
        {
            id: SPECIAL_DISC_IDS.INTERCEPTION_PATH[1],
            position: { x: line.end.x, y: line.end.y },
        },
    ];
}

export function xDistanceToYards(xDistance: number): number {
    return Math.round(xDistance / MapMeasures.YARD);
}

export function calculateDirectionalGain(
    offensiveTeam: Team,
    xGained: number,
): number {
    return offensiveTeam === Team.RED ? xGained : -xGained;
}

export function calculateYardsGained(
    offensiveTeam: Team,
    fromFieldPos: FieldPosition,
    toFieldPos: FieldPosition,
): number {
    const fromX = getPositionFromFieldPosition(fromFieldPos);
    const toX = getPositionFromFieldPosition(toFieldPos);
    const xGained = toX - fromX;

    return xDistanceToYards(calculateDirectionalGain(offensiveTeam, xGained));
}

export function getBallPath(
    ballX: number,
    ballY: number,
    xSpeed: number,
    ySpeed: number,
): Ray {
    return {
        origin: { x: ballX, y: ballY },
        direction: { x: xSpeed, y: ySpeed },
    };
}

export type RaySegmentIntersectionResult =
    | { intersects: true; point: PointLike }
    | { intersects: false };

export function intersectRayWithSegment(
    ray: Ray,
    segment: Line,
): RaySegmentIntersectionResult {
    const ox = ray.origin.x;
    const oy = ray.origin.y;
    const dx = ray.direction.x;
    const dy = ray.direction.y;

    const x3 = segment.start.x;
    const y3 = segment.start.y;
    const x4 = segment.end.x;
    const y4 = segment.end.y;

    const segmentDx = x4 - x3;
    const segmentDy = y4 - y3;

    const denominator = dx * segmentDy - dy * segmentDx;

    if (Math.abs(denominator) < 1e-10) {
        return { intersects: false };
    }

    const t = ((x3 - ox) * segmentDy - (y3 - oy) * segmentDx) / denominator;
    const u = ((x3 - ox) * dy - (y3 - oy) * dx) / denominator;

    if (t >= 0 && u >= 0 && u <= 1) {
        return {
            intersects: true,
            point: {
                x: ox + t * dx,
                y: oy + t * dy,
            },
        };
    }

    return { intersects: false };
}

export type GoalPostIntersectionResult =
    | { intersects: true; line: Line; point: PointLike }
    | { intersects: false };

export function intersectsGoalPosts(
    ray: Ray,
    team: FieldTeam,
): GoalPostIntersectionResult {
    const goalLine =
        team === Team.RED
            ? MapMeasures.RED_GOAL_LINE
            : MapMeasures.BLUE_GOAL_LINE;

    const intersection = intersectRayWithSegment(ray, goalLine);

    if (intersection.intersects) {
        return {
            intersects: true,
            line: {
                start: goalLine.start,
                end: goalLine.end,
            },
            point: intersection.point,
        };
    }

    return { intersects: false };
}

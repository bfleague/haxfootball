import type {
    AnchorSpec,
    JointSpec,
    LineSpec,
    SegmentProps,
    StadiumIndex,
    VertexProps,
} from "@stadium/stadium-generator";
import type { Pair } from "@common/types";

type LinePoint = { x: number; y: number; vertex?: VertexProps };
type LineParams = {
    from: LinePoint;
    to: LinePoint;
    segment: SegmentProps;
    name?: string;
};

export function line(params: LineParams): LineSpec;
export function line(
    from: LinePoint,
    to: LinePoint,
    segment: SegmentProps,
    name?: string,
): LineSpec;
export function line(
    fromOrParams: LinePoint | LineParams,
    to?: LinePoint,
    segment?: SegmentProps,
    name?: string,
): LineSpec {
    if (typeof to === "undefined" && "from" in fromOrParams) {
        const { from, to: target, segment: seg, name: label } = fromOrParams;
        return {
            ...(label ? { name: label } : {}),
            from,
            to: target,
            segment: seg,
        };
    }

    if (!to || !segment) {
        throw new Error(
            "line requires either a params object or full arguments",
        );
    }

    return {
        ...(name ? { name } : {}),
        from: fromOrParams as LinePoint,
        to,
        segment,
    };
}

export const vLine = ({
    x,
    yStart,
    yEnd,
    segment,
    name,
    vertex,
}: {
    x: number;
    yStart: number;
    yEnd: number;
    segment: SegmentProps;
    name?: string;
    vertex?: VertexProps;
}): LineSpec =>
    line(
        vertex ? { x, y: yStart, vertex } : { x, y: yStart },
        vertex ? { x, y: yEnd, vertex } : { x, y: yEnd },
        segment,
        name,
    );

export function repeat<T>(count: number, make: (index: number) => T): T[];
export function repeat<T>(count: number, value: T): T[];
export function repeat<T>(
    count: number,
    valueOrMake: T | ((index: number) => T),
): T[] {
    return Array.from({ length: count }, (_, index) =>
        typeof valueOrMake === "function"
            ? (valueOrMake as (index: number) => T)(index)
            : valueOrMake,
    );
}

export const pos = (x: number, y: number): Pair<number> => [x, y];
export const lengthRange = (min: number, max: number): Pair<number> => [
    min,
    max,
];
type PairedIndexesParams = {
    start: number;
    count: number;
};

export const pairedIndexes = ({
    start,
    count,
}: PairedIndexesParams): Array<Pair<number>> =>
    repeat(count, (index) => {
        const left = start + index * 2;
        return [left, left + 1];
    });

type AnchorsFromPairsParams = {
    prefix: string;
    pairs: Array<Pair<number>>;
};

export const anchorsFromPairs = ({
    prefix,
    pairs,
}: AnchorsFromPairsParams): AnchorSpec[] =>
    pairs.flatMap(([d0, d1], index) => [
        { name: `${prefix}${index}.a`, index: d0 },
        { name: `${prefix}${index}.b`, index: d1 },
    ]);

type JointsFromPairsParams = {
    prefix: string;
    pairs: Array<Pair<number>>;
    color: string;
};

export const jointsFromPairs = ({
    prefix,
    pairs,
    color,
}: JointsFromPairsParams): JointSpec[] =>
    pairs.map((_, index) => ({
        from: `${prefix}${index}.a`,
        to: `${prefix}${index}.b`,
        color,
        length: lengthRange(0, 99999),
    }));

export const pairList = (...pairs: Array<Pair<number>>) => pairs;

type StadiumIndexKind = keyof StadiumIndex["names"];
type StadiumIndexHit = { kind: StadiumIndexKind; index: number };

const findIndexHits = (index: StadiumIndex, name: string): StadiumIndexHit[] =>
    (Object.keys(index.names) as StadiumIndexKind[]).flatMap((kind) => {
        const id = index.names[kind][name];
        return id === undefined ? [] : [{ kind, index: id }];
    });

export const getIndexByName = (index: StadiumIndex, name: string): number => {
    const hits = findIndexHits(index, name);
    if (hits.length === 0) {
        throw new Error(`Missing stadium index for "${name}"`);
    }
    if (hits.length > 1) {
        const kinds = hits.map(({ kind }) => kind).join(", ");
        throw new Error(`Ambiguous stadium name "${name}" found in: ${kinds}`);
    }
    return hits[0]!.index;
};

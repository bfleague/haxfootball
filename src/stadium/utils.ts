import type {
    AnchorSpec,
    JointSpec,
    LineSpec,
    SegmentProps,
    StadiumIndex,
    VertexProps,
} from "@stadium/stadium-generator";
import { asArray, mergeDeep, repeat } from "@common/general/helpers";
import type { DeepPartial, Pair } from "@common/general/types";
import { range } from "@common/math/geometry";

type LinePoint = { x: number; y: number; vertex?: VertexProps };

type ExtendInput<T> = DeepPartial<T> & {
    extend?: ExtendInput<T> | ExtendInput<T>[];
};

type LineParamsCore = {
    from: LinePoint;
    to: LinePoint;
    segment: SegmentProps;
    name?: string;
};

const stripExtend = <T extends Record<string, unknown>>(
    value: ExtendInput<T>,
): Partial<T> => {
    const { extend: _extend, ...rest } = value as Record<string, unknown>;

    return rest as Partial<T>;
};

const resolveExtend = <T extends Record<string, unknown>>(
    input: ExtendInput<T>,
): T => {
    const bases = asArray(input.extend);

    const mergedBase = bases.reduce<T>(
        (acc, base) => mergeDeep(acc, resolveExtend(base as ExtendInput<T>)),
        {} as T,
    );

    return mergeDeep(mergedBase, stripExtend(input) as Partial<T>);
};

export function line(params: ExtendInput<LineParamsCore>): LineSpec;
export function line(
    from: LinePoint,
    to: LinePoint,
    segment: SegmentProps,
    name?: string,
): LineSpec;
export function line(
    fromOrParams: LinePoint | ExtendInput<LineParamsCore>,
    to?: LinePoint,
    segment?: SegmentProps,
    name?: string,
): LineSpec {
    if (typeof to === "undefined" && "from" in fromOrParams) {
        const resolved = resolveExtend<LineParamsCore>(
            fromOrParams as ExtendInput<LineParamsCore>,
        );

        const { from, to: target, segment: seg, name: label } = resolved;

        if (!from || !target || !seg) {
            throw new Error(
                "line params require from, to, and segment (via params or extend)",
            );
        }

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

type VLineParamsCore = {
    x: number;
    yStart: number;
    yEnd: number;
    segment: SegmentProps;
    name?: string;
    vertex?: VertexProps;
};

export const vLine = (params: ExtendInput<VLineParamsCore>): LineSpec => {
    const resolved = resolveExtend<VLineParamsCore>(params);
    const { x, yStart, yEnd, segment, name: label, vertex } = resolved;

    if (
        x === undefined ||
        yStart === undefined ||
        yEnd === undefined ||
        !segment
    ) {
        throw new Error(
            "vLine params require x, yStart, yEnd, and segment (via params or extend)",
        );
    }

    return line(
        vertex ? { x, y: yStart, vertex } : { x, y: yStart },
        vertex ? { x, y: yEnd, vertex } : { x, y: yEnd },
        segment,
        label,
    );
};

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
        length: range(0, 99999),
    }));

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

export const getDynamicLine = (
    index: StadiumIndex,
    name: string,
): Pair<number> => {
    const line = index.dynamicLines.names[name];

    if (!line) {
        throw new Error(`Missing dynamic line "${name}"`);
    }

    return line;
};

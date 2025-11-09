import { Room } from "@core/room";

// Derive types from the Room wrapper to avoid importing globals.
type DiscProps = Parameters<Room["setDiscProperties"]>[1];
type CFType = Room["collisionFlags"];
type SendOptions = Parameters<Room["send"]>[0];
type ChatStyle = SendOptions["style"];
type ChatSoundString = SendOptions["sound"];

type RoomMethodKeys = {
    [K in keyof Room]: Room[K] extends (...args: any[]) => any
        ? K extends "send"
            ? never
            : K
        : never;
}[keyof Room];

type RoomMethodApi = Pick<Room, RoomMethodKeys>;

/**
 * API exposed inside $effect closures (executed after the state's run).
 * These helpers bridge state logic to the Room wrapper.
 */
export interface EffectApi extends RoomMethodApi {
    send(
        message: string,
        to?: number | null,
        color?: number | null,
        style?: ChatStyle,
        sound?: ChatSoundString,
    ): void;
    send(options: SendOptions): void;
    CollisionFlags: CFType;
    stat: (key: string) => void;
    setPlayerDisc: (playerId: number, props: DiscProps) => void;
    setBall: (props: DiscProps) => void;
}

let RUNTIME: {
    room: Room;
    config: unknown;
    effects: Array<(api: EffectApi) => void>;
    transition: { to: string; params: any } | null;
    onStat: (k: string) => void;
} | null = null;

/**
 * Install a per-tick runtime. Ensures stat handler always exists.
 */
export function installRuntime(ctx: {
    room: Room;
    config: unknown;
    onStat?: (k: string) => void;
}) {
    const onStat = ctx.onStat ? ctx.onStat : () => {};

    RUNTIME = {
        room: ctx.room,
        config: ctx.config,
        effects: [],
        transition: null,
        onStat,
    };

    return function uninstall() {
        RUNTIME = null;
    };
}

/**
 * Allows late replacement of the room reference (no-op if not installed).
 */
export function setRuntimeRoom(room: Room) {
    if (RUNTIME) RUNTIME.room = room;
}

/**
 * Queue an effect to run after the state's run() returns.
 */
export function $effect(fn: (api: EffectApi) => void) {
    if (!RUNTIME) throw new Error("$effect used outside of runtime");

    RUNTIME.effects.push(fn);
}

/**
 * Schedule a transition to another state after effects are flushed.
 * Throws a sentinel so code after `$next` doesn't run within the tick.
 */
export function $next(args: { to: string; params?: any }): never {
    if (!RUNTIME) throw new Error("$next used outside of runtime");

    RUNTIME.transition = {
        to: args.to,
        params: args.params ? args.params : {},
    };

    // eslint-disable-next-line no-throw-literal
    throw "__NEXT__";
}

/**
 * Access strongly-typed config injected when creating the engine.
 */
export function $config<Cfg>(): Cfg {
    if (!RUNTIME) throw new Error("$config used outside of runtime");

    return RUNTIME.config as Cfg;
}

/**
 * Execute queued effects and return any pending transition.
 */
export function flushRuntime(): {
    transition: { to: string; params: any } | null;
} {
    if (!RUNTIME) return { transition: null };

    const room = RUNTIME.room;
    const cf = room.collisionFlags;

    const api = Object.assign(Object.create(room), {
        send: (
            messageOrOpts: string | SendOptions,
            to?: number | null,
            color?: number | null,
            style?: ChatStyle,
            sound?: ChatSoundString,
        ) => {
            if (typeof messageOrOpts !== "string") {
                room.send(messageOrOpts);
                return;
            }

            room.send({
                message: messageOrOpts,
                to: typeof to === "number" ? to : null,
                color: typeof color === "number" ? color : null,
                style: style ?? "normal",
                sound: sound ?? "normal",
            });
        },
        CollisionFlags: cf,
        stat: (k: string) => RUNTIME!.onStat(k),
        setPlayerDisc: (playerId: number, props: DiscProps) =>
            room.setPlayerDiscProperties(playerId, props),
        setBall: (props: DiscProps) => room.setDiscProperties(0, props), // default ball disc index
    }) as EffectApi;

    for (let i = 0; i < RUNTIME.effects.length; i++) {
        const fx = RUNTIME.effects[i];
        if (fx) fx(api);
    }

    const tr = RUNTIME.transition;

    RUNTIME.effects = [];
    RUNTIME.transition = null;

    return { transition: tr };
}

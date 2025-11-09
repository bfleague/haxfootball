import { Room } from "@core/room";

// Derive types from the Room wrapper to avoid importing globals.
type DiscProps = Parameters<Room["setDiscProperties"]>[1];
type CFType = Room["collisionFlags"];
type SendOptions = Parameters<Room["send"]>[0];
type ChatStyle = SendOptions["style"];
type ChatSoundString = SendOptions["sound"];
type TeamValue = Parameters<Room["setTeam"]>[1];
type AvatarValue = Parameters<Room["setAvatar"]>[1];
type AdminValue = Parameters<Room["setAdmin"]>[1];
type PlayerRef = number | PlayerObject;

const toPlayerId = (player: PlayerRef): number =>
    typeof player === "number" ? player : player.id;

type RoomMethodKeys = {
    [K in keyof Room]: Room[K] extends (...args: any[]) => any
        ? K extends "send"
            ? never
            : K
        : never;
}[keyof Room];

type RoomMethodApi = Pick<Room, RoomMethodKeys>;

type DiscPropsPatch = Partial<DiscProps>;

export type MutationBuffer = ReturnType<typeof createMutationBuffer>;

const mergeProps =
    <T extends Record<string, any>>(map: Map<number, T>) =>
    (key: number, props: T) => {
        const existing = map.get(key);
        if (existing) {
            Object.assign(existing, props);
            return;
        }
        map.set(key, { ...props });
    };

export function createMutationBuffer(room: Room) {
    const discProps = new Map<number, DiscPropsPatch>();
    const playerDiscProps = new Map<number, DiscPropsPatch>();
    const avatars = new Map<number, AvatarValue>();
    const teams = new Map<number, TeamValue>();
    const admins = new Map<number, AdminValue>();

    const queueDiscProps = mergeProps<DiscPropsPatch>(discProps);
    const queuePlayerDiscProps = mergeProps<DiscPropsPatch>(playerDiscProps);

    return {
        queueDisc: (discIndex: number, props: DiscProps) =>
            queueDiscProps(discIndex, props),
        queuePlayerDisc: (player: PlayerRef, props: DiscProps) =>
            queuePlayerDiscProps(toPlayerId(player), props),
        queueAvatar: (player: PlayerRef, avatar: AvatarValue) => {
            avatars.set(toPlayerId(player), avatar);
        },
        queueTeam: (player: PlayerRef, team: TeamValue) => {
            teams.set(toPlayerId(player), team);
        },
        queueAdmin: (player: PlayerRef, admin: AdminValue) => {
            admins.set(toPlayerId(player), admin);
        },
        flush: () => {
            discProps.forEach((props, discIndex) =>
                room.setDiscProperties(discIndex, props as DiscProps),
            );
            playerDiscProps.forEach((props, playerId) =>
                room.setPlayerDiscProperties(playerId, props as DiscProps),
            );
            avatars.forEach((avatar, playerId) =>
                room.setAvatar(playerId, avatar),
            );
            teams.forEach((team, playerId) => room.setTeam(playerId, team));
            admins.forEach((admin, playerId) => room.setAdmin(playerId, admin));

            discProps.clear();
            playerDiscProps.clear();
            avatars.clear();
            teams.clear();
            admins.clear();
        },
    };
}

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
    getTickNumber: () => number;
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
    tickNumber: number;
    mutations: MutationBuffer;
    ownsMutations: boolean;
} | null = null;

/**
 * Install a per-tick runtime. Ensures stat handler always exists.
 */
export function installRuntime(ctx: {
    room: Room;
    config: unknown;
    onStat?: (k: string) => void;
    tickNumber?: number;
    mutations?: MutationBuffer | undefined;
}) {
    const onStat = ctx.onStat ? ctx.onStat : () => {};
    const mutations = ctx.mutations ?? createMutationBuffer(ctx.room);

    RUNTIME = {
        room: ctx.room,
        config: ctx.config,
        effects: [],
        transition: null,
        onStat,
        tickNumber: typeof ctx.tickNumber === "number" ? ctx.tickNumber : 0,
        mutations,
        ownsMutations: !ctx.mutations,
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
    const mutations = RUNTIME.mutations;

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
        setPlayerDiscProperties: (player: PlayerRef, props: DiscProps) =>
            mutations.queuePlayerDisc(player, props),
        setDiscProperties: (discIndex: number, props: DiscProps) =>
            mutations.queueDisc(discIndex, props),
        setAvatar: (player: PlayerRef, avatar: AvatarValue) =>
            mutations.queueAvatar(player, avatar),
        setTeam: (player: PlayerRef, team: TeamValue) =>
            mutations.queueTeam(player, team),
        setAdmin: (player: PlayerRef, admin: AdminValue) =>
            mutations.queueAdmin(player, admin),
        getTickNumber: () => RUNTIME!.tickNumber,
        CollisionFlags: cf,
        stat: (k: string) => RUNTIME!.onStat(k),
        setPlayerDisc: (playerId: number, props: DiscProps) =>
            mutations.queuePlayerDisc(playerId, props),
        setBall: (props: DiscProps) => mutations.queueDisc(0, props), // default ball disc index
    }) as EffectApi;

    for (let i = 0; i < RUNTIME.effects.length; i++) {
        const fx = RUNTIME.effects[i];
        if (fx) fx(api);
    }

    if (RUNTIME.ownsMutations) {
        mutations.flush();
    }

    const tr = RUNTIME.transition;

    RUNTIME.effects = [];
    RUNTIME.transition = null;

    return { transition: tr };
}

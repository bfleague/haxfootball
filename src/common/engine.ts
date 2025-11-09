import { installRuntime, flushRuntime, setRuntimeRoom } from "@common/runtime";
import { Room } from "@core/room";
import { Team } from "@common/models";

/**
 * Metas register state factories by string key.
 */
export type StateFactory<SParams = any> = (params: SParams) => {
    run: (state: GameState) => void;
    dispose?: () => void;
};

export type StateRegistry = Record<string, StateFactory<any>>;

export interface EngineOptions<Cfg> {
    config: Cfg;
    onStats?: (key: string) => void;
}

/**
 * Transient snapshot used by states each tick.
 */
export interface GameStatePlayer {
    id: number;
    name: string;
    team: Team;
    x: number;
    y: number;
    radius: number;
    isKickingBall: boolean;
}

export interface GameStateBall {
    x: number;
    y: number;
    radius: number;
}

export interface GameState {
    players: GameStatePlayer[];
    ball: GameStateBall;
}

export interface Engine<Cfg = unknown> {
    start: (name: string, params?: any) => void;
    stop: () => void;
    tick: () => void;
    trackPlayerBallKick: (playerId: number) => void;
    isRunning: () => boolean;
    readonly _configBrand?: Cfg;
}

function getPlayerRadius(room: Room, playerId: number): number {
    const disc = room.getPlayerDiscProperties(playerId);

    return disc && typeof disc.radius === "number" ? disc.radius : 0;
}

function getBallSnapshot(room: Room): { x: number; y: number; radius: number } {
    const ballPos = room.getBallPosition();
    const disc = room.getDiscProperties(0);

    const radius = disc && typeof disc.radius === "number" ? disc.radius : 0;

    return {
        x: ballPos ? ballPos.x : 0,
        y: ballPos ? ballPos.y : 0,
        radius,
    };
}

function buildGameState(room: Room, kickerIds: Set<number>): GameState {
    const list = room.getPlayerList();
    const ball = getBallSnapshot(room);

    const players = list.map((p) => {
        const hasPos = !!p.position;
        const px = hasPos ? p.position.x : 0;
        const py = hasPos ? p.position.y : 0;

        return {
            id: p.id,
            name: p.name,
            team: p.team as Team,
            x: px,
            y: py,
            radius: getPlayerRadius(room, p.id),
            isKickingBall: kickerIds.has(p.id),
        };
    });

    return { players, ball };
}

/**
 * Creates a new engine bound to a Room wrapper.
 * The module drives it exclusively via Module event callbacks.
 */
export function createEngine<Cfg>(
    room: Room,
    registry: StateRegistry,
    opts: EngineOptions<Cfg>,
): Engine<Cfg> {
    let current: { name: string; api: ReturnType<StateFactory<any>> } | null =
        null;
    let pendingTransition: { to: string; params: any } | null = null;
    let kickerSet: Set<number> = new Set();
    let running = false;

    // Always have a concrete stats handler; defaults to no-op.
    const onStats: (key: string) => void = opts.onStats
        ? opts.onStats
        : () => {};

    function runOutsideTick<T>(fn: () => T): T {
        const uninstall = installRuntime({
            room,
            config: opts.config,
            onStat: onStats,
        });

        setRuntimeRoom(room);

        let caught: unknown | null = null;
        try {
            return fn();
        } catch (err) {
            caught = err;
            throw err;
        } finally {
            const flushed = flushRuntime();

            uninstall();

            if (!caught && flushed.transition) {
                throw new Error(
                    "$next cannot be used during state setup/cleanup",
                );
            }
        }
    }

    function ensureFactory(name: string) {
        const factory = registry[name];

        if (!factory) throw new Error(`State "${name}" is not registered`);

        return factory;
    }

    function createState(
        name: string,
        params?: any,
        factory?: StateFactory<any>,
    ) {
        const resolved = factory ?? ensureFactory(name);

        return runOutsideTick(() => resolved(params ?? {}));
    }

    function disposeState(
        target: { api: ReturnType<StateFactory<any>> } | null,
    ) {
        if (!target || !target.api.dispose) return;

        const dispose = target.api.dispose;

        runOutsideTick(() => {
            dispose();
        });
    }

    function applyTransition() {
        if (!pendingTransition) return;
        const next = pendingTransition;
        pendingTransition = null;

        const factory = ensureFactory(next.to);
        disposeState(current);

        current = {
            name: next.to,
            api: createState(next.to, next.params, factory),
        };
    }

    function start(name: string, params?: any) {
        if (running) stop();

        const factory = ensureFactory(name);

        current = {
            name,
            api: createState(name, params, factory),
        };

        running = true;
    }

    function stop() {
        disposeState(current);

        current = null;
        running = false;
        kickerSet.clear();
    }

    function tick() {
        if (!running || !current) return;

        // Install per-tick runtime ($effect, $next, $config).
        const uninstall = installRuntime({
            room,
            config: opts.config,
            onStat: onStats,
        });

        setRuntimeRoom(room);

        // Build state, consume the "kicker" one-tick flag.
        const currentKickers = kickerSet;
        kickerSet = new Set();
        const gs = buildGameState(room, currentKickers);

        // Run state logic; `$next` throws a sentinel to halt local flow.
        try {
            current.api.run(gs);
        } catch (err) {
            if (err !== "__NEXT__") throw err;
        }

        // Flush $effects and apply transition if any.
        const flushed = flushRuntime();

        uninstall();

        if (flushed.transition) {
            pendingTransition = flushed.transition;
            applyTransition();
        }
    }

    function trackPlayerBallKick(playerId: number) {
        kickerSet.add(playerId);
    }

    function isRunning() {
        return running;
    }

    return {
        start,
        stop,
        tick,
        trackPlayerBallKick,
        isRunning,
    };
}

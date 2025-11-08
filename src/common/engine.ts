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
export interface GameState {
    players: Array<{
        id: number;
        team: Team;
        x: number;
        y: number;
        isKickingBall: boolean;
    }>;
    ball: { x: number; y: number };
}

export interface Engine<Cfg = unknown> {
    start: (name: string, params?: any) => void;
    stop: () => void;
    tick: () => void;
    notePlayerBallKick: (playerId: number) => void;
    isRunning: () => boolean;
    readonly _configBrand?: Cfg;
}

/**
 * Builds a snapshot of players and ball for the current tick.
 * Position may be null for spectators; in that case use (0,0).
 */
function buildGameState(room: Room, kickerId: number | null): GameState {
    const list = room.getPlayerList();
    const ballPos = room.getBallPosition();
    const bx = ballPos ? ballPos.x : 0;
    const by = ballPos ? ballPos.y : 0;

    const players = list.map((p) => {
        const hasPos = !!p.position;
        const px = hasPos ? p.position.x : 0;
        const py = hasPos ? p.position.y : 0;
        return {
            id: p.id,
            team: p.team as Team,
            x: px,
            y: py,
            isKickingBall: kickerId === p.id,
        };
    });

    return { players, ball: { x: bx, y: by } };
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
    let lastKicker: number | null = null;
    let running = false;

    // Always have a concrete stats handler; defaults to no-op.
    const onStats: (key: string) => void = opts.onStats
        ? opts.onStats
        : () => {};

    function applyTransition() {
        if (!pendingTransition) return;
        if (current && current.api.dispose) current.api.dispose();
        const factory = registry[pendingTransition.to];
        if (!factory)
            throw new Error(
                `State "${pendingTransition.to}" is not registered`,
            );
        current = {
            name: pendingTransition.to,
            api: factory(pendingTransition.params),
        };
        pendingTransition = null;
    }

    function start(name: string, params?: any) {
        if (running) stop();
        const factory = registry[name];
        if (!factory) throw new Error(`State "${name}" is not registered`);
        current = { name, api: factory(params) };
        running = true;
    }

    function stop() {
        if (current && current.api.dispose) current.api.dispose();
        current = null;
        running = false;
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
        const gs = buildGameState(room, lastKicker);
        lastKicker = null;

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

    function notePlayerBallKick(playerId: number) {
        lastKicker = playerId;
    }

    function isRunning() {
        return running;
    }

    return { start, stop, tick, notePlayerBallKick, isRunning };
}

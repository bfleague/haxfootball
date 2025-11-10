import {
    installRuntime,
    flushRuntime,
    setRuntimeRoom,
    createMutationBuffer,
    type MutationBuffer,
} from "@common/runtime";
import { Room } from "@core/room";
import { Team, type FieldTeam, isFieldTeam } from "@common/models";

/**
 * Metas register state factories by string key.
 */
export interface StateApi {
    run: (state: GameState) => void;
    dispose?: () => void;
    join?: (player: GameStatePlayer) => void;
    leave?: (player: GameStatePlayer) => void;
}

export type StateFactory<SParams = any> = (params: SParams) => StateApi;

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
    team: FieldTeam;
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
    tickNumber: number;
}

export interface Engine<Cfg = unknown> {
    start: (name: string, params?: any) => void;
    stop: () => void;
    tick: () => void;
    trackPlayerBallKick: (playerId: number) => void;
    handlePlayerTeamChange: (
        player: PlayerObject,
        byPlayer: PlayerObject | null,
    ) => void;
    handlePlayerLeave: (player: PlayerObject) => void;
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

function createGameStatePlayerSnapshot(
    room: Room,
    player: PlayerObject,
    kickerIds: Set<number>,
): GameStatePlayer | null {
    if (!isFieldTeam(player.team)) return null;

    const hasPos = !!player.position;
    const px = hasPos ? player.position.x : 0;
    const py = hasPos ? player.position.y : 0;
    const team: FieldTeam = player.team === Team.RED ? Team.RED : Team.BLUE;

    return {
        id: player.id,
        name: player.name,
        team,
        x: px,
        y: py,
        radius: getPlayerRadius(room, player.id),
        isKickingBall: kickerIds.has(player.id),
    };
}

function buildGameState(
    room: Room,
    kickerIds: Set<number>,
    tickNumber: number,
): GameState {
    const list = room.getPlayerList();
    const ball = getBallSnapshot(room);

    const players = list
        .map((p) => createGameStatePlayerSnapshot(room, p, kickerIds))
        .filter((p): p is GameStatePlayer => p !== null);

    return { players, ball, tickNumber };
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
    let current: { name: string; api: StateApi } | null = null;
    let pendingTransition: { to: string; params: any } | null = null;
    let kickerSet: Set<number> = new Set();
    let running = false;
    let disableStateExecution = false;
    let tickNumber = 0;
    let sharedTickMutations: MutationBuffer | null = null;

    // Always have a concrete stats handler; defaults to no-op.
    const onStats: (key: string) => void = opts.onStats
        ? opts.onStats
        : () => {};

    function runOutsideTick<T>(fn: () => T): T {
        room.invalidateCaches();
        const uninstall = installRuntime({
            room,
            config: opts.config,
            onStat: onStats,
            tickNumber,
            mutations: sharedTickMutations ?? undefined,
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

            if (flushed.stopRequested) {
                disableStateExecution = true;
                running = false;
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

    function disposeState(target: { api: StateApi } | null) {
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

        tickNumber = 0;
        disableStateExecution = false;

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
        tickNumber = 0;
        disableStateExecution = false;
    }

    function tick() {
        if (!running || !current || disableStateExecution) return;

        room.invalidateCaches();
        sharedTickMutations = createMutationBuffer(room);

        try {
            const currentTickNumber = tickNumber;

            const uninstall = installRuntime({
                room,
                config: opts.config,
                onStat: onStats,
                tickNumber: currentTickNumber,
                mutations: sharedTickMutations ?? undefined,
            });

            setRuntimeRoom(room);

            // Build state, consume the "kicker" one-tick flag.
            const currentKickers = kickerSet;
            kickerSet = new Set();
            const gs = buildGameState(room, currentKickers, currentTickNumber);

            let flushed: {
                transition: { to: string; params: any } | null;
                stopRequested: boolean;
            } | null = null;

            try {
                // Run state logic; `$next` throws a sentinel to halt local flow.
                try {
                    current.api.run(gs);
                } catch (err) {
                    if (err !== "__NEXT__") throw err;
                }

                // Flush $effects and apply transition if any.
                flushed = flushRuntime();
            } finally {
                uninstall();
            }

            if (flushed?.stopRequested) {
                pendingTransition = null;
                disableStateExecution = true;
                running = false;
            } else if (flushed && flushed.transition) {
                pendingTransition = flushed.transition;
                applyTransition();
            }

            tickNumber += 1;
        } finally {
            if (sharedTickMutations) {
                sharedTickMutations.flush();
                sharedTickMutations = null;
            }
        }
    }

    function trackPlayerBallKick(playerId: number) {
        kickerSet.add(playerId);
    }

    function handlePlayerTeamChange(
        player: PlayerObject,
        _byPlayer: PlayerObject | null,
    ) {
        if (!running || !current || !current.api.join) return;

        const snapshot = createGameStatePlayerSnapshot(room, player, kickerSet);
        if (!snapshot) return;

        runOutsideTick(() => {
            current!.api.join!(snapshot);
        });
    }

    function handlePlayerLeave(player: PlayerObject) {
        if (!running || !current || !current.api.leave) return;

        const snapshot = createGameStatePlayerSnapshot(room, player, kickerSet);
        if (!snapshot) return;

        runOutsideTick(() => {
            current!.api.leave!(snapshot);
        });
    }

    function isRunning() {
        return running;
    }

    return {
        start,
        stop,
        tick,
        trackPlayerBallKick,
        handlePlayerTeamChange,
        handlePlayerLeave,
        isRunning,
    };
}

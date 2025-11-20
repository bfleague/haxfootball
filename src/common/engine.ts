import {
    installRuntime,
    flushRuntime,
    setRuntimeRoom,
    createMutationBuffer,
    type MutationBuffer,
    type Transition,
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
    chat?: (player: GameStatePlayer, message: string) => void;
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
    handlePlayerChat: (player: PlayerObject, message: string) => void;
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
    let current: {
        name: string;
        api: StateApi;
        disposals: Array<() => void>;
    } | null = null;
    let pendingTransition: Transition | null = null;
    let delayedTransition: {
        to: string;
        params: any;
        remainingTicks: number;
        disposal: "IMMEDIATE" | "DELAYED";
    } | null = null;
    let kickerSet: Set<number> = new Set();
    let running = false;
    let disableStateExecution = false;
    let tickNumber = 0;
    let sharedTickMutations: MutationBuffer | null = null;

    // Always have a concrete stats handler; defaults to no-op.
    const onStats: (key: string) => void = opts.onStats
        ? opts.onStats
        : () => {};

    function runOutsideTick<T>(
        fn: () => T,
        optsRun?: { allowTransition?: boolean; disposals?: Array<() => void> },
    ): T {
        room.invalidateCaches();
        const uninstall = installRuntime({
            room,
            config: opts.config,
            onStat: onStats,
            tickNumber,
            mutations: sharedTickMutations ?? undefined,
            ...(optsRun?.disposals ? { disposals: optsRun.disposals } : {}),
        });

        setRuntimeRoom(room);

        const allowTransition = optsRun?.allowTransition ?? false;
        let result!: T;
        try {
            result = fn();
        } catch (err) {
            if (err === "__NEXT__" && allowTransition) {
                result = undefined as T;
            } else {
                throw err;
            }
        } finally {
            const flushed = flushRuntime();

            uninstall();

            if (!allowTransition && flushed.transition) {
                throw new Error(
                    "$next cannot be used during state setup/cleanup",
                );
            }

            if (flushed.stopRequested) {
                pendingTransition = null;
                delayedTransition = null;
                disableStateExecution = true;
                running = false;
            } else if (allowTransition && flushed.transition) {
                scheduleTransition(flushed.transition);
            }
        }

        return result;
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

        const disposals: Array<() => void> = [];

        const api = runOutsideTick(() => resolved(params ?? {}), { disposals });

        return { api, disposals };
    }

    function disposeState(
        target: { api: StateApi; disposals: Array<() => void> } | null,
    ) {
        if (!target) return;

        const disposeFns: Array<() => void> = [];

        if (target.api.dispose) {
            disposeFns.push(() => target.api.dispose!());
        }

        disposeFns.push(...target.disposals);

        if (disposeFns.length === 0) return;

        runOutsideTick(
            () => {
                for (const fn of disposeFns) {
                    fn();
                }
                target.disposals.length = 0;
            },
            { disposals: target.disposals },
        );
    }

    function applyTransition() {
        if (!pendingTransition) return;
        const next = pendingTransition;
        pendingTransition = null;

        const factory = ensureFactory(next.to);
        disposeState(current);

        const created = createState(next.to, next.params, factory);

        current = {
            name: next.to,
            api: created.api,
            disposals: created.disposals,
        };
    }

    function scheduleTransition(transition: Transition) {
        const wait =
            typeof transition.wait === "number" && transition.wait > 0
                ? transition.wait
                : 0;
        const disposal =
            transition.disposal === "IMMEDIATE" ? "IMMEDIATE" : "DELAYED";

        if (wait > 0) {
            delayedTransition = {
                to: transition.to,
                params: transition.params,
                remainingTicks: wait,
                disposal,
            };

            if (disposal === "IMMEDIATE") {
                disposeState(current);
                current = null;
            }
            pendingTransition = null;
            return;
        }

        pendingTransition = transition;
        applyTransition();
    }

    function start(name: string, params?: any) {
        if (running) stop();

        const factory = ensureFactory(name);

        tickNumber = 0;
        disableStateExecution = false;
        pendingTransition = null;
        delayedTransition = null;

        const created = createState(name, params, factory);

        current = {
            name,
            api: created.api,
            disposals: created.disposals,
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
        pendingTransition = null;
        delayedTransition = null;
    }

    function tick() {
        if (!running || disableStateExecution) return;

        if (delayedTransition) {
            if (delayedTransition.remainingTicks > 0) {
                delayedTransition.remainingTicks -= 1;
                tickNumber += 1;
                return;
            }

            pendingTransition = {
                to: delayedTransition.to,
                params: delayedTransition.params,
            };
            delayedTransition = null;
            applyTransition();
        }

        if (!current) {
            tickNumber += 1;
            return;
        }

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
                disposals: current.disposals,
            });

            setRuntimeRoom(room);

            // Build state, consume the "kicker" one-tick flag.
            const currentKickers = kickerSet;
            kickerSet = new Set();
            const gs = buildGameState(room, currentKickers, currentTickNumber);

            let flushed: {
                transition: Transition | null;
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
                delayedTransition = null;
                disableStateExecution = true;
                running = false;
            } else if (flushed && flushed.transition) {
                scheduleTransition(flushed.transition);
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

    function handlePlayerChat(player: PlayerObject, message: string) {
        if (!running || !current || !current.api.chat) return;

        const snapshot = createGameStatePlayerSnapshot(room, player, kickerSet);
        if (!snapshot) return;

        runOutsideTick(
            () => {
                current!.api.chat!(snapshot, message);
            },
            { allowTransition: true, disposals: current.disposals },
        );
    }

    function handlePlayerTeamChange(
        player: PlayerObject,
        _byPlayer: PlayerObject | null,
    ) {
        if (!running || !current || !current.api.join) return;

        const snapshot = createGameStatePlayerSnapshot(room, player, kickerSet);
        if (!snapshot) return;

        runOutsideTick(
            () => {
                current!.api.join!(snapshot);
            },
            { disposals: current.disposals },
        );
    }

    function handlePlayerLeave(player: PlayerObject) {
        if (!running || !current || !current.api.leave) return;

        const snapshot = createGameStatePlayerSnapshot(room, player, kickerSet);
        if (!snapshot) return;

        runOutsideTick(
            () => {
                current!.api.leave!(snapshot);
            },
            { allowTransition: true, disposals: current.disposals },
        );
    }

    function isRunning() {
        return running;
    }

    return {
        start,
        stop,
        tick,
        trackPlayerBallKick,
        handlePlayerChat,
        handlePlayerTeamChange,
        handlePlayerLeave,
        isRunning,
    };
}

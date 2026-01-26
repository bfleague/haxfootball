import {
    installRuntime,
    flushRuntime,
    setRuntimeRoom,
    createMutationBuffer,
    type MutationBuffer,
    type Transition,
} from "@runtime/runtime";
import { Room } from "@core/room";
import { Team, type FieldTeam, isFieldTeam } from "@runtime/models";
import { CommandHandleResult, CommandSpec } from "@runtime/commands";

/**
 * Metas register state factories by string key.
 */
export interface StateApi {
    run: (state: GameState) => void;
    join?: (player: GameStatePlayer) => void;
    leave?: (player: GameStatePlayer) => void;
    chat?: (player: GameStatePlayer, message: string) => void;
    command?: (
        player: GameStatePlayer,
        command: CommandSpec,
    ) => CommandHandleResult | void;
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
    xspeed: number;
    yspeed: number;
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
    handleGamePause: (byPlayer: PlayerObject | null) => void;
    handleGameUnpause: (byPlayer: PlayerObject | null) => void;
    trackPlayerBallKick: (playerId: number) => void;
    handlePlayerChat: (player: PlayerObject, message: string) => void;
    handlePlayerCommand: (
        player: PlayerObject,
        command: CommandSpec,
    ) => CommandHandleResult;
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

function getBallSnapshot(room: Room): GameStateBall {
    const ballPos = room.getBallPosition();
    const disc = room.getDiscProperties(0);

    const radius = disc && typeof disc.radius === "number" ? disc.radius : 0;
    const xspeed = disc && typeof disc.xspeed === "number" ? disc.xspeed : 0;
    const yspeed = disc && typeof disc.yspeed === "number" ? disc.yspeed : 0;

    return {
        x: ballPos ? ballPos.x : 0,
        y: ballPos ? ballPos.y : 0,
        radius,
        xspeed,
        yspeed,
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
        disposal: "IMMEDIATE" | "DELAYED" | "AFTER_RESUME";
    } | null = null;
    let kickerSet: Set<number> = new Set();
    let running = false;
    let disableStateExecution = false;
    let tickNumber = 0;
    let sharedTickMutations: MutationBuffer | null = null;
    let lastGameState: GameState | null = null;
    // @ts-expect-error - Not being used directly for now.
    let isPaused = false;
    let resumePending = false;
    let isResumeTick = false;
    let afterResumeDisposers: Array<() => void> = [];
    let afterResumeTransition: Transition | null = null;

    // Always have a concrete stats handler; defaults to no-op.
    const onStats: (key: string) => void = opts.onStats
        ? opts.onStats
        : () => {};

    function runOutsideTick<T>(
        fn: () => T,
        optsRun?: {
            allowTransition?: boolean;
            disposals?: Array<() => void>;
            beforeGameState?: GameState | null;
            muteEffects?: boolean;
        },
    ): T {
        room.invalidateCaches();
        const uninstall = installRuntime({
            room,
            config: opts.config,
            onStat: onStats,
            tickNumber,
            mutations: sharedTickMutations ?? undefined,
            ...(optsRun?.disposals ? { disposals: optsRun.disposals } : {}),
            beforeGameState:
                optsRun && "beforeGameState" in optsRun
                    ? optsRun.beforeGameState
                    : lastGameState,
            ...(optsRun?.muteEffects !== undefined
                ? { muteEffects: optsRun.muteEffects }
                : {}),
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
        options?: { muteEffects?: boolean },
    ) {
        const resolved = factory ?? ensureFactory(name);

        const disposals: Array<() => void> = [];

        const api = runOutsideTick(() => resolved(params ?? {}), {
            disposals,
            beforeGameState: lastGameState,
            ...(options?.muteEffects !== undefined
                ? { muteEffects: options.muteEffects }
                : {}),
        });

        return { api, disposals };
    }

    function collectDisposers(
        target: {
            api: StateApi;
            disposals: Array<() => void>;
        } | null,
    ): Array<() => void> {
        if (!target) return [];

        const disposeFns: Array<() => void> = [];

        disposeFns.push(...target.disposals);
        target.disposals.length = 0;

        return disposeFns;
    }

    function runDisposers(disposeFns: Array<() => void>) {
        if (disposeFns.length === 0) return;

        const runtimeDisposals: Array<() => void> = [];

        runOutsideTick(
            () => {
                for (const fn of disposeFns) {
                    fn();
                }
                runtimeDisposals.length = 0;
            },
            {
                disposals: runtimeDisposals,
                beforeGameState: lastGameState,
            },
        );
    }

    function flushAfterResumeDisposers() {
        if (afterResumeDisposers.length === 0) return;
        const disposers = afterResumeDisposers;
        afterResumeDisposers = [];
        runDisposers(disposers);
    }

    function queueAfterResumeDisposers(disposeFns: Array<() => void>) {
        if (disposeFns.length === 0) return;
        afterResumeDisposers.push(...disposeFns);
    }

    function disposeState(
        target: {
            api: StateApi;
            disposals: Array<() => void>;
        } | null,
    ) {
        const disposeFns = collectDisposers(target);
        runDisposers(disposeFns);
    }

    function deferDisposeState(
        target: {
            api: StateApi;
            disposals: Array<() => void>;
        } | null,
    ) {
        const disposeFns = collectDisposers(target);
        queueAfterResumeDisposers(disposeFns);
    }

    function applyTransition() {
        if (!pendingTransition) return;
        const next = pendingTransition;
        pendingTransition = null;

        const isSameState = current && current.name === next.to;

        if (current && isSameState && next.disposal !== "IMMEDIATE") {
            const factory = ensureFactory(next.to);
            const created = createState(next.to, next.params, factory, {
                muteEffects: true,
            });

            current.api = created.api;
            current.disposals = created.disposals;
            return;
        }

        const factory = ensureFactory(next.to);
        if (next.disposal === "AFTER_RESUME") {
            deferDisposeState(current);
        } else {
            disposeState(current);
        }

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
            transition.disposal === "IMMEDIATE"
                ? "IMMEDIATE"
                : transition.disposal === "AFTER_RESUME"
                  ? "AFTER_RESUME"
                  : "DELAYED";

        if (disposal === "AFTER_RESUME" && wait === 0 && isResumeTick) {
            pendingTransition = { ...transition, disposal: "DELAYED" };
            applyTransition();
            return;
        }

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

        if (disposal === "AFTER_RESUME") {
            afterResumeTransition = transition;
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
        lastGameState = null;
        afterResumeDisposers = [];
        resumePending = false;
        isPaused = false;
        isResumeTick = false;
        afterResumeTransition = null;

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
        flushAfterResumeDisposers();

        current = null;
        running = false;
        kickerSet.clear();
        tickNumber = 0;
        disableStateExecution = false;
        pendingTransition = null;
        delayedTransition = null;
        lastGameState = null;
        afterResumeDisposers = [];
        resumePending = false;
        isPaused = false;
        isResumeTick = false;
        afterResumeTransition = null;
    }

    function tick() {
        if (!running || disableStateExecution) return;

        isResumeTick = resumePending;
        if (resumePending) {
            resumePending = false;
            flushAfterResumeDisposers();
            if (afterResumeTransition) {
                pendingTransition = {
                    ...afterResumeTransition,
                    disposal: "DELAYED",
                };
                afterResumeTransition = null;
                applyTransition();
            }
        }

        const kicksThisTick = delayedTransition ? new Set<number>() : kickerSet;
        kickerSet = new Set();

        if (delayedTransition) {
            if (delayedTransition.remainingTicks > 0) {
                delayedTransition.remainingTicks -= 1;
                tickNumber += 1;
                isResumeTick = false;
                return;
            }

            const completedTransition = {
                to: delayedTransition.to,
                params: delayedTransition.params,
                disposal: delayedTransition.disposal,
            };
            delayedTransition = null;
            if (completedTransition.disposal === "AFTER_RESUME") {
                if (isResumeTick) {
                    pendingTransition = {
                        ...completedTransition,
                        disposal: "DELAYED",
                    };
                    applyTransition();
                } else {
                    afterResumeTransition = completedTransition;
                }
            } else {
                pendingTransition = completedTransition;
                applyTransition();
            }
        }

        if (afterResumeTransition && !isResumeTick) {
            tickNumber += 1;
            isResumeTick = false;
            return;
        }

        if (!current) {
            tickNumber += 1;
            isResumeTick = false;
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
                beforeGameState: lastGameState,
            });

            setRuntimeRoom(room);

            // Build state, consume the "kicker" one-tick flag.
            const gs = buildGameState(room, kicksThisTick, currentTickNumber);

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

            lastGameState = gs;
            tickNumber += 1;
        } finally {
            isResumeTick = false;
            if (sharedTickMutations) {
                sharedTickMutations.flush();
                sharedTickMutations = null;
            }
        }
    }

    function trackPlayerBallKick(playerId: number) {
        kickerSet.add(playerId);
    }

    function handleGamePause(_byPlayer: PlayerObject | null) {
        isPaused = true;
        resumePending = false;
    }

    function handleGameUnpause(_byPlayer: PlayerObject | null) {
        isPaused = false;
        resumePending = true;
    }

    function handlePlayerChat(player: PlayerObject, message: string) {
        if (!running || !current || !current.api.chat) return;

        const snapshot = createGameStatePlayerSnapshot(room, player, kickerSet);
        if (!snapshot) return;

        runOutsideTick(
            () => {
                current!.api.chat!(snapshot, message);
            },
            {
                allowTransition: true,
                disposals: current.disposals,
                beforeGameState: lastGameState,
            },
        );
    }

    function handlePlayerCommand(
        player: PlayerObject,
        command: CommandSpec,
    ): CommandHandleResult {
        if (!running || !current || !current.api.command) {
            return { handled: false };
        }

        const snapshot = createGameStatePlayerSnapshot(room, player, kickerSet);
        if (!snapshot) return { handled: false };

        const commandResult = runOutsideTick(
            () => {
                const handlerResult = current!.api.command!(snapshot, command);

                return handlerResult ?? { handled: false };
            },
            {
                allowTransition: true,
                disposals: current.disposals,
                beforeGameState: lastGameState,
            },
        );

        return commandResult ?? { handled: true };
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
            {
                disposals: current.disposals,
                beforeGameState: lastGameState,
            },
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
            {
                allowTransition: true,
                disposals: current.disposals,
                beforeGameState: lastGameState,
            },
        );
    }

    function isRunning() {
        return running;
    }

    return {
        start,
        stop,
        tick,
        handleGamePause,
        handleGameUnpause,
        trackPlayerBallKick,
        handlePlayerChat,
        handlePlayerCommand,
        handlePlayerTeamChange,
        handlePlayerLeave,
        isRunning,
    };
}

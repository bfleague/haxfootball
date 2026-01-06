# Engine Guide

This guide is for contributors who add new states or game rules; it explains the State API and the core patterns you should follow, without covering engine internals.

## What a State Is

A state is a self-contained phase of gameplay (presnap, live ball, interception, etc.) that owns the rules for that phase and decides when and how to transition to the next state.

## Where State Code Lives

Check the meta registry for the authoritative list of states and their file paths. In this repo, states are currently under `src/meta/legacy/states/` and registered in `src/meta/legacy/meta.ts`, but future metas can use different directories.

## State API at a Glance

```ts
import type { GameState, GameStatePlayer } from "@common/engine";
import { $effect, $next } from "@common/runtime";

export function MyState({ someParam }: { someParam: number }) {
    function run(state: GameState) {
        // Read-only snapshot: state.players, state.ball, state.tickNumber.
        // Use $next(...) to transition to another state.
    }

    function dispose() {
        // Cleanup that should happen when the state ends.
    }

    return { run, dispose };
}
```

## State Handlers

- `run(state)` (required): per-tick game logic based on the snapshot.
- `dispose()` (optional): cleanup for state-specific changes (lines, traps, ball state, etc.).
- `join(player)` / `leave(player)` (optional): respond to players entering/leaving.
- `chat(player, message)` (optional): non-command chat messages.
- `command(player, command)` (optional): parsed commands (prefixed messages).

Note: `chat` and `command` run outside the tick loop; they see the last snapshot and should not depend on real-time physics for strict validation.

## Hooks

Hooks are runtime primitives you call inside state handlers; they schedule effects or transitions and are applied by the runtime in a consistent order.

- `$effect(fn)`: queue side effects like announcements, disc updates, and stats.
- `$next(...)`: transition to another state and stop the current handler.
- `$before()`: get the snapshot from before the current state took place.
- `$dispose(fn)`: register cleanup to run when the state ends.
- `$config<T>()`: access the engine configuration object.

Metas can expose additional hooks (for example, game/physics hooks that set LOS lines, ball active state, or traps); use those instead of rewriting low-level disc logic.

## Transitions with $next

Use `$next` to move between states and pass parameters:

```ts
$next({
    to: "NEXT_STATE",
    params: {
        /* state params */
    },
    wait: ticks({ seconds: 2 }), // optional delay
});
```

Notes: `$next` stops execution for the current handler, so code after it will not run; place side effects before it or in `dispose()`; only call `$next` from state handlers (`run`, `chat`, `command`, etc.), not during state construction or `dispose()`.

## Side Effects with $effect

Do side effects inside `$effect` so they are applied in the correct order after state logic finishes:

```ts
$effect(($) => {
    $.send("Message");
    $.setAvatar(playerId, ":)");
});
```

`$effect` is deferred; do not expect changes from `$effect` to be visible in the same handler or the current snapshot.

## GameState Snapshot and $before()

`run(state)` receives a read-only snapshot of players, ball, and the current tick number. If you need the snapshot from before the current state took place (for example, the last tick of the previous state when entering a new state), use `$before()`.

`$before()` can throw if there is no prior snapshot (for example, the very first state before any tick), so guard it when unsure.

`isKickingBall` is a one-tick flag; if you need longer behavior, store it in state params or your own state.

## Common Helpers You Should Use

Use project helpers rather than re-implementing rules or geometry. In this repo they live under `src/meta/legacy/utils/` and `src/meta/legacy/hooks/`, but future metas may organize them differently. Also use `@common/utils` helpers like `ticks`, `findCatchers`, `findBallCatchers`, and `distributeOnLine`.

## Cleanup Discipline

If you lock the ball, trap players, or set special lines, undo it in `dispose()` so those changes do not leak into the next state.

## Adding a New State

1. Create the state file in the meta state directory.
2. Export a function that returns the State API.
3. Register it in the meta registry.
4. Transition to it using `$next` from another state.

## Commands vs Chat

Commands are messages with the command prefix (currently `!`) and go to `command`, not `chat`. Return `{ handled: true }` when your state recognizes the command, even if you reject it with a message, and `{ handled: false }` only when the command is not yours so the caller can decide whether to show a fallback message.

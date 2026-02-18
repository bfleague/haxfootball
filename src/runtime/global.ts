export type GlobalAction<State> = (state: State, ...args: any[]) => State;

export type GlobalActionMap<State> = Record<string, GlobalAction<State>>;

export type GlobalSchema<
    State extends Record<string, any> = Record<string, any>,
    Actions extends GlobalActionMap<State> = GlobalActionMap<State>,
> = {
    state: State;
    actions: Actions;
};

export function defineGlobalSchema<
    State extends Record<string, any>,
    Actions extends GlobalActionMap<State>,
>(schema: { state: State; actions: Actions }) {
    return schema;
}

type Tail<T extends any[]> = T extends [any, ...infer Rest] ? Rest : never;

export type GlobalSchemaState<Schema extends GlobalSchema<any, any>> =
    Schema["state"];

export type GlobalSchemaActions<Schema extends GlobalSchema<any, any>> = {
    [K in keyof Schema["actions"]]: (
        ...args: Tail<Parameters<Schema["actions"][K]>>
    ) => void;
};

export type GlobalStore<Schema extends GlobalSchema<any, any>> =
    GlobalSchemaState<Schema> & GlobalSchemaActions<Schema>;

export type GlobalStoreApi<Schema extends GlobalSchema<any, any>> = {
    getState: () => GlobalStore<Schema>;
    getStateSnapshot: () => GlobalSchemaState<Schema>;
    setStateSnapshot: (snapshot: GlobalSchemaState<Schema>) => void;
};

const cloneStateSnapshot = <State extends Record<string, any>>(
    snapshot: State,
): State => {
    try {
        if (typeof globalThis.structuredClone === "function") {
            return globalThis.structuredClone(snapshot);
        }
    } catch {
        // Fall through to JSON clone.
    }

    return JSON.parse(JSON.stringify(snapshot)) as State;
};

export function createGlobalStore<Schema extends GlobalSchema<any, any>>(
    schema: Schema,
): GlobalStoreApi<Schema> {
    let state = cloneStateSnapshot(
        schema.state as GlobalSchemaState<Schema>,
    );

    const actions = {} as GlobalSchemaActions<Schema>;

    (Object.keys(schema.actions) as Array<keyof Schema["actions"]>).forEach(
        (key) => {
            const reducer = schema.actions[key];

            actions[key] = ((...args: any[]) => {
                state = reducer(state, ...args);
            }) as GlobalSchemaActions<Schema>[typeof key];
        },
    );

    return {
        getState: () =>
            ({
                ...(state as GlobalSchemaState<Schema>),
                ...(actions as GlobalSchemaActions<Schema>),
            }) as GlobalStore<Schema>,
        getStateSnapshot: () =>
            cloneStateSnapshot(state as GlobalSchemaState<Schema>),
        setStateSnapshot: (snapshot: GlobalSchemaState<Schema>) => {
            state = cloneStateSnapshot(snapshot as GlobalSchemaState<Schema>);
        },
    };
}

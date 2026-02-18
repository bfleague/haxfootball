export type ConfigFlagSpec<Config> = {
    description: string;
    getValue: (config: Config) => boolean;
    setValue: (config: Config, value: boolean) => void;
};

type ConfigFlagsByName<Config, FlagName extends string = string> = Record<
    FlagName,
    ConfigFlagSpec<Config>
>;

type ConfigManager<Config, FlagName extends string> = {
    defaultConfig: Config;
    createConfig: (base?: Config) => Config;
    getFlagNames: () => FlagName[];
    hasFlag: (name: string) => name is FlagName;
    getFlagDescription: (name: FlagName) => string;
    getFlagValue: (config: Config, name: FlagName) => boolean;
    setFlagValue: (config: Config, name: FlagName, value: boolean) => void;
};

type CreateConfigOptions<Config, Flags extends ConfigFlagsByName<Config>> = {
    defaultConfig: Config;
    flags: Flags;
    clone?: (config: Config) => Config;
};

const cloneConfigWithFallback = <Config>(config: Config): Config => {
    try {
        if (typeof globalThis.structuredClone === "function") {
            return globalThis.structuredClone(config);
        }
    } catch {
        // Fall through to JSON clone.
    }

    return JSON.parse(JSON.stringify(config)) as Config;
};

export function createConfig<
    Config,
    Flags extends ConfigFlagsByName<Config>,
    FlagName extends string = Extract<keyof Flags, string>,
>(
    options: CreateConfigOptions<Config, Flags>,
): ConfigManager<Config, FlagName> {
    const { defaultConfig, flags } = options;
    const clone = options.clone ?? cloneConfigWithFallback;

    const createConfigInstance = (base: Config = defaultConfig): Config =>
        clone(base);

    const getFlagNames = (): FlagName[] => Object.keys(flags) as FlagName[];

    const hasFlag = (name: string): name is FlagName => name in flags;

    const getFlagSpec = (name: FlagName): ConfigFlagSpec<Config> => {
        const flagSpec = flags[name];

        if (!flagSpec) {
            throw new Error(`Unknown config flag "${name}"`);
        }

        return flagSpec;
    };

    const getFlagDescription = (name: FlagName): string =>
        getFlagSpec(name).description;

    const getFlagValue = (config: Config, name: FlagName): boolean =>
        getFlagSpec(name).getValue(config);

    const setFlagValue = (
        config: Config,
        name: FlagName,
        value: boolean,
    ): void => {
        getFlagSpec(name).setValue(config, value);
    };

    return {
        defaultConfig,
        createConfig: createConfigInstance,
        getFlagNames,
        hasFlag,
        getFlagDescription,
        getFlagValue,
        setFlagValue,
    };
}

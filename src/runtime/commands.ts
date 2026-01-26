export const COMMAND_PREFIX = "!";

export type CommandSpec = {
    prefix: string;
    name: string;
    args: string[];
    raw: string;
};

export type CommandParseSpec = {
    prefix: string;
};

export type CommandConfig = {
    spec: CommandParseSpec;
    commands: string[];
};

export type CommandHandleResult = {
    handled: boolean;
};

export type CommandResponse = {
    hideMessage?: boolean;
};

import { cleanEnv, str, bool } from "envalid";

export const env = cleanEnv(process.env, {
    PROXY: str({ default: undefined }),
    DEBUG: bool({ default: false }),
    LANGUAGE: str({ default: undefined }),
    TOKEN: str(),
    TUTORIAL_LINK: str({ default: "youtube.com/watch?v=Z09dlI3MR28" }),
    DISCORD_LINK: str({ default: "discord.gg/q8ay8PmEkp" }),
});

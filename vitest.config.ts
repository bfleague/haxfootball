import path from "node:path";
import { defineConfig } from "vitest/config";

const resolvePath = (target: string) => path.resolve(__dirname, target);

export default defineConfig({
    resolve: {
        alias: {
            "@common": resolvePath("src/common"),
            "@core": resolvePath("src/core"),
            "@haxball": resolvePath("src/haxball"),
            "@environment": resolvePath("src/environments"),
            "@meta": resolvePath("src/meta"),
            "@room": resolvePath("src/room"),
            "@runtime": resolvePath("src/runtime"),
            "@types": resolvePath("src/types"),
            "@dev": resolvePath("src/dev"),
            "@i18n": resolvePath("src/i18n.ts"),
            "@stadium": resolvePath("src/stadium"),
        },
    },
});

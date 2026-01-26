module.exports = {
    presets: [
        [
            "@babel/preset-env",
            {
                targets: { node: "current" },
            },
        ],
        [
            "@babel/preset-typescript",
            {
                allowDeclareFields: true,
            },
        ],
    ],
    plugins: [
        "macros",
        [
            "module-resolver",
            {
                root: ["./src"],
                extensions: [".ts", ".js", ".json"],
                alias: {
                    "@common": "./src/common",
                    "@core": "./src/core",
                    "@haxball": "./src/haxball",
                    "@environment": "./src/environments",
                    "@meta": "./src/meta",
                    "@room": "./src/room",
                    "@runtime": "./src/runtime",
                    "@types": "./src/types",
                    "@dev": "./src/dev",
                    "@i18n": "./src/i18n",
                },
            },
        ],
    ],
};

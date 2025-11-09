module.exports = {
    locales: ["en", "pt"],
    sourceLocale: "en",
    catalogs: [
        {
            path: "<rootDir>/src/locales/{locale}/messages",
            include: ["<rootDir>/src"],
        },
    ],
    format: "po",
    compileNamespace: "ts",
    runtimeConfigModule: ["@common/i18n", "i18n"],
};

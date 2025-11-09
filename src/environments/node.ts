import Haxball from "@haxball/game";
import * as Manual from "@room/manual";
import { updateRoomModules } from "@core/module";
import { activateLocale, resolveLocale } from "src/i18n";

async function bootstrap() {
    const languageEnv = process.env["LANGUAGE"];
    const locale = resolveLocale(languageEnv);
    const normalizedEnv = languageEnv?.trim().toLowerCase();

    if (normalizedEnv && !normalizedEnv.startsWith(locale)) {
        console.warn(
            `[i18n] LANGUAGE "${languageEnv}" is not supported. Falling back to "${locale}".`,
        );
    }

    activateLocale(locale);

    const HBInit: Function = await Haxball;
    const room = HBInit({
        ...Manual.config,
        token: process.env["TOKEN"] ?? "",
    });

    updateRoomModules(room, Manual.modules);
}

bootstrap().catch((error) => {
    console.error("Failed to bootstrap headless environment:", error);
    process.exitCode = 1;
});

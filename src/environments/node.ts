import Haxball from "@haxball/game";
import * as Manual from "@room/manual";
import { updateRoomModules } from "@core/module";
import { initI18n } from "@i18n";

async function bootstrap() {
    initI18n(process.env["LANGUAGE"]);

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

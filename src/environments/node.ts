import Haxball from "@haxball/game";
import * as Manual from "@room/manual";
import { updateRoomModules } from "@core/module";

Haxball.then((HBInit: Function) => {
    const room = HBInit({
        ...Manual.config,
        token: process.env["TOKEN"] ?? "",
    });

    updateRoomModules(room, Manual.modules);
});

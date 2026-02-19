import { t } from "@lingui/core/macro";
import { modules as roomModules } from "./modules/room";
import { modules as gameModules } from "./modules/game";

const PROXY = process.env["PROXY"];
const IS_DEBUG = process.env["DEBUG"] === "true";

const config: RoomConfigObject = {
    roomName: t`🏈 HaxFootball - American Football 🏈`,
    maxPlayers: 25,
    noPlayer: true,
    public: !IS_DEBUG,
    ...(PROXY ? { proxy: PROXY } : {}),
};

export const getConfig = () => config;
export const modules = [...roomModules, ...gameModules];

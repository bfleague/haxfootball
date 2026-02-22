import { t } from "@lingui/core/macro";
import { modules as roomModules } from "./modules/room";
import { modules as gameModules } from "./modules/game";
import { env } from "@env";

const config: RoomConfigObject = {
    roomName: t`🏈 HaxFootball - American Football 🏈`,
    maxPlayers: 25,
    noPlayer: true,
    public: !env.DEBUG,
    ...(env.PROXY ? { proxy: env.PROXY } : {}),
};

export const getConfig = () => config;
export const modules = [...roomModules, ...gameModules];

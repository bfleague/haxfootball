import { createModule } from "@core/module";
import { COMMAND_PREFIX } from "@runtime/commands";
import { createEngine, type Engine } from "@runtime/engine";
import { registry, stadium } from "@meta/legacy/meta";
import { defaultConfig, type Config } from "@meta/legacy/config";
import { Team } from "@runtime/models";
import { legacyGlobalSchema } from "@meta/legacy/global";
import { t } from "@lingui/core/macro";
import { randomBytes } from "node:crypto";
import { Room } from "@core/room";
import { COLOR } from "@common/general/color";

const IS_DEBUG = process.env["DEBUG"] === "true";
const PROXY = process.env["PROXY"];

const config: RoomConfigObject = {
    roomName: t`🏈 HaxFootball - American Football 🏈`,
    maxPlayers: 25,
    noPlayer: true,
    public: !IS_DEBUG,
    ...(PROXY ? { proxy: PROXY } : {}),
};

const TUTORIAL_LINK = "youtube.com/watch?v=Z09dlI3MR28";
const DISCORD_LINK = "discord.gg/q8ay8PmEkp";
const ADMIN_PASSWORD = randomBytes(4).toString("hex");

const getPlayerNamePrefix = (team: number): string => {
    switch (team) {
        case Team.RED:
            return "🟥";
        case Team.BLUE:
            return "🟦";
        default:
            return "⬜";
    }
};

let engine: Engine<Config> | null = null;

const admins = new Set<number>();

const manageAdmin = (room: Room) => {
    if (!room.getPlayerList().some((p) => p.admin)) {
        const player = room.getPlayerList()[0];

        if (player) {
            room.setAdmin(player, true);
        }
    }
};

const mainModule = createModule()
    .setCommands({
        spec: { prefix: COMMAND_PREFIX },
        commands: [
            "admin",
            "setpassword",
            "clearpassword",
            "discord",
            "tutorial",
        ],
    })
    .onRoomLink((room, url) => {
        if (IS_DEBUG) {
            console.warn("Running in debug mode.");
        }

        console.log(`Room link: ${url}`);
        console.log(`Admin password: ${ADMIN_PASSWORD}`);

        room.lockTeams();
    })
    .onPlayerSendCommand((room, player, command) => {
        switch (command.name) {
            case "admin": {
                const password = command.args[0];

                if (password === ADMIN_PASSWORD) {
                    room.setAdmin(player, true);
                    room.send({
                        message: t`✅ You are now an admin.`,
                        color: COLOR.SUCCESS,
                        to: player.id,
                    });
                    admins.add(player.id);
                } else {
                    room.send({
                        message: t`❌ Incorrect password.`,
                        color: COLOR.ERROR,
                        to: player.id,
                    });
                }

                return { hideMessage: true };
            }
            case "setpassword": {
                const newPassword = command.args[0];

                if (!player.admin) {
                    room.send({
                        message: t`🚫 You must be an admin to use this command.`,
                        color: COLOR.ERROR,
                        to: player.id,
                    });
                    return { hideMessage: true };
                }

                if (!newPassword) {
                    room.send({
                        message: t`⚠️ Please provide a new password.`,
                        color: COLOR.WARNING,
                        to: player.id,
                    });
                    return { hideMessage: true };
                }

                room.setPassword(newPassword);
                room.send({
                    message: t`✅ Password updated successfully.`,
                    color: COLOR.SUCCESS,
                    to: player.id,
                });

                return { hideMessage: true };
            }
            case "clearpassword": {
                if (!player.admin) {
                    room.send({
                        message: t`🚫 You must be an admin to use this command.`,
                        color: COLOR.ERROR,
                        to: player.id,
                    });
                    return { hideMessage: true };
                }

                room.removePassword();
                room.send({
                    message: t`✅ Password cleared successfully.`,
                    color: COLOR.SUCCESS,
                    to: player.id,
                });

                return { hideMessage: true };
            }
            case "discord": {
                room.send({
                    message: t`💬 Join our Discord server: ${DISCORD_LINK}`,
                    color: COLOR.ACTION,
                });

                return { hideMessage: false };
            }
            case "tutorial": {
                room.send({
                    message: t`🎬 Watch the tutorial: ${TUTORIAL_LINK}`,
                    color: COLOR.ACTION,
                });

                return { hideMessage: false };
            }
            default:
                return { hideMessage: false };
        }
    })
    .onPlayerJoin((room, player) => {
        if (IS_DEBUG) {
            room.setAdmin(player, true);
        } else {
            manageAdmin(room);
        }

        room.send({
            message: t`🏈 Welcome to HaxFootball!`,
            color: COLOR.SYSTEM,
            to: player.id,
            sound: "notification",
        });
        room.send({
            message: t`🎬 Watch the tutorial: ${TUTORIAL_LINK}`,
            color: COLOR.HIGHLIGHT,
            to: player.id,
            sound: "none",
        });
        room.send({
            message: t`💬 Join our Discord server: ${DISCORD_LINK}`,
            color: COLOR.ACTION,
            to: player.id,
            sound: "none",
        });

        console.log(`${player.name} has joined`);
    })
    .onPlayerLeave((room, player) => {
        manageAdmin(room);

        console.log(`${player.name} has left`);
    })
    .onPlayerAdminChange((room) => {
        manageAdmin(room);
    })
    .onPlayerKicked((room, kickedPlayer, _reason, _ban, byPlayer) => {
        if (
            byPlayer &&
            admins.has(kickedPlayer.id) &&
            !admins.has(byPlayer.id)
        ) {
            room.clearBan(kickedPlayer.id);
            room.setAdmin(byPlayer, false);
        }
    })
    .onPlayerChat((_, player, message) => {
        console.log(
            `${getPlayerNamePrefix(player.team)} ${player.name}: ${message}`,
        );
    });

const matchModule = createModule()
    .setCommands({
        spec: { prefix: COMMAND_PREFIX },
        commands: [
            "punt",
            "fg",
            "version",
            "undo",
            "info",
            "reposition",
            "score",
        ],
    })
    .onGameStart((room) => {
        engine = createEngine(room, registry, {
            config: defaultConfig,
            globalSchema: legacyGlobalSchema,
        });

        engine.start("KICKOFF", { forTeam: Team.RED });
    })
    .onGameTick(() => {
        engine?.tick();
    })
    .onPlayerBallKick((_room, player) => {
        engine?.trackPlayerBallKick(player.id);
    })
    .onPlayerSendCommand((room, player, command) => {
        const { handled: handledByEngine } = engine
            ? engine.handlePlayerCommand(player, command)
            : { handled: false };

        if (handledByEngine) {
            return { hideMessage: true };
        }

        switch (command.name) {
            case "version":
                room.send({
                    message: t`🏈 HaxFootball 2026`,
                    color: COLOR.SYSTEM,
                    to: player.id,
                });

                return { hideMessage: true };
            default:
                room.send({
                    message: engine
                        ? t`⚠️ You cannot use that command right now.`
                        : t`⚠️ The game has not been started yet.`,
                    color: COLOR.WARNING,
                    to: player.id,
                });

                return { hideMessage: true };
        }
    })
    .onPlayerChat((room, player, rawMessage) => {
        const emoji = getPlayerNamePrefix(player.team);
        const message = `${emoji} ${player.name}: ${rawMessage}`;

        const engineChatResult = engine?.handlePlayerChat(
            player,
            rawMessage,
            () => room.send({ message }),
        );

        const defaultResult = {
            allowBroadcast: true,
            sentBeforeHooks: false,
        };

        const chatResult = engineChatResult ?? defaultResult;

        if (chatResult.allowBroadcast && !chatResult.sentBeforeHooks) {
            room.send({ message });
        }

        return false;
    })
    .onPlayerTeamChange((_room, changedPlayer, byPlayer) => {
        engine?.handlePlayerTeamChange(changedPlayer, byPlayer);
    })
    .onPlayerLeave((_room, player) => {
        engine?.handlePlayerLeave(player);
    })
    .onGameStop(() => {
        engine?.stop();
        engine = null;
    })
    .onGamePause((_room, byPlayer) => {
        engine?.handleGamePause(byPlayer);
    })
    .onGameUnpause((_room, byPlayer) => {
        engine?.handleGameUnpause(byPlayer);
    })
    .onRoomLink((room, _) => {
        room.setStadium(stadium);
    });

export const getConfig = () => config;
export const modules = [mainModule, matchModule];

import { createModule } from "@core/module";
import { COMMAND_PREFIX } from "@runtime/commands";
import { t } from "@lingui/core/macro";
import { randomBytes } from "node:crypto";
import { Room } from "@core/room";
import { COLOR } from "@common/general/color";

const IS_DEBUG = process.env["DEBUG"] === "true";
const TUTORIAL_LINK = "youtube.com/watch?v=Z09dlI3MR28";
const DISCORD_LINK = "discord.gg/q8ay8PmEkp";
const ADMIN_PASSWORD = randomBytes(4).toString("hex");

const admins = new Set<number>();
const adminConns = new Set<string>();

const manageAdmin = (room: Room) => {
    if (!room.getPlayerList().some((p) => p.admin)) {
        const player = room.getPlayerList()[0];

        if (player) {
            room.setAdmin(player, true);
        }
    }
};

const connToIp = (conn: string) =>
    decodeURIComponent(conn.replace(/(..)/g, "%$1"));

const mainModule = createModule()
    .setCommands({
        spec: { prefix: COMMAND_PREFIX },
        commands: [
            "admin",
            "setpassword",
            "clearpassword",
            "discord",
            "tutorial",
            "clearbans",
        ],
    })
    .onRoomLink((room, url) => {
        if (IS_DEBUG) {
            console.warn("Running in debug mode.");
        }

        console.log(`Room link: ${url}`);
        console.log(`Admin password: ${ADMIN_PASSWORD}`);

        room.lockTeams();
        room.setScoreLimit(0);
        room.setTimeLimit(10);
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
                    adminConns.add(connToIp(player.conn));
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
            case "clearbans": {
                if (!player.admin) {
                    room.send({
                        message: t`🚫 You must be an admin to use this command.`,
                        color: COLOR.ERROR,
                        to: player.id,
                    });
                    return { hideMessage: true };
                }

                room.clearBans();

                room.send({
                    message: t`✅ All bans cleared successfully.`,
                    color: COLOR.SUCCESS,
                    to: player.id,
                });

                return { hideMessage: true };
            }
            default:
                return { hideMessage: false };
        }
    })
    .onPlayerJoin((room, player) => {
        console.log(`${player.name} has joined (${connToIp(player.conn)})`);

        const duplicate = room
            .getPlayerList()
            .find((p) => p.id !== player.id && p.conn === player.conn);

        if (duplicate) {
            room.kick(player, t`Already connected (${duplicate.name}).`);
            return;
        }

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
    })
    .onPlayerLeave((room, player) => {
        manageAdmin(room);

        console.log(`${player.name} has left`);
    })
    .onPlayerAdminChange((room) => {
        manageAdmin(room);
    })
    .onBeforeKick((room, kickedPlayer, _reason, ban, byPlayer) => {
        if (
            kickedPlayer &&
            adminConns.has(connToIp(kickedPlayer.conn)) &&
            !admins.has(byPlayer.id)
        ) {
            room.send({
                message: ban
                    ? t`⚠️ You cannot ban this player.`
                    : t`⚠️ You cannot kick this player.`,
                color: COLOR.WARNING,
                to: byPlayer.id,
                sound: "notification",
            });

            return false;
        }

        if (ban && !admins.has(byPlayer.id)) {
            room.send({
                message: t`🚫 You are not allowed to ban players.`,
                color: COLOR.ERROR,
                to: byPlayer.id,
                sound: "notification",
            });

            return false;
        }

        return true;
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
        const time = new Date().toLocaleTimeString();
        console.log(`[${time}] ${player.name}: ${message}`);
    });

export const modules = [mainModule];

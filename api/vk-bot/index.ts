import { on } from "nexus";
import * as dotenv from "dotenv";
import * as path from "path";
import { PrismaClient } from "@prisma/client";
import { VK } from "vk-io";
import { SessionManager } from "@vk-io/session";

/*
регистр не имеет значение
*/

class UserInputTooLarge extends TypeError {
    constructor(public expectedLength: number, public usersLength: number, where: string) {
        super();
        this.message = `К сажелению тут жесткое ограничение на кол-во символов для ${where}: ${expectedLength}. Сократите сообщение всего лишь на ${usersLength - expectedLength} симв.`;
    }
}

on.start(async () => {
    dotenv.config({
        path: path.resolve(__dirname, "./.env")
    });
    if (!process.env.VK_SUPER_SECRET_TOKEN) throw new TypeError("some of env vars are not defined");
    const prisma = new PrismaClient();
    const vk = new VK({
        token: process.env.VK_SUPER_SECRET_TOKEN
    });
    const sessionManager = new SessionManager();
    //todo mb vk-io-question

    vk.updates.on("message_new", sessionManager.middleware);

    vk.updates.on("message_new", async (ctx) => {
        if (!ctx.text) {
            console.error("ctx empty text");
            await ctx.send(`Я не вижу текста. Повтори-ка.`);
            return;
        }

        const dataFromDb = {
            async getUsersHost() {
                return await prisma.host.findOne({
                    where: {
                        ownerUserId: userId.toString()
                    }
                });
            },
            async getUserInvites() {
                return await prisma.userInvite.findMany({
                    where: {
                        toUserId: userId.toString()
                    }
                });
            }
        };

        const dangerousDeleteHost = async () => {
            prisma.host.delete({
                where: {
                    ownerUserId: userId.toString()
                }
            });
        };

        const userId = ctx["payload"].message.from_id;

        //todo rewrite ts type
        type DialogContext = {
            active: boolean,
            command: string,
            /** 0 initial for each. needs reset at the end */
            commandStep: number,
            inputData: {
                [componentData: string]: string;
            };
        };
        const dialogContext: DialogContext = ctx.session;
        const commandArgs = dialogContext.active ? null : ctx.text.split(" ").slice(1);
        const resetBotState = async () => {
            ctx.session = {
                active: false
            };
        };

        if (/^\/stop/i.test(ctx.text)) {
            await resetBotState();
            await ctx.send("⚓️Вы в меню.");
            return;
        }

        const userCommand: string = dialogContext.active ? dialogContext.command : ctx.text.split(" ")[0].slice(1).toLowerCase();

        const commands: Record<string, {
            /** keep undefined if commands doesn't need dialog context */
            dialogContextFinalStage?: number,
            handle: (anotherCommandName?: string) => Promise<void>;
        }> = {
            help: {
                handle: async () => {
                    const userInvites = await dataFromDb.getUserInvites();

                    const allAvailable = commandArgs && commandArgs[0] === "all";
                    const hostAvailable = allAvailable || !!(await dataFromDb.getUsersHost());
                    const hasAnyInvites = allAvailable || userInvites.length !== 0;
                    await ctx.send(`
                        Доступные команды:
                        - /help - эта справка
                        - /help all - эта справка, но со всеми коммандами
                        - /stop - выход из допросника и сброса сост. бота

                        ${allAvailable || !hostAvailable ? `
                         - /newhost - создать хост
                        ` : ""}
                        ${allAvailable || hostAvailable ? `
                            - /removehost - удалить хост
                            - /edithost - ред. данные хоста
                        ` : ""}

                        ${allAvailable || hasAnyInvites ? `
                            - /invites - показать приглашения (${userInvites.length})
                            - /accept <host id>
                            - /decline <host id>
                        ` : ""}
                    `);
                }
            },
            newHost: {
                dialogContextFinalStage: 3,
                handle: async () => {
                    const maxLength = {
                        name: 25,
                        link: 50,
                        description: 350
                    };
                    const isTextTooLong = async (component: keyof typeof maxLength): Promise<void> => {
                        const usersLength = ctx.text!.length,
                            expectedLength = maxLength[component];
                        if (usersLength > maxLength[component]) throw new UserInputTooLarge(expectedLength, usersLength, component);
                    };
                    if (await (dataFromDb.getUsersHost())) {
                        await ctx.send(`❌ Вы уже владете одним хостом, больше нельзя. См. /help для упр. хостом`);
                        await resetBotState();
                        return;
                    }
                    switch (dialogContext.commandStep) {
                        case 0:
                            await ctx.send(`✏️ Как назовем хост? - введите /stop для выхода`);
                            break;
                        case 1:
                            if (isTextTooLong("name")) return;
                            dialogContext.inputData = {
                                name: ctx.text!
                            };
                            await ctx.send(`🔗 Дай ссылку на сайт этого хоста`);
                            break;
                        case 2:
                            if (isTextTooLong("link")) return;
                            dialogContext.inputData.site = ctx.text!;
                            await ctx.send(`✏️ Теперь давай описание, только поподробней ;) - макс ${maxLength} символов`);
                            break;
                        case 3:
                            if (isTextTooLong("description")) return;
                            dialogContext.inputData.description = ctx.text!;
                            try {
                                const { name, site, description } = dialogContext.inputData;
                                await prisma.host.create({
                                    data: {
                                        ownerUserId: userId.toString(),
                                        name,
                                        site,
                                        description
                                    }
                                });
                                await ctx.send(`Х Мы успешно добавили хост!`);
                            } catch (err) {
                                console.error(err);
                                await ctx.send(`❌ Наш полный провал. Мы не смогли добавить хост. Сообщите нам об этом.`);
                            }
                            break;
                    }
                }
            },
            deleteHost: {
                dialogContextFinalStage: 1,
                handle: async () => {
                    switch (dialogContext.commandStep) {
                        case 0:
                            const usersHost = await prisma.host.findOne({
                                where: {
                                    ownerUserId: userId.toString()
                                },
                                include: {
                                    members: true,
                                    userRatings: true
                                }
                            });
                            if (!usersHost) {
                                await ctx.send(`❌ Вы не создавали хост. Удалять нечего.`);
                                return;
                            }
                            //если у хоста нет участников, нету рейтингов и с момента создания прошло не более суток то запрашивать доп. разрешение не нужно
                            if (Date.now() - +usersHost.createdAt / 1000 / 60 / 60 / 24 < 1 && usersHost.members.length === 0 && usersHost.userRatings.length === 0) {
                                await dangerousDeleteHost();
                                await ctx.send(`Х Хост удален. Будем рады услышать ваше мнение о проекте: ${"github.com/zardoy/api-rate-host"}`);
                                return;
                            }
                            const removeConfirm = usersHost.name.slice(0, 15);
                            ctx.session.removeConfirm = removeConfirm;

                            await ctx.send(`Назад пути нет! Введите ${removeConfirm} для безвозвратного удаления хоста.`);
                            break;
                        case 1:
                            if (ctx.text! === ctx.session.removeConfirm) {
                                await dangerousDeleteHost();
                                await ctx.send(`Х Хост удален! Спасибо, что были с нами!`);
                            }
                            break;
                    }
                }
            },
            invites: {
                handle: async () => {
                    const userInvitesFromHost = await prisma.userInvite.findMany({
                        where: {
                            toUserId: userId.toString()
                        },
                        include: {
                            Host: true
                        }
                    });
                    if (userInvitesFromHost.length === 0) {
                        await ctx.send(`Ту! У вас еще нет приглашений!`);
                        return;
                    }
                    const invitesToPrint = userInvitesFromHost.map(inviteWithHost => `${inviteWithHost.fromHostId} ${inviteWithHost.Host.name}`);
                    await ctx.send(`
                        Всего приглашений: ${userInvitesFromHost.length}
                        (на каждой строчке – id приглашения и назв. хоста, исп. id в /accept и /decline, к примеру /accept 53248)
                        ${invitesToPrint.join("\n")}
                    `);
                }
            },
            accept: {
                handle: async (anotherCommandName) => {
                    const isFromDecline = anotherCommandName === "decline";

                    const hostId = commandArgs![0];
                    if (!hostId) {
                        await ctx.send(`Укажите число в начале строки из списка /invites . К примеру: /${userCommand} 4359`);
                        return;
                    }
                    if (isNaN(+hostId)) {
                        await ctx.send(`❌ Вы ввели не id, а что-то другое (это не число)`);
                        return;
                    }
                    const dedicatedInvite = await prisma.userInvite.findOne({
                        where: {
                            toUserId_fromHostId: {
                                toUserId: userId.toString(),
                                fromHostId: +hostId
                            }
                        }
                    });
                    if (!dedicatedInvite) {
                        await ctx.send(`❌ Мы не смогли найти это приглашение`);
                        return;
                    }
                    await prisma.userInvite.delete({
                        where: {
                            toUserId_fromHostId: {
                                fromHostId: +hostId,
                                toUserId: userId.toString()
                            }
                        }
                    });
                    if (!isFromDecline) {
                        //todo transaction
                        await prisma.hostMember.create({
                            data: {
                                host: { connect: { id: +hostId } },
                                userId: userId.toString()
                            }
                        });
                    }
                }
            },
            decline: {
                handle: async () => {
                    await commands.accept.handle("decline");
                }
            },
            invite: {
                handle: async () => {
                    //todo check user id
                    //todo multiple users
                }
            }
        };
        const commandNameToExecute = Object.keys(commands).map(key => key.toLowerCase()).find(commandName => commandName === userCommand);
        if (commandNameToExecute) {
            const commandToExecute = commands[commandNameToExecute];
            if (commandToExecute.dialogContextFinalStage !== undefined) {
                if (dialogContext.active) {
                    if (dialogContext.commandStep === commandToExecute.dialogContextFinalStage) {
                        await resetBotState();
                    } else {
                        dialogContext.commandStep++;
                    }
                } else {
                    dialogContext.active = true;
                    dialogContext.command = commandNameToExecute;
                    dialogContext.commandStep = 0;
                }
            }
            try {
                await commandToExecute.handle();
            } catch (err) {
                if (err instanceof UserInputTooLarge) {
                    await ctx.send(err.message);
                } else {
                    await ctx.send(`❌Наш полный провал. Мы не смогли исполнить /${commandNameToExecute} :(`);
                    console.error(err);
                }
            }
        } else {
            await ctx.send(`/help тебе в помощь`);
        }
    });

    await vk.updates.start();
});
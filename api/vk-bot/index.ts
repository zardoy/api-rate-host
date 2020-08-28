import { on } from "nexus";
import * as dotenv from "dotenv";
import * as path from "path";
import { PrismaClient, Host, UserInvite } from "@prisma/client";
import { VK, Keyboard, MessageContext, KeyboardBuilder } from "vk-io";
import { QuestionManager, IQuestionMessageContext } from "vk-io-question";
import _ from "lodash";
import Debug from "@prisma/debug";


class UserInputTooLarge extends TypeError {
    constructor(public expectedLength: number, public usersLength: number, where: string) {
        super();
        this.message = `К сажелению тут жесткое ограничение на кол-во символов для ${where}: ${expectedLength}. Сократите сообщение всего лишь на ${usersLength - expectedLength} симв.`;
    }
}

// nexus рекоммендует иниц. доп. логику тут дабы исбежать повторного вызова, вроде как на продакшене не имеет значения
on.start(async () => {
    const debug = Debug("vk-bot");
    dotenv.config({
        path: path.resolve(__dirname, "./.env")
    });
    if (!process.env.VK_SUPER_SECRET_TOKEN) throw new TypeError("some of env vars are not defined");
    const prisma = new PrismaClient();
    const vk = new VK({
        token: process.env.VK_SUPER_SECRET_TOKEN,
        //bad internet connection todo: remove it
        apiTimeout: 50_000
    });
    //todo question?
    const questionManager/* : QuestionManager & { questions: string } */ = new QuestionManager();

    //todo жесткое огр свойств
    type MyMessageContext = MessageContext & {
        question: (question: string, params?: Parameters<MessageContext["send"]>[1]) => ReturnType<IQuestionMessageContext["question"]>,
        usersDataFromDb: {
            host: Host | null,
            invitesCount: number;
        };
    };
    type QuestionsMap = Map<number, unknown>;

    vk.updates.on("message_new", async (ctx: MyMessageContext, next) => {
        //подготавливаем вспомогательные данные и клавиатуру для любого ответа
        const { senderId } = ctx;

        // const userHasQuestion = questionManager["questions"].has(senderId);

        // если не в допроснике, значит в главном меню
        ctx.usersDataFromDb = {
            host: await prisma.host.findOne({
                where: {
                    ownerUserId: senderId.toString()
                }
            }),
            invitesCount: await prisma.userInvite.count({
                where: {
                    toUserId: senderId.toString()
                }
            })
        };

        const oldSend = ctx.send.bind(ctx);
        ctx.send = async (text, params = {}) => {
            const keyboardToSend = params.keyboard || (() => {
                const defaultKeyboard = Keyboard.builder().oneTime(true);
                if (ctx.usersDataFromDb.host) {
                    defaultKeyboard
                        .textButton({
                            label: "/editinfo - ред. хост",
                            color: "primary"
                        })
                        .textButton({
                            label: "/invite - пригласить",
                            color: "positive"
                        });
                    //удалить хост можно только прописав команду вручную
                } else {
                    defaultKeyboard
                        .textButton({
                            label: "/newhost создать хост"
                        });
                }
                if (ctx.usersDataFromDb.invitesCount !== 0) {
                    defaultKeyboard
                        .oneTime()
                        .row()
                        .textButton({
                            label: "/invites - приглашения",
                            color: "positive"
                        });
                }
                return defaultKeyboard;
            })();
            //todo-low refactor
            return await oldSend(text, {
                ...(keyboardToSend ? { keyboard: keyboardToSend } : {}),
                ...(params || _.omit(params, "keyboard"))
            });
        };
        await next();
    });

    vk.updates.on("message_new", async (ctx, next) => {
        // тут обрабатываем случаи включая когда в допроснике

        const { senderId } = ctx;
        if (!ctx.text) {
            await ctx.send(`Я не вижу текста. Повтори-ка.`, {
                keyboard: undefined
            });
            return;
        }

        // не подходит ctx.text.startsWith("/stop") тк он регистрозависимый
        if (/^\/stop/i.test(ctx.text)) {
            await ctx.send("⚓️ Вы в меню.");
            (questionManager["questions"] as QuestionsMap).delete(senderId);
            return;
        }
        await next();
    });

    vk.updates.on("message_new", questionManager.middleware);
    vk.updates.on("message_new", async (ctx: MyMessageContext, next) => {
        // переопределение .question, обязательно после его middleware (после того как он его назначает)

        const oldQuestion = ctx.question.bind(ctx);
        ctx.question = async (text, params?) => {
            return await oldQuestion(text, {
                keyboard: Keyboard.builder()
                    .oneTime(true)
                    .textButton({
                        label: "/stop - покинуть допрос",
                        color: "negative"
                    }),
                ...(params || {})
            });
        };
        await next();
    });

    vk.updates.on("message_new", async (ctx: MyMessageContext) => {
        // вызывается только если не в допроснике
        // поиск и исполнение комманды
        const { senderId } = ctx;

        //вызываем справку для кнопки начать
        if (ctx.messagePayload && ctx.messagePayload.command === "start") ctx.text = "/help";

        if (
            // если не ждем ответа на вопрос
            !(questionManager["questions"] as QuestionsMap).has(senderId) &&
            !ctx.text!.startsWith("/")
        ) {
            await ctx.send(`Я сейчас понимаю только комманды, а они начинаются с /`);
            return;
        }


        const commandParts = ctx.text!.split(" "),
            userCommandInLowerCase = commandParts[0].slice(1).toLowerCase();

        const dangerousDeleteHost = async () => {
            await prisma.host.delete({
                where: {
                    ownerUserId: senderId.toString()
                }
            });
            ctx.usersDataFromDb.host = null;
        };

        let isFromDeclineCommand = false;
        const commands: Record<string, () => Promise<void>> = {
            help: async () => {
                const { invitesCount } = ctx.usersDataFromDb;

                const allAvailable = commandParts[1] === "all";
                const hostAvailable = allAvailable || !!ctx.usersDataFromDb!.host;
                const hasAnyInvites = allAvailable || invitesCount !== 0;
                await ctx.send(`
                        ${allAvailable ? `Все` : `Доступные`} действия:
                        - /help - ${!allAvailable ? "эта справка" : "cправка с доступными коммандами"}
                        - /help all - ${allAvailable ? "эта справка" : "cправка со всеми коммандами"}
                        ${allAvailable ? `
                            - /stop - выход из допросника и сброса сост. бота
                        ` : ""}

                        ${allAvailable || !hostAvailable ? `
                            - /newhost - создать хост
                        ` : ""}
                        ${allAvailable || hostAvailable ? `
                            - /removehost - удалить хост
                            - /edithost - ред. данные хоста
                            - /invite [упоминание юзеров через пробел] - пригласить в модераторы
                        ` : ""}

                        ${allAvailable || hasAnyInvites ? `
                        - /invites - показать приглашения (${invitesCount})
                        - /accept <host id>
                        - /decline <host id>
                        ` : ""}
                    `.replace(/^\s+/gm, "") /* <-- убираем пробелы в начале каждой строки (флаг m) */
                );
            },
            newhost: async () => {
                if (ctx.usersDataFromDb!.host) {
                    await ctx.send(`❌ Вы уже владете одним хостом, больше нельзя. См. /help для упр. хостом`);
                    return;
                }

                const PEN_SMILE = `✏️`;
                const LINK_SMILE = `🔗`;

                const components = {
                    name: {
                        maxLength: 25,
                        question: `${PEN_SMILE} Как назовем хост? - введите /stop для выхода`
                    },
                    site: {
                        maxLength: 50,
                        question: `${LINK_SMILE} Дай ссылку на сайт этого хоста`
                    },
                    description: (() => {
                        const maxLength = 350;
                        return {
                            maxLength,
                            question: `${PEN_SMILE} Теперь давай описание, только поподробней ;) - макс ${maxLength} символов`
                        };
                    })()
                };
                type ComponentName = keyof typeof components;

                const newHostData = new Map<ComponentName, string>();

                for (let [componentName, questionData] of Object.entries(components)) {
                    const { text: answer } = await ctx.question(questionData.question);
                    if (!answer) throw new TypeError("Empty response from user");
                    const { maxLength: expectedLength } = questionData,
                        usersLength = answer.length;
                    if (usersLength > expectedLength) throw new UserInputTooLarge(expectedLength, usersLength, componentName);
                    newHostData.set(componentName as ComponentName, answer);
                }

                try {
                    ctx.usersDataFromDb.host = await prisma.host.create({
                        data: {
                            ownerUserId: senderId.toString(),
                            //why fromEntries
                            ...Object.fromEntries(newHostData) as any
                        }
                    });
                    await ctx.send(`✅ Мы успешно добавили хост!`);
                } catch (err) {
                    console.error(err);
                    await ctx.send(`❌ Наш полный провал. Мы не смогли занести хост в базу данных. Сообщите нам об этом.`);
                }
            },
            deletehost: async () => {
                const usersHost = await prisma.host.findOne({
                    where: {
                        ownerUserId: senderId.toString()
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
                    await ctx.send(`✅ Хост удален. Будем рады услышать ваше мнение о проекте: ${"github.com/zardoy/api-rate-host"}`);
                    return;
                }
                const removeConfirm = usersHost.name.slice(0, 15);
                const { text: answerConfirm } = await ctx.question(`Назад пути нет! Введите "${removeConfirm}" (без кавычек) для безвозвратного удаления хоста.`);
                if (answerConfirm === removeConfirm) {
                    await dangerousDeleteHost();
                    await ctx.send(`✅ Хост удален! Спасибо, что были с нами!`);
                } else {
                    await ctx.send(`Сори, но вы ввели не в точности так, как мы вас просили. ${userCommandInLowerCase} для повтора`);
                }
            },
            invite: async () => {
                const usersToInvite = commandParts.slice(1);
                if (usersToInvite.length > 5) {
                    await ctx.send(`❌ Нельзя пригласить более 5 пользователей`);
                    return;
                }
                await ctx.send("Not implemented yet");
            },
            invites: async () => {
                const userInvitesFromHost = await prisma.userInvite.findMany({
                    where: {
                        toUserId: undefined
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
                await vk.api.messages.send({
                    message: "",
                    template: "",
                });
                await ctx.send(`
                    Всего приглашений: ${userInvitesFromHost.length}
                    (на каждой строчке – id приглашения и назв. хоста, исп. id в /accept и /decline, к примеру /accept 53248)
                    ${invitesToPrint.join("\n")}
                `.replace(/^\s+/gm, ""));
            },
            accept: async () => {
                const hostId = commandParts[1];
                if (!hostId) {
                    await ctx.send(`❌ Укажите число в начале строки из списка /invites . К примеру: /${userCommandInLowerCase} 4359`);
                    return;
                }
                if (isNaN(+hostId)) {
                    await ctx.send(`❌ Вы ввели не id, а что-то другое (а нужно число!)`);
                    return;
                }
                const dedicatedInvite = await prisma.userInvite.findOne({
                    where: {
                        toUserId_fromHostId: {
                            toUserId: senderId.toString(),
                            fromHostId: +hostId
                        }
                    }
                });
                if (!dedicatedInvite) {
                    await ctx.send(`❌ Мы не смогли отыскать это приглашение :(`);
                    return;
                }
                await prisma.userInvite.delete({
                    where: {
                        toUserId_fromHostId: {
                            fromHostId: +hostId,
                            toUserId: senderId.toString()
                        }
                    }
                });
                if (!isFromDeclineCommand) {
                    //todo transaction
                    await prisma.hostMember.create({
                        data: {
                            host: { connect: { id: +hostId } },
                            userId: senderId.toString()
                        }
                    });
                }
                ctx.usersDataFromDb.invitesCount = await prisma.userInvite.count({
                    where: {
                        toUserId: senderId.toString()
                    }
                });
            },
            decline: async () => {
                isFromDeclineCommand = true;
                await commands.accept();
            }
        };
        const commandNameToExecute =
            Object.keys(commands).find((commandName) => commandName.toLowerCase() === userCommandInLowerCase);

        if (!commandNameToExecute) {
            await ctx.send(`/help тебе в помощь`);
            return;
        }

        try {
            await commands[commandNameToExecute]();
        } catch (err) {
            await ctx.send(`❌ Не вышло исполнить /${commandNameToExecute} :(`);
            console.error(err);
        }
    });

    await vk.updates.start();
});
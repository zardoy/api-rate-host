import { on } from "nexus";
import * as dotenv from "dotenv";
import * as path from "path";
import { PrismaClient, Host, HostMember } from "@prisma/client";
import { VK, Keyboard, MessageContext } from "vk-io";
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
    });
    //todo question?
    const questionManager/* : QuestionManager & { questions: string } */ = new QuestionManager();

    //todo жесткое огр свойств
    type MyMessageContext = MessageContext & {
        question: (question: string, params?: Parameters<MessageContext["send"]>[1]) => ReturnType<IQuestionMessageContext["question"]>,
        usersDataFromDb: {
            host: Host | null,
            hostMember: (HostMember & { host: Host; }) | null;
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
            hostMember: await prisma.hostMember.findOne({
                where: {
                    userId: senderId.toString()
                },
                include: {
                    host: true
                }
            })
        };

        const oldSend = ctx.send.bind(ctx);
        ctx.send = async (text, params = {}) => {
            const getMainMenuKeyboard = () => {
                const mainMenuKeyboard = Keyboard.builder().oneTime(true);
                if (ctx.usersDataFromDb.host || ctx.usersDataFromDb.hostMember) {
                    //both owner and member can edit the info
                    mainMenuKeyboard
                        .textButton({
                            label: "/edithost - ред. хост",
                            color: "primary"
                        });
                    //удалить хост можно только прописав команду вручную
                } else {
                    mainMenuKeyboard
                        .textButton({
                            label: "/newhost создать хост"
                        });
                }
                return mainMenuKeyboard;
            };
            //todo-low refactor
            return await oldSend(text, {
                keyboard: params.keyboard || getMainMenuKeyboard()
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

        const getHostMember = async () => {
            return await prisma.hostMember.findOne({
                where: {
                    userId: senderId.toString()
                }
            });
        };

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

        const commands: Record<string, {
            execute: () => Promise<void>;
            isAvailable: () => Promise<{ available: true; } | { available: false, reason: string; }>;
            usage: string;
        }> = {
            newhost: {
                execute: async () => {
                    const PENCIL_SMILE = `✏️`;
                    const LINK_SMILE = `🔗`;

                    const components = {
                        name: {
                            maxLength: 25,
                            question: `${PENCIL_SMILE} Как назовем хост? - введите /stop для выхода`
                        },
                        site: {
                            maxLength: 50,
                            question: `${LINK_SMILE} Дай ссылку на сайт этого хоста`
                        },
                        description: (() => {
                            const maxLength = 350;
                            return {
                                maxLength,
                                question: `${PENCIL_SMILE} Теперь давай описание, только поподробней ;) - макс ${maxLength} символов`
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
                isAvailable: async () => {
                    if (ctx.usersDataFromDb.host) {
                        return {
                            available: false,
                            reason: `Вы уже владете одним хостом, больше нельзя. См. /help для упр. хостом.`
                        };
                    }

                    if (await getHostMember()) {
                        return {
                            available: false,
                            reason: `Нельзя создать свой хост, когда вы являетесь участником другого.`
                        };
                    }

                    return {
                        available: true
                    };
                },
                usage: "создать хост"
            },
            edithost: {
                execute: async () => { },
                isAvailable: async () => {
                    if (ctx.usersDataFromDb.host || ctx.usersDataFromDb.hostMember) {
                        return {
                            available: true
                        };
                    } else {
                        return {
                            available: false,
                            reason: `Вы не являетесь ни участником хоста, ни его владельцем.`
                        };
                    }
                },
                usage: "ред. данные хоста"
            },
            deletehost: {
                execute: async () => {
                    const usersHost = (await prisma.host.findOne({
                        where: {
                            ownerUserId: senderId.toString()
                        },
                        include: {
                            members: true,
                            userRatings: true
                        }
                    }))!;
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
                isAvailable: async () => {
                    if (!ctx.usersDataFromDb.host) {
                        return {
                            available: false,
                            reason: `Вы не создавали хост. Удалять нечего.`
                        };
                    } else {
                        return {
                            available: true
                        };
                    }
                },
                usage: "удалить хост"
            }
        };

        if (userCommandInLowerCase === "help") {
            const allArgProvided = commandParts[1] === "all";
            const commandToDisplay = await Object.entries(commands)
                .reduce(async (prevPromise, [commandName, { isAvailable, usage }]) => {
                    const commandsArr = await prevPromise;
                    if (
                        (await isAvailable()).available
                    ) {
                        commandsArr.push(`- /${commandName.toLowerCase()} - ${usage}`);
                    }
                    return commandsArr;
                }, Promise.resolve([] as string[]));

            await ctx.send(`
                        ${allArgProvided ? `Все` : `Доступные`} действия:
                        - /help - ${!allArgProvided ? "эта справка" : "cправка с доступными коммандами"}
                        - /help all - ${allArgProvided ? "эта справка" : "cправка со всеми коммандами"}
                        ------
                        ${commandToDisplay.join("\n")}
                    `.replace(/^\s+/gm, "").replace(/-{3,}/g, "") /* <-- убираем пробелы в начале каждой строки (флаг m) */
            );
            return;
        }

        const commandNameToExecute =
            Object.keys(commands).find((commandName) => commandName.toLowerCase() === userCommandInLowerCase);

        if (!commandNameToExecute) {
            await ctx.send(`/help тебе в помощь`);
            return;
        }
        const selectedCommand = commands[commandNameToExecute];

        try {
            const result = await selectedCommand.isAvailable();
            if (result.available === false) {
                await ctx.send(`❌ ${result.reason}`);
            } else {
                await selectedCommand.execute();
            }
        } catch (err) {
            await ctx.send(`❌ Не вышло исполнить /${commandNameToExecute} :(`);
            console.error(err);
        }
    });

    await vk.updates.start();
});
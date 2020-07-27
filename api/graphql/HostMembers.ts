import { schema } from "nexus";
import { getOwnerHost } from "./Me";

const isHostOwnerAuth = async (_: any, __: any, { vk_params, db: prisma }: NexusContext) => !!vk_params && !!await getOwnerHost(+vk_params.user_id, prisma);

schema.extendType({
    type: "Query",
    definition(t) {
        t.field("hostMembers", {
            type: "String",
            list: true,
            description: "List of user ids. Only for HOST_OWNER role!",
            async resolve(_root, _args, { vk_params, db: prisma }) {
                if (!vk_params) return null;
                const ownerHost = await getOwnerHost(+vk_params.user_id, prisma);
                if (!ownerHost) throw new Error("Allowed only for host owners!");
                let hostMembers = (await prisma.hostMember.findMany({
                    where: {
                        hostId: ownerHost.id
                    }
                }))
                    .map(hostMember => hostMember.userId);
                return hostMembers;
            }
        });

    }
});

schema.extendType({
    type: "Mutation",
    definition(t) {
        t.field("addMember", {
            //todo void response type
            type: "Boolean",
            authorize: isHostOwnerAuth,
            args: {
                userId: schema.intArg({ required: true })
            },
            async resolve(_root, { userId }, { db: prisma, vk_params }) {
                if (!vk_params) throw new TypeError("no vk_params");
                let hostOwner = await getOwnerHost(+vk_params.user_id, prisma);
                //todo err
                if (!hostOwner) throw new TypeError("auth error");
                await prisma.hostMember.create({
                    data: {
                        host: {
                            connect: {
                                id: hostOwner.id
                            }
                        },
                        userId
                    }
                });
                return true;
            }
        });
        t.field("removeMember", {
            //todo void response type
            type: "Boolean",
            authorize: isHostOwnerAuth,
            args: {
                userId: schema.intArg({ required: true })
            },
            async resolve(_root, { userId }, { db: prisma, vk_params }) {
                if (!vk_params) throw new TypeError("no vk_params");
                let hostOwner = await getOwnerHost(+vk_params.user_id, prisma);
                if (!hostOwner) throw new TypeError("not auth");
                await prisma.hostMember.deleteMany({
                    where: {
                        AND: {
                            hostId: hostOwner.id,
                            userId
                        }
                    }
                });
                return true;
            }
        });
    }
});
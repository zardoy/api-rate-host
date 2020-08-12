import { schema } from "nexus";
import { getHostOwner } from "./Me";
import { checkDeletedHost } from "./DeletedContent";

const isHostOwnerAuth = async (_: any, __: any, { vk_params, db: prisma }: NexusContext) => !!vk_params && !!await getHostOwner(+vk_params.user_id, prisma);


schema.extendType({
    type: "Query",
    definition(t) {
        t.field("hostMembers", {
            type: "Int",
            list: true,
            nullable: false,
            description: "List of user ids. Only for HOST_OWNER role!",
            async resolve(_root, _args, { vk_params, db: prisma }) {
                if (!vk_params) throw new Error("Not authorized");
                const hostOwner = await getHostOwner(vk_params.user_id, prisma);
                if (!hostOwner) throw new Error("Allowed only for host owners!");
                let hostMembers = (await prisma.hostMember.findMany({
                    where: {
                        hostId: hostOwner.id
                    },
                    select: {
                        userId: true
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
                userId: schema.stringArg({ required: true })
            },
            async resolve(_root, { userId }, { db: prisma, vk_params }) {
                if (!vk_params) throw new TypeError("no vk_params");
                const hostOwner = await getHostOwner(vk_params.user_id, prisma);
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
                userId: schema.stringArg({ required: true })
            },
            async resolve(_root, { userId }, { db: prisma, vk_params }) {
                if (!vk_params) throw new TypeError("no vk_params");
                const hostOwner = await getHostOwner(vk_params.user_id, prisma);
                if (!hostOwner) throw new TypeError("not auth");
                await prisma.hostMember.delete({
                    where: {
                        userId
                    }
                });
                return true;
            }
        });
    }
});
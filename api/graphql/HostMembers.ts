import { schema } from "nexus";
import { getHostOwner } from "../utils";

schema.extendType({
    type: "Query",
    definition(t) {
        t.field("hostMembers", {
            type: "String",
            list: true,
            description: "List of user ids. Only for HOST_OWNER role!",
            async resolve(_root, _args, { vk_params, db: prisma }) {
                const hostOwner = await getHostOwner(prisma, vk_params.user_id);
                if (!vk_params) throw new Error("Not authorized");
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
        t.field("removeMember", {
            //todo void response type
            type: "Boolean",
            args: {
                userId: schema.stringArg()
            },
            async resolve(_root, { userId }, { db: prisma, vk_params }) {
                if (!vk_params) throw new TypeError("no vk_params");
                const hostOwner = await getHostOwner(prisma, vk_params.user_id);
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
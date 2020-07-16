import { schema } from "nexus";
import { getOwnerHost } from "./Me";

const isHostOwnerAuth = async (_: any, __: any, { vk_params, db: prisma }: NexusContext) => !!vk_params && !!await getOwnerHost(+vk_params.user_id, prisma);

schema.extendType({
    type: "Query",
    definition(t) {
        // t.field("users_id_members", {
        //     type: "String",
        //     list: true,
        //     description: "Only for HOST_OWNER role!",
        //     async resolve(_, _, { vk_params, db: prisma }) {
        //         if (!vk_params) return null;
        //         if (!await getOwnerHost(+vk_params.user_id, prisma)) throw new Error("Allowed only for host owners!");
        //     }
        // });
        t.crud.hostMembers({
            authorize: isHostOwnerAuth
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
                user_id: schema.intArg({ required: true })
            },
            async resolve(_root, { user_id }, { db: prisma, vk_params }) {
                if (!vk_params) throw new TypeError("no vk_params");
                let hostOwner = await getOwnerHost(+vk_params.user_id, prisma);
                if (!hostOwner) throw new TypeError("not auth");
                prisma.host_member.create({
                    data: {
                        host: {
                            connect: {
                                id: hostOwner.id
                            }
                        },
                        user_id
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
                user_id: schema.intArg({ required: true })
            },
            async resolve(_root, { user_id }, { db: prisma, vk_params }) {
                if (!vk_params) throw new TypeError("no vk_params");
                let hostOwner = await getOwnerHost(+vk_params.user_id, prisma);
                if (!hostOwner) throw new TypeError("not auth");
                prisma.host_member.deleteMany({
                    where: {
                        AND: {
                            host_id: hostOwner.id,
                            user_id
                        }
                    }
                });
                return true;
            }
        });
    }
});
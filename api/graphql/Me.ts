import { schema } from "nexus";

schema.objectType({
    name: "Me",
    definition(t) {
        t.field("role", { type: "UserRole", nullable: false });
        t.field("hostId", { type: "Int", description: "Which host user belongs to" });
    }
});

schema.enumType({
    name: "UserRole",
    members: [
        "USER",
        "HOST_MEMBER",
        "HOST_OWNER"
    ]
});

export const getOwnerHost = async (user_id: number, prisma: NexusContext["db"]) => {
    let ownerHosts = await prisma.host.findMany({
        where: { owner_user_id: user_id }
    });
    if (ownerHosts.length > 0) {
        return ownerHosts[0];
    } else {
        return null;
    }
};

schema.extendType({
    type: "Query",
    definition(t) {
        t.field("me", {
            type: "Me",
            async resolve(_root, _args, { vk_params, db: prisma }) {
                if (!vk_params) throw new Error("No auth");
                let { user_id } = vk_params;
                let ownerHost = await getOwnerHost(+user_id, prisma);
                if (ownerHost) {
                    return {
                        role: "HOST_OWNER",
                        host: ownerHost.id
                    };
                } else {
                    let memberHosts = await prisma.host_member.findMany({
                        where: { user_id: +user_id },
                        include: {
                            host: true
                        }
                    });
                    if (memberHosts.length > 0) {
                        return {
                            role: "HOST_MEMBER",
                            host: memberHosts[0].host.id
                        };
                    } else {
                        return {
                            role: "USER",
                            host: null
                        };
                    }
                }
            }
        });
    }
});
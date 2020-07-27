import { schema } from "nexus";

schema.objectType({
    name: "Me",
    definition(t) {
        t.field("role", { type: "UserRole", nullable: false });
        t.field("hostId", { type: "Int", description: "Which host user belongs to" });
        t.field("membersCount", { type: "Int", nullable: true, description: "Null if user is not host owner" });
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
        where: { ownerUserId: user_id }
    });
    return ownerHosts[0] || null;
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
                    let membersCount = await prisma.hostMember.count({ where: { hostId: ownerHost.id } });
                    return {
                        role: "HOST_OWNER",
                        host: ownerHost.id,
                        membersCount
                    };
                } else {
                    let memberHosts = await prisma.hostMember.findMany({
                        where: { userId: +user_id },
                        include: {
                            host: true
                        }
                    });
                    if (memberHosts.length > 0) {
                        return {
                            role: "HOST_MEMBER",
                            host: memberHosts[0].hostId,
                            membersCount: null
                        };
                    } else {
                        return {
                            role: "USER",
                            host: null,
                            membersCount: null
                        };
                    }
                }
            }
        });
    }
});
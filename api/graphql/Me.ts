import { schema } from "nexus";

schema.objectType({
    name: "Me",
    definition(t) {
        t.field("role", { type: "UserRole", nullable: false });
        t.field("hostId", { type: "Int", description: "Which host user belongs to" });
        t.field("membersCount", { type: "Int", nullable: true, description: "NULL if user is not host owner" });
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

export const getHostOwner = async (userId: string, prisma: NexusContext["db"]) => {
    return await prisma.host.findOne({
        where: { ownerUserId: userId }
    });
};

schema.extendType({
    type: "Query",
    definition(t) {
        t.field("me", {
            type: "Me",
            async resolve(_root, _args, { vk_params, db: prisma }) {
                if (!vk_params) throw new Error("No auth");
                let { user_id: userId } = vk_params;
                let ownerHost = await getHostOwner(userId, prisma);
                if (ownerHost) {
                    let membersCount = await prisma.hostMember.count({ where: { hostId: ownerHost.id } });
                    return {
                        role: "HOST_OWNER",
                        host: ownerHost.id,
                        membersCount
                    };
                } else {
                    let memberHosts = await prisma.hostMember.findOne({
                        where: { userId },
                        include: {
                            host: true
                        }
                    });
                    if (memberHosts) {
                        return {
                            role: "HOST_MEMBER",
                            host: memberHosts.hostId,
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
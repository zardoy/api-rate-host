import { schema } from "nexus";
import { getHostOwner } from "../utils";

schema.extendType({
    type: "Query",
    definition(t) {
        t.field("me", {
            type: "Me",
            async resolve(_root, _args, { vk_params, db: prisma }) {
                if (!vk_params) throw new Error("No auth");
                let { user_id: userId } = vk_params;
                let ownerHost = await getHostOwner(prisma, userId);
                if (ownerHost) {
                    let membersCount = await prisma.hostMember.count({ where: { hostId: ownerHost.id } });
                    return {
                        role: "HOST_OWNER",
                        hostId: ownerHost.id,
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
                            hostId: memberHosts.hostId,
                            membersCount: null
                        };
                    } else {
                        return {
                            role: "USER",
                            hostId: null,
                            membersCount: null
                        };
                    }
                }
            }
        });
    }
});

schema.objectType({
    name: "Me",
    definition(t) {
        t.field("role", { type: "UserRole", nullable: false });
        t.field("hostId", { type: "Int", nullable: true, description: "Which host user belongs to. NULL if the role is USER" });
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
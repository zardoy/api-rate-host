import { schema } from "nexus";
import { getHostOwner } from "../utils";

schema.extendType({
    type: "Mutation",
    definition(t) {
        t.field("getInviteKey", {
            type: "String",
            args: {
                userIdToInvite: schema.stringArg({ required: true })
            },
            async resolve(_root, { userIdToInvite }, { db: prisma, vk_params }) {
                if (!vk_params) throw new Error("Not auth.");
                const userId = vk_params.user_id;
                const ownerHost = await getHostOwner(prisma, userId);
                if (!ownerHost) throw new Error("Only owners can invite new members");
                let userInviteEntry = await prisma.userInvite.findOne({
                    where: {
                        toUserId_fromHostId: {
                            fromHostId: ownerHost.id,
                            toUserId: userIdToInvite
                        }
                    }
                });
                if (!userInviteEntry) {
                    if (
                        await prisma.hostMember.findOne({
                            where: {
                                userId: userIdToInvite
                            }
                        }) ||
                        await prisma.host.findOne({
                            where: {
                                ownerUserId: userIdToInvite
                            }
                        })
                    ) {
                        throw new Error("Can't invite this user, he is member or owner of another host.");
                    }
                    userInviteEntry = await prisma.userInvite.create({
                        data: {
                            Host: { connect: { id: ownerHost.id } },
                            toUserId: userIdToInvite
                        }
                    });
                }
                return `${userInviteEntry.fromHostId}`;
            }
        });
        t.field("applyInviteKey", {
            type: "Boolean",
            args: {
                fromHostId: schema.stringArg({ required: true })
            },
            async resolve(_root, { fromHostId }, { db: prisma, vk_params }) {
                if (!vk_params) throw new Error("Not auth.");
                const userId = vk_params.user_id;
                fromHostId = +fromHostId;
                if (!isFinite(fromHostId)) throw new TypeError(`Wrong invite key`);
                const dedicatedInvite = await prisma.userInvite.findOne({
                    where: {
                        toUserId_fromHostId: {
                            fromHostId,
                            toUserId: userId
                        }
                    }
                });
                if (!dedicatedInvite) throw new Error("This invite doesn't exist.");
                await prisma.userInvite.delete({
                    where: {
                        toUserId_fromHostId: {
                            fromHostId,
                            toUserId: userId
                        }
                    }
                });
                await prisma.hostMember.create({
                    data: {
                        host: { connect: { id: fromHostId } },
                        userId
                    }
                });
                return true;
            }
        });
    }
});
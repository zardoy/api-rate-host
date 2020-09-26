import { schema } from "nexus";
import { getHostOwner } from "../utils";

schema.extendType({
    type: "Mutation",
    definition(t) {
        t.field("getInviteKey", {
            type: "String",
            args: {
                userIdToInvite: schema.stringArg()
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
                            host: { connect: { id: ownerHost.id } },
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
                inviteKey: schema.stringArg()
            },
            async resolve(_root, { inviteKey }, { db: prisma, vk_params }) {
                if (!vk_params) throw new Error("Not auth.");
                const userId = vk_params.user_id;
                const ownersHost = await getHostOwner(prisma, userId);
                if (ownersHost) throw new Error(`You can't join the host because you are host owner.`);

                const fromHostId = +inviteKey;
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
import { schema } from "nexus";
import _ from "lodash";

schema.inputObjectType({
    name: "ComponentRatings",
    definition(t) {
        t.field("billing", {
            type: "Int",
            required: true
        });
        t.field("cpu", {
            type: "Int",
            required: true
        });
        t.field("ram", {
            type: "Int",
            required: true
        });
        t.field("support", {
            type: "Int",
            required: true
        });
    }
});

schema.objectType({
    name: "UserRatingId",
    definition(t) {
        t.model("UserRating").ratingId();
    }
});

schema.extendType({
    type: "Mutation",
    definition(t) {
        t.field("createOrUpdateRating", {
            type: "UserRatingId",
            nullable: false,
            args: {
                hostId: schema.intArg({ required: true }),
                generalRating: schema.intArg({ description: "All ratings must be in range 1-10 inclusive" }),
                componentRatings: schema.arg({ type: "ComponentRatings" })
            },
            async resolve(_root, { hostId, generalRating, componentRatings }, { db: prisma, vk_params }) {
                if (!vk_params) throw new Error("Not authorized");
                if (!generalRating && !componentRatings) throw new TypeError("one of the args must be provided");
                if (generalRating && componentRatings) throw new TypeError("Only one of rating args must be provided");
                let userId = +vk_params.user_id;
                let calculatedGeneralRating = componentRatings ? _.mean(_.values(componentRatings)) : generalRating;
                if (typeof calculatedGeneralRating !== "number") throw new TypeError("generalRating is not a number");
                let dataToUpdateOrCreate = {
                    ...(componentRatings || {}),
                    general: calculatedGeneralRating,
                };
                return (await prisma.userRating.upsert({
                    where: {
                        host_id_user_id_unique: {
                            hostId,
                            userId
                        }
                    },
                    create: {
                        ...dataToUpdateOrCreate,
                        userId,
                        host: {
                            connect: {
                                id: hostId
                            }
                        }
                    },
                    update: dataToUpdateOrCreate,
                    select: {
                        ratingId: true
                    }
                }));
            }
        });
        t.field("deleteRating", {
            type: "Boolean",
            description: "User must be notified that this action also drops his review",
            nullable: false,
            args: {
                hostId: schema.intArg({ required: true })
            },
            async resolve(_root, { hostId }, { db: prisma, vk_params }) {
                //todo: cascading deletes
                if (!vk_params) throw new Error("Not authorized");
                let dedicatedRating = await prisma.userRating.findOne({
                    where: {
                        host_id_user_id_unique: {
                            hostId,
                            userId: +vk_params.user_id
                        }
                    },
                    include: { userReview: true }
                });
                if (!dedicatedRating) throw new Error("You didn't rate this host.");
                if (dedicatedRating.userReview) {
                    await prisma.userRating.update({
                        where: { ratingId: dedicatedRating.ratingId },
                        data: {
                            userReview: {
                                delete: true
                            }
                        }
                    });
                }
                await prisma.userRating.delete({
                    where: { ratingId: dedicatedRating.ratingId }
                });
                return true;
            }
        });
    }
});
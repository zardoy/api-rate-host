import { schema } from "nexus";
import _ from "lodash";
import { RATING_COMPONENTS } from "../app";
import { deleteOneObjectFromDatabase } from "../errors";
import { getHostOwner } from "./Me";

schema.inputObjectType({
    name: "ComponentRatings",
    definition(t) {
        RATING_COMPONENTS.map(componentName => {
            t.field(componentName, {
                type: "Int",
                required: true
            });
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
                let userId = vk_params.user_id;

                let hostOwner = await getHostOwner(userId, prisma);

                let calculatedGeneralRating = componentRatings ? _.mean(_.values(componentRatings)) : generalRating;
                if (typeof calculatedGeneralRating !== "number") throw new TypeError("generalRating is not a number");
                let dataToUpdateOrCreate = {
                    ...(componentRatings ? _.mapValues(componentRatings, rating => rating - 1) : {}),
                    general: calculatedGeneralRating - 1,
                };
                return (await prisma.userRating.upsert({
                    where: {
                        hostId_userId: {
                            hostId,
                            userId
                        }
                    },
                    create: {
                        ...dataToUpdateOrCreate,
                        userId,
                        dedicatedHost: {
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
                if (!vk_params) throw new Error("Not authorized");
                const userId = vk_params.user_id;
                //todo: prisma crashes here for some reason.
                let deleteCount = await prisma.executeRaw;
                return await deleteOneObjectFromDatabase({
                    prisma,
                    query: {
                        query: `DELETE FROM "UserRating" WHERE "hostId" = $1 AND "userId" = $2`,
                        params: [hostId, userId]
                    },
                    itemName: "rating",
                    expectedAction: "rate this host"
                });
                return true;
            }
        });
    }
});
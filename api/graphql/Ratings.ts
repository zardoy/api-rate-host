import { schema } from "nexus";
import _ from "lodash";
import { RATING_COMPONENTS } from "../app";
import { deleteOneObjectFromDatabase, getHostOwner } from "../utils";
import { checkUserInputRatingBounds } from "../errors";

schema.extendType({
    type: "Mutation",
    definition(t) {
        t.field("createOrUpdateRating", {
            type: "UserRatingId",
            args: {
                // todo use only one of args
                hostId: schema.intArg(),
                generalRating: schema.intArg({ description: "All input ratings must be in range 1-10 inclusive", required: false }),
                componentRatings: schema.arg({ type: "ComponentRatings", required: false })
            },
            async resolve(_root, { hostId, generalRating, componentRatings }, { db: prisma, vk_params }) {
                if (!vk_params) throw new Error("Not authorized");
                if (!generalRating && !componentRatings) throw new TypeError("At least one of ratings args must be provided");
                if (generalRating && componentRatings) throw new TypeError("Only one of rating args must be provided");
                let userId = vk_params.user_id;

                //check if owner
                let hostOwner = await getHostOwner(prisma, userId);
                if (hostOwner && hostOwner.id === hostId) throw new Error("Owners can't rate their hosts");

                //check input
                if (generalRating) checkUserInputRatingBounds(generalRating);
                else Object.entries(componentRatings!).forEach(([componentName, rating]) => checkUserInputRatingBounds(rating, componentName));

                let calculatedGeneralRating = componentRatings ? _.mean(_.values(componentRatings)) : generalRating!;
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
            args: {
                hostId: schema.intArg()
            },
            async resolve(_root, { hostId }, { db: prisma, vk_params }) {
                if (!vk_params) throw new Error("Not authorized");
                const userId = vk_params.user_id;
                return await deleteOneObjectFromDatabase({
                    prisma,
                    query: {
                        query: `DELETE FROM "UserRating" WHERE "hostId" = $1 AND "userId" = $2`,
                        params: [hostId, userId]
                    },
                    itemName: "rating",
                    expectedAction: "rate this host"
                });
            }
        });
    }
});

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
import { schema } from "nexus";
import _ from "lodash";
import { deleteOneObjectFromDatabase } from "../errors";
import { VOTE_TO_INTEGER_CASE_SQL, GET_MY_VOTE_SQL } from "../utils";

schema.objectType({
    name: "UserReview",
    definition(t) {
        t.model.ratingId({
            alias: "reviewId"
        });
        t.model.text();
        t.model.createdAt();
        t.model.updatedAt();
        t.field("karma", {
            type: "Int",
            nullable: true
        });
        t.field("generalRating", {
            type: "Int",
            nullable: false,
            async resolve({ ratingId }, _args, { db: prisma }) {
                return (await prisma.userRating.findOne({
                    where: { ratingId },
                    select: { general: true }
                }))!.general;
            }
        });
        t.field("myVote", {
            type: "VoteType",
            nullable: true
        });
        t.field("commentsCount", {
            type: "Int",
            nullable: false,
            resolve: async (review, _args, { db: prisma }) => await prisma.userComment.count({ where: { ratingId: review.ratingId } })
        });
    }
});

schema.enumType({
    name: "VoteType",
    members: [
        "UP",
        "DOWN"
    ]
});

schema.objectType({
    name: "ReviewsCustomPagination",
    definition(t) {
        t.field("edges", {
            type: "UserReview",
            list: true,
            nullable: false
        });
        // t.field("hasNext", {
        //     type: "Boolean",
        //     nullable: false
        // });
        // t.field("totalCount", {
        //     type: "Int",
        //     nullable: false
        // });
    }
});

//todo safe fields

schema.extendType({
    type: "Query",
    definition(t) {
        t.field("reviewsTotalCount", {
            type: "Int",
            args: {
                hostId: schema.intArg({ required: true })
            },
            async resolve(_root, { hostId }, { db: prisma }) {
                return await prisma.userReview.count({
                    where: {
                        userRating: {
                            hostId
                        }
                    }
                });
            }
        });
        t.field("reviews", {
            type: "ReviewsCustomPagination",
            nullable: false,
            args: {
                hostId: schema.intArg({ required: true }),
                offset: schema.intArg({ required: true }),
                first: schema.intArg({ required: true }),
                // searchQuery: schema.stringArg(),
            },
            async resolve(_root, { first, offset, /* searchQuery, */ hostId }, { db: prisma, vk_params }) {
                if (!vk_params) throw new Error("Not authorized");
                const userId = vk_params.user_id;
                let reviews = await prisma.queryRaw<
                    //todo
                    any[]
                // {
                //     reviewId: number,
                //     generalRating: number,
                //     karma: number,
                //     myVote: number,
                //     text: string,
                //     createdAt: string,
                //     updatedAt: string
                // }[]
                >(
                    `SELECT "ratingId" as "reviewId", (general + 1)::integer as "generalRating", sum(${VOTE_TO_INTEGER_CASE_SQL}) as karma, ${GET_MY_VOTE_SQL}, text, "createdAt", "updatedAt"`
                    + ` FROM "UserRating" as ratings INNER JOIN "UserReview" as reviews USING("ratingId") LEFT JOIN "UserReviewVote" as votes USING("ratingId")`
                    + ` WHERE ratings."hostId" = $2`
                    + ` GROUP BY ratings."ratingId", reviews."ratingId"`
                    + ` ORDER BY karma`
                    + ` LIMIT $3 OFFSET $4`,
                    userId,
                    hostId,
                    first,
                    offset
                );
                for (let review of reviews) {
                    review.generalRating = +review.generalRating;
                    review.commentsCount = await prisma.userComment.count({
                        where: {
                            ratingId: review.reviewId
                        }
                    });
                }
                console.log(reviews);
                return {
                    edges: reviews,
                };
            }
        });
    }
});

schema.extendType({
    type: "Mutation",
    definition(t) {
        t.field("createOrUpdateReview", {
            type: "Boolean",
            nullable: false,
            args: {
                hostId: schema.intArg({ required: true }),
                text: schema.stringArg({ required: true }),
            },
            async resolve(_root, { hostId, text }, { db: prisma, vk_params }) {
                if (!vk_params) throw new Error("Not auth");
                let userId = vk_params.user_id;
                let dedicatedRating = await prisma.userRating.findOne({
                    where: {
                        hostId_userId: {
                            hostId,
                            userId
                        }
                    },
                    select: {
                        ratingId: true
                    }
                });
                if (!dedicatedRating) throw new Error("API needs to create rating first");
                let { ratingId } = dedicatedRating;
                //todo: why one to many???
                await prisma.userReview.upsert({
                    where: {
                        ratingId
                    },
                    create: { text, userRating: { connect: { ratingId } } },
                    update: { text }
                });
                return true;
            }
        });
        t.field("deleteReview", {
            type: "Boolean",
            nullable: false,
            args: {
                hostId: schema.intArg({ required: true }),
            },
            async resolve(_root, { hostId }, { db: prisma, vk_params }) {
                if (!vk_params) throw new Error("Not authorized");
                let userId = vk_params.user_id;
                //todo: prisma alternative?
                return await deleteOneObjectFromDatabase({
                    prisma,
                    query: {
                        query: `DELETE FROM "UserReview" WHERE "ratingId" = (SELECT "ratingId" FROM "UserRating" WHERE "hostId" = $1 AND "userId" = $2)`,
                        params: [hostId, userId]
                    },
                    itemName: "review"
                });
            }
        });
    }
});
import { schema } from "nexus";
import _ from "lodash";
import { deleteOneObjectFromDatabase } from "../utils";
import { VOTE_TO_INTEGER_CASE_SQL, GET_MY_VOTE_SQL } from "../utils";

schema.extendType({
    type: "Query",
    definition(t) {
        t.field("reviewsTotalCount", {
            type: "Int",
            args: {
                hostId: schema.intArg()
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
            args: {
                hostId: schema.intArg(),
                offset: schema.intArg(),
                first: schema.intArg(),
                // searchQuery: schema.stringArg(),
            },
            async resolve(_root, { first, offset, /* searchQuery, */ hostId }, { db: prisma, vk_params }) {
                if (!vk_params) throw new Error("Not authorized");
                const userId = vk_params.user_id;
                type RawQuery = {
                    reviewId: number,
                    generalRating: number | string,
                    karma: number,
                    myVote: "UP" | "DOWN" | null,
                    text: string,
                    createdAt: string,
                    updatedAt: string;
                }[];
                let reviews = await (await prisma.$queryRaw<
                    RawQuery
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
                )).reduce(async (prevPromise, review) => {
                    const reviewsArr = await prevPromise;
                    //todo rewrite spread arr
                    reviewsArr.push({
                        ...review,
                        generalRating: +review.generalRating,
                        commentsCount: await prisma.userComment.count({
                            where: {
                                ratingId: review.reviewId
                            }
                        })
                    });
                    return reviewsArr;
                }, Promise.resolve([] as RawQuery & { generalRating: number, commentsCount: number; }[]));
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
            args: {
                hostId: schema.intArg(),
                text: schema.stringArg(),
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
            args: {
                hostId: schema.intArg(),
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

schema.objectType({
    name: "UserReview1",
    definition(t) {
        t.int("reviewId");
        t.model("UserReview").text()
            .createdAt()
            .updatedAt();
        t.int("karma", {
            nullable: true
        });
        t.float("generalRating", {
            async resolve({ reviewId: ratingId }, _args, { db: prisma }) {
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
        t.int("commentsCount", {
            resolve: async ({ reviewId: ratingId }, _args, { db: prisma }) => await prisma.userComment.count({ where: { ratingId } })
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
            //todo 1
            type: "UserReview1",
            list: true
        });
        // t.field("hasNext", {
        //     type: "Boolean"
        // });
        // t.field("totalCount", {
        //     type: "Int"
        // });
    }
});

//todo safe fields

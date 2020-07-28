import { schema } from "nexus";
import _ from "lodash";

schema.objectType({
    name: "UserReview",
    definition(t) {
        t.model.reviewId();
        t.model.text();
        t.model.karma();
        t.model.createdAt();
        t.model.updatedAt();
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
        t.field("hasNext", {
            type: "Boolean",
            nullable: false
        });
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
                        userRating: { hostId }
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
                searchQuery: schema.stringArg(),
            },
            async resolve(_root, { first, offset, searchQuery, hostId }, { db: prisma, vk_params }) {
                if (!vk_params) throw new Error("Not authorized");
                let paginatedReviews = (await prisma.userReview.findMany({
                    where: {
                        userRating: { hostId },
                        ...(searchQuery ? {
                            OR: [
                                {
                                    text: { contains: searchQuery }
                                }
                            ]
                        } : {})
                    },
                    orderBy: {
                        karma: "desc"
                    },
                    include: {
                        userReviewVotes: true,
                        userRating: true
                    },
                    skip: offset,
                    take: first
                }))
                    .map(review => {
                        let myVote = review.userReviewVotes.find(vote => vote.userId === +vk_params.user_id);
                        return {
                            ...review,
                            generalRating: review.userRating.general,
                            karma: _.sumBy(review.userReviewVotes, vote => vote.voteType === "UP" ? 1 : -1),
                            myVote: myVote && myVote.voteType
                        };
                    });
                return {
                    edges: paginatedReviews,
                    //todo: 
                    hasNext: true
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
                await prisma.userRating.update({
                    where: {
                        host_id_user_id_unique: {
                            hostId,
                            userId: +vk_params.user_id
                        }
                    },
                    data: {
                        userReview: {
                            upsert: {
                                create: { text },
                                update: { text }
                            }
                        }
                    }
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
                //todo: cascading deletes
                let dedicatedRating = await prisma.userRating.findOne({
                    where: {
                        host_id_user_id_unique: {
                            hostId,
                            userId: +vk_params.user_id
                        }
                    },
                    include: { userReview: true }
                });
                //todo: ->
                if (!dedicatedRating) throw new Error("You didn't rate this host.");
                if (!dedicatedRating.userReview) throw new Error("You didn't write review for this host.");
                await prisma.userComment.deleteMany({
                    where: {
                        reviewId: dedicatedRating.userReview.reviewId
                    }
                });
                await prisma.userReview.delete({
                    where: { reviewId: dedicatedRating.userReview.reviewId }
                });
                return true;
            }
        });
    }
});
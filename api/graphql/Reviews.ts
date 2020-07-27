import { schema } from "nexus";

schema.objectType({
    name: "UserReview",
    definition(t) {
        t.model.ratingId();
        t.model.text();
        t.model.karma();
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
            async resolve({ ratingId }, _args, { db: prisma, vk_params }) {
                if (!vk_params) throw new Error("Not auth");
                let myVote = await prisma.userVoteRatings.findOne({
                    where: {
                        rating_id_user_id_unique: {
                            ratingId,
                            userId: +vk_params.user_id
                        }
                    },
                });
                return myVote && myVote.isDislike ? "DOWN" : "UP";
            }
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
        t.field("totalCount", {
            type: "Int",
            nullable: false
        });
    }
});

schema.extendType({
    type: "Query",
    definition(t) {
        t.field("reviews", {
            type: "ReviewsCustomPagination",
            nullable: false,
            args: {
                offset: schema.intArg({ required: true }),
                first: schema.intArg({ required: true }),
                search: schema.stringArg(),
            },
            async resolve(_root, { first, offset, search: searchString }, { db: prisma, vk_params }) {
                if (!vk_params) throw new Error("Not authorized");
                let allReviews = (await prisma.userReview.findMany({
                    where: searchString ? {
                        text: {
                            contains: searchString
                        }
                    } : undefined,
                    orderBy: {
                        karma: "desc"
                    },
                    include: {
                        userRating: {
                            include: {
                                userVotes: true
                            },
                        }
                    }
                }))
                    .map(review => {
                        let myVote = review.userRating.userVotes.find(vote => vote.userId === +vk_params.user_id);
                        return {
                            ...review,
                            generalRating: review.userRating.general,
                            myVote: myVote && myVote.isDislike ? "DOWN" : "UP"
                        };
                    });
                let end = first + offset;
                return {
                    edges: allReviews.slice(offset, end),
                    hasNext: !!allReviews[end],
                    totalCount: allReviews.length
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
                let userId = +vk_params.user_id;
                let dedicatedRating = await prisma.userRating.findOne({
                    where: {
                        host_id_user_id_unique: {
                            hostId,
                            userId
                        }
                    },
                    select: {
                        ratingId: true
                    }
                });
                if (!dedicatedRating) throw new Error("Dedicated rating can't be found. You need to rate this host first.");
                //todo: test connect
                await prisma.userReview.upsert({
                    where: {
                        ratingId: dedicatedRating.ratingId
                    },
                    create: {
                        text,
                        userRating: {
                            connect: {
                                ratingId: dedicatedRating.ratingId
                            }
                        }
                    },
                    update: {
                        text
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
                let dedicatedRating = await prisma.userRating.findOne({
                    where: {
                        host_id_user_id_unique: {
                            hostId,
                            userId: +vk_params.user_id
                        }
                    },
                    select: {
                        ratingId: true
                    }
                });
                if (!dedicatedRating) throw new Error("Dedicated rating not found");
                await prisma.userReview.delete({
                    where: {
                        ratingId: dedicatedRating.ratingId
                    }
                });
                return true;
            }
        });
    }
});
import { schema } from "nexus";
import { paginateResults } from "./util";

import { forwardConnectionArgs, connectionArgs, connectionFromArray } from "graphql-relay";

schema.objectType({
    name: "user_rating",
    definition(t) {
        t.model.general({
            alias: "general_rating"
        });
        t.int("numberOfComments", {
            nullable: false,
            async resolve(user_rating, _args, { db: prisma }) {
                return await prisma.user_comment.count({
                    where: {
                        rating_id: user_rating.rating_id
                    }
                });
            }
        });
    }
});

schema.objectType({
    name: "user_review",
    definition(t) {
        t.model.text();
        t.model.user_rating({
            alias: "rating"
        });
    }
});

schema.objectType({
    name: "userReviewsConnection",
    definition(t) {
        t.boolean("hasMore", { nullable: false });
        t.int("after");
        t.field("nodes", {
            type: "user_review",
            list: true,
            nullable: false
        });
    }
});

schema.extendType({
    type: "Query",
    definition(t) {
        t.connection("reviews", {
            type: "userReviewsConnection",
            additionalArgs: {
                hostId: schema.intArg({ required: true })
            },
            disableBackwardPagination: true,
            // args: {
            //     hostId: schema.intArg({ required: true }),
            //     after: schema.intArg(),
            //     pageSize: schema.intArg(),
            // },
            async resolve(_root, { hostId, ...paginationArgs }, { db: prisma }) {
                const allHostReviews = await prisma.user_review.findMany({
                    where: {
                        user_rating: {
                            host_id: hostId
                        }
                    },
                    include: {
                        user_rating: true
                    }
                });
                return {
                    pageInfo: {
                        hasNextPage: true,
                        hasPreviousPage: true
                    },
                    edges: [{

                    }]
                };
            }
        });
    }
});
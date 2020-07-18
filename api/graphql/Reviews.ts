import { schema, settings } from "nexus";

import { forwardConnectionArgs, connectionArgs, connectionFromArray } from "graphql-relay";
import { connectionPlugin } from "@nexus/schema";

// settings.change({
//     schema: {
//         connections: {
//             default: {
//                 disableBackwardPagination: true,
//                 extendConnection: {
//                     totalCount: { type: "Int", nullable: false, description: "Total amount of results" }
//                 },
//             }
//         }
//     }
// });

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
    name: "user_review_node",
    definition(t) {
        t.model("user_review").rating_id();
        t.model("user_review").text();
        t.model("user_review").karma();
        t.int("user_rating", {
            nullable: false
        });
    }
});

schema.extendType({
    type: "Query",
    definition(t) {
        t.connection("reviews", {
            type: "user_review_node",
            additionalArgs: {
                hostId: schema.intArg({ required: true })
            },
            //todo what is default func
            cursorFromNode: (node) => `cursor:${node!.rating_id}`,
            disableBackwardPagination: true,
            async nodes(_root, { hostId }, { db: prisma }) {
                connectionPlugin.defaultCursorFromNode;
                const allHostReviews = (await prisma.user_review.findMany({
                    where: {
                        user_rating: {
                            host_id: hostId
                        },
                    },
                    orderBy: {
                        karma: "desc"
                    },
                    // cursor: {
                    //     rating_id: +(paginationArgs.after || 0)
                    // },
                    // take: paginationArgs.first,
                    include: {
                        user_rating: {
                            select: {
                                general: true
                            }
                        }
                    }
                }))
                    .map(({ user_rating, ...restHostReview }) => ({
                        ...restHostReview,
                        user_rating: user_rating.general,
                        cursor: restHostReview.rating_id
                    }));
                console.dir(connectionFromArray(allHostReviews, {}), {
                    depth: null
                });
                return allHostReviews;
            }
            // resolve(_root, { hostId, ...paginationArgs }, { db: prisma }) {
            //     // const allHostReviews = (await prisma.user_review.findMany({
            //     //     where: {
            //     //         user_rating: {
            //     //             host_id: hostId
            //     //         },
            //     //     },
            //     //     orderBy: {
            //     //         karma: "desc"
            //     //     },
            //     //     // cursor: {
            //     //     //     rating_id: +(paginationArgs.after || 0)
            //     //     // },
            //     //     // take: paginationArgs.first,
            //     //     include: {
            //     //         user_rating: {
            //     //             select: {
            //     //                 general: true
            //     //             }
            //     //         }
            //     //     }
            //     // }))
            //     //     .map(({ user_rating, ...restHostReview }) => ({
            //     //         ...restHostReview,
            //     //         user_rating: user_rating.general
            //     //     }));
            //     // let paginated = connectionFromArray(allHostReviews, paginationArgs);
            //     //todo :(
            //     return {
            //         edges: [
            //             {
            //                 cursor: 'YXJyYXljb25uZWN0aW9uOjA=',
            //                 node: { rating_id: 2, text: 'Poor hosting', karma: 5, user_rating: 0 }
            //             },
            //             {
            //                 cursor: 'YXJyYXljb25uZWN0aW9uOjE=',
            //                 node: { rating_id: 1, text: 'Nice hosting', karma: 0, user_rating: 9 }
            //             }
            //         ],
            //         pageInfo: {
            //             startCursor: 'YXJyYXljb25uZWN0aW9uOjA=',
            //             endCursor: 'YXJyYXljb25uZWN0aW9uOjE=',
            //             hasPreviousPage: false,
            //             hasNextPage: false
            //         }
            //     };
            // }
        });
    }
});
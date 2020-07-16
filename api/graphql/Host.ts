import { schema } from "nexus";
import _ from "lodash";
import { paginateResults } from "./util";

const MAX_RATING = 10;

// schema.objectType({
//     name: "Host",
//     definition(t) {
//         t.int("id");
//         t.string("title");
//         t.string("body");
//         t.boolean("published");
//     }
// });

schema.objectType({
    name: "overall_rating",
    definition(t) {
        t.model.cpu();
        t.model.ram();
        t.model.support();
        t.model.billing();
    }
});

schema.objectType({
    name: "hostDetails",
    definition(t) {
        t.model("host").description();
        // t.field("host_rating", {
        //     type: "Float",
        //     nullable: false,
        //     async resolve({ id: hostId }, _args, ctx) {
        //         let user_ratings = await ctx.db.user_rating.findMany({
        //             where: {
        //                 host_id: hostId
        //             }
        //         });
        //         let hostRating = _.meanBy(user_ratings, rating => rating.general);
        //         if (hostRating > MAX_RATING) throw new Error(`Rating out of range. Host id: ${hostId}. Calculated rating: ${hostRating}`);
        //         return hostRating;
        //     }
        // });
    }
});

schema.objectType({
    name: "hostListItem",
    definition(t) {
        t.model("host").id();
        t.model("host").name();
        t.model("host").site();
        t.float("average_rating");
    }
});

schema.objectType({
    name: "host_member",
    definition(t) {
        t.model.host_id();
        t.model.user_id();
    }
});

schema.objectType({
    name: "hostListConnection",
    definition(t) {
        t.int("totalCount", { nullable: false });
        t.boolean("hasMore", { nullable: false });
        t.int("after");
        t.field("nodes", {
            type: "hostListItem",
            list: true,
            nullable: false
        });
    }
});

const DEFAULT_PAGINATION_LIMIT = 20;

const connectionArgs = {
    after: schema.intArg({ description: "Aka cursor" }),
    pageSize: schema.intArg({ description: `${DEFAULT_PAGINATION_LIMIT} by default` }),
};

schema.extendType({
    type: "Query",
    definition(t) {
        //todo
        //t.connection("hosts_rating")
        t.field("hosts_rating", {
            type: "hostListConnection",
            nullable: false,
            args: connectionArgs,
            async resolve(_root, { after, pageSize }, { db: prisma }) {
                if (!pageSize) pageSize = DEFAULT_PAGINATION_LIMIT;
                if (after === null) after = undefined;
                const allHosts = await prisma.host.findMany({
                    include: {
                        user_ratings: true
                    }
                });
                const ratingList = allHosts
                    .map(host => ({
                        ...host,
                        average_rating: _.meanBy(host.user_ratings, user_rating => user_rating.general + 1)
                    }))
                    //DESC
                    .sort((hostA, hostB) => hostB.average_rating - hostA.average_rating);
                let paginatedRating = paginateResults({
                    after,
                    pageSize,
                    results: ratingList,
                    cursorKey: "id"
                });
                let newCursor = (paginatedRating.slice(-1)[0] || { id: null }).id;
                return {
                    after: newCursor,
                    hasMore: !!ratingList.length && newCursor !== ratingList.slice(-1)[0].id,
                    nodes: paginatedRating,
                    totalCount: ratingList.length
                };
            }
        });
        t.field("hostDetails", {
            type: "hostDetails",
            args: {
                hostId: schema.intArg({ required: true })
            },
            async resolve(_root, { hostId }, { db: prisma }) {
                return (await prisma.host.findMany({ where: { id: +hostId } }))[0] || null;
            }
        });
    }
});


// schema.extendType({
//     type: "Mutation",
//     definition(t) {
//         t.field("createDraft", {
//             type: "Post",
//             args: {
//                 title: schema.stringArg({ required: true }),
//                 body: schema.stringArg({ required: true })
//             },
//             resolve(_root, { body, title }, ctx) {
//                 ctx.db.posts.push({
//                     id: ctx.db.posts.length + 1,
//                     title,
//                     body,
//                     published: false
//                 });
//                 return ctx.db.posts.slice(-1)[0];
//             }
//         });
//         t.field("publish", {
//             type: "Post",
//             args: {
//                 id: schema.intArg({ nullable: false })
//             },
//             resolve(_root, { id }, ctx) {
//                 let postIndex = ctx.db.posts.findIndex(post => post.id === id);
//                 if (postIndex < 0) throw new Error(`Can't find post with id ${id}`);
//                 ctx.db.posts[postIndex].published = true;
//                 return ctx.db.posts[postIndex];
//             }
//         });
//     }
// });
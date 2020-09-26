import { schema } from "nexus";
import _ from "lodash";
import { VOTE_TO_INTEGER_CASE_SQL, GET_MY_VOTE_SQL } from "../utils";
import { errorMessages } from "../errors";

schema.extendType({
    type: "Query",
    definition(t) {
        t.field("comments", {
            type: "UserCommentsCustomPagination",
            args: {
                reviewId: schema.intArg(),
                offset: schema.intArg(),
                first: schema.intArg(),
                searchQuery: schema.stringArg({ required: false }),
            },
            async resolve(_root, { offset, first, searchQuery, reviewId: ratingId }, { db: prisma, vk_params }) {
                if (!vk_params) throw new Error("Not authorized");
                let userId = vk_params.user_id;
                let hosterCommentId = await prisma.hosterResponse.findOne({
                    where: {
                        ratingId
                    }
                });
                let result = (await prisma.$queryRaw(
                    `SELECT "commentId", "userId", sum(${VOTE_TO_INTEGER_CASE_SQL}) as karma, ${GET_MY_VOTE_SQL}, text, "createdAt", "updatedAt", "toCommentId"`
                    + ` FROM "UserComment" as comments LEFT JOIN "UserCommentVote" as votes USING("commentId")`
                    + ` WHERE comments."ratingId" = $2 AND comments."commentId" != $3`
                    + ` GROUP BY comments."ratingId"`
                    + ` ORDER BY "commentId"`
                    + ` LIMIT $4 OFFSET $5`,
                    userId,
                    ratingId,
                    hosterCommentId && hosterCommentId.ratingId,
                    first,
                    offset
                ))
                    .map((comment: any) => ({
                        author: {
                            userId: comment.userId,
                            fullName: "Petya Vasiliy",
                            isFromHoster: false
                        },
                        ...comment
                    }));
                if (offset === 0 && hosterCommentId) {
                    result.shift(
                        await prisma.userComment.findOne({
                            where: {
                                commentId: hosterCommentId.commentId
                            }
                        })
                    );
                }
                return {
                    edges: result
                };
            }
        });
    }
});

schema.extendType({
    type: "Mutation",
    definition(t) {
        t.field("createComment", {
            type: "UserComment",
            args: {
                reviewId: schema.intArg(),
                text: schema.stringArg(),
                responseToCommentId: schema.intArg({ required: false }),
            },
            async resolve(_root, { responseToCommentId, text, reviewId: ratingId }, { db: prisma, vk_params }) {
                if (!vk_params) throw new Error("Not authorized");
                const userId = vk_params.user_id;
                return await prisma.userComment.create({
                    data: {
                        dedicatedReview: {
                            connect: {
                                ratingId
                            }
                        },
                        userId,
                        text,
                        toCommentId: responseToCommentId === null ? undefined : responseToCommentId
                    }
                });
            }
        });
        t.field("updateComment", {
            type: "Boolean",
            args: {
                commentId: schema.intArg(),
                //todo: use diff in the future
                text: schema.stringArg()
            },
            async resolve(_root, { commentId, text }, { db: prisma, vk_params }) {
                if (!vk_params) throw new Error("Not authorized");
                const userId = vk_params.user_id;
                let { count: updateCount } = await prisma.userComment.updateMany({
                    where: { commentId, userId },
                    data: { text }
                });
                if (updateCount === 0) throw new Error("There is no comment that belongs to you.");
                if (updateCount > 0) throw new Error(":WARNING: you just updated more than one comment.");
                return true;
            }
        });
        t.field("deleteComment", {
            type: "Boolean",
            args: {
                commentId: schema.intArg()
            },
            async resolve(_root, { commentId }, { db: prisma, vk_params }) {
                if (!vk_params) throw new Error("Not authorized");
                const userId = vk_params.user_id;
                let { count: deleteCount } = await prisma.userComment.deleteMany({
                    where: {
                        commentId,
                        userId
                    }
                });
                if (deleteCount === 0) throw new Error(errorMessages.delete.zero("comment"));
                if (deleteCount > 1) throw new Error(errorMessages.delete.moreThanOne("comment"));
                return true;
            }
        });
    }
});

schema.objectType({
    name: "UserData",
    definition(t) {
        t.field("fullName", { type: "String" });
        t.field("id", { type: "String" });
        t.field("isFromHoster", { type: "Boolean" });
    }
});

schema.objectType({
    name: "UserComment",
    definition(t) {
        t.model.commentId();
        t.model.karma();
        t.model.text();
        t.model.createdAt();
        t.model.updatedAt();
        //todo: refactor: tree comments, like on reddit
        // t.field("inResponseToCommentAuthor", {
        //     type: "UserData",
        //     nullable: true
        // });
        t.field("toCommentId", {
            type: "Int",
            resolve: () => -1
        });
        t.field("author", {
            type: "UserData",
            resolve(comment, _args, _ctx) {
                return {
                    id: comment.userId,
                    fullName: "Petya Vasiliy",
                    isFromHoster: false
                };
            }
        });
        t.field("myVote", {
            type: "VoteType",
            nullable: true
        });
    }
});

schema.objectType({
    name: "UserCommentsCustomPagination",
    definition(t) {
        t.field("edges", {
            type: "UserComment",
            list: true
        });
    }
});
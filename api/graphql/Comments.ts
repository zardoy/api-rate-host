import { schema } from "nexus";
import _ from "lodash";

//todo: calculate karma

schema.objectType({
    name: "UserData",
    definition(t) {
        t.field("fullName", { type: "String", nullable: false });
        t.field("id", { type: "Int", nullable: false });
    }
});

schema.objectType({
    name: "UserDataWithHoster",
    definition(t) {
        t.field("fullName", { type: "String", nullable: false });
        t.field("id", { type: "Int", nullable: false });
        t.field("isFromHoster", { type: "Boolean", nullable: false });
    }
});

schema.objectType({
    name: "UserComment",
    definition(t) {
        t.model.commentId();
        t.model.karma();
        t.model.text();
        //todo: refactor: tree comments, like on reddit
        t.field("inResponseToCommentAuthor", {
            type: "UserData",
            nullable: true,
            resolve({ toCommentId }, _args, _ctx) {
                return toCommentId ? {
                    id: toCommentId,
                    fullName: "Pfdlfskf"
                } : null;
            }
        });
        t.model.createdAt();
        t.model.updatedAt();
        t.field("author", {
            type: "UserData",
            nullable: false,
            resolve(comment, _args, _ctx) {
                return {
                    id: comment.userId,
                    fullName: "Petya Vasiliy"
                };
            }
        });
        t.field("myVote", {
            type: "VoteType",
            nullable: true,
            async resolve({ userId, commentId }, _args, { db: prisma, vk_params }) {
                if (!vk_params) throw new Error("Not authorized");
                if (userId !== +vk_params.user_id) return null;
                let userCommentVote = await prisma.userCommentVote.findOne({
                    where: { comment_id_user_id_unique: { commentId, userId } }
                });
                return userCommentVote && userCommentVote.voteType;
            }
        });
    }
});

schema.enumType({
    name: "AnswerTo",
    members: [
        "COMMENT",
        "REVIEW"
    ]
});

schema.objectType({
    name: "UserCommentsCustomPagination",
    definition(t) {
        t.field("edges", {
            type: "UserComment",
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
        t.field("comments", {
            type: "UserCommentsCustomPagination",
            args: {
                reviewId: schema.intArg({ required: true }),
                offset: schema.intArg({ required: true }),
                first: schema.intArg({ required: true }),
                searchQuery: schema.stringArg(),
            },
            async resolve(_root, { offset, first, searchQuery, reviewId }, { db: prisma, vk_params }) {
                if (!vk_params) throw new Error("Not authorized");
                let allComments = (await prisma.userComment.findMany({
                    where: {
                        reviewId,
                        ...(searchQuery ? {
                            OR: [
                                {
                                    text: { contains: searchQuery },
                                }
                            ]
                        } : {})
                    },
                    include: {
                        userCommentVotes: true
                    },
                    orderBy: {
                        createdAt: "desc"
                    }
                }))
                    .map(comment => {
                        let myCommentVote = comment.userCommentVotes.find(vote => vote.userId === +vk_params.user_id);
                        return {
                            ...comment,
                            karma: _.sumBy(comment.userCommentVotes, vote => vote.voteType === "UP" ? 1 : -1),
                            inResponseToCommentAuthor: {
                                id: comment.toCommentId,
                                fullName: "Vasya Petr"
                            },
                            myVote: myCommentVote && myCommentVote.voteType,
                            author: {
                                id: comment.userId,
                                fullName: "Petr Vasiliy"
                            }
                        };
                    });
                //todo: test with empty string
                if (typeof searchQuery != "string") {
                    // todo: always display RESPONSE TO REVIEW from the host member/owner to top
                }
                let end = offset + first;
                return {
                    edges: allComments.slice(offset, end),
                    hasNext: !!allComments[end],
                    totalCount: allComments.length
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
            nullable: false,
            args: {
                reviewId: schema.intArg({ required: true }),
                text: schema.stringArg({ required: true }),
                responseToCommentId: schema.intArg({ required: false }),
            },
            async resolve(_root, { responseToCommentId, text, reviewId }, { db: prisma, vk_params }) {
                if (!vk_params) throw new Error("Not authorized");
                return await prisma.userComment.create({
                    data: {
                        userReview: { connect: { reviewId } },
                        text,
                        userId: +vk_params.user_id
                    }
                });
            }
        });
        t.field("updateComment", {
            type: "Boolean",
            nullable: false,
            args: {
                commentId: schema.intArg({ required: true }),
                //todo: use diff in the future
                text: schema.stringArg({ required: true })
            },
            async resolve(_root, { commentId, text }, { db: prisma, vk_params }) {
                if (!vk_params) throw new Error("Not authorized");
                let comment = await prisma.userComment.findOne({ where: { commentId } });
                if (!comment) throw new Error("Comment with such id doesn't exist");
                if (comment.userId !== +vk_params.user_id) throw new Error("This comment doesn't belong to you");
                await prisma.userComment.update({
                    where: { commentId },
                    data: { text, updatedAt: new Date() }
                });
                return true;
            }
        });
        t.field("deleteComment", {
            type: "Boolean",
            args: {
                commentId: schema.intArg({ required: true })
            },
            async resolve(_root, { commentId }, { db: prisma, vk_params }) {
                if (!vk_params) throw new Error("Not authorized");
                let comment = await prisma.userComment.findOne({ where: { commentId } });
                if (!comment) throw new Error("Comment with such id doesn't exist");
                if (comment.userId !== +vk_params.user_id) throw new Error("This comment doesn't belong to you");
                await prisma.userComment.delete({ where: { commentId } });
                return true;
            }
        });
    }
});
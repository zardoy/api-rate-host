import { schema } from "nexus";

schema.objectType({
    name: "UserComment",
    definition(t) {
        t.model.commentId();
        t.model.karma();
        t.field("text", {
            type: "String",
            args: {
                includeMention: schema.booleanArg({ required: false, description: "true by default" })
            },
            async resolve(comment, { includeMention }, { db: prisma }) {
                return includeMention === false || comment.toCommentId === null ?
                    comment.text :
                    (await prisma.userComment.findOne({
                        where: { commentId: comment.toCommentId }
                    }))?.userId;
            }
        });
        t.field("answerTo", {
            type: "AnswerTo",
            nullable: false,
            resolve: ({ toCommentId }) => toCommentId === null ? "REVIEW" : "COMMENT"
        });
        t.field("isFromHoster", {
            type: "Boolean",
            nullable: false
        });
        t.field("myVote", {
            type: "VoteType",
            nullable: true,
            async resolve({ userId, commentId }, _args, { db: prisma, vk_params }) {
                if (!vk_params) throw new Error("Not authorized");
                if (userId !== +vk_params.user_id) return null;
                let userCommentVote = await prisma.userVoteComment.findOne({
                    where: { comment_id_user_id_unique: { commentId, userId } }
                });
                if (!userCommentVote) return null;
                userCommentVote.
            }
        });
        // t.field("host")
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
                offset: schema.intArg({ required: true }),
                first: schema.intArg({ required: true }),
                search: schema.stringArg(),
            },
            async resolve(_root, { offset, first, search: searchString }, { db: prisma }) {
                let allComments = (await prisma.userComment.findMany({
                    where: searchString ? {
                        text: { contains: searchString }
                    } : undefined,
                    include: {
                        userVoteComments: true
                    }
                }))
                    .map(comment => {
                        return {
                            ...comment,
                            text: 
                        };
                    });
            }
        });
    }
});
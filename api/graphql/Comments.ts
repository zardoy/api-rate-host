import { schema } from "nexus";

schema.objectType({
    name: "UserData",
    definition(t) {
        t.field("fullName", { type: "String", nullable: false });
        t.field("id", { type: "ID", nullable: false });
    }
});

schema.objectType({
    name: "UserDataWithHoster",
    definition(t) {
        t.field("fullName", { type: "String", nullable: false });
        t.field("id", { type: "ID", nullable: false });
        t.field("isFromHoster", { type: "Boolean", nullable: false });
    }
});

schema.objectType({
    name: "UserComment",
    definition(t) {
        t.model.commentId();
        t.model.karma();
        t.model.text();
        t.model.commentId();
        //todo: refactor: tree comments, like on reddit
        t.field("commentResponseUser", {
            type: "UserData",
            nullable: true
        });
        t.model.createdAt();
        t.model.updatedAt();
        t.field("author", {
            type: "UserData",
            nullable: false
        });
        t.field("myVote", {
            type: "VoteType",
            nullable: true,
            // async resolve({ userId, commentId }, _args, { db: prisma, vk_params }) {
            //     if (!vk_params) throw new Error("Not authorized");
            //     if (userId !== +vk_params.user_id) return null;
            //     let userCommentVote = await prisma.userVoteComment.findOne({
            //         where: { comment_id_user_id_unique: { commentId, userId } }
            //     });
            //     if (!userCommentVote) return null;
            //     userCommentVote.
            // }
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
                offset: schema.intArg({ required: true }),
                first: schema.intArg({ required: true }),
                searchQuery: schema.stringArg(),
            },
            async resolve(_root, { offset, first, searchQuery }, { db: prisma }) {
                let allComments = (await prisma.userComment.findMany({
                    where: searchQuery ? {
                        text: { contains: searchQuery }
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
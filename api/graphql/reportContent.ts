import { schema } from "nexus";

//сообщать владельцу о положительно решенных репортах участников

schema.extendType({
    type: "Query",
    definition(t) {
        t.field("reportContent", {
            type: "Boolean",
            args: {
                contentType: schema.arg({ type: "ReportContentType", required: true }),
                contentId: schema.intArg({ required: true }),
            },
            async resolve(_root, { }, { vk_params }) {
                if (!vk_params) throw new Error("No auth.");
                //todo?
                return true;
            }
        });
    }
});

schema.enumType({
    name: "ReportContentType",
    members: [
        "HOST",
        "REVIEW",
        "COMMENT"
    ]
});
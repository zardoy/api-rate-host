import { createTestContext } from "./__helpers";

const ctx = createTestContext();

it("ensures that a draft can be created and published", async () => {
    const draftResult = await ctx.app.query(`
        mutation {
            createDraft(title: "Nexus", body: "...") {
                id
                title
                body
                published
            }
        }
    `);

    expect(draftResult).toMatchInlineSnapshot(`
        Object {
            "createDraft": Object {
                "body": "...",
                "id": 1,
                "publised": false,
                "title": "Nexus",
            },
        }
    `);

    const publishResult = await ctx.app.query(`
        mutation publishDraft($draftId: Int!) {
            publish(draftId: $draftId) {
                id
                title
                body
                published
            }
        }
    `, { draftId: draftResult.createDraft.id });

    
});
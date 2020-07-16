import { createTestContext as originalCreateTestContext, TestContext } from "nexus/testing";

export const createTestContext = () => {
    let ctx = {} as TestContext;

    beforeAll(async () => {
        ctx = { ...ctx, ...await originalCreateTestContext() };
        ctx.app.start();
    });

    afterAll(async () => {
        await ctx.app.stop();
    });

    return ctx;
};
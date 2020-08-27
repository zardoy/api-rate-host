import { createTestContext as originalCreateTestContext, TestContext } from "nexus/testing";
import * as fs from "fs";
import * as path from "path";
import _ from "lodash";
import md5File from "md5-file";

export const LAST_DB_CHANGE_FILEPATH = path.resolve(__dirname, "./last-db-change");

export const schemaFilePath = path.resolve(__dirname, `../schema.sql`);

export const createTestContext = () => {
    let ctx = {} as TestContext;

    beforeAll(async () => {
        Object.assign(ctx, await originalCreateTestContext());
        if (!fs.existsSync(LAST_DB_CHANGE_FILEPATH) || (await fs.promises.readFile(LAST_DB_CHANGE_FILEPATH)).toString() !== md5File.sync(schemaFilePath)) {
            throw new Error(`db needs reset. run \`yarn reset-database\``);
        }
        await ctx.app.start();
    });

    afterAll(async () => {
        await ctx.app.stop();
    });

    return ctx;
};

export const checkRating = (rating: number, canBeEmpty = false) => {
    if (!canBeEmpty) expect(rating).not.toBe(0);
    expect(rating).toBeGreaterThanOrEqual(1);
    expect(rating).toBeLessThan(10);
};
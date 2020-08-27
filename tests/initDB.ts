import { PrismaClient } from "@prisma/client";
import * as path from "path";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as child_process from "child_process";
import * as util from "util";
import _ from "lodash";
import md5file from "md5-file";
import { LAST_DB_CHANGE_FILEPATH, schemaFilePath } from "./__helpers";

dotenv.config({
    path: path.resolve(__dirname, "../prisma/.env")
});

const TEST_USER_ID = "1806602625";

const execPromise = util.promisify(child_process.exec);
const prisma = new PrismaClient();

const mockData = {
    hosts: ["zardoy", "dimaka", "kayos", "machosts"],
    reviewTexts: [
        "Awful host. I love it!",
        "Impressive. Nice host!",
        "its rly bad",
        "Amazing host with 100% uptime (example.com), easy setup, low price and very responsible support. Thank you guys a lot! The best of the best!!!"
    ]
};

const dataCount = {
    hosts: 80,
    ratings: 50,
    reviews: 10,
    firstMembers: 100
};

const getRandomUserId = () => _.random(0, 100000) + "";

(async () => {
    console.log(`Reseting db...`);
    let err = (await
        execPromise(
            `echo "DROP DATABASE IF EXISTS ratehost;CREATE DATABASE ratehost;" | psql && psql ratehost --file="${schemaFilePath}"`
        )).stderr;
    if (err) throw new Error(err);

    console.log(`Initializing test data...`);


    // if (typeof process.env.TEST_USER_ID !== "string") throw new Error("TEST_USER_ID env is not a string");
    // let { TEST_USER_ID } = process.env;
    for (let hostNumber = 0; hostNumber < dataCount.hosts; hostNumber++) {
        let hostName = `${_.sample(mockData.hosts)}${_.random(10, 999)}`;
        let newHost = await prisma.host.create({
            data: {
                name: hostName.charAt(0).toUpperCase() + hostName.slice(1),
                description: `Another awesome hosting. Yes, ${hostName} is the best. Definitely.`,
                ownerUserId: (+TEST_USER_ID + hostNumber).toString(),
                site: `${hostName}.com`
            }
        });
        if (hostNumber === dataCount.hosts - 1) continue; //do not create rating for the last host
        for (let ratingNumber = 0; ratingNumber < dataCount.ratings; ratingNumber++) {
            let newRating = await prisma.userRating.create({
                data: {
                    dedicatedHost: { connect: { id: newHost.id } },
                    general: _.random(0, 9),
                    userId: (+TEST_USER_ID + 1 + ratingNumber).toString()
                }
            });
            if (ratingNumber < dataCount.reviews) {
                await prisma.userReview.create({
                    data: {
                        userRating: {
                            connect: { ratingId: newRating.ratingId }
                        },
                        text: _.sample(mockData.reviewTexts) as string
                    }
                });
            }
        }
        if (hostNumber === 0) {
            let randomStartUserId = getRandomUserId();
            for (let memberNumber = 0; memberNumber < dataCount.firstMembers; memberNumber++) {
                await prisma.hostMember.create({
                    data: {
                        host: {
                            connect: { id: newHost.id }
                        },
                        userId: (+randomStartUserId + memberNumber).toString()
                    }
                });
            }
        }
    }
    await prisma.$disconnect();
    await fs.promises.writeFile(LAST_DB_CHANGE_FILEPATH, md5file.sync(schemaFilePath));
})();
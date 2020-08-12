import { schema } from "nexus";
import _ from "lodash";
import { RATING_COMPONENTS } from "../app";

const MAX_RATING = 10, MIN_RATING = 1, NO_RATINGS_RATING = 0;

/** @returns number 0 or float 1-10 inclusive */
export const calculateRating = (numbersArr: number[], hostId: number) => {
    numbersArr = numbersArr.map(rating => rating + 1);
    let rating = _.ceil(_.mean(numbersArr), 1);
    if (!_.inRange(MIN_RATING, MAX_RATING + 1)) throw new RangeError(`Calculated rating ${rating} out of range. Host id: ${hostId}`);
    return isFinite(rating) ? rating : NO_RATINGS_RATING;
};

schema.objectType({
    name: "HostList",
    definition(t) {
        t.model("Host").id()
            .name()
            .description()
            .site();
        t.string("rating", { nullable: false, description: "Float actually" });
        t.int("votesCount", { nullable: false });
    }
});

schema.objectType({
    name: "HostDetails",
    definition(t) {
        t.field("componentRating", {
            type: "componentRating",
            nullable: false
        });
        t.field("myRating", {
            type: "Int",
            nullable: true
        });
    }
});

schema.objectType({
    name: "componentRating",
    definition(t) {
        RATING_COMPONENTS.map(component => t.string(component, { nullable: true }));
        // t.model("UserRating").billing()
        //     .cpu()
        //     .ram()
        //     .support();
    }
});

schema.objectType({
    name: "HostsCustomPagination",
    definition(t) {
        //todo wrong pagination schema (everwhere)
        t.field("edges", {
            type: "HostList",
            list: true,
            nullable: false
        });
    }
});

const wrongHostId = ({ hostId }: { hostId: number; }) => {
    //todo hostId < lastId ? "deleted" : "not created yet"
};

schema.extendType({
    type: "Query",
    definition(t) {
        //t.crud.hosts(); - can't explicity set the ordering
        t.field("hosts", {
            //todo: return whether should update rating
            type: "HostsCustomPagination",
            nullable: false,
            args: {
                offset: schema.intArg({ nullable: false }),
                first: schema.intArg({ nullable: false, description: "ZERO based" }),
                searchQuery: schema.stringArg()
            },
            async resolve(_root, { first, offset, searchQuery }, { db: prisma }) {
                const result =
                    await prisma.queryRaw(
                        `SELECT "id", "name", "description", "site", round(avg(r.general + 1), 1) as rating, count(r.general) as "votesCount"`
                        + ` FROM "Host" as h INNER JOIN "UserRating" as r ON h.id = r."hostId"`
                        + ` WHERE "isSuspended" = FALSE`
                        + ` GROUP BY h.id`
                        + ` ORDER BY rating DESC`
                        + ` LIMIT $1 OFFSET $2;`,
                        first,
                        offset
                    );
                return {
                    edges: result
                };
            }
        });
        t.field("hostDetails", {
            type: "HostDetails",
            nullable: false,
            args: {
                id: schema.intArg({ required: true })
            },
            async resolve(_root, { id: hostId }, { db: prisma, vk_params }) {
                if (!vk_params) throw new Error("Not auth.");
                let userId = vk_params.user_id;
                //todo check only if not found in the first sce.
                let host = await prisma.host.findOne({
                    where: { id: hostId }
                });
                if (!host) throw new Error("Host not found.");
                if (host.isSuspended) throw new Error(`This host has suspended.`);
                let componentRating = (await prisma.queryRaw(
                    //todo: NOT SAFE
                    `SELECT ${RATING_COMPONENTS.map(component => `avg(r."${component}" + 1) as ${component}`).join(", ")}`
                    + ` FROM "Host" h INNER JOIN "UserRating" r ON h."id" = r."hostId"`
                    + ` WHERE h."id" = $1`
                    + ` GROUP BY h."id"`,
                    hostId
                ))[0];
                let userRating = await prisma.userRating.findOne({
                    where: {
                        hostId_userId: {
                            hostId,
                            userId
                        }
                    }
                });
                return {
                    componentRating,
                    myRating: userRating && (userRating.general + 1)
                };
            }
        });
        t.field("suspendedHostName", {
            type: "String",
            description: "For advanced use.",
            args: {
                id: schema.intArg({ required: true })
            },
            async resolve(_root, { id: hostId }, { db: prisma }) {
                let host = await prisma.host.findOne({
                    where: { id: hostId }
                });
                if (!host) throw new Error("Host not found.");
                if (!host.isSuspended) throw new Error("This host wasn't suspended.");
                return host.name;
            }
        });
    }
});
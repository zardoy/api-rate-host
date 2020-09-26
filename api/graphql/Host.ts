import { schema } from "nexus";
import _ from "lodash";
import { RATING_COMPONENTS } from "../app";

schema.extendType({
    type: "Query",
    definition(t) {
        //t.crud.hosts(); - can't explicity set the ordering
        t.field("hosts", {
            //todo: return whether should update rating
            type: "HostsCustomPagination",
            args: {
                offset: schema.intArg(),
                first: schema.intArg({ description: "ZERO based" }),
                searchQuery: schema.stringArg({ required: false })
            },
            async resolve(_root, { first, offset, searchQuery }, { db: prisma }) {
                const result =
                    await prisma.$queryRaw<
                        {
                            id: number,
                            name: string,
                            description: string,
                            site: string,
                            //todo prisma bug?
                            rating: string | null,
                            votesCount: number;
                        }[]
                    >(
                        `SELECT "id", "name", "description", "site", round(avg(r.general + 1), 1) as rating, count(r.general) as "votesCount"`
                        + ` FROM "Host" as h LEFT JOIN "UserRating" as r ON h.id = r."hostId"`
                        + ` WHERE "isSuspended" = FALSE`
                        + ` GROUP BY h.id`
                        + ` ORDER BY rating DESC`
                        + ` LIMIT $1 OFFSET $2;`,
                        first,
                        offset
                    );
                return {
                    edges: result.map(host => ({
                        ...host,
                        rating: host.rating === null ? NO_RATINGS_HOST_RATING : _.round(+host.rating, 1)
                    }))
                };
            }
        });
        t.field("hostDetails", {
            type: "HostDetails",
            args: {
                id: schema.intArg()
            },
            async resolve(_root, { id: hostId }, { db: prisma, vk_params }) {
                if (!vk_params) throw new Error("Not auth.");
                let userId = vk_params.user_id;
                //todo check only if not found in the first sce.
                let host = await prisma.host.findOne({
                    where: { id: hostId }
                });
                if (!host) throw new Error("Host not found.");
                //todo rewrite with prisma aggregate functions
                type ArrType<T> = T extends (infer U)[] ? U : never;
                let componentRating = (await prisma.$queryRaw(
                    //todo: NOT SAFE
                    `SELECT ${RATING_COMPONENTS.map(component => `avg(r."${component}" + 1) as ${component}`).join(", ")}`
                    + ` FROM "Host" h INNER JOIN "UserRating" r ON h."id" = r."hostId"`
                    + ` WHERE h."id" = $1`
                    + ` GROUP BY h."id"`,
                    hostId
                ))[0] || null;
                let userRating = await prisma.userRating.findOne({
                    where: {
                        hostId_userId: {
                            hostId,
                            userId
                        }
                    },
                    select: {
                        general: true
                    }
                });
                return {
                    componentRating: componentRating && _.mapValues(componentRating, (ratingComponent: string | null) => ratingComponent !== null ? _.round(+ratingComponent, 1) : null),
                    myRating: userRating && (userRating.general + 1)
                };
            }
        });
        t.field("suspendedHostName", {
            type: "String",
            description: "For advanced use.",
            args: {
                id: schema.intArg()
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

const NO_RATINGS_HOST_RATING = 0;

schema.objectType({
    name: "HostList",
    definition(t) {
        t.model("Host").id()
            .name()
            .description()
            .site();
        t.float("rating");
        t.int("votesCount");
    }
});

schema.objectType({
    name: "HostDetails",
    definition(t) {
        t.field("componentRating", {
            type: "componentRating",
            nullable: true
        });
        t.field("myRating", {
            type: "Float",
            nullable: true
        });
    }
});

schema.objectType({
    name: "componentRating",
    definition(t) {
        RATING_COMPONENTS.map(component => t.float(component, { nullable: true }));
    }
});

schema.objectType({
    name: "HostsCustomPagination",
    definition(t) {
        //todo wrong pagination schema (everwhere)
        t.field("edges", {
            type: "HostList",
            list: true
        });
    }
});

//todo wrong host id deleted or not created yet

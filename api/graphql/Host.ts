import { schema } from "nexus";
import _ from "lodash";

const MAX_RATING = 10, MIN_RATING = 1, NO_RATINGS_RATING = 0;

/** @returns number 0 or float 1-10 inclusive */
export const calculateRating = (numbersArr: number[], hostId: number) => {
    numbersArr = numbersArr.map(rating => rating + 1);
    let rating = _.ceil(_.mean(numbersArr), 1);
    if (!_.inRange(MIN_RATING, MAX_RATING + 1)) throw new RangeError(`Calculated rating ${rating} out of range. Host id: ${hostId}`);
    return isFinite(rating) ? rating : NO_RATINGS_RATING;
};

schema.objectType({
    name: "Host",
    definition(t) {
        t.model.id();
        t.model.name();
        t.model.description();
        t.model.site();
        t.field("generalRating", {
            type: "Float",
            nullable: false,
            async resolve({ id: hostId }, _args, ctx) {
                let userRatings = await ctx.db.userRating.findMany({
                    where: {
                        hostId
                    },
                    select: {
                        general: true
                    }
                });
                return calculateRating(userRatings.reduce((prevArr, { general: generalRating }) => [...prevArr, generalRating], [] as number[]), hostId);
            }
        });
        t.field("componentRating", {
            type: "componentRating",
            nullable: false,
            async resolve({ id: hostId }, _args, { db: prisma }) {
                let hostRatingsFromDb = await prisma.userRating.findMany({
                    where: {
                        hostId
                    },
                    select: {
                        billing: true,
                        cpu: true,
                        ram: true,
                        support: true
                    }
                });
                //todo: find better solution
                const firstEntry = hostRatingsFromDb[0];
                if (!firstEntry) return {
                    billing: 0,
                    cpu: 0,
                    ram: 0,
                    support: 0
                };
                let ratingArrsNullable = hostRatingsFromDb.reduce((prevRatingArr, currentRating) => {
                    return _.mapValues(prevRatingArr, (arr, key) => [...arr, currentRating[key as keyof typeof prevRatingArr]]);
                }, _.mapValues(firstEntry, val => [val]));
                let ratings = _.mapValues(ratingArrsNullable, arr => calculateRating(_.compact(arr), hostId));
                return ratings;
            }
        });
    }
});

schema.objectType({
    name: "componentRating",
    definition(t) {
        //todo: switch back OverallRating
        t.model("OverallRating").billing();
        t.model("OverallRating").cpu();
        t.model("OverallRating").ram();
        t.model("OverallRating").support();
    }
});

schema.objectType({
    name: "HostsCustomPagination",
    definition(t) {
        t.field("edges", {
            type: "Host",
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
        t.crud.host();
        //t.crud.hosts(); - can't explicity set the ordering
        t.field("hosts", {
            //todo: return whether should update rating
            type: "HostsCustomPagination",
            nullable: false,
            args: {
                offset: schema.intArg({ nullable: false }),
                first: schema.intArg({ nullable: false, description: "ZERO based" }),
                search: schema.stringArg()
            },
            async resolve(_root, { first, offset, search: searchString }, { db: prisma }) {
                const ratingList = (await prisma.host.findMany({
                    where: searchString ? {
                        OR: [
                            {
                                name: {
                                    contains: searchString
                                }
                            },
                            {
                                description: {
                                    contains: searchString
                                }
                            },
                            {
                                site: {
                                    contains: searchString
                                }
                            }
                        ]
                    } : undefined,
                    include: {
                        userRatings: true
                    }
                }))
                    .map(host => ({
                        ...host,
                        averageRating:
                            calculateRating(
                                _.compact(
                                    host.userRatings.reduce((ratingsArr, { general: generalRating }) => {
                                        return [...ratingsArr, generalRating];
                                    }, [] as number[])
                                ),
                                host.id
                            )
                    }))
                    //DESC
                    .sort((hostA, hostB) => hostB.averageRating - hostA.averageRating);
                let end = offset + first;
                return {
                    edges: ratingList.slice(offset, end),
                    hasNext: !!ratingList[end],
                    totalCount: ratingList.length
                };
            }
        });
    }
});
import { createTestContext, checkRating } from "./__helpers";

const ctx = createTestContext();
let testingHostId: number;

const testingUserId = process.env.TEST_USER_ID;
if (!testingUserId) throw new TypeError("env variable TEST_USER_ID is not defined");

//EMPTY RATINGS: 0 in hosts query only! in other cases will be null

const getOneHostWithIdAndRating = async (offset = 0): Promise<{ id: number, rating: number; }> => {
    return (await ctx.client.send(`
        query {
            hosts(offset:${offset}, first:1) {
                edges {
                    id
                    rating
                }
            }
        }
    `)).hosts.edges[0];
};

const createOrUpdateRating = async (generalRating: number, hostId = testingHostId): Promise<{ ratingId: number; }> => (await ctx.client.send(`
    mutation {
        createOrUpdateRating(generalRating: ${generalRating}, hostId: ${hostId}) {
            ratingId
        }
    }
`)).createOrUpdateRating;

describe("Host", () => {
    describe("tests hosts query", () => {
        let hostsQueryResult: any;
        beforeAll(async () => {
            hostsQueryResult = await ctx.client.send(`
                query {
                    hosts(offset: 10, first: 20) {
                        edges {
                            id
                            name
                            description
                            rating
                            site
                            votesCount
                        }
                    }
                }
            `);
        });
        test("hosts result should be defined", () => {
            expect(hostsQueryResult.hosts.edges).toBeDefined();
        });
        test("checks hosts result length", () => {
            expect(hostsQueryResult.hosts.edges).toHaveLength(20);
        });
        test("checks rating", () => {
            const hostEntry = hostsQueryResult.hosts.edges[0];
            checkRating(hostEntry.rating);
        });
        test("checks votes count", () => {
            const hostEntry = hostsQueryResult.hosts.edges[0];
            expect(hostEntry.votesCount).toBeGreaterThanOrEqual(1);
        });
        test("checks other field types", () => {
            const hostEntry = hostsQueryResult.hosts.edges[0];
            expect({
                descriptionType: typeof hostEntry.description,
                idType: typeof hostEntry.id,
                nameType: typeof hostEntry.name,
                siteType: typeof hostEntry.site,
            }).toMatchSnapshot();
        });

        test("should skip host in the list if host was suspended", async () => {
            const prisma = ctx.app.db.client;

            const queriedHostBefore = await getOneHostWithIdAndRating();
            await prisma.host.update({
                where: { id: queriedHostBefore.id },
                data: {
                    isSuspended: true
                }
            });
            const queriedHostAfter = await getOneHostWithIdAndRating();
            //first host should be banned
            expect(queriedHostAfter.id).not.toBe(queriedHostBefore.id);
            expect(queriedHostAfter.rating).toBeLessThanOrEqual(queriedHostBefore.rating);
            //but hostDetails still can be queried
        });
    });

    describe("test hostDetails query", () => {
        let hostTestingId: number;
        beforeAll(async () => {
            hostTestingId = (await getOneHostWithIdAndRating(5)).id;
        });

        test("tests hostDetails query against snapshot", async () => {
            const { hostDetails } = await ctx.client.send(`
                query {
                    hostDetails(id: ${hostTestingId}) {
                        myRating
                        componentRating {
                            billing
                            cpu
                            ram
                            support
                        }
                    }
                }
            `);
            //only last host not filled with rating data so componentRating can't be null
            expect(hostDetails).toMatchSnapshot();
        });
    });
});

describe("HostMember", () => {
    test("checks host members", async () => {
        const { hostMembers }: { hostMembers: string[]; } = await ctx.client.send(`
            query {
                hostMembers
            }
        `);
        expect(hostMembers).toHaveLength(100);
        expect(hostMembers[49]).toEqual(expect.any(String));
    });
});

describe("Me", () => {
    it("checks me query that I'm owner of the first added host", async () => {
        const queryResult = await ctx.client.send(`
            query {
                me {
                    role
                    hostId
                    membersCount
                }
            }
        `);

        expect(queryResult).toMatchSnapshot();
    });
});

describe("Rating", () => {
    let myHostId: number;

    //todo graphql vars
    const getMyRating = async (): Promise<number> => (await ctx.client.send(`
        query {
            hostDetails(id: ${testingHostId}) {
                myRating
            }
        }
    `)).hostDetails.myRating;

    //assign hostId for all tests
    beforeAll(async () => {
        myHostId = (await ctx.client.send(`
            query {
                me {
                    hostId
                }
            }
        `)).me.hostId;
        //already checked that role is host owner (see test above)
        testingHostId = (await getOneHostWithIdAndRating()).id;
        if (testingHostId === myHostId) {
            testingHostId += 1;// I know that I owner of the first added host so I can pick next one
        }
    });


    test("not created rating should be empty", async () => {
        const emptyRating = await getMyRating();//testing on testingHostId
        expect(emptyRating).toBeNull();
    });

    test("should throw err if I try to create rating on my host", async () => {
        expect.assertions(1);
        try {
            await createOrUpdateRating(3, myHostId);
        } catch (err) {
            console.dir(err);
            expect(err).toMatch("Owners can't rate their hosts");
        }
    });

    test("should throw err if I provide incorrect rating number", async () => {
        expect.assertions(2);
        try {
            expect(await createOrUpdateRating(11)).toThrow();
        } catch (err) {
            expect(err).toMatch("not in range");
        }
        try {
            await createOrUpdateRating(0);
        } catch (err) {
            //actually wrong err message 
            expect(err).toMatch("error");
        }
    });

    test("should create rating", async () => {
        const hostGeneralRatingBefore = (await getOneHostWithIdAndRating()).rating;
        const FIRST_TESTING_RATING = 3;
        await createOrUpdateRating(FIRST_TESTING_RATING);
        const myRatingAfter = await getMyRating();
        expect(myRatingAfter).toEqual(FIRST_TESTING_RATING);
        const hostGeneralRatingAfter = (await getOneHostWithIdAndRating()).rating;
        expect(hostGeneralRatingBefore).not.toEqual(hostGeneralRatingAfter);
    });

    test("should update rating", async () => {
        const SECOND_HOST_RATING = 10;
        await createOrUpdateRating(SECOND_HOST_RATING);
        const myRatingUpdated = await getMyRating();
        expect(myRatingUpdated).toBe(SECOND_HOST_RATING);
    });

    test("should delete rating", async () => {
        await ctx.client.send(`
            query {
                deleteRating(hostId: ${testingHostId})
            }
        `);
        const rating = await getMyRating();
        expect(rating).toBeNull();
    });
});

describe("Review", () => {
    const createOrUpdateReview = async (reviewText: string, hostId = testingHostId): Promise<void> => {
        await ctx.client.send(`
            mutation {
                createOrUpdateReview(hostId: ${hostId}, ${reviewText})
            }
        `);
    };

    test("should create and return find created review", async () => {
        const prisma = ctx.app.db.client;

        expect.assertions(2);
        const TESTING_RATING = 1;
        await createOrUpdateRating(TESTING_RATING);
        for (let testingText of ["this review was just created", "updated unique text review"]) {
            await createOrUpdateReview(testingText);
            let reviewsResult = await prisma.userReview.findMany({
                where: {
                    userRating: {
                        hostId: testingHostId
                    },
                    text: testingText
                }
            });
            expect(reviewsResult).toHaveLength(1);
        }
    });

    test.skip("tests updatedAt timestamp againg createdAt", async () => {
        const prisma = ctx.app.db.client;

        const myRating = await prisma.userRating.findOne({
            where: {
                hostId_userId: {
                    hostId: testingHostId,
                    userId: testingUserId
                }
            },
            include: {
                userReview: true
            }
        });
        if (!myRating) throw new Error("can't find rating");
        const { createdAt, updatedAt } = myRating.userReview[0];
        //here it is
        expect(updatedAt).not.toBeNull();
        expect(+createdAt).toBeLessThan(+updatedAt!);
    });

    test.skip("should delete review", async () => {
        const prisma = ctx.app.db.client;

        await ctx.client.send(`
            mutation {
                deleteReview(hostId: ${testingHostId})
            }
        `);
        const myRating = await prisma.userRating.findOne({
            where: {
                hostId_userId: {
                    hostId: testingHostId,
                    userId: testingUserId
                }
            },
            include: {
                userReview: true
            }
        });
        if (!myRating) throw new Error("can't find rating");
        //we can have either 0 or 1
        expect(myRating.userReview).toHaveLength(0);
    });
});

// describe("InviteMember", () => {
//     test("invite member and ensures that member was invited", async () => {
//         await ctx.client.send(`
//             mutation {
//                 inviteUserToMembers()
//             }
//         `)
//     })
// })
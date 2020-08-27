import { errorMessages } from "./errors";

export const VOTE_TO_INTEGER_CASE_SQL = `CASE votes."voteType" WHEN 'UP' THEN 1 WHEN 'DOWN' THEN -1 END`;
export const GET_MY_VOTE_SQL = `(CASE sum(CASE votes."userId" WHEN $1 THEN ${VOTE_TO_INTEGER_CASE_SQL} END) WHEN 1 THEN 'UP' WHEN -1 THEN 'DOWN' END) as "myVote"`;

interface Query {
    query: string,
    params: any[];
};

export const deleteOneObjectFromDatabase = async ({ prisma, query, itemName, expectedAction }: { prisma: NexusContext["db"]; query: Query; itemName: string; expectedAction?: string; }) => {
    let deleteCount = await prisma.$executeRaw(query.query, ...query.params);
    if (deleteCount === 0) throw new Error(errorMessages.delete.zero(itemName, expectedAction));
    if (deleteCount > 1) throw new Error(errorMessages.delete.moreThanOne(itemName));
    return true;
};

export const getHostOwner = async (prisma: NexusContext["db"], userId: string) => {
    return await prisma.host.findOne({
        where: { ownerUserId: userId }
    });
};
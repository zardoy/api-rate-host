interface Query {
    query: string,
    params: any[]
};

export const deleteOneObjectFromDatabase = async ({ prisma, query, itemName, expectedAction }: { prisma: NexusContext["db"]; query: Query; itemName: string; expectedAction?: string; }) => {
    let deleteCount = await prisma.executeRaw(query.query, ...query.params);
    if (deleteCount === 0) throw new Error(errorMessages.delete.zero(itemName, expectedAction));
    if (deleteCount > 1) throw new Error(errorMessages.delete.moreThanOne(itemName));
    return true;
}

export const errorMessages = {
    delete: {
        zero: (itemName: string, expectedAction?: string) => 
            `There is no ${itemName} to remove! Probably, you already removed it or you didn't ${expectedAction || "create it before"}.`,
        moreThanOne: (itemName: string) => `Congrats! You just removed more than one ${itemName}!`,
    }
};
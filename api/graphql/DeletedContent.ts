//only checking host id now

import { DeleteReason } from "@prisma/client";

class DeletedHostError extends Error {
    constructor(public hostId: number, public reason: DeleteReason) {
        super();
    }
}

export const checkDeletedHost = async (hostId: number, prisma: NexusContext["db"]): Promise<void> => {
    let deletedHost = await prisma.deletedHost.findOne({ where: { id: hostId } });
    if (deletedHost) {
        throw new DeletedHostError(hostId, deletedHost.reason);
    }
};
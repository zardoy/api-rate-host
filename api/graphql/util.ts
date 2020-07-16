//I will rewrite this soon

export const paginateResults = <K, T extends keyof K>({ after, pageSize = 20, results, cursorKey }: { after?: number, pageSize?: number, results: K[], cursorKey: T; }): { paginatedResults: K[]; after: K[T]; } => {
    const paginateArr = () => {
        if (after === undefined) return {
            paginatedResults: results.slice(0, pageSize),
            after: 0 as any
        };

        let cursorIndex = results.findIndex(item => String(item[cursorKey]) === String(after));
        //todo: throw an error
        if (cursorIndex < 0) return [];
        return results.slice(cursorIndex + 1, pageSize);
    };
};
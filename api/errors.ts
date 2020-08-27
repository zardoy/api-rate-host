import _ from "lodash";

export const errorMessages = {
    delete: {
        zero: (itemName: string, expectedAction?: string) =>
            `There is no ${itemName} to remove! Probably, you already removed it or you didn't ${expectedAction || "create it before"}.`,
        moreThanOne: (itemName: string) => `Congrats! You just removed more than one ${itemName}!`,
    }
};

const MAX_RATING = 10, MIN_RATING = 1;

export const checkUserInputRatingBounds = (rating: number, componentName?: string) => {
    if (!_.inRange(rating, MIN_RATING, MAX_RATING + 1))
        throw new RangeError(`Incorrect input. Rating ${rating}${componentName ? ` for component ${componentName}` : ``} not in range (${MIN_RATING} – ${MAX_RATING}).`);
};
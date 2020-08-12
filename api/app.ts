import { use, schema } from "nexus";
import { prisma } from "nexus-plugin-prisma";
import _ from "lodash";

import * as path from "path";
import * as dotenv from "dotenv";
import * as crypto from "crypto";

dotenv.config({
    //todo check compiled
    path: path.resolve(__dirname, "../prisma/.env")
});

export const RATING_COMPONENTS = [
    "billing",
    "cpu",
    "ram",
    "support"
];

interface VK_params {
    [vk_param: string]: string;
}

const pickVkParams = <K extends string = string>(vk_params: VK_params, pick_params: K[]): Record<K, string> => {
    //todo simplify
    const vkSliced = (str: string) => str.slice("vk_".length);
    return _.mapKeys(
        _.pickBy(vk_params, (_val, key) => pick_params.includes(vkSliced(key) as K)),
        (_val, key) => vkSliced(key)
    ) as any;
};

schema.addToContext((req) => {
    //todo err
    if (process.env.VK_SECRET_KEY === undefined) throw new TypeError("Env VK_SECRET_KEY not defined");
    // try {
    const paramsForTesting = process.env.VK_PARAMS_FOR_TESTING;
    const vkParams = new URLSearchParams(paramsForTesting/* req.headers.authorization */);

    const SIGN_SECRET_URL_PARAM = vkParams.get("sign");
    vkParams.forEach((_paramValue, paramKey) => {
        if (!paramKey.startsWith("vk_")) vkParams.delete(paramKey);
    });
    vkParams.sort();

    const paramsHash = crypto
        .createHmac("sha256", process.env.VK_SECRET_KEY)
        .update(vkParams.toString())
        .digest()
        .toString("base64")
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=$/, "");

    //todo change error message
    if (paramsHash !== SIGN_SECRET_URL_PARAM) throw new TypeError("can't validate sign param");

    //todo any is evil
    let vk_launch_params: VK_params = _.fromPairs(Array.from(vkParams as any));
    const ctx_vk_params = pickVkParams(vk_launch_params, ["user_id", "app_id", "platform"]);
    ctx_vk_params.user_id = "35039";
    if (!isFinite(+ctx_vk_params.user_id)) throw new TypeError(`user_id param is not a number: ${ctx_vk_params.user_id}`);
    return {
        vk_params: ctx_vk_params
    };
    // } catch (err) {
    //     if (process.env.)
    //     return {
    //         vk_params: null
    //     };
    // }
});

use(
    prisma({
        client: {
            options: {
                __internal: {
                    debug: true,
                    measurePerformance: true
                },
                log: ["query", "warn"]
            }
        }
    })
);
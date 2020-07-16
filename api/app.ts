import { use, schema } from "nexus";
import { prisma } from "nexus-plugin-prisma";
import _ from "lodash";

interface VK_params {
    [vk_param: string]: string;
}

const pickVkParams = <K extends string = string>(vk_params: VK_params, to_pick: K[]): { [param in K]: string } => {
    //todo simplify
    return _.mapKeys(
        _.pickBy(vk_params, (_val, key) => to_pick.includes(`vk_${key}` as K)),
        (_val, key) => key.slice("vk_".length)
    ) as any;
};

schema.addToContext((req) => {
    try {
        let vk_launch_params: VK_params = _.fromPairs(Array.from(new URLSearchParams(req.headers.authorization) as any));
        const ctx_vk_params = pickVkParams(vk_launch_params, ["user_id", "app_id", "platform"]);
        if (!isFinite(+ctx_vk_params.user_id)) throw new TypeError(`user_id param is not a number: ${ctx_vk_params.user_id}`);
        return {
            vk_params: ctx_vk_params
        };
    } catch (err) {
        return {
            vk_params: null
        };
    }
});

use(
    prisma({
        features: {
            crud: true
        }
    })
);
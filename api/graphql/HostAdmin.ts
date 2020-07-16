import { schema } from "nexus";
import { stringArg } from "nexus/components/schema";
import _ from "lodash";

const adminAuth = (_root: any, _args: any, { isAdmin }: NexusContext) => isAdmin;

// schema.extendType({
//     type: "Mutation",
//     definition(t) {
//         //admin
//         t.crud.createOnehost({
//             authorize: adminAuth,
//             computedInputs: {
//                 host_members: () => null,
//                 overall_rating: () => null,
//                 user_ratings: () => null,
//             }
//         });
//         //admin
//         // t.field("updateHost", {
//         //     type: "host",
//         //     authorize: adminAuth,
//         //     args: {
//         //         hostId: schema.intArg({ nullable: false }),
//         //         name: "String",
//         //         description: "String",
//         //         site: "String",
//         //         owner_user_id: "String"
//         //     },
//         //     resolve(_root, { hostId, ...dataToUpdate }, { isAdmin, db: prisma }) {
//         //         let updatedHost = prisma.host.update({
//         //             where: { id: hostId },
//         //             data: dataToUpdate
//         //         });
//         //     }
//         // });
//         //admin


//     }
// });
const NodeEnvironment = require("jest-environment-node");

//todo: use ts

class NexusEnvironment extends NodeEnvironment {
    connectionString = `postgresql://postgres:postgres@localhost:5432/ratehost`;
    // postgresClient = new Client({
    //     connectionString: this.connectionStringWithoutDb
    // }); //connecting not to a db
    async setup() {
        this.global.process.env.TEST_USER_ID = "1806602625";
        this.global.process.env.DATABASE_URL = this.connectionString;
        await super.setup();
    }
    async teardown() {
        await super.teardown();
    }
}

module.exports = NexusEnvironment;
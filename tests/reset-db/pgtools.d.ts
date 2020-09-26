type Config = {
    user: string,
    password: string,
    port: number,
    host: string;
};

declare module "pgtools" {
    let createdb: (config: Config, dbName: string) => Promise<unknown>;
    let dropdb: (config: Config, dbName: string) => Promise<unknown>;
}
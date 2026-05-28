import { Sequelize } from "sequelize";
require("../config/config");
// console.log(global.gConfig)
let dbUrl =
  global.gConfig.config_id === "development"
    ? `postgres://${global.gConfig.userName}:${global.gConfig.databasePassword}@${global.gConfig.hostAddress}/${global.gConfig.databaseName}`
    : global.gConfig.config_id === "staging"
      ? `postgres://${global.gConfig.userName}:${global.gConfig.databasePassword}@${global.gConfig.hostAddress}/${global.gConfig.databaseName}`
      : global.gConfig.config_id === "production"
        ? `postgres://${global.gConfig.userName}:${global.gConfig.databasePassword}@${global.gConfig.hostAddress}:${global.gConfig.dbPort}/${global.gConfig.databaseName}`
        : "postgres://pgreferral:kcedeihTYYd@103.182.210.198:5439/nowareferral";
        
console.log("dbUrl", dbUrl);


let sequelize;
if (global.gConfig.config_id == "production") {
  sequelize = new Sequelize(dbUrl, {
    logging: false,
    dialectOptions: {
      ssl: {
        require: true,
        rejectUnauthorized: false,
      },
    },
  });
} else {
  sequelize = new Sequelize(dbUrl, { logging: false });
}

(async () => {
  try {
    await sequelize.authenticate();
    console.log("Postgresql Connection has been established successfully✔️");
  } catch (error) {
    console.error("Unable to connect to the database:", error);
    process.exit(1);
  }
})();
module.exports = sequelize;





// import { Sequelize } from "sequelize";
// import "../config/config.js"; // this loads global.gConfig

// const { dbConfig, environment } = global.gConfig;

// let dbUrl = `postgres://${dbConfig.user}:${dbConfig.password}@${dbConfig.host}:${dbConfig.port}/${dbConfig.name}`;
// console.log(dbUrl);
// let sequelize;
// if (environment === "production") {
//   sequelize = new Sequelize(dbUrl, {
//     logging: false,
//     dialectOptions: {
//       ssl: {
//         require: true,
//         rejectUnauthorized: false,
//       },
//     },
//   });
// } else {
//   sequelize = new Sequelize(dbUrl, { logging: false });
// }

// (async () => {
//   try {
//     await sequelize.authenticate();
//     console.log("Postgresql Connection has been established successfully✔️");
//   } catch (error) {
//     console.error("Unable to connect to the database:", error);
//     process.exit(1);
//   }
// })();

// export default sequelize;

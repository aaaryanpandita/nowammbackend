import _ from "lodash";
import config from "./config.json";

  const environment = 'development';  // for develeopment 
// const environment = 'staging';  // for UAT
// const environment = 'production'; // for Production
const defaultConofig = config.development;  // default

const environmentConfig = config[environment];

const finalConfig = _.merge(defaultConofig, environmentConfig);
global.gConfig = finalConfig;


// import dotenv from "dotenv";
// dotenv.config();

// const environment = process.env.NODE_ENV || "production";

// const baseConfig = {
//   port: process.env.PORT || 8083,
//   jwtsecret: process.env.JWT_SECRET || "nodejwt",
//   jwtresetsecret: process.env.JWT_RESET_SECRET || "nodejwt",
//   jwtOptions: {
//     expiresIn: "24h",
//   },
//   swaggerDefinition: {
//     info: {
//       title: "Nowa Refferal Backend",
//       version: "1.0",
//       description:
//         "API documentation for the Nowa Refferal Backend. All apis written in node js.",
//     },
//     basePath: "/api/v1",
//     securityDefinitions: {
//       tokenauth: {
//         type: "apiKey",
//         name: "Authorization",
//         in: "header",
//       },
//     },
//   },
// //   GOOGLE_RECAPTCHA_SECRET: process.env.GOOGLE_RECAPTCHA_SECRET || "",
// };

// const dbConfig = {
//   host: process.env.DB_HOST,
//   port: process.env.DB_PORT,
//   user: process.env.DB_USER,
//   password: process.env.DB_PASSWORD,
//   name: process.env.DB_NAME,
// };

// const finalConfig = { environment, ...baseConfig, dbConfig };
// global.gConfig = finalConfig;

// export default finalConfig;

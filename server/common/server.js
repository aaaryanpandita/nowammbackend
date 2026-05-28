import express from 'express';
import morgan from 'morgan';
import cors from "cors";
import * as path from "path";
import swaggerUi from "swagger-ui-express";
import swaggerJSDoc from "swagger-jsdoc";
import apiErrorhandler from '../helper/apiErrorHandler';
import device from 'express-device';
const app = express();
const root = path.normalize(`${__dirname}/../..`);

// import bnplProcess from "../api/v1/controllers/process/bnplProcess";
// import openbalance from "../api/v1/controllers/process/userPNL";
// import openbalance from "../api/v1/controllers/process/userPNL";
// import intallmentProcess from "../api/v1/controllers/instalmentDeposite/installementProcess";
// import tradeOrder from "../api/v1/controllers/process/tradeOrder";
// import tokenDistribution from "../api/v1/controllers/process/tokenDistribution"
// import maintenanceProcess from '../api/v1/controllers/process/maintenance';
// import priceAter from "../api/v1/controllers/process/priceAlertProcess"



class ExpressServer {
    constructor() {
        app.use(express.json({ limit: '1000mb' }));
        app.use(express.urlencoded({ extended: true, limit: '1000mb' }));
        app.use(morgan('dev'));
        app.use(device.capture());
        app.use(
            cors({
                allowedHeaders: ["Content-Type", "token", "authorization", "devicetypes"],
                exposedHeaders: ["token", "authorization", "devicetypes"],
                origin: "*",
                methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
                preflightContinue: false,
            })
        );
    }

    router(routes) {
        routes(app);
        return this;
    }

    configureSwagger(swaggerDefinition) {
        const options = {
            swaggerDefinition,
            explorer: true,
            apis: [
                path.resolve(`${root}/server/api/v1/controllers/**/*.js`),
                path.resolve(`${root}/api.yaml`),
            ],
        };

        const swaggerSpec = swaggerJSDoc(options);

        // Serve the Swagger UI
        app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
        
        app.get("/health", async (req, res) => {
            try {
                // // Optional DB check (comment out if you don’t want DB check here)
                // if (global.db?.sequelize) {
                //     await global.db.sequelize.authenticate();
                // }

                res.status(200).json({
                    status: "ok",
                    uptime: process.uptime(),
                    timestamp: new Date(),
                    database: "connected"
                });
            } catch (err) {
                res.status(500).json({
                    status: "error",
                    message: "Database not reachable",
                    error: err.message
                });
            }
        });


      app.get("/", (req, res) => {
        res.status(200).send("ok")});

        // ✅ Add swagger.json route
        app.get('/swagger.json', (req, res) => {
            res.setHeader('Content-Type', 'application/json');
            res.send(swaggerSpec);
        });

        return this;
    }

    handleError() {
        app.use(apiErrorhandler);
        return this;
    }

    listen(port) {
        app.listen(port, () => {
            console.log(`Server is running on port ${port} ${new Date().toLocaleString()}`);
        });
        return app;
    }
}

// (async function() {
//     console.log("Initializing Ngrok tunnel...");

//     // Initialize ngrok using auth token and hostname
//     const url = await ngrok.connect({
//         proto: "http",
//         // Your authtoken if you want your hostname to be the same everytime
//         authtoken: "2ylaltPQY9gg9vVbG6frLvnLD9Z_7W7FMVwN6EHcPFGTGJDF2",
//         // Your hostname if you want your hostname to be the same everytime
//         hostname: "loving-specially-mastiff.ngrok-free.app",
//         // Your app port
//         addr: 8080,
//     });

//     console.log(`Listening on url ${url}`);
//     console.log("Ngrok tunnel initialized!");
// })();

export default ExpressServer;

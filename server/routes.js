import userContent from './api/v1/controllers/Controller/routes.js'
import db from "../connection/dbConnection.js";
export default function Routes(app) {

    app.use("/api/v1/trade", userContent);
    return app;
}




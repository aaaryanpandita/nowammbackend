import Server from "./common/server";
import Routes from "./routes";


const sever = new Server()
    .router(Routes)
    .configureSwagger(global.gConfig.swaggerDefinition)
    .handleError()
    .listen(global.gConfig.port)
export default sever;

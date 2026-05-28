import sequelize from "../../connection/dbConnection.js";
import { DataTypes } from "sequelize";

const db = {};

db.sequelize = sequelize;
db.Sequelize = DataTypes;

// ===== IMPORT MODELS =====
import tradeModel from "../model/TradeModals/Trademodal.js";

db.trades = tradeModel(sequelize, DataTypes);

// ===== SYNC ALL TABLES =====
sequelize
  .sync({ alter: true })
  .then(() => {
    console.log("✅ DB synced successfully");
  })
  .catch((err) => {
    console.error("❌ DB sync error:", err.message);
  });

export default db;
import express from "express";
import tradeController from "./tradeController.js";

const router = express.Router()
  .post("/executeTrade", tradeController.executeTrade)
  .get("/getTrades", tradeController.getTrades);

export default router;
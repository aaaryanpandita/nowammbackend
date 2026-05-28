//import admin from '../model/adminModels/Admin.js';
import jwt from "jsonwebtoken";
import apiError from "./apiError.js";
//import db from '../helper/tableSync.js';
import users from '../model/TradeModals/User.js';
import finalConfig from '../../config/config.js';
export const verifyAdminToken = async (req, res, next) => {
    try {
      const authHeader = req.headers["authorization"];
      if (!authHeader) {
        return res.status(401).json({
          responseCode: 401,
          responseMessage: "No token provided.",
        });
      }
  
      const token = authHeader.split(" ")[1];
      if (!token) {
        return res.status(401).json({
          responseCode: 401,
          responseMessage: "Invalid token format.",
        });
      }
  
      jwt.verify(token, process.env.JWT_SECRET || "sahdiash8@##$7379487", async (err, decoded) => {
        if (err) {
          if (err.name === "TokenExpiredError") {
            return res.status(440).json({
              responseCode: 440,
              responseMessage: "Session expired, please login again.",
            });
          }
          return res.status(401).json({
            responseCode: 401,
            responseMessage: "Admin not authorized.",
          });
        }
  
        const admin = await db.admin.findOne({ where: { id: decoded.id } });
        if (!admin) {
          return res.status(404).json({
            responseCode: 404,
            responseMessage: "Admin not found.",
          });
        }
  
        // ✅ Save both
        req.adminId = admin.id;  // easy access
        req.admin = admin;       // if you need full admin object
        next();
      });
    } catch (error) {
      console.error("Admin token verification error:", error);
      return res.status(500).json({
        responseCode: 500,
        responseMessage: "Internal Server Error.",
      });
    }
  };
  





  export const verifyUserToken = async (req, res, next) => {
    try {
      const authHeader = req.headers["authorization"];
      if (!authHeader) {
        return res.status(401).json({
          responseCode: 401,
          responseMessage: "No token provided.",
        });
      }
  
      const token = authHeader.split(" ")[1];
      if (!token) {
        return res.status(401).json({
          responseCode: 401,
          responseMessage: "Invalid token format.",
        });
      }
  
      jwt.verify(token, finalConfig.jwtsecret || "sahdiash8@##$7379487", async (err, decoded) => {
        if (err) {
          if (err.name === "TokenExpiredError") {
            return res.status(440).json({
              responseCode: 440,
              responseMessage: "Session expired, please login again.",
            });
          }
          return res.status(401).json({
            responseCode: 401,
            responseMessage: "User not authorized.",
          });
        }
  
        // ✅ Use decoded.userId (because that's what you signed in token)
        const user = await db.users.findOne({ where: { id: decoded.userId } });
        if (!user) {
          return res.status(404).json({
            responseCode: 404,
            responseMessage: "User not found.",
          });
        }
  
        // ✅ Save correctly
        req.userId = user.id;
        req.user = user;
        next();
      });
    } catch (error) {
      console.error("User token verification error:", error);
      return res.status(500).json({
        responseCode: 500,
        responseMessage: "Internal Server Error.",
      });
    }
  };
  

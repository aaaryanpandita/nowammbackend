import "dotenv/config";
import Joi from "joi";
import { ethers } from "ethers";
import apiError from "../../../../helper/apiError.js";
import response from "../../../../../assets/response.js";
import responseMessage from "../../../../../assets/responseMessage.js";
import db from "../../../../helper/tableSync.js";

console.log("the key is",process.env.PRIVATE_KEY)
const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
const operator  = new ethers.Wallet(process.env.PRIVATE_KEY, provider);


const factoryAbi = [
  "function getVaultAddress(address token0, address token1) external view returns (address)"
];

const vaultAbi = [
  "function operatorWithdraw(address token, address to, uint256 amount) external"
];

const erc20Abi = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address account) view returns (uint256)"
];


// ─── Helpers ──────────────────────────────────────────────────────────────────

async function approveToken(tokenAddress, spenderAddress, signer) {
  const token = new ethers.Contract(tokenAddress, erc20Abi, signer);
  const tx    = await token.approve(spenderAddress, ethers.MaxUint256);
  await tx.wait();
  console.log("Approved token: " + tokenAddress);
}

async function authenticateWallet(wallet) {
  const nonceRes  = await fetch("https://nowapi-orderbook.tarality.io/api/auth/nonce?address=" + wallet.address);
  const nonceData = await nonceRes.json();
  if (!nonceData.success) throw new Error("Failed to get nonce");
  const signature = await wallet.signMessage(nonceData.message);
  const loginRes  = await fetch("https://nowapi-orderbook.tarality.io/api/auth/login", {
    method : "POST",
    headers: { "Content-Type": "application/json" },
    body   : JSON.stringify({ address: wallet.address, message: nonceData.message, signature: signature })
  });
  const loginData = await loginRes.json();
  if (!loginData.success) throw new Error("Login failed: " + loginData.error);
  return loginData.tokens.accessToken;
}

async function getVaultAddress(token0, token1) {
  const factory = new ethers.Contract(process.env.ARYU_FACTORY_ADDRESS, factoryAbi, provider);
  return await factory.getVaultAddress(token0, token1);
}

async function getVaultToken0Balance(vaultAddress, token0Address) {
  const token   = new ethers.Contract(token0Address, erc20Abi, provider);
  const balance = await token.balanceOf(vaultAddress);
  console.log("Vault token0 balance: " + balance.toString());
  return BigInt(balance.toString());
}


// ─── Step 1: Withdraw 50% from vault, trade 50% of that = 25% total ──────────
//
//   vaultBalance   = full token0 in vault
//   withdrawAmount = vaultBalance / 2       <- withdraw 50%
//   tradeAmount    = withdrawAmount / 2     <- trade 50% of withdrawn = 25% total
//
async function operatorWithdrawAndGetTradeAmount(vaultAddress, token0Address, totalBalance) {
  const vault = new ethers.Contract(vaultAddress, vaultAbi, operator);

  const withdrawAmount = totalBalance / BigInt(2);
  const tradeAmount    = withdrawAmount / BigInt(2);

  console.log("Total vault balance   : " + totalBalance.toString());
  console.log("Withdraw amount (50%) : " + withdrawAmount.toString());
  console.log("Trade amount    (25%) : " + tradeAmount.toString());

  const tx      = await vault.operatorWithdraw(token0Address, operator.address, withdrawAmount);
  const receipt = await tx.wait();
  console.log("Withdraw TX: " + receipt.hash);

  return { withdrawAmount: withdrawAmount, tradeAmount: tradeAmount, withdrawTxHash: receipt.hash };
}


// ─── Step 2: Market SELL with IOC ─────────────────────────────────────────────

async function submitMarketSellOrder(authToken, tradeAmount, token0, token1, pairSymbol) {

  // Fetch best bid
  const obRes  = await fetch("https://nowapi-orderbook.tarality.io/api/orderbook/" + pairSymbol);
  const obData = await obRes.json();

  if (!obData.success || !obData.data || !obData.data.bids || obData.data.bids.length === 0) {
    throw new Error("No bids in orderbook");
  }

  const bestBidPrice = obData.data.bids[0][0];
  const bestBidQty   = obData.data.bids[0][1];
  console.log("Best bid price: " + bestBidPrice + " | qty: " + bestBidQty);

  // Token decimals
  const tokenContract = new ethers.Contract(token0, erc20Abi, provider);
  const decimals      = await tokenContract.decimals();

  // finalQty = min(25% tradeAmount, best bid qty)
  const tradeAmountFormatted = Number(ethers.formatUnits(tradeAmount, decimals));
  const availableQty         = Number(bestBidQty);
  const finalQty             = Math.min(tradeAmountFormatted, availableQty);

  console.log("Trade amount (25%) : " + tradeAmountFormatted);
  console.log("Available bid qty  : " + availableQty);
  console.log("Final sell qty     : " + finalQty);

  if (finalQty <= 0) throw new Error("Final trade quantity is 0 — no liquidity");

  const amountRaw    = Math.floor(finalQty * 1e8).toString();
  const quantityStr  = finalQty.toString();
  const currentNonce = Date.now();

  // Approve token0 against contract
  await approveToken(token0, process.env.CONTRACT_ADDRESS, operator);

  // Build libOrder — market + IOC
  const libOrder = {
    userAddress      : operator.address,
    baseToken        : token0,
    quoteToken       : token1,
    amount           : amountRaw,
    isAmountInQuote  : false,
    nonce            : currentNonce,
    orderType        : 0,
    side             : 1,
    limitPrice       : "0",
    stopPrice        : "0",
    timeInForce      : 2,
    cancelAfter      : "0",
    balanceSnapshot  : "0",
    allowanceSnapshot: "0"
  };

  // Get order hash and sign
  const contract = new ethers.Contract(
    process.env.CONTRACT_ADDRESS,
    ["function getOrderHash(tuple(address userAddress,address baseToken,address quoteToken,uint64 amount,bool isAmountInQuote,uint128 nonce,uint8 orderType,uint8 side,uint64 limitPrice,uint64 stopPrice,uint8 timeInForce,uint64 cancelAfter,bytes walletSignature,uint64 balanceSnapshot,uint64 allowanceSnapshot) order) view returns (bytes32)"],
    provider
  );

  const orderForHash       = Object.assign({}, libOrder, { walletSignature: "0x" });
  const orderHash          = await contract.getOrderHash(orderForHash);
  const personalSignature  = await operator.signMessage(ethers.getBytes(orderHash));
  libOrder.walletSignature = personalSignature;

  const payload = {
    pairSymbol   : pairSymbol,
    side         : "sell",
    type         : "market",
    quantity     : quantityStr,
    stopPrice    : "0",
    timeInForce  : "IOC",
    signature    : personalSignature,
    signingScheme: "personal-v1",
    nonce        : currentNonce,
    libOrder     : libOrder
  };

  console.log("Submitting order payload: " + JSON.stringify(payload, null, 2));

  const placedAt = new Date().toISOString();

  const orderRes  = await fetch("https://nowapi-orderbook.tarality.io/api/orders", {
    method : "POST",
    headers: {
      "Content-Type" : "application/json",
      "Authorization": "Bearer " + authToken
    },
    body: JSON.stringify(payload)
  });

  const orderData     = await orderRes.json();
  orderData._placedAt = placedAt;

  console.log("Order response: " + JSON.stringify(orderData, null, 2));
  return { orderData: orderData, quantityStr: quantityStr };
}


// ─── Step 3: Poll trades for txHash — DB save ONLY after txHash confirmed ─────

async function fetchTxHashFromOrderbook(orderId, pairSymbol, authToken, placedAt, retries, delayMs) {
  retries = retries || 20;
  delayMs = delayMs || 3000;

  console.log("Polling /api/trades for txHash (orderId: " + orderId + ")...");

  for (var i = 0; i < retries; i++) {
    await new Promise(function(r) { return setTimeout(r, delayMs); });

    try {
      const res    = await fetch("https://nowapi-orderbook.tarality.io/api/trades?page=1&limit=50", {
        headers: { "Authorization": "Bearer " + authToken }
      });
      const data   = await res.json();
      const trades = (data && data.data) ? data.data : [];

      // Primary: match by orderId
      var matched = null;
      for (var j = 0; j < trades.length; j++) {
        if (trades[j].orderId === orderId && trades[j].txHash) {
          matched = trades[j];
          break;
        }
      }

      // Fallback: side + pairSymbol + executedAt >= placedAt
      if (!matched) {
        for (var k = 0; k < trades.length; k++) {
          var t = trades[k];
          if (
            t.side       === "sell" &&
            t.pairSymbol === pairSymbol &&
            new Date(t.executedAt) >= new Date(placedAt) &&
            t.txHash
          ) {
            matched = t;
            break;
          }
        }
      }

      console.log("[" + (i + 1) + "] trades: " + trades.length + " | matched: " + !!matched + " | txHash: " + (matched && matched.txHash ? matched.txHash : "null"));

      if (matched && matched.txHash) {
        console.log("txHash found: " + matched.txHash);
        return {
          txHash  : matched.txHash,
          txStatus: "confirmed",
          price   : matched.price    || "0",
          quantity: matched.quantity || "0"
        };
      }
    } catch (err) {
      console.log("Poll attempt " + (i + 1) + " failed: " + err.message);
    }
  }

  console.log("txHash not found within timeout for orderId: " + orderId);
  return null;
}


// ─── Controller ───────────────────────────────────────────────────────────────

class tradeController {

  /**
   * @swagger
   * /trade/executeTrade:
   *   post:
   *     tags:
   *       - TRADE
   *     summary: Execute a market SELL trade (token0 to token1)
   *     description: Checks vault balance of token0. Withdraws 50%. Trades 25% of total (50% of withdrawn). Places market SELL IOC order. Saves to DB only after txHash confirmed.
   *     parameters:
   *       - in: query
   *         name: token0
   *         required: true
   *         type: string
   *         example: "0xWETH_ADDRESS"
   *       - in: query
   *         name: token1
   *         required: true
   *         type: string
   *         example: "0xNUSD_ADDRESS"
   *       - in: query
   *         name: pairSymbol
   *         required: true
   *         type: string
   *         example: "WETH_NUSD"
   *     responses:
   *       200:
   *         description: Trade executed and saved to DB
   *       400:
   *         description: Validation error or no vault balance
   *       500:
   *         description: Internal server error
   */
  async executeTrade(req, res, next) {
    const validSchema = Joi.object({
      token0    : Joi.string().required(),
      token1    : Joi.string().required(),
      pairSymbol: Joi.string().required()
    });

    try {
      const { error, value } = validSchema.validate(req.query);
      if (error) throw apiError.badRequest(error.details[0].message);
      const { token0, token1, pairSymbol } = value;

      // Step 1 — Vault address
      const vaultAddress = await getVaultAddress(token0, token1);
      console.log("Vault address: " + vaultAddress);

      // Step 2 — Vault token0 balance
      const vaultBalance = await getVaultToken0Balance(vaultAddress, token0);
      if (vaultBalance.toString() === "0") {
        throw apiError.badRequest("Vault has no token0 balance (" + token0 + ") — nothing to trade");
      }

      // Step 3 — Withdraw 50%, get tradeAmount = 25% of total
      const withdrawResult = await operatorWithdrawAndGetTradeAmount(vaultAddress, token0, vaultBalance);
      console.log("Withdraw TX  : " + withdrawResult.withdrawTxHash);
      console.log("Trade amount : " + withdrawResult.tradeAmount.toString());

      // Step 4 — Auth
      const authToken = await authenticateWallet(operator);

      // Step 5 — Market sell IOC with 25% amount
      const orderResult = await submitMarketSellOrder(
        authToken,
        withdrawResult.tradeAmount,
        token0,
        token1,
        pairSymbol
      );

      const orderData = orderResult.orderData;
      const orderId   = (orderData && orderData.data && orderData.data.id) ? orderData.data.id : null;
      const placedAt  = orderData._placedAt;
      console.log("Order ID: " + orderId);

      // Step 6 — Wait for txHash — DB save ONLY after this ✅
      const matchedTrade = await fetchTxHashFromOrderbook(orderId, pairSymbol, authToken, placedAt, 20, 3000);

      if (!matchedTrade || !matchedTrade.txHash) {
        throw apiError.badRequest("Trade submitted but txHash not received — orderId: " + orderId);
      }

      console.log("txHash confirmed: " + matchedTrade.txHash);

      // Step 7 — Save to DB only after txHash confirmed ✅
      const trade = await db.trades.create({
        orderId        : orderId,
        txHash         : matchedTrade.txHash,
        status         : matchedTrade.txStatus || "confirmed",
        side           : "sell",
        type           : "market",
        quantity       : orderResult.quantityStr,
        price          : matchedTrade.price || "0",
        pairSymbol     : pairSymbol,
        baseToken      : token0,
        quoteToken     : token1,
        withdrawTxHash : withdrawResult.withdrawTxHash
      });

      // Step 8 — Respond
      return res.json(new response({ trade: trade }, responseMessage.TRADE_EXECUTED));

    } catch (error) {
      if (error && error.code && typeof error.code === "string" && isNaN(Number(error.code))) {
        return res.status(500).json({
          responseCode   : 500,
          responseMessage: "Blockchain error: " + (error.reason || error.shortMessage || error.message || error.code)
        });
      }
      return next(error);
    }
  }

  /**
   * @swagger
   * /trade/getTrades:
   *   get:
   *     tags:
   *       - TRADE
   *     summary: Get all trades
   *     parameters:
   *       - in: query
   *         name: page
   *         type: integer
   *         example: 1
   *       - in: query
   *         name: limit
   *         type: integer
   *         example: 10
   *       - in: query
   *         name: status
   *         type: string
   *         example: "confirmed"
   *     responses:
   *       200:
   *         description: Trades fetched successfully
   *       500:
   *         description: Internal server error
   */
  async getTrades(req, res, next) {
    try {
      const page   = req.query.page   ? Number(req.query.page)  : 1;
      const limit  = req.query.limit  ? Number(req.query.limit) : 10;
      const status = req.query.status || null;
      const offset = (page - 1) * limit;

      const whereClause = {};
      if (status) whereClause.status = status;

      const result = await db.trades.findAndCountAll({
        where : whereClause,
        limit : limit,
        offset: offset,
        order : [["createdAt", "DESC"]]
      });

      return res.json(new response({
        totalTrades: result.count,
        currentPage: page,
        totalPages : Math.ceil(result.count / limit),
        trades     : result.rows
      }, responseMessage.TRADES_FETCHED));

    } catch (error) {
      return next(error);
    }
  }
}

export default new tradeController();
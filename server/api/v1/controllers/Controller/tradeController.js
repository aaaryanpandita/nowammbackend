import "dotenv/config";
import Joi from "joi";
import { ethers } from "ethers";
import apiError from "../../../../helper/apiError.js";
import response from "../../../../../assets/response.js";
import responseMessage from "../../../../../assets/responseMessage.js";
import db from "../../../../helper/tableSync.js";

const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
const operator = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

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

async function signOrder(order, signer) {
  const encoded = ethers.solidityPacked(
    ["address", "address", "address", "uint64", "bool", "uint128", "uint8", "uint8", "uint64", "uint64", "uint8", "uint64", "uint64", "uint64"],
    [order.userAddress, order.baseToken, order.quoteToken, order.amount, order.isAmountInQuote, order.nonce, order.orderType, order.side, order.limitPrice, order.stopPrice, order.timeInForce, order.cancelAfter, order.balanceSnapshot, order.allowanceSnapshot]
  );
  const hash = ethers.keccak256(encoded);
  return await signer.signMessage(ethers.getBytes(hash));
}

async function approveToken(tokenAddress, spenderAddress, signer) {
  const token = new ethers.Contract(tokenAddress, erc20Abi, signer);
  const tx = await token.approve(spenderAddress, ethers.MaxUint256);
  await tx.wait();
  console.log("Approved token0: " + tokenAddress);
}

async function authenticateWallet(wallet) {
  const nonceRes = await fetch("https://nowapi-orderbook.tarality.io/api/auth/nonce?address=" + wallet.address);
  const nonceData = await nonceRes.json();
  if (!nonceData.success) throw new Error("Failed to get nonce");
  const signature = await wallet.signMessage(nonceData.message);
  const loginRes = await fetch("https://nowapi-orderbook.tarality.io/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address: wallet.address, message: nonceData.message, signature: signature })
  });
  const loginData = await loginRes.json();
  if (!loginData.success) throw new Error("Login failed: " + loginData.error);
  return loginData.tokens.accessToken;
}

async function getVaultAddress(token0, token1) {
  const factory = new ethers.Contract(process.env.ARYU_FACTORY_ADDRESS, factoryAbi, provider);
  return await factory.getVaultAddress(token0, token1);
}

// ===== CHECK VAULT BALANCE OF TOKEN0 =====
// token0 contract ka balanceOf(vaultAddress) call karo
async function getVaultToken0Balance(vaultAddress, token0Address) {
  const token = new ethers.Contract(token0Address, erc20Abi, provider);
  const balance = await token.balanceOf(vaultAddress);
  console.log("Vault token0 balance (from token contract): " + balance.toString());
  return BigInt(balance.toString());
}

async function operatorWithdrawHalfToken0(vaultAddress, token0Address, totalBalance) {
  const vault = new ethers.Contract(vaultAddress, vaultAbi, operator);

  const withdrawAmount = totalBalance / BigInt(2);
  const tradeAmount = withdrawAmount / BigInt(2);

  console.log("Withdrawing token0 amount: " + withdrawAmount.toString());

  // ✅ operator.address as `to` — tokens operator ke wallet mein aayenge
  const tx = await vault.operatorWithdraw(token0Address, operator.address, withdrawAmount);
  const receipt = await tx.wait();
  console.log("Withdraw TX (token0): " + receipt.hash);

  return { withdrawAmount, tradeAmount, withdrawTxHash: receipt.hash };
}

// ===== MARKET SELL token0 → receive token1 =====
async function submitMarketSellOrder(authToken, tradeAmount, token0, token1, pairSymbol, vaultAddress) {

   const bestBidPrice = await getBestBid(pairSymbol);
  console.log("Best bid price:", bestBidPrice);

  const tokenContract = new ethers.Contract(token0, erc20Abi, provider);
  const decimals = await tokenContract.decimals();

  const amountInPips = Number(ethers.formatUnits(tradeAmount, decimals)) * 1e8;
  const amountPips = BigInt(Math.floor(amountInPips));
  const quantityString = ethers.formatUnits(tradeAmount, decimals);
  const currentNonce = BigInt(Math.floor(Date.now() / 1000));
const limitPricePips = BigInt(Math.floor(Number(bestBidPrice) * 1e8));
  // Approve token0 (the token we are selling)
  await approveToken(token0, vaultAddress, operator);

  const ZERO = BigInt(0);

  const sellOrder = {
    userAddress: operator.address,
    baseToken: token0,           // token0 is always baseToken (what we sell)
    quoteToken: token1,           // token1 is always quoteToken (what we receive)
    amount: amountPips,
    isAmountInQuote: false,        // amount is in token0 units
    nonce: currentNonce,
    orderType: 0,               // market
    side: 1,               // sell
    limitPrice: limitPricePips,
    stopPrice: ZERO,
    timeInForce: 0,
    cancelAfter: ZERO,
    balanceSnapshot: ZERO,
    allowanceSnapshot: ZERO,
    walletSignature: "0x"
  };

  sellOrder.walletSignature = await signOrder(sellOrder, operator);

  const payload = {
    orderData: {
      userAddress: sellOrder.userAddress,
      baseToken: sellOrder.baseToken,
      quoteToken: sellOrder.quoteToken,
      amount: sellOrder.amount.toString(),
      isAmountInQuote: sellOrder.isAmountInQuote,
      nonce: sellOrder.nonce.toString(),
      orderType: sellOrder.orderType,
      side: sellOrder.side,
      limitPrice: sellOrder.limitPrice.toString(),
      stopPrice: sellOrder.stopPrice.toString(),
      timeInForce: sellOrder.timeInForce,
      cancelAfter: sellOrder.cancelAfter.toString(),
      walletSignature: sellOrder.walletSignature,
      balanceSnapshot: sellOrder.balanceSnapshot.toString(),
      allowanceSnapshot: sellOrder.allowanceSnapshot.toString()
    },
    side: "sell",
    type: "market",
    quantity: quantityString,
    price: "0",
    pairSymbol: pairSymbol
  };

  const orderRes = await fetch("https://nowapi-orderbook.tarality.io/api/orders", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + authToken
    },
    body: JSON.stringify(payload)
  });

  const orderData = await orderRes.json();
  console.log("Order response:", orderData);
  return { orderData, quantityString };
}


// ===== FETCH txHash + txStatus FROM ORDERBOOK AFTER ORDER SUBMIT =====
async function fetchTxHashFromOrderbook(orderId, pairSymbol, retries, delayMs) {
  retries = retries || 8;
  delayMs = delayMs || 3000;

  for (var i = 0; i < retries; i++) {
    try {
      var url = "https://nowapi-orderbook.tarality.io/api/market/trades/" + pairSymbol + "?limit=50";
      var res = await fetch(url);
      var data = await res.json();

      if (data && data.success && data.data && data.data.length > 0) {
        // Match our orderId against takerOrderId OR makerOrderId
        var match = null;
        for (var j = 0; j < data.data.length; j++) {
          var t = data.data[j];
          if (t.takerOrderId === orderId || t.makerOrderId === orderId) {
            match = t;
            break;
          }
        }

        if (match) {
          console.log("Matched trade from orderbook:", match.id, "txHash:", match.txHash);
          return {
            txHash: match.txHash || null,
            txStatus: (match.metadata && match.metadata.txStatus) || "pending",
            tradeId: match.id,
            price: match.price || "0",
            quantity: match.quantity || "0"
          };
        }
      }
    } catch (err) {
      console.log("fetchTxHash attempt " + (i + 1) + " failed: " + err.message);
    }

    // Wait before next retry
    if (i < retries - 1) {
      await new Promise(function (r) { setTimeout(r, delayMs); });
    }
  }

  console.log("Could not find txHash for orderId: " + orderId + " after " + retries + " retries");
  return null;
}

async function getBestBid(pairSymbol) {
  const res = await fetch("https://nowapi-orderbook.tarality.io/api/market/orderbook/" + pairSymbol);
  const data = await res.json();
  if (data && data.data && data.data.bids && data.data.bids.length > 0) {
    return data.data.bids[0][0]; // "5800.000000000000000000"
  }
  throw new Error("No bids available in orderbook");
}

class tradeController {


  
  /**
   * @swagger
   * /trade/executeTrade:
   *   post:
   *     tags:
   *       - TRADE
   *     summary: Execute a market SELL trade (token0 to token1)
   *     description: Checks vault balance of token0. Withdraws 50% via operatorWithdraw. Uses 50% of withdrawn to place a market SELL order (sell token0, receive token1). Saves trade to DB.
   *     parameters:
   *       - in: query
   *         name: token0
   *         required: true
   *         type: string
   *         description: Address of token0 (baseToken) - the token you SELL e.g. WETH address
   *         example: "0xWETH_ADDRESS"
   *       - in: query
   *         name: token1
   *         required: true
   *         type: string
   *         description: Address of token1 (quoteToken) - the token you RECEIVE e.g. NUSD address
   *         example: "0xNUSD_ADDRESS"
   *       - in: query
   *         name: pairSymbol
   *         required: true
   *         type: string
   *         description: Trading pair symbol e.g. WETH_NUSD
   *         example: "WETH_NUSD"
   *     responses:
   *       200:
   *         description: Trade executed and saved to DB successfully
   *       400:
   *         description: Validation error or vault has zero token0 balance
   *       500:
   *         description: Internal server error
   */


  

async executeTrade(req, res, next) {
  const validSchema = Joi.object({
    token0: Joi.string().required(),
    token1: Joi.string().required(),
    pairSymbol: Joi.string().required()
  });
  try {
    const { error, value } = validSchema.validate(req.query);
    if (error) throw apiError.badRequest(error.details[0].message);
    const { token0, token1, pairSymbol } = value;

    // Step 1 — Get vault address from factory using (token0, token1)
    const vaultAddress = await getVaultAddress(token0, token1);
    console.log("Vault address: " + vaultAddress);

    // Step 2 — Check token0 balance in vault (we only ever sell token0)
    const vaultBalance = await getVaultToken0Balance(vaultAddress, token0);
    console.log("Vault token0 balance: " + vaultBalance.toString());

    if (vaultBalance.toString() === "0") {
      throw apiError.badRequest("Vault has no token0 balance (" + token0 + ") — nothing to trade");
    }

    // Step 3 — Withdraw 50% of token0 from vault; trade with 50% of that
    const withdrawResult = await operatorWithdrawHalfToken0(vaultAddress, token0, vaultBalance);
    console.log("Withdrawn token0 amount : " + withdrawResult.withdrawAmount.toString());
    console.log("Trade token0 amount     : " + withdrawResult.tradeAmount.toString());

    // Step 4 — Authenticate operator wallet
    const authToken = await authenticateWallet(operator);

    // Step 5 — Place market SELL order: spend token0, receive token1
    const orderResult = await submitMarketSellOrder(
      authToken,
      withdrawResult.tradeAmount,
      token0,
      token1,
      pairSymbol,
      vaultAddress
    );

    // Step 6 — Extract orderId from order submit response
    const orderData = orderResult.orderData;
    const orderId = (orderData && orderData.data && orderData.data.id) || null;
    console.log("Submitted orderId:", orderId);

    // Step 7 — Wait for txHash (blocking — response tabhi aayega)
    const matchedTrade = await fetchTxHashFromOrderbook(orderId, pairSymbol, 20, 5000);

    if (!matchedTrade || !matchedTrade.txHash) {
      throw apiError.badRequest("Trade submitted but txHash nahi mila — orderId: " + orderId);
    }

    console.log("txHash mila:", matchedTrade.txHash, "status:", matchedTrade.txStatus);

    // Step 8 — DB mein save karo jab txHash aa gaya
    const trade = await db.trades.create({
      orderId,
      txHash: matchedTrade.txHash,
      status: matchedTrade.txStatus || "confirmed",
      side: "sell",
      type: "market",
      quantity: orderResult.quantityString,
      price: matchedTrade.price || "0",
      pairSymbol,
      baseToken: token0,
      quoteToken: token1,
      withdrawTxHash: withdrawResult.withdrawTxHash
    });

    // Step 9 — Ab response do — txHash + confirmed status ke saath
    return res.json(new response({ trade }, responseMessage.TRADE_EXECUTED));

  } catch (error) {
    if (error && error.code && typeof error.code === "string" && isNaN(Number(error.code))) {
      return res.status(500).json({
        responseCode: 500,
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
   *     description: Fetch all trade records from the database. Every trade is a market SELL of token0 in exchange for token1. Supports pagination and optional status filter.
   *     parameters:
   *       - in: query
   *         name: page
   *         required: false
   *         type: integer
   *         description: Page number (default 1)
   *         example: 1
   *       - in: query
   *         name: limit
   *         required: false
   *         type: integer
   *         description: Records per page (default 10)
   *         example: 10
   *       - in: query
   *         name: status
   *         required: false
   *         type: string
   *         description: Filter by trade status e.g. submitted, filled, cancelled
   *         example: "submitted"
   *     responses:
   *       200:
   *         description: Trades fetched successfully
   *       500:
   *         description: Internal server error
   */
  async getTrades(req, res, next) {
    try {
      const page = req.query.page ? Number(req.query.page) : 1;
      const limit = req.query.limit ? Number(req.query.limit) : 10;
      const status = req.query.status || null;
      const offset = (page - 1) * limit;

      const whereClause = {};
      if (status) whereClause.status = status;

      const result = await db.trades.findAndCountAll({
        where: whereClause,
        limit: limit,
        offset: offset,
        order: [["createdAt", "DESC"]]
      });

      return res.json(new response({
        totalTrades: result.count,
        currentPage: page,
        totalPages: Math.ceil(result.count / limit),
        trades: result.rows
      }, responseMessage.TRADES_FETCHED));
    } catch (error) {
      return next(error);
    }
  }
}

export default new tradeController();
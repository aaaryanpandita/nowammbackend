import crypto from "crypto";
//import db from './tableSync.js';


export const generateReferralCode = () => {
  const prefix = "NOWA";
  const randomNumber = crypto.randomInt(100000000, 999999999).toString();
  return `${prefix}${randomNumber}`;
};


export const formatDate = (date) => {
    const d = new Date(date);
    return d.toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata", // Converts UTC to IST
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  };


  export function getCurrentIST() {
    // Convert current UTC time to IST (UTC+5:30)
    const now = new Date();
    const nowUTC = now.getTime() + now.getTimezoneOffset() * 60000;
    const istOffset = 5.5 * 60 * 60000; // 5 hours 30 minutes in ms
    return new Date(nowUTC + istOffset);
  }
  


  export async function rewardParentIfEligible(user) {
    try {
      // ✅ Reward only if both tasks are done
      if (!(user.socialTasksCompleted && user.referralTasksCompleted)) return;
  
      if (!user.parentReferralCode) return;
  
      // ✅ Find parent user by referralCode
      const parentUser = await db.users.findOne({
        where: { referralCode: user.parentReferralCode },
      });
      if (!parentUser) return;
  
      // ✅ Check if already rewarded for this parent-child pair
      const existingReward = await db.referralrewardHistory.findOne({
        where: { 
          parentWalletAddress: parentUser.walletAddress,
          childWalletAddress: user.walletAddress
        },
      });
      if (existingReward) return; // Prevent duplicate reward
  
      // ✅ Get latest reward config from admin
      const rewardConfig = await db.refferalreward.findOne({
        order: [["createdAt", "DESC"]],
      });
  
      if (rewardConfig && rewardConfig.refferedreward > 0) {
        const tokens = rewardConfig.refferedreward;
  
        // Save reward history
        await db.referralrewardHistory.create({
          parentWalletAddress: parentUser.walletAddress,
          childWalletAddress: user.walletAddress,
          rewardTokens: tokens,
          status: "credited",
        });
  
        // Update parent's token balance
        parentUser.tokens = (parentUser.tokens || 0) + tokens;
        await parentUser.save();
  
        console.log(
          `Rewarded ${tokens} tokens to parent ${parentUser.walletAddress} for child ${user.walletAddress}`
        );
      }
    } catch (err) {
      console.error("Reward distribution failed:", err);
    }
  }
  
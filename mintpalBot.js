const ethers = require('ethers');
const fs = require('fs');
require("dotenv").config();
// const mintPalAbi = require("./mintpal-share-v1.json")

/*
  Main trading bot which buys shares as soon as someone signs up
  Some quality checks to prevent anti-frontrunner bots based on
  previously seen account balances.
  Also checks users wallet balance and buys up to 3 shares
  depending on how much funds they have in their wallet.
  Price checks to prevent getting frontrun.
*/

const contractAddress = process.env.CONTRACT_ADDRESS;
const enableCheckBot = process.env.ENABLE_BOT_CHECK == "1";
const provider = new ethers.JsonRpcProvider(process.env.RPC_URL); // https://base.blockpi.network/v1/rpc/public

const wallet = new ethers.Wallet(process.env.PRIVATE_KEY);
const account = wallet.connect(provider);

const mintpal = new ethers.Contract(
  contractAddress,
  [
    'function buyShares(address arg0, uint256 arg1)',
    'function getBuyPriceAfterFee(address sharesSubject, uint256 amount) public view returns (uint256)',
    'event Trade(address trader, address subject, bool isBuy, uint256 shareAmount, uint256 ethAmount, uint256 protocolEthAmount, uint256 subjectEthAmount, uint256 holderEthAmount, uint256 referralEthAmount, uint256 supply)',
  ],
  account
);

const balanceArray = [];

const run = async () => {
  let filter = mintpal.filters.Trade(null,null,null,null,null,null,null,null,null,null);

  mintpal.on(filter, async (event) => {
    console.log(event.args);
    if (event.args[2] == true) {
      if (event.args[9] <= 1n || (event.args[9] <= 4n && event.args[0] == event.args[1]))  {
        const amigo = event.args[1];
        const weiBalance = await provider.getBalance(amigo);

        if (enableCheckBot) {
          // bot check
          for (const botBalance in balanceArray) {
            if (weiBalance > botBalance - 300000000000000 && weiBalance < botBalance + 300000000000000) {
              console.log('Bot detected: ', amigo);
              return false;
            }
          }
          // bot check 2
          if (weiBalance > 95000000000000000 && weiBalance < 105000000000000000) { // 0.1
            console.log('Bot detected 2: ', amigo);
            return false;
          }
          balanceArray.push(weiBalance);
          // if (balanceArray.length < 10) return false;
          if (balanceArray.length > 20) balanceArray.shift();
        }

        if (weiBalance >= 30000000000000000) { // 0.03 ETH
          let qty = 1;
          if (weiBalance >= 90000000000000000) qty = 2;
          if (weiBalance >= 900000000000000000) qty = 3;
          
          //const buyPrice = 893750000000000 * qty * qty; //await mintpal.getBuyPriceAfterFee(amigo, qty);
          const buyPrice = await mintpal.getBuyPriceAfterFee(amigo, qty);
          console.log(`BUY PRICE: ${buyPrice} ${event.args[9]}`)
          if (qty < 2 && buyPrice > 2000000000000000) return false; // 0.001
          if (buyPrice > 10000000000000000) return false; // 0.01
          console.log('### BUY ###', amigo, buyPrice);
          const tx = await mintpal.buyShares(amigo, qty, {value: buyPrice});
          fs.appendFileSync('./buys.txt', amigo+"\n");
          try {
            const receipt = await tx.wait();
            console.log('Transaction Mined:', receipt.blockNumber);
          } catch (error) {
            console.log('Transaction Failed:', error);
          }
        } else {
          console.log(`No Money No Honey: ${amigo} ${weiBalance}`);
        }
      }
    }
  });
}

try {
  run();
} catch (error) {
  console.error('ERR:', error);
}

process.on('uncaughtException', error => {
  console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Promise Rejection:', reason);
});
# Blackhole Testnet Bot

A fully automated bot for Blackhole Router on Avalanche Fuji Testnet.

---

## 🔧 Features

- ✅ Supports multiple private keys (wallets) from `.env`
- 🧠 Random swap order and amount (1–5 tokens)
- 💤 Includes delay per wallet and cooldown between cycles
- 👻 Designed to look like human-like, non-bot activity

---

## 📦 Requirements

- Node.js v18+
- A `.env` file in the root directory containing one private key per line (no prefix like `PRIVATE_KEY=`, just plain keys)
- Sufficient testnet tokens (BLACK, BTC, SUPER, USDC) on Avalanche Fuji
- Internet connection

---

## 🚀 How to Run

1. **Install dependencies:**

   ```bash
   npm install
   ```

2. **Create `.env` file with your private keys:**

   ```
   0xabc123...
   0xdef456...
   ...
   ```

3. **Run the bot:**

   ```bash
   node index.js
   ```

---

## 🛠 Tech Stack

- [viem](https://viem.sh) – Ethereum-compatible client library
- Node.js (ESM)
- Avalanche Fuji Testnet
- Native JavaScript `timers` and `readline` modules

---

## ⚠️ Disclaimer

- This project is for **testing and educational purposes only**.
- Use only on **Avalanche Fuji Testnet**.
- The code is unaudited. You are responsible for any actions taken with your private keys.
- Do **not** use this script on mainnet or with real funds.

---

Happy testing!

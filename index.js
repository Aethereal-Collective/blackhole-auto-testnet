import fs from "fs";
import { setTimeout as wait } from "timers/promises";
import { swapToken } from "./utils/swap.js";

const privateKeys = fs
	.readFileSync(".env", "utf-8")
	.split("\n")
	.map((line) => line.trim())
	.filter(Boolean);

const tokens = ["BTC", "SUPER", "USDC"];
const walletDelayMs = 30 * 1000;

function randomMs(minMinutes, maxMinutes) {
	const min = minMinutes * 60 * 1000;
	const max = maxMinutes * 60 * 1000;
	return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function main() {
	console.log(`🚀 Starting swap bot for ${privateKeys.length} accounts...\n`);

	while (true) {
		const token = tokens[Math.floor(Math.random() * tokens.length)];
		const amount = Math.floor(Math.random() * 5) + 1;

		for (const [i, pk] of privateKeys.entries()) {
			const label = `Account ${i + 1}`;

			try {
				console.log(`🔁 ${label}: Swapping ${amount} BLACK → ${token}`);
				await swapToken("BLACK", token, String(amount), false, pk);

				console.log(`Waiting for ${walletDelayMs / 1000} seconds before next swap...`);
				await wait(walletDelayMs);

				console.log(`🔁 ${label}: Swapping MAX ${token} → BLACK`);
				await swapToken(token, "BLACK", "max", true, pk);
			} catch (err) {
				console.error(`❌ Error in ${label}:`, err.message || err);
			}

			console.log(`✅ ${label} done. Waiting for ${walletDelayMs / 1000} seconds before next account...\n`);
			await wait(walletDelayMs);
		}

		const cooldown = randomMs(60, 120);
		console.log(`⏳ All wallets done. Sleeping for ${(cooldown / 60000).toFixed(2)} minutes before next round...\n`);
		await wait(cooldown);
	}
}

main().catch(console.error);

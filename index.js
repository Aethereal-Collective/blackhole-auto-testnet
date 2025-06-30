import readline from "readline";
import { setTimeout as wait } from "timers/promises";
import { swapToken } from "./utils/swap.js";

function ask(question) {
	const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
	return new Promise((resolve) =>
		rl.question(question, (answer) => {
			rl.close();
			resolve(answer);
		})
	);
}

async function main() {
	const input = await ask("⏱️ Enter the interval between swaps (in minutes): ");
	const intervalMs = parseInt(input) * 60 * 1000;

	if (isNaN(intervalMs) || intervalMs <= 0) {
		console.error("❌ Invalid interval. Please enter a number greater than 0.");
		return;
	}

	console.log(`\n🚀 Starting the swap bot with an interval of ${input} minutes...\n`);

	while (true) {
		const tokens = ["BTC", "SUPER", "USDC"];
		const token = tokens[Math.floor(Math.random() * tokens.length)];
		const randomAmount = Math.floor(Math.random() * 5) + 1;

		// Swap Functionality
		console.log(`🔁 Swapping ${randomAmount} BLACK → ${token}`);
		await swapToken("BLACK", token, String(randomAmount), false);

		console.log(`⏳ Waiting ${input} minutes before next swap...\n`);
		await wait(intervalMs);

		console.log(`🔁 Swapping MAX ${token} → BLACK`);
		await swapToken(token, "BLACK", "max", true);

		// Cooldown Cycle
		console.log(`⏳ Waiting ${input} minutes before the next cycle...\n`);
		await wait(intervalMs);
	}
}

main().catch(console.error);

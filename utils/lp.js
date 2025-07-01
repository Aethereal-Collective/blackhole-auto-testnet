import { createWalletClient, createPublicClient, http, parseUnits, getAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { avalancheFuji } from "viem/chains";

import { CA } from "../config/contract-address.js";
import { swapToken } from "./swap.js";

const tokenPairs = [
	["BLACK", "USDC"],
	["BLACK", "SUPER"],
];

const erc20Abi = [
	{
		name: "balanceOf",
		type: "function",
		stateMutability: "view",
		inputs: [{ name: "_owner", type: "address" }],
		outputs: [{ name: "balance", type: "uint256" }],
	},
	{
		name: "allowance",
		type: "function",
		stateMutability: "view",
		inputs: [
			{ name: "_owner", type: "address" },
			{ name: "_spender", type: "address" },
		],
		outputs: [{ name: "remaining", type: "uint256" }],
	},
	{
		name: "approve",
		type: "function",
		stateMutability: "nonpayable",
		inputs: [
			{ name: "_spender", type: "address" },
			{ name: "_value", type: "uint256" },
		],
		outputs: [{ name: "success", type: "bool" }],
	},
	{
		name: "decimals",
		type: "function",
		stateMutability: "view",
		inputs: [],
		outputs: [{ name: "", type: "uint8" }],
	},
];

const routerAbi = [
	{
		name: "addLiquidity",
		type: "function",
		stateMutability: "nonpayable",
		inputs: [
			{ name: "tokenA", type: "address" },
			{ name: "tokenB", type: "address" },
			{ name: "stable", type: "bool" },
			{ name: "amountADesired", type: "uint256" },
			{ name: "amountBDesired", type: "uint256" },
			{ name: "amountAMin", type: "uint256" },
			{ name: "amountBMin", type: "uint256" },
			{ name: "to", type: "address" },
			{ name: "deadline", type: "uint256" },
		],
		outputs: [
			{ name: "amountA", type: "uint256" },
			{ name: "amountB", type: "uint256" },
			{ name: "liquidity", type: "uint256" },
		],
	},
	{
		name: "quoteAddLiquidity",
		type: "function",
		stateMutability: "view",
		inputs: [
			{ name: "tokenA", type: "address" },
			{ name: "tokenB", type: "address" },
			{ name: "stable", type: "bool" },
			{ name: "amountADesired", type: "uint256" },
			{ name: "amountBDesired", type: "uint256" },
		],
		outputs: [
			{ name: "amountA", type: "uint256" },
			{ name: "amountB", type: "uint256" },
			{ name: "liquidity", type: "uint256" },
		],
	},
];

export async function addLiquidityForPair(pk, index) {
	const account = privateKeyToAccount(pk);

	const walletClient = createWalletClient({
		account,
		chain: avalancheFuji,
		transport: http("https://endpoints.omniatech.io/v1/avax/fuji/public"),
	});
	const publicClient = createPublicClient({
		chain: avalancheFuji,
		transport: http("https://endpoints.omniatech.io/v1/avax/fuji/public"),
	});

	const [tokenAKey, tokenBKey] = tokenPairs[Math.floor(Math.random() * tokenPairs.length)];
	const user = getAddress(account.address);
	const tokenA = getAddress(CA[tokenAKey]);
	const tokenB = getAddress(CA[tokenBKey]);

	let balanceA = await publicClient.readContract({ address: tokenA, abi: erc20Abi, functionName: "balanceOf", args: [user] });
	let balanceB = await publicClient.readContract({ address: tokenB, abi: erc20Abi, functionName: "balanceOf", args: [user] });

	if (balanceA <= 1000n || balanceB <= 1000n) {
		console.log(`⚠️ Account ${index + 1}: Missing balance. Swapping...`);
		await swapToken("BLACK", tokenBKey, "1", false, pk);
		balanceA = await publicClient.readContract({ address: tokenA, abi: erc20Abi, functionName: "balanceOf", args: [user] });
		balanceB = await publicClient.readContract({ address: tokenB, abi: erc20Abi, functionName: "balanceOf", args: [user] });
	}

	if (balanceA <= 1000n || balanceB <= 1000n) {
		console.log(`❌ Account ${index + 1}: Still insufficient. Skipping.`);
		return;
	}

	const decimalsA = await publicClient.readContract({ address: tokenA, abi: erc20Abi, functionName: "decimals" });
	const decimalsB = await publicClient.readContract({ address: tokenB, abi: erc20Abi, functionName: "decimals" });

	const oneTokenA = parseUnits("1", decimalsA);
	const [quoteA, quoteB] = await publicClient.readContract({
		address: CA.BLACKHOLE_ROUTER,
		abi: routerAbi,
		functionName: "quoteAddLiquidity",
		args: [tokenA, tokenB, false, oneTokenA, balanceB],
	});

	const amountA = (balanceB * quoteA) / quoteB;
	const amountB = balanceB;

	if (amountA === 0n || amountB === 0n) {
		console.log(`⚠️ Account ${index + 1}: Quote too small. Skipping.`);
		return;
	}

	console.log(`📊 Account ${index + 1}: Quote ${tokenAKey}-${tokenBKey} = A: ${amountA} | B: ${amountB}`);

	for (const [tokenAddr, amount, decimals] of [
		[tokenA, amountA, decimalsA],
		[tokenB, amountB, decimalsB],
	]) {
		const allowance = await publicClient.readContract({
			address: tokenAddr,
			abi: erc20Abi,
			functionName: "allowance",
			args: [user, CA.BLACKHOLE_ROUTER],
		});
		if (allowance < amount) {
			await walletClient.writeContract({
				address: tokenAddr,
				abi: erc20Abi,
				functionName: "approve",
				args: [CA.BLACKHOLE_ROUTER, parseUnits("1000000", decimals)],
			});
			console.log(`✅ Account ${index + 1}: Approved ${tokenAddr}`);
			await new Promise((r) => setTimeout(r, 3000));
		}
	}

	try {
		const deadline = BigInt(Math.floor(Date.now() / 1000 + 600));

		const sim = await publicClient.simulateContract({
			address: CA.BLACKHOLE_ROUTER,
			abi: routerAbi,
			functionName: "addLiquidity",
			args: [tokenA, tokenB, false, amountA, amountB, 0n, 0n, user, deadline],
			account: user,
		});

		if (sim.result.amountA === 0n || sim.result.amountB === 0n || sim.result.liquidity === 0n) {
			console.log(`⚠️ Account ${index + 1}: Simulated liquidity too small. Skipping.`);
			return;
		}
	} catch (error) {
		console.error(`🔍 Account ${index + 1}: Simulation failed → ${error.shortMessage || error.message}`);
		console.dir(error, { depth: null });
		return;
	}

	let attempt = 0;
	let success = false;
	while (attempt < 2 && !success) {
		try {
			const deadline = BigInt(Math.floor(Date.now() / 1000 + 600));
			console.log(`🔁 Account ${index + 1}: Adding LP for ${tokenAKey}-${tokenBKey} (attempt ${attempt + 1})`);

			const txHash = await walletClient.writeContract({
				address: CA.BLACKHOLE_ROUTER,
				abi: routerAbi,
				functionName: "addLiquidity",
				args: [tokenA, tokenB, false, amountA, amountB, 0n, 0n, user, deadline],
			});

			console.log(`⏳ Waiting for tx to be mined...`);
			const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

			if (receipt.status === "success") {
				console.log(`🎉 Account ${index + 1}: LP ${tokenAKey}-${tokenBKey} success. Tx: ${txHash}`);
				success = true;
			} else {
				console.log(`❌ Account ${index + 1}: LP ${tokenAKey}-${tokenBKey} failed. Tx: ${txHash}`);
				console.dir(receipt, { depth: null });
			}
		} catch (error) {
			console.error(`❌ Account ${index + 1}: Add liquidity error → ${error?.shortMessage || error?.cause?.message || error?.message}`);
			console.dir(error, { depth: null });
		}

		if (!success && attempt === 0) {
			console.log("🔁 Retrying LP once after delay...");
			await new Promise((r) => setTimeout(r, 10000));
		}

		attempt++;
	}
}

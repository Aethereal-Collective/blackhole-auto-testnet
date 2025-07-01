import { createWalletClient, createPublicClient, http, parseUnits, getAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { avalancheFuji } from "viem/chains";
import { CA, ROUTES } from "../config/contract-address.js";

const erc20Abi = [
	{ name: "balanceOf", type: "function", stateMutability: "view", inputs: [{ name: "_owner", type: "address" }], outputs: [{ name: "balance", type: "uint256" }] },
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
	{ name: "decimals", type: "function", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint8" }] },
];

const routerAbi = [
	{
		name: "swapExactTokensForTokens",
		type: "function",
		stateMutability: "nonpayable",
		inputs: [
			{ name: "amountIn", type: "uint256" },
			{ name: "amountOutMin", type: "uint256" },
			{
				name: "routes",
				type: "tuple[]",
				components: [
					{ name: "pair", type: "address" },
					{ name: "from", type: "address" },
					{ name: "to", type: "address" },
					{ name: "stable", type: "bool" },
					{ name: "concentrated", type: "bool" },
					{ name: "receiver", type: "address" },
				],
			},
			{ name: "to", type: "address" },
			{ name: "deadline", type: "uint256" },
		],
		outputs: [{ name: "amounts", type: "uint256[]" }],
	},
];

export async function swapToken(fromToken, toToken, amount, reverse = false, privateKey) {
	const account = privateKeyToAccount(privateKey);
	const walletClient = createWalletClient({ account, chain: avalancheFuji, transport: http("https://avalanche-fuji.drpc.org") });
	const publicClient = createPublicClient({ chain: avalancheFuji, transport: http("https://avalanche-fuji.drpc.org") });

	const routeKey = `${fromToken}→${toToken}`;
	const pair = ROUTES[routeKey];
	if (!pair) {
		console.error(`❌ No route for ${routeKey}`);
		return;
	}

	const fromAddress = getAddress(CA[fromToken]);
	const toAddress = getAddress(CA[toToken]);
	const pairAddress = getAddress(pair);
	const user = getAddress(account.address);

	const decimals = await publicClient.readContract({
		address: fromAddress,
		abi: erc20Abi,
		functionName: "decimals",
	});

	const amountIn = reverse ? await publicClient.readContract({ address: fromAddress, abi: erc20Abi, functionName: "balanceOf", args: [user] }) : parseUnits(amount.toString(), decimals);

	if (amountIn === 0n) {
		console.log(`❌ No ${fromToken} to swap.`);
		return;
	}

	const allowance = await publicClient.readContract({
		address: fromAddress,
		abi: erc20Abi,
		functionName: "allowance",
		args: [user, CA.BLACKHOLE_ROUTER],
	});

	if (allowance < amountIn) {
		try {
			await walletClient.writeContract({
				address: fromAddress,
				abi: erc20Abi,
				functionName: "approve",
				args: [CA.BLACKHOLE_ROUTER, parseUnits("1000000", decimals)],
			});
			console.log("✅ Approved");

			// Wait 1 block after approve
			const startBlock = await publicClient.getBlockNumber();
			while ((await publicClient.getBlockNumber()) <= startBlock) {
				await new Promise((r) => setTimeout(r, 4000));
			}
		} catch (e) {
			console.error("❌ Approve failed:", e.message);
			return;
		}
	}

	const routes = [
		{
			pair: pairAddress,
			from: fromAddress,
			to: toAddress,
			stable: false,
			concentrated: false,
			receiver: user,
		},
	];

	let amountOutMin = 0n;
	try {
		const { result } = await publicClient.simulateContract({
			address: CA.BLACKHOLE_ROUTER,
			abi: routerAbi,
			functionName: "swapExactTokensForTokens",
			args: [amountIn, 0n, routes, user, BigInt(Math.floor(Date.now() / 1000 + 300))],
			account: user,
		});
		const estimatedOut = result[1];
		amountOutMin = (estimatedOut * 95n) / 100n;
		console.log(`📉 EstimatedOut: ${estimatedOut} | MinOut (95%): ${amountOutMin}`);
	} catch (e) {
		console.warn("⚠️ Simulate failed (using MinOut = 0n):", e.shortMessage || e.message);
	}

	const deadline = BigInt(Math.floor(Date.now() / 1000 + 300));

	for (let attempt = 1; attempt <= 2; attempt++) {
		try {
			const txHash = await walletClient.writeContract({
				address: CA.BLACKHOLE_ROUTER,
				abi: routerAbi,
				functionName: "swapExactTokensForTokens",
				args: [amountIn, amountOutMin, routes, user, deadline],
			});

			console.log(`⏳ Waiting for tx to be mined... ${txHash}`);

			const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash, timeout: 60000 });

			const status = receipt.status === "success";
			console.log(`${status ? "✅" : "❌"} Swapped ${reverse ? "MAX" : amount} ${fromToken} → ${toToken}. Tx: ${txHash} | Status: ${status ? "Success ✅" : "Failed ❌"}`);

			if (!status) {
				console.error("❌ Transaction reverted:");
				throw new Error(`Transaction reverted: ${txHash}`);
			}

			return txHash;
		} catch (err) {
			const message = err?.shortMessage || err?.cause?.message || err?.message || JSON.stringify(err);
			console.error(`❌ Swap error: ${message}`);
			if (attempt === 1) {
				console.log("🔁 Retrying swap once after delay...");
				await new Promise((r) => setTimeout(r, 4000));
			}
		}
	}
}

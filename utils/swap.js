import { createWalletClient, createPublicClient, http, parseUnits, getAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { avalancheFuji } from "viem/chains";

import { CA } from "../config/contract-address.js";

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

const ROUTES = {
	"BLACK→BTC": "0x1F834DDD43abDd95d8339dcD3121fd6B9e6e08f2",
	"BTC→BLACK": "0x1F834DDD43abDd95d8339dcD3121fd6B9e6e08f2",
	"BLACK→SUPER": "0x9C72ccF7fa3E26E9b0cd34Db48D92096Cdd0E69c",
	"SUPER→BLACK": "0x9C72ccF7fa3E26E9b0cd34Db48D92096Cdd0E69c",
	"BLACK→USDC": "0x4080881f17b4c479adcbE55e40b8A61366E278B8",
	"USDC→BLACK": "0x4080881f17b4c479adcbE55e40b8A61366E278B8",
};

export async function swapToken(fromToken, toToken, amount, reverse = false, privateKey) {
	const account = privateKeyToAccount(privateKey);
	const walletClient = createWalletClient({ account, chain: avalancheFuji, transport: http() });
	const publicClient = createPublicClient({ chain: avalancheFuji, transport: http() });

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

	const decimals = await publicClient.readContract({ address: fromAddress, abi: erc20Abi, functionName: "decimals" });
	const amountIn = reverse ? await publicClient.readContract({ address: fromAddress, abi: erc20Abi, functionName: "balanceOf", args: [user] }) : parseUnits(amount.toString(), decimals);

	if (amountIn === 0n) {
		console.log(`❌ No ${fromToken} to swap.`);
		return;
	}

	const allowance = await publicClient.readContract({ address: fromAddress, abi: erc20Abi, functionName: "allowance", args: [user, CA.BLACKHOLE_ROUTER] });
	if (allowance < amountIn) {
		await walletClient.writeContract({
			address: fromAddress,
			abi: erc20Abi,
			functionName: "approve",
			args: [CA.BLACKHOLE_ROUTER, parseUnits("1000000", decimals)],
		});
		console.log("✅ Approved");
		await new Promise((r) => setTimeout(r, 4000));
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

	const txHash = await walletClient.writeContract({
		address: CA.BLACKHOLE_ROUTER,
		abi: routerAbi,
		functionName: "swapExactTokensForTokens",
		args: [amountIn, 0n, routes, user, BigInt(Math.floor(Date.now() / 1000 + 300))],
	});

	console.log(`✅ Swapped ${reverse ? "MAX" : amount} ${fromToken} → ${toToken}. Tx:`, txHash);
}

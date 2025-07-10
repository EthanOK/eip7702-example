import { createModularAccountV2Client } from "@account-kit/smart-contracts";
import { sepolia, alchemy } from "@account-kit/infra";
import { LocalAccountSigner } from "@aa-sdk/core";
import { ZeroAddress } from "ethers";
import "dotenv/config";

const privateKey = process.env.ALCHEMY_PRIVATE_KEY?.startsWith("0x")
  ? process.env.ALCHEMY_PRIVATE_KEY
  : `0x${process.env.ALCHEMY_PRIVATE_KEY}`;

const signer = LocalAccountSigner.privateKeyToAccountSigner(privateKey as any);

async function sendEIP7702Transaction() {
  // Constructing the smart account client
  const smartAccountClient = await createModularAccountV2Client({
    mode: "7702",
    transport: alchemy({ apiKey: process.env.ALCHEMY_API_KEY }), // Get your API key: https://dashboard.alchemy.com/apps
    chain: sepolia,
    signer,
    policyId: process.env.ALCHEMY_POLICY_ID, // Sponsor gas with your sponsorship policy id: https://dashboard.alchemy.com/gas-manager
  });

  const userOps = [
    {
      target: ZeroAddress,
      data: "0x12",
      value: 12n,
    },
    {
      target: ZeroAddress,
      data: "0x34",
      value: 34n,
    },
  ];

  // Sending a user operation
  const uoHash = await smartAccountClient.sendUserOperation({
    uo: userOps,
  } as any);

  const txnHash = await smartAccountClient.waitForUserOperationTransaction(
    uoHash
  );
  console.log("Transaction hash:", txnHash);
}

// https://www.alchemy.com/docs/wallets/smart-contracts/modular-account-v2/using-7702

sendEIP7702Transaction();

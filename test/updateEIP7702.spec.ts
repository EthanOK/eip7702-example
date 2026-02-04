import "dotenv/config";
import { JsonRpcProvider, Wallet, ZeroAddress } from "ethers";
import { updateEIP7702Delegation } from "../src/updateEIP7702Delegation";

async function main() {
  const provider = new JsonRpcProvider("https://0xrpc.io/sep");
  const signer = new Wallet(process.env.SPONSEE_PRIVATE_KEY!, provider);
  console.log("signer address:", signer.address);
  // pay gas for the transaction
  const sponsorSigner = new Wallet(process.env.SPONSOR_PRIVATE_KEY!, provider);
  console.log("sponsorSigner address:", sponsorSigner.address);
  // set delegate
  const setDelegateAddress = "0x69007702764179f14F51cdce752f4f775d74E139";
  const setDelegateTxHash = await updateEIP7702Delegation(
    signer,
    sponsorSigner,
    setDelegateAddress
  );
  console.log("Transaction hash:", setDelegateTxHash);

  // sleep 10 seconds
  await new Promise((resolve) => setTimeout(resolve, 10000));

  // revoke delegate
  const revokeDelegateAddress = ZeroAddress;
  const revokeTxHash = await updateEIP7702Delegation(
    signer,
    sponsorSigner,
    revokeDelegateAddress
  );
  console.log("Transaction hash:", revokeTxHash);
}

main().catch(console.error);

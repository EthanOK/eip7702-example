import dotenv, { parse } from "dotenv";
import {
  ethers,
  getBytes,
  parseEther,
  Signer,
  solidityPacked,
  solidityPackedKeccak256,
  ZeroAddress,
} from "ethers";
import BatchCallABI from "../src/abi/BatchCallAndSponsor.json";
dotenv.config();

export type Call = {
  to: string;
  value: bigint;
  data: string;
};

// 用于可重用性的全局变量
let provider: ethers.JsonRpcProvider,
  firstSigner: ethers.Wallet,
  sponsorSigner: ethers.Wallet,
  coldSigner: ethers.Wallet,
  targetAddress: string,
  usdcAddress: string,
  recipients: string[];

async function initializeSigners() {
  // 检查环境变量
  if (
    !process.env.FIRST_PRIVATE_KEY ||
    !process.env.SPONSOR_PRIVATE_KEY ||
    !process.env.COLD_PRIVATE_KEY ||
    !process.env.DELEGATION_CONTRACT_ADDRESS ||
    !process.env.QUICKNODE_URL ||
    !process.env.USDC_ADDRESS
  ) {
    console.error("请在 .env 文件中设置你的环境变量。");
    process.exit(1);
  }

  const quickNodeUrl = process.env.QUICKNODE_URL;
  provider = new ethers.JsonRpcProvider(quickNodeUrl);

  firstSigner = new ethers.Wallet(process.env.FIRST_PRIVATE_KEY, provider);
  sponsorSigner = new ethers.Wallet(process.env.SPONSOR_PRIVATE_KEY, provider);
  coldSigner = new ethers.Wallet(process.env.COLD_PRIVATE_KEY, provider);

  targetAddress = process.env.DELEGATION_CONTRACT_ADDRESS;
  usdcAddress = process.env.USDC_ADDRESS;
  recipients = [
    "0x6278A1E803A76796a3A1f7F6344fE874ebfe94B2",
    sponsorSigner.address,
  ];

  console.log("第一个签名者地址：", firstSigner.address);
  console.log("赞助者签名者地址：", sponsorSigner.address);

  // 检查余额
  const firstBalance = await provider.getBalance(firstSigner.address);
  const sponsorBalance = await provider.getBalance(sponsorSigner.address);
  console.log("第一个签名者余额：", ethers.formatEther(firstBalance), "ETH");
  console.log("赞助者签名者余额：", ethers.formatEther(sponsorBalance), "ETH");
}

async function checkDelegationStatus(address = firstSigner.address) {
  console.log("\n=== 正在检查委托状态 ===");

  try {
    // 获取 EOA 地址的代码
    const code = await provider.getCode(address);

    if (code === "0x") {
      console.log(`❌ 未找到 ${address} 的委托`);
      return null;
    }

    // 检查它是否是 EIP-7702 委托 (以 0xef0100 开头)
    if (code.startsWith("0xef0100")) {
      // 提取委托的地址 (删除 0xef0100 前缀)
      const delegatedAddress = "0x" + code.slice(8); // 删除 0xef0100 (8 个字符)

      console.log(`✅ 找到 ${address} 的委托`);
      console.log(`📍 委托给：${delegatedAddress}`);
      console.log(`📝 完整委托代码：${code}`);

      return delegatedAddress;
    } else {
      console.log(`❓ 地址有代码但不是 EIP-7702 委托：${code}`);
      return null;
    }
  } catch (error) {
    console.error("检查委托状态时出错：", error);
    return null;
  }
}

// 步骤 2：为 EOA 创建授权
/**
 *  创建授权
 * @param signer Signer
 * @param authAddress 授权地址
 * @param nonce  If use signer send transaction, nonce = currentNonce + 1
 * @returns
 */
async function createAuthorization(
  signer: Signer,
  authAddress: string,
  nonce?: number
) {
  const auth = await signer.authorize({
    address: authAddress,
    nonce: nonce,
    // chainId: 11155111, // Sepolia 链 ID
  });

  console.log("使用以下 nonce 创建授权：", auth.nonce);
  return auth;
}
async function revokeDelegation(signer: Signer) {
  console.log("\n=== 正在撤销委托 ===");

  const currentNonce = await signer.getNonce();

  // 创建授权以撤销 (将地址设置为零地址)
  const revokeAuth = await signer.authorize({
    address: ethers.ZeroAddress, // 零地址以撤销
    nonce: currentNonce + 1,
    // chainId: 11155111,
  });

  console.log("已创建撤销授权");

  // 发送带有撤销授权的交易
  const tx = await signer.sendTransaction({
    type: 4,
    to: await signer.getAddress(),
    authorizationList: [revokeAuth],
  });

  console.log("已发送撤销交易：", tx.hash);

  const receipt = await tx.wait();
  console.log("委托已成功撤销！");

  return receipt;
}

// 步骤 3：发送非赞助的 EIP-7702 交易
async function sendNonSponsoredTransaction(signer: Signer, calls: Call[]) {
  console.log("开始发送非赞助的 EIP-7702 交易...");
  const contract = new ethers.Contract(
    await signer.getAddress(),
    BatchCallABI,
    signer
  );

  const tx = await contract["execute((address,uint256,bytes)[])"](calls);
  await tx.wait();
  console.log(`Transaction hash: ${tx.hash}`);
  return tx;
}

async function getSponseeSignature(sponsee: Signer, calls: Call[]) {
  let encodeData = "0x";

  for (const call of calls) {
    encodeData += solidityPacked(
      ["address", "uint256", "bytes"],
      [call.to, call.value, call.data]
    ).slice(2);
  }
  const contract = new ethers.Contract(
    await sponsee.getAddress(),
    BatchCallABI,
    sponsee
  );

  const nonce = await contract.nonce();

  const digest = solidityPackedKeccak256(
    ["uint256", "bytes"],
    [nonce, encodeData]
  );
  const signature = await sponsee.signMessage(getBytes(digest));
  return signature;
}
// 步骤 4：发送赞助的 EIP-7702 交易
async function sendSponsoredTransaction(
  signer: Signer,
  sponsee: string,
  calls: Call[],
  signature: string
) {
  console.log("开始发送赞助的 EIP-7702 交易...");
  const contract = new ethers.Contract(sponsee, BatchCallABI, signer);

  const tx = await contract["execute((address,uint256,bytes)[],bytes)"](
    calls,
    signature
  );
  await tx.wait();
  console.log(`Transaction hash: ${tx.hash}`);
  return tx;
}

(async function main() {
  await initializeSigners();
  const signers = [firstSigner, sponsorSigner, coldSigner];
  const authorizationList = [];
  for (const signer of signers) {
    const state = await checkDelegationStatus(signer.address);
    if (state == null) {
      const currentNonce = await signer.getNonce();
      const auth = await createAuthorization(
        signer,
        targetAddress,
        signer.address == sponsorSigner.address
          ? currentNonce + 1
          : currentNonce
      );
      authorizationList.push(auth);
    }
  }
  if (authorizationList.length > 0) {
    // sponsor or paymaster 提交授权到链上
    const tx = await sponsorSigner.sendTransaction({
      type: 4,
      to: sponsorSigner.address,
      authorizationList: authorizationList,
    });
    await tx.wait();
    console.log("交易哈希:", tx.hash);
  }

  const calls_first: Call[] = [];
  const calls_sponsor: Call[] = [];
  const ERC20_ABI = ["function transfer(address to, uint256 amount)"];
  const iface = new ethers.Interface(ERC20_ABI);

  for (const recipient of recipients) {
    calls_first.push({
      to: recipient,
      value: parseEther("0.001"),
      data: "0x",
    });

    calls_sponsor.push({
      to: usdcAddress,
      value: 0n,
      data: iface.encodeFunctionData("transfer", [recipient, 1e6]),
    });
  }

  await sendNonSponsoredTransaction(firstSigner, calls_first);

  const signature = await getSponseeSignature(coldSigner, calls_sponsor);

  await sendSponsoredTransaction(
    sponsorSigner,
    coldSigner.address,
    calls_sponsor,
    signature
  );

  // await revokeDelegation(firstSigner);
  // await revokeDelegation(sponsorSigner);
})();

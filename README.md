# EIP7702 Example

This is an example of how to use ethers create the EIP7702.

[如何使用 Ethers.js 发送 EIP-7702 交易](https://learnblockchain.cn/article/15774)

## 1. create authorize

```ts
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
```

### Nonce 管理

```ts
// 对于同钱包交易（非赞助）
const currentNonce = await signer.getNonce();
const auth = await signer.authorize({
  nonce: currentNonce + 1, // ✅ 为同一钱包递增
});

// 对于不同钱包的交易（赞助）
const auth = await signer.authorize({
  nonce: currentNonce, // ✅ 对不同的钱包使用当前的 nonce
});
```

## 2.send auth transaction

```ts
const tx = await sponsorSigner.sendTransaction({
  type: 4,
  to: sponsorSigner.address,
  authorizationList: [auth],
});
```

```ts
for (const signer of signers) {
  const state = await checkDelegationStatus(signer.address);
  if (state == null) {
    const currentNonce = await signer.getNonce();
    const auth = await createAuthorization(
      signer,
      targetAddress,
      signer.address == sponsorSigner.address ? currentNonce + 1 : currentNonce
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
```

## 3. send Non Sponsored Transaction

```ts
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
```

## 4. send Sponsored Transaction

### 4.1 被赞助者 signature

```ts
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
```

### 4.2 sponsor send transaction

```ts
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
```

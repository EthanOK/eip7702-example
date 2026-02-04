import { Signer, ZeroAddress } from "ethers";

export async function updateEIP7702Delegation(
  signer: Signer,
  sponsorSigner: Signer,
  delegateAddress = ZeroAddress,
  waitConfirmation = false
) {
  const signerAddress = await signer.getAddress();

  const nonce = await signer.getNonce();

  const auth = await signer.authorize({
    address: delegateAddress,
    nonce:
      (await signer.getAddress()) == (await sponsorSigner.getAddress())
        ? nonce + 1
        : nonce,
  });

  const tx = await sponsorSigner.sendTransaction({
    type: 4,
    to: signerAddress,
    authorizationList: [auth],
  });

  try {
    if (waitConfirmation) {
      await tx.wait();
    }
  } catch (error) {
    console.error(error);
  }

  return tx.hash;
}

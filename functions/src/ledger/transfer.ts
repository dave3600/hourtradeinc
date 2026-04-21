export async function transferCoin(data: {
  amountMs: number;
  fromWallet: string;
  toWallet: string;
}) {
  return {
    txId: `tx_${Date.now()}`,
    ...data,
    status: "pending_review",
  };
}

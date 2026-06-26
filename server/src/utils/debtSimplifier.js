/**
 * Greedy Debt Simplification Algorithm (Minimum Cash Flow Problem)
 * 
 * Takes a map of net balances per user in a group:
 *   balance = total_paid_by_user - total_owed_by_user
 * 
 * Returns a list of simplified transactions:
 *   { from: userId, to: userId, amount: float }
 * 
 * @param {Object} memberBalances - Key: userId, Value: net balance (float)
 * @returns {Array} List of transactions
 */
export function simplifyDebts(memberBalances) {
  const debtors = [];
  const creditors = [];

  // Group members into debtors and creditors, ignoring rounded-to-zero balances
  for (const [userId, rawBalance] of Object.entries(memberBalances)) {
    const balance = Math.round(rawBalance * 100) / 100; // Round to 2 decimal places
    if (balance < -0.01) {
      debtors.push({ userId, balance: Math.abs(balance) });
    } else if (balance > 0.01) {
      creditors.push({ userId, balance });
    }
  }

  const transactions = [];

  // Greedily match largest debtor with largest creditor
  while (debtors.length > 0 && creditors.length > 0) {
    // Sort descending by balance to always pick the largest values
    debtors.sort((a, b) => b.balance - a.balance);
    creditors.sort((a, b) => b.balance - a.balance);

    const debtor = debtors[0];
    const creditor = creditors[0];

    const amount = Math.min(debtor.balance, creditor.balance);
    const roundedAmount = Math.round(amount * 100) / 100;

    if (roundedAmount > 0) {
      transactions.push({
        from: debtor.userId,
        to: creditor.userId,
        amount: roundedAmount,
      });
    }

    // Update balances
    debtor.balance -= amount;
    creditor.balance -= amount;

    // Remove if settled
    if (debtor.balance < 0.01) {
      debtors.shift();
    }
    if (creditor.balance < 0.01) {
      creditors.shift();
    }
  }

  return transactions;
}

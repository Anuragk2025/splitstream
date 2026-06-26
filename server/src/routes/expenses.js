import express from 'express';
import prisma from '../db.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Helper to calculate and round splits
// Returns array of { userId, amountOwed }
function calculateSplits(amount, splitType, splits, membersList) {
  // splits: Array of { userId, value }
  // value represents:
  // - EQUAL: just a list of userIds (value can be ignored or not present)
  // - PERCENTAGE: percentage number (e.g. 50, 25, 25)
  // - EXACT: exact currency amount (e.g. 100, 50, 50)
  // - SHARES: number of shares (e.g. 2, 1, 1)
  
  if (!splits || splits.length === 0) {
    throw new Error('Splits list cannot be empty.');
  }

  const result = [];
  let totalCalculated = 0;

  if (splitType === 'EQUAL') {
    const share = amount / splits.length;
    splits.forEach(s => {
      result.push({
        userId: s.userId,
        amountOwed: Math.round(share * 100) / 100
      });
    });
  } else if (splitType === 'PERCENTAGE') {
    let totalPct = 0;
    splits.forEach(s => {
      totalPct += s.value;
      const owed = amount * (s.value / 100);
      result.push({
        userId: s.userId,
        amountOwed: Math.round(owed * 100) / 100
      });
    });
    if (Math.abs(totalPct - 100) > 0.01) {
      throw new Error('Percentages must sum to 100%.');
    }
  } else if (splitType === 'EXACT') {
    let totalExact = 0;
    splits.forEach(s => {
      totalExact += s.value;
      result.push({
        userId: s.userId,
        amountOwed: Math.round(s.value * 100) / 100
      });
    });
    if (Math.abs(totalExact - amount) > 0.01) {
      throw new Error(`Sum of exact amounts (₹${totalExact}) must equal total expense amount (₹${amount}).`);
    }
  } else if (splitType === 'SHARES') {
    let totalShares = 0;
    splits.forEach(s => {
      if (s.value <= 0) throw new Error('Shares must be positive numbers.');
      totalShares += s.value;
    });

    if (totalShares <= 0) {
      throw new Error('Total shares must be greater than 0.');
    }

    splits.forEach(s => {
      const owed = amount * (s.value / totalShares);
      result.push({
        userId: s.userId,
        amountOwed: Math.round(owed * 100) / 100
      });
    });
  } else {
    throw new Error('Invalid split type.');
  }

  // Adjust for rounding differences
  const sumOfOwed = result.reduce((sum, item) => sum + item.amountOwed, 0);
  const diff = Math.round((amount - sumOfOwed) * 100) / 100;
  
  if (diff !== 0 && result.length > 0) {
    // Add the difference to the first split
    result[0].amountOwed = Math.round((result[0].amountOwed + diff) * 100) / 100;
  }

  // Verify that all split users exist in the group membership
  const groupUserIds = new Set(membersList.map(m => m.userId));
  for (const r of result) {
    if (!groupUserIds.has(r.userId)) {
      throw new Error(`User with ID ${r.userId} is not a member of this group.`);
    }
  }

  return result;
}

// POST /api/expenses - Add a new expense
router.post('/', authenticateToken, async (req, res) => {
  const { groupId, amount, description, splitType, splits } = req.body;

  // Simple input validation
  if (!groupId || !description || !splitType) {
    return res.status(400).json({ message: 'Missing required parameters.' });
  }

  const parsedAmount = parseFloat(amount);
  if (isNaN(parsedAmount) || parsedAmount <= 0) {
    return res.status(400).json({ message: 'Amount must be a positive number.' });
  }

  try {
    // 1. Verify user is in the group and fetch all group members
    const members = await prisma.groupMember.findMany({
      where: { groupId },
    });

    const isMember = members.some(m => m.userId === req.user.id);
    if (!isMember) {
      return res.status(403).json({ message: 'Access denied. You are not a member of this group.' });
    }

    // 2. Compute splits
    let calculatedSplitsList;
    try {
      calculatedSplitsList = calculateSplits(parsedAmount, splitType, splits, members);
    } catch (err) {
      return res.status(400).json({ message: err.message });
    }

    // 3. Create expense and its splits in a transaction
    const expense = await prisma.$transaction(async (tx) => {
      const exp = await tx.expense.create({
        data: {
          groupId,
          paidById: req.user.id,
          amount: parsedAmount,
          description,
          splitType,
        },
      });

      // Prepare split objects
      const splitsData = calculatedSplitsList.map(s => ({
        expenseId: exp.id,
        userId: s.userId,
        amountOwed: s.amountOwed,
      }));

      await tx.expenseSplit.createMany({
        data: splitsData,
      });

      return tx.expense.findUnique({
        where: { id: exp.id },
        include: {
          paidBy: { select: { id: true, name: true, email: true } },
          splits: { include: { user: { select: { id: true, name: true } } } },
        },
      });
    });

    // 4. Emit socket updates (broadcast to group room + send personal notifications)
    const io = req.app.get('io');
    if (io) {
      // Group room real-time update
      io.to(`group_${groupId}`).emit('group_updated', {
        type: 'EXPENSE_ADDED',
        expense,
        message: `${expense.paidBy.name} added "${description}" (₹${parsedAmount})`,
      });

      // Individual user notifications
      calculatedSplitsList.forEach(s => {
        // Don't notify the payer in their separate notifications unless they want a badge, 
        // but let's notify everyone affected by the debt
        if (s.userId !== req.user.id) {
          io.to(`user_${s.userId}`).emit('notification', {
            type: 'DEBT_ADDED',
            message: `${expense.paidBy.name} added "${description}". Your share is ₹${s.amountOwed}.`,
            groupId,
            expenseId: expense.id,
          });
        }
      });
    }

    return res.status(201).json({ expense, message: 'Expense added successfully!' });
  } catch (error) {
    console.error('Add expense error:', error);
    return res.status(500).json({ message: 'Server error adding expense.' });
  }
});

// PUT /api/expenses/:id - Edit an expense (only by the creator)
router.put('/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { amount, description, splitType, splits } = req.body;

  if (!description || !splitType) {
    return res.status(400).json({ message: 'Missing required parameters.' });
  }

  const parsedAmount = parseFloat(amount);
  if (isNaN(parsedAmount) || parsedAmount <= 0) {
    return res.status(400).json({ message: 'Amount must be a positive number.' });
  }

  try {
    // 1. Fetch existing expense
    const existingExpense = await prisma.expense.findUnique({
      where: { id },
      include: { splits: true },
    });

    if (!existingExpense) {
      return res.status(404).json({ message: 'Expense not found.' });
    }

    // 2. Verify authorization
    if (existingExpense.paidById !== req.user.id) {
      return res.status(403).json({ message: 'Only the user who added the expense can edit it.' });
    }

    // 3. Fetch group members
    const members = await prisma.groupMember.findMany({
      where: { groupId: existingExpense.groupId },
    });

    // 4. Calculate splits
    let calculatedSplitsList;
    try {
      calculatedSplitsList = calculateSplits(parsedAmount, splitType, splits, members);
    } catch (err) {
      return res.status(400).json({ message: err.message });
    }

    // 5. Update expense and splits in transaction
    const expense = await prisma.$transaction(async (tx) => {
      // Update Expense
      await tx.expense.update({
        where: { id },
        data: {
          amount: parsedAmount,
          description,
          splitType,
        },
      });

      // Clear old splits
      await tx.expenseSplit.deleteMany({
        where: { expenseId: id },
      });

      // Create new splits
      const splitsData = calculatedSplitsList.map(s => ({
        expenseId: id,
        userId: s.userId,
        amountOwed: s.amountOwed,
      }));

      await tx.expenseSplit.createMany({
        data: splitsData,
      });

      return tx.expense.findUnique({
        where: { id },
        include: {
          paidBy: { select: { id: true, name: true, email: true } },
          splits: { include: { user: { select: { id: true, name: true } } } },
        },
      });
    });

    // 6. Broadcast real-time update
    const io = req.app.get('io');
    if (io) {
      io.to(`group_${existingExpense.groupId}`).emit('group_updated', {
        type: 'EXPENSE_UPDATED',
        expense,
        message: `${expense.paidBy.name} updated "${description}" (₹${parsedAmount})`,
      });

      calculatedSplitsList.forEach(s => {
        if (s.userId !== req.user.id) {
          io.to(`user_${s.userId}`).emit('notification', {
            type: 'DEBT_UPDATED',
            message: `${expense.paidBy.name} updated "${description}". Your new share is ₹${s.amountOwed}.`,
            groupId: existingExpense.groupId,
            expenseId: id,
          });
        }
      });
    }

    return res.status(200).json({ expense, message: 'Expense updated successfully!' });
  } catch (error) {
    console.error('Update expense error:', error);
    return res.status(500).json({ message: 'Server error updating expense.' });
  }
});

// DELETE /api/expenses/:id - Delete an expense (only by the creator)
router.delete('/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;

  try {
    const expense = await prisma.expense.findUnique({
      where: { id },
      include: { paidBy: { select: { name: true } } },
    });

    if (!expense) {
      return res.status(404).json({ message: 'Expense not found.' });
    }

    if (expense.paidById !== req.user.id) {
      return res.status(403).json({ message: 'Only the user who added the expense can delete it.' });
    }

    const groupId = expense.groupId;

    // Delete splits and expense
    await prisma.expenseSplit.deleteMany({
      where: { expenseId: id },
    });

    await prisma.expense.delete({
      where: { id },
    });

    // Broadcast delete event
    const io = req.app.get('io');
    if (io) {
      io.to(`group_${groupId}`).emit('group_updated', {
        type: 'EXPENSE_DELETED',
        expenseId: id,
        message: `${expense.paidBy.name} deleted expense "${expense.description}"`,
      });
    }

    return res.status(200).json({ message: 'Expense deleted successfully.' });
  } catch (error) {
    console.error('Delete expense error:', error);
    return res.status(500).json({ message: 'Server error deleting expense.' });
  }
});

export default router;

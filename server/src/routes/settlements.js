import express from 'express';
import prisma from '../db.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// POST /api/settlements - Create a settlement
router.post('/', authenticateToken, async (req, res) => {
  const { groupId, toUserId, amount } = req.body;

  if (!groupId || !toUserId) {
    return res.status(400).json({ message: 'Missing required parameters.' });
  }

  const parsedAmount = parseFloat(amount);
  if (isNaN(parsedAmount) || parsedAmount <= 0) {
    return res.status(400).json({ message: 'Amount must be a positive number.' });
  }

  try {
    // 1. Verify both users are members of the group
    const members = await prisma.groupMember.findMany({
      where: { groupId },
      include: {
        user: { select: { id: true, name: true } }
      }
    });

    const isFromMember = members.some(m => m.userId === req.user.id);
    const isToMember = members.some(m => m.userId === toUserId);

    if (!isFromMember || !isToMember) {
      return res.status(403).json({ message: 'Both users must be members of the group.' });
    }

    const fromUser = members.find(m => m.userId === req.user.id).user;
    const toUser = members.find(m => m.userId === toUserId).user;

    // 2. Create the settlement record
    const settlement = await prisma.settlement.create({
      data: {
        groupId,
        fromUserId: req.user.id,
        toUserId,
        amount: parsedAmount,
      },
      include: {
        fromUser: { select: { id: true, name: true } },
        toUser: { select: { id: true, name: true } },
      }
    });

    // 3. Real-time broadcast
    const io = req.app.get('io');
    if (io) {
      // Group room update
      io.to(`group_${groupId}`).emit('group_updated', {
        type: 'SETTLEMENT_ADDED',
        settlement,
        message: `${fromUser.name} settled ₹${parsedAmount} with ${toUser.name}`,
      });

      // Direct notification to the receiver
      io.to(`user_${toUserId}`).emit('notification', {
        type: 'DEBT_SETTLED',
        message: `${fromUser.name} marked a settlement of ₹${parsedAmount} with you.`,
        groupId,
        settlementId: settlement.id,
      });
    }

    return res.status(201).json({ settlement, message: 'Settlement recorded successfully!' });
  } catch (error) {
    console.error('Create settlement error:', error);
    return res.status(500).json({ message: 'Server error creating settlement.' });
  }
});

export default router;

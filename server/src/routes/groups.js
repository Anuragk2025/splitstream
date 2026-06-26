import express from 'express';
import prisma from '../db.js';
import { authenticateToken } from '../middleware/auth.js';
import { simplifyDebts } from '../utils/debtSimplifier.js';

const router = express.Router();

// Helper to generate a unique random invite code
const generateInviteCode = () => {
  return Math.random().toString(36).substring(2, 10).toUpperCase();
};

// GET /api/groups - List all groups for the logged-in user
router.get('/', authenticateToken, async (req, res) => {
  try {
    const memberships = await prisma.groupMember.findMany({
      where: { userId: req.user.id },
      include: {
        group: {
          include: {
            members: {
              include: {
                user: {
                  select: {
                    id: true,
                    name: true,
                    email: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    const groups = memberships.map((membership) => {
      const g = membership.group;
      return {
        id: g.id,
        name: g.name,
        inviteCode: g.inviteCode,
        createdAt: g.createdAt,
        membersCount: g.members.length,
        members: g.members.map((m) => m.user),
      };
    });

    return res.status(200).json({ groups });
  } catch (error) {
    console.error('List groups error:', error);
    return res.status(500).json({ message: 'Server error listing groups.' });
  }
});

// POST /api/groups - Create a new group
router.post('/', authenticateToken, async (req, res) => {
  const { name } = req.body;

  if (!name || name.trim() === '') {
    return res.status(400).json({ message: 'Group name is required.' });
  }

  try {
    let inviteCode = generateInviteCode();
    // Ensure uniqueness
    let exists = await prisma.group.findUnique({ where: { inviteCode } });
    while (exists) {
      inviteCode = generateInviteCode();
      exists = await prisma.group.findUnique({ where: { inviteCode } });
    }

    // Create group and auto-join the creator in a transaction
    const group = await prisma.group.create({
      data: {
        name,
        inviteCode,
        members: {
          create: {
            userId: req.user.id,
          },
        },
      },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
      },
    });

    return res.status(201).json({
      group: {
        id: group.id,
        name: group.name,
        inviteCode: group.inviteCode,
        createdAt: group.createdAt,
        members: group.members.map((m) => m.user),
      },
      message: 'Group created successfully!',
    });
  } catch (error) {
    console.error('Create group error:', error);
    return res.status(500).json({ message: 'Server error creating group.' });
  }
});

// POST /api/groups/join - Join a group by invite code
router.post('/join', authenticateToken, async (req, res) => {
  const { inviteCode } = req.body;

  if (!inviteCode || inviteCode.trim() === '') {
    return res.status(400).json({ message: 'Invite code is required.' });
  }

  try {
    const group = await prisma.group.findUnique({
      where: { inviteCode: inviteCode.toUpperCase() },
      include: {
        members: true,
      },
    });

    if (!group) {
      return res.status(404).json({ message: 'Group not found with this invite code.' });
    }

    // Check if already a member
    const alreadyMember = group.members.some((m) => m.userId === req.user.id);
    if (alreadyMember) {
      return res.status(400).json({ message: 'You are already a member of this group.' });
    }

    // Add user to the group
    await prisma.groupMember.create({
      data: {
        groupId: group.id,
        userId: req.user.id,
      },
    });

    // Fetch joined user info
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, name: true, email: true },
    });

    // Real-time broadcast that user joined
    const io = req.app.get('io');
    if (io) {
      io.to(`group_${group.id}`).emit('group_updated', {
        type: 'MEMBER_JOINED',
        user,
        message: `${user.name} joined the group.`,
      });
    }

    return res.status(200).json({
      group: {
        id: group.id,
        name: group.name,
      },
      message: 'Successfully joined group!',
    });
  } catch (error) {
    console.error('Join group error:', error);
    return res.status(500).json({ message: 'Server error joining group.' });
  }
});

// GET /api/groups/:id - Get details for a specific group
router.get('/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;

  try {
    // 1. Check if group exists and user is a member
    const membership = await prisma.groupMember.findUnique({
      where: {
        groupId_userId: {
          groupId: id,
          userId: req.user.id,
        },
      },
    });

    if (!membership) {
      return res.status(403).json({ message: 'Access denied. You are not a member of this group.' });
    }

    // 2. Fetch group info, members, expenses, and settlements
    const group = await prisma.group.findUnique({
      where: { id },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
        expenses: {
          include: {
            paidBy: {
              select: { id: true, name: true, email: true },
            },
            splits: {
              include: {
                user: {
                  select: { id: true, name: true, email: true },
                },
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
        settlements: {
          include: {
            fromUser: { select: { id: true, name: true } },
            toUser: { select: { id: true, name: true } },
          },
          orderBy: { settledAt: 'desc' },
        },
      },
    });

    // 3. Compute net balances for each member
    // Net Balance = (Total Paid in Expenses + Total Paid in Settlements) - (Total Owed in Splits + Total Received in Settlements)
    const memberBalances = {};
    group.members.forEach((m) => {
      memberBalances[m.userId] = 0;
    });

    // Add Expense Paid amounts
    group.expenses.forEach((expense) => {
      if (memberBalances[expense.paidById] !== undefined) {
        memberBalances[expense.paidById] += expense.amount;
      }
      // Subtract Expense Splits owed amounts
      expense.splits.forEach((split) => {
        if (memberBalances[split.userId] !== undefined) {
          memberBalances[split.userId] -= split.amountOwed;
        }
      });
    });

    // Adjust for settlements
    group.settlements.forEach((settlement) => {
      // Payer of settlement (fromUserId) spent money, which goes towards settling their debt
      if (memberBalances[settlement.fromUserId] !== undefined) {
        memberBalances[settlement.fromUserId] += settlement.amount;
      }
      // Recipient of settlement (toUserId) received money, which reduces what they are owed
      if (memberBalances[settlement.toUserId] !== undefined) {
        memberBalances[settlement.toUserId] -= settlement.amount;
      }
    });

    // Formatted list of members with their net balances
    const membersWithBalances = group.members.map((m) => {
      return {
        id: m.user.id,
        name: m.user.name,
        email: m.user.email,
        netBalance: Math.round(memberBalances[m.userId] * 100) / 100,
      };
    });

    // 4. Simplify debts
    const whoOwesWhom = simplifyDebts(memberBalances);

    // Map user IDs to names for transactions
    const membersMap = new Map(group.members.map((m) => [m.userId, m.user.name]));
    const simplifiedTransactions = whoOwesWhom.map((tx) => ({
      fromId: tx.from,
      fromName: membersMap.get(tx.from) || 'Unknown',
      toId: tx.to,
      toName: membersMap.get(tx.to) || 'Unknown',
      amount: tx.amount,
    }));

    return res.status(200).json({
      group: {
        id: group.id,
        name: group.name,
        inviteCode: group.inviteCode,
        createdAt: group.createdAt,
      },
      members: membersWithBalances,
      expenses: group.expenses,
      settlements: group.settlements,
      whoOwesWhom: simplifiedTransactions,
      userNetBalance: Math.round((memberBalances[req.user.id] || 0) * 100) / 100,
    });
  } catch (error) {
    console.error('Fetch group details error:', error);
    return res.status(500).json({ message: 'Server error fetching group details.' });
  }
});

// GET /api/groups/:id/activity - Get recent activities for a group
router.get('/:id/activity', authenticateToken, async (req, res) => {
  const { id } = req.params;

  try {
    const membership = await prisma.groupMember.findUnique({
      where: {
        groupId_userId: {
          groupId: id,
          userId: req.user.id,
        },
      },
    });

    if (!membership) {
      return res.status(403).json({ message: 'Access denied.' });
    }

    const expenses = await prisma.expense.findMany({
      where: { groupId: id },
      include: {
        paidBy: { select: { name: true } },
      },
    });

    const settlements = await prisma.settlement.findMany({
      where: { groupId: id },
      include: {
        fromUser: { select: { name: true } },
        toUser: { select: { name: true } },
      },
    });

    // Map to feed activities
    const activities = [];

    expenses.forEach((e) => {
      activities.push({
        id: `expense-${e.id}`,
        type: 'EXPENSE',
        userId: e.paidById,
        message: `${e.paidBy.name} added "${e.description}" (₹${e.amount})`,
        createdAt: e.createdAt,
      });
    });

    settlements.forEach((s) => {
      activities.push({
        id: `settlement-${s.id}`,
        type: 'SETTLEMENT',
        userId: s.fromUserId,
        message: `${s.fromUser.name} settled ₹${s.amount} with ${s.toUser.name}`,
        createdAt: s.settledAt,
      });
    });

    // Sort by date desc
    activities.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    return res.status(200).json({ activities: activities.slice(0, 50) });
  } catch (error) {
    console.error('Fetch activity feed error:', error);
    return res.status(500).json({ message: 'Server error fetching activity feed.' });
  }
});

export default router;

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // 1. Clear database
  await prisma.settlement.deleteMany({});
  await prisma.expenseSplit.deleteMany({});
  await prisma.expense.deleteMany({});
  await prisma.groupMember.deleteMany({});
  await prisma.group.deleteMany({});
  await prisma.user.deleteMany({});

  console.log('Database cleared.');

  // 2. Create users
  const passwordHash = await bcrypt.hash('password123', 10);

  const alice = await prisma.user.create({
    data: {
      name: 'Alice Smith',
      email: 'alice@example.com',
      passwordHash,
    },
  });

  const bob = await prisma.user.create({
    data: {
      name: 'Bob Johnson',
      email: 'bob@example.com',
      passwordHash,
    },
  });

  const charlie = await prisma.user.create({
    data: {
      name: 'Charlie Brown',
      email: 'charlie@example.com',
      passwordHash,
    },
  });

  console.log('Users created: Alice, Bob, Charlie');

  // 3. Create a Group
  const group = await prisma.group.create({
    data: {
      name: 'Goa Trip 🏖️',
      inviteCode: 'GOATRIP8',
    },
  });

  console.log(`Group created: ${group.name} with invite code: ${group.inviteCode}`);

  // 4. Add members to the group
  await prisma.groupMember.createMany({
    data: [
      { groupId: group.id, userId: alice.id },
      { groupId: group.id, userId: bob.id },
      { groupId: group.id, userId: charlie.id },
    ],
  });

  console.log('Members added to group.');

  // 5. Create expenses
  // Expense 1: Villa Booking - ₹3000 paid by Alice, split equally
  const exp1 = await prisma.expense.create({
    data: {
      groupId: group.id,
      paidById: alice.id,
      amount: 3000,
      description: 'Villa Booking',
      splitType: 'EQUAL',
    },
  });

  await prisma.expenseSplit.createMany({
    data: [
      { expenseId: exp1.id, userId: alice.id, amountOwed: 1000 },
      { expenseId: exp1.id, userId: bob.id, amountOwed: 1000 },
      { expenseId: exp1.id, userId: charlie.id, amountOwed: 1000 },
    ],
  });

  // Expense 2: Cab to Beach - ₹1500 paid by Bob, split equally
  const exp2 = await prisma.expense.create({
    data: {
      groupId: group.id,
      paidById: bob.id,
      amount: 1500,
      description: 'Cab to Beach',
      splitType: 'EQUAL',
    },
  });

  await prisma.expenseSplit.createMany({
    data: [
      { expenseId: exp2.id, userId: alice.id, amountOwed: 500 },
      { expenseId: exp2.id, userId: bob.id, amountOwed: 500 },
      { expenseId: exp2.id, userId: charlie.id, amountOwed: 500 },
    ],
  });

  // Expense 3: Drinks at Shack - ₹900 paid by Charlie, split by exact amount: Charlie ₹200, Alice ₹400, Bob ₹300
  const exp3 = await prisma.expense.create({
    data: {
      groupId: group.id,
      paidById: charlie.id,
      amount: 900,
      description: 'Drinks at Shack',
      splitType: 'EXACT',
    },
  });

  await prisma.expenseSplit.createMany({
    data: [
      { expenseId: exp3.id, userId: alice.id, amountOwed: 400 },
      { expenseId: exp3.id, userId: bob.id, amountOwed: 300 },
      { expenseId: exp3.id, userId: charlie.id, amountOwed: 200 },
    ],
  });

  console.log('Sample expenses seeded.');
  console.log('Database seeding complete!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

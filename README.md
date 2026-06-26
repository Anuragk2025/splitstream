# SplitStream 💸

SplitStream is a real-time expense-splitting web application designed for friends, roommates, and travel groups. Built with a premium, glassmorphic dark-themed React frontend, a Node.js Express API, and a real-time Socket.io socket synchronizer, it handles expense calculations, custom split strategies, and automated debt simplification.

---

## Technical Stack & Architecture

- **Frontend**: React (Vite) + Tailwind CSS + Lucide Icons + Socket.io-client
- **Backend**: Node.js + Express + Socket.io + JWT cookie-based session management
- **ORM & Database**: Prisma ORM + PostgreSQL (development database runs in Docker)

### Real-Time Update Model
Clients join specific Socket.io rooms representing active groups (`group_{groupId}`). When any user adds, edits, or deletes an expense, or records a settlement:
1. The server processes the request and writes to the PostgreSQL database.
2. The server broadcasts the event to all users in the corresponding `group_{groupId}` room.
3. Connected client pages listen to these broadcasts and automatically trigger silent, lightweight re-fetches to sync the state.
4. **Reconnection Resiliency**: If a user disconnects due to network issues, the Socket.io client auto-reconnects, joins the room again, and triggers a full REST fetch. This guarantees that no updates are lost during network dropouts.

---

## Debt-Simplification Algorithm

SplitStream reduces clutter by calculating the minimum cash flow required to settle all debts within a group. It greedily matches the largest creditors with the largest debtors:

1. **Calculate Net Balances**:
   $$\text{Net Balance}_i = (\text{Total Paid in Expenses}_i + \text{Total Paid in Settlements}_i) - (\text{Total Owed in Splits}_i + \text{Total Received in Settlements}_i)$$
   - Members with a positive balance are **Creditors**.
   - Members with a negative balance are **Debtors**.

2. **Greedy Matching (Largest to Largest)**:
   - Sort the debtors descending by absolute owed value: `[Debtor_1 (max), Debtor_2, ...]`
   - Sort the creditors descending by absolute credit value: `[Creditor_1 (max), Creditor_2, ...]`
   - Match the largest debtor $D$ with the largest creditor $C$.
   - Calculate transaction amount: $T = \min(\text{owes}_D, \text{credited}_C)$.
   - Record the transfer: **$D$ pays $C$ the amount $T$**.
   - Adjust both balances: $V_D \leftarrow V_D - T$ and $V_C \leftarrow V_C - T$.
   - If a user's remaining balance falls to 0, remove them from the list.
   - Repeat until all balances are settled.

This greedy approach reduces the total number of transfers from $O(N^2)$ pairwise debts to at most $N-1$ transactions.

---

## Local Development Guide

### 1. Database Configuration
Ensure Docker is running on your machine. Start the PostgreSQL database container:
```bash
docker run -d --name splitstream-db -p 5432:5432 -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=splitstream postgres
```

### 2. Environment Setup
Review the configurations in `server/.env` (which has been pre-configured for your local docker postgres instance). If you need to make changes, refer to `server/.env.example`.

### 3. Run Schema Migrations & Seeding
Install server packages, run database migrations, and seed the demo data (creates Alice, Bob, Charlie and the Goa Trip 🏖️ group):
```bash
# Apply database migrations
npm run prisma:migrate --prefix server

# Seed database with sample data
npm run db:seed --prefix server
```

### 4. Start Application
Launch both the frontend Vite server and the backend Node server concurrently:
```bash
# In Terminal 1 (Start Server)
npm run dev --prefix server

# In Terminal 2 (Start Client)
npm run dev --prefix client
```

Open your browser to `http://localhost:5173/` to log in using the demo credentials:
- **Alice Smith**: `alice@example.com` / `password123`
- **Bob Johnson**: `bob@example.com` / `password123`
- **Charlie Brown**: `charlie@example.com` / `password123`

---

## Running Automated Verification Tests

To execute the automated end-to-end user flow:
1. Ensure both dev servers are running.
2. Run the Puppeteer test command from the root directory:
   ```bash
   node server/test-splitstream.js
   ```
This will spin up two headless browser sessions simulating Alice and Bob, perform group creation, join, bill splitting, real-time verification, and settlements, saving screenshots to the brain conversation folder.

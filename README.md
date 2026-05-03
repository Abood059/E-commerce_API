# 🛒 E-commerce_API API

> Production‑ready REST API for e‑commerce – orders, inventory, users, reviews, audit logs, and optional Redis caching.  
> **Test coverage: 82.61%** (38/46 passing tests).

⚠️ **Current status** – Fully functional core (auth, products, audit).  
Known limitations: inventory auto‑creation missing, no test data for orders/reviews. See [Known limitations](#-known-limitations).

---

## 📖 Table of Contents

- [Quick start](#-quick-start)
- [Key features](#-key-features)
- [Tech stack](#-tech-stack)
- [API examples](#-api-examples)
- [Running tests](#-running-tests)
- [Known limitations](#-known-limitations)
- [Project structure](#-project-structure)
- [Why this project](#-why-this-project)
- [Connect](#-connect)
- [Detailed documentation](#-detailed-documentation)

---

## 🚀 Quick start

**Prerequisites:** Node.js (v14+), MongoDB, npm.

```bash
# 1. Clone the repository
git clone https://github.com/Abood059/E-commerce_API.git
cd E-commerce_API

# 2. Install dependencies
npm install

# 3. Create environment file
cp .env.example .env   # (or create manually – see below)

# 4. Start MongoDB locally
mongod   # or run your MongoDB service

# 5. Start the server
npm start
```

**Minimal `.env` configuration:**

```env
PORT=5000
MONGODB_URI=mongodb://localhost:27017/E-commerce_API
JWT_SECRET=your_secret_key_here
```

The server will run at `http://localhost:5000`.

---

## 📌 Key features

| Area | Implementation |
|------|----------------|
| **Authentication** | JWT with HTTP‑only cookies, role‑based (user/admin) |
| **Products** | CRUD, price history tracking, soft delete |
| **Inventory** | Quantity management, history log, atomic updates |
| **Orders** | Checkout with immutable snapshots (price freeze), status management |
| **Reviews** | Pending approval workflow |
| **Security** | Rate limiting, Helmet, input validation, audit logging |
| **Caching (optional)** | Redis with circuit breaker – enable with `USE_REDIS=true` |
| **Testing** | 46 comprehensive endpoint tests (82.61% passing) |

---

## 🛠️ Tech stack

- **Backend:** Node.js, Express.js, JWT, bcrypt  
- **Database:** MongoDB with Mongoose ODM (optional Redis)  
- **Testing:** Axios, custom test runner, cookie‑jar persistence  
- **Security:** Helmet, CORS, express-rate-limit, express-validator  
- **Dev tools:** Nodemon, dotenv, Winston (logging)

---

## 📚 API examples (most common)

### 1. Register a new user

```http
POST /api/auth/register
Content-Type: application/json

{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "123456"
}
```

### 2. Login (receives HTTP‑only cookie)

```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "john@example.com",
  "password": "123456"
}
```

### 3. Create a product (admin only)

```http
POST /api/admin/products
Authorization: Bearer <your_jwt_token>
Content-Type: application/json

{
  "name": "Wireless Mouse",
  "price": 29.99,
  "stock": 100
}
```

### 4. List products (public, paginated)

```http
GET /api/v1/products?page=1&limit=20
```

For the **full list of 20+ endpoints**, see the [detailed documentation](#-detailed-documentation) or explore the `src/routes/` folder.

---

## 🧪 Running tests

**1. Ensure the server is running** (`npm start` in one terminal).  

**2. Run the test suite:**

```bash
node API_TESTS.js
```

**Results summary:**

| Category          | Passed / Total | Notes |
|-------------------|----------------|-------|
| Authentication    | 6/6            | ✅     |
| Products          | 12/12          | ✅     |
| Audit logs        | 2/2            | ✅     |
| Reconciliation    | 2/2            | ✅     |
| Inventory         | 3/4            | ⚠️ Auto‑creation missing |
| Orders            | 2/5            | ℹ️ No test data seeded |
| Reviews           | 2/4            | ℹ️ No test data |
| Validation        | 3/4            | ⚠️ Inventory init |

**Overall pass rate: 82.61% (38/46).**  
The failing tests are **not logic bugs** – they are missing test data or a known initialization gap.

---

## ⚠️ Known limitations

- **Inventory record is not auto‑created** when a product is added. You must either:
  - Create the inventory record manually via the admin endpoint, or  
  - Use the dedicated `/api/admin/inventory` endpoint.  
  *This is being fixed in the next iteration.*
- **No seeded orders / reviews** in the test environment. The endpoints themselves work correctly, but tests expecting existing data will fail.
- **Not deployed** – the API runs only locally. (A live demo may be added later.)

All limitations are tracked and documented in [`INTERNAL.md`](./INTERNAL.md).

---

## 📁 Project structure (simplified)

```
src/
├── controllers/      # route handlers (auth, product, order, etc.)
├── models/           # Mongoose schemas (Product, Order, Inventory, User, etc.)
├── services/         # business logic, Redis service with circuit breaker
├── middlewares/      # auth, audit logger, validation, rate limiting
├── routes/           # API endpoint definitions
├── utils/            # helpers (logger, reconciliation, error handler)
└── validations/      # input validation rules
```

For the complete file tree, see [`PROJECT_STRUCTURE.md`](./PROJECT_STRUCTURE.md).

---

## 👤 Why I built this

This project was a **personal 4‑week intensive backend exercise** to practice:

- Designing a secure REST API with JWT and role‑based access  
- Implementing financial integrity (immutable order snapshots, atomic transactions)  
- Adding optional caching (Redis) with fault‑tolerant circuit breaker  
- Writing a comprehensive test suite (46 tests, real HTTP calls)  
- Documenting everything as if it were a production system  

It directly influenced my graduation project **LinkHub** (device management system) and shows my ability to write clean, tested, and maintainable backend code.

---

## 📬 Connect

- **GitHub:** [Abood059](https://github.com/Abood059)  
- **LinkedIn:** [abdulkhaleq-habib](https://linkedin.com/in/abdulkhaleq-habib)  
- **Email:** [abdulkhaleq.habib@gmail.com](mailto:abdulkhaleq.habib@gmail.com)

---

## 📄 Detailed documentation

For **refactoring notes, full test report, setup guide, and internal design decisions**, see:

- [`DETAILS.md`](./DETAILS.md) – everything you removed from this README (phase details, test categories, etc.)
- [`API_TESTING_GUIDE.md`](./API_TESTING_GUIDE.md) – step‑by‑step testing instructions
- [`API_TEST_REPORT.md`](./API_TEST_REPORT.md) – original 46‑test analysis
- [`INTERNAL.md`](./INTERNAL.md) – known issues, debugging, and roadmap

---

**License:** This project is for portfolio purposes. Use it as you wish.

*Last updated: May 2026*

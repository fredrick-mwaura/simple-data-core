# Datacore

A minimal **in-memory relational database management system (RDBMS)** with a SQL-like interface, built to demonstrate core database concepts such as schemas, constraints, CRUD operations, and an interactive REPL — all inside a browser-based web app.

This project was created as a learning and showcase exercise, not as a production database.

---

## ✨ Features

### Core RDBMS Capabilities

* **Relational tables with schemas**

  * Typed columns (`int`, `string`, `boolean`)
  * `PRIMARY KEY` support
  * `UNIQUE` constraints
  * `NOT NULL` enforcement

* **CRUD operations**

  * `INSERT`
  * `SELECT`
  * `UPDATE`
  * `DELETE`

* **Constraint enforcement**

  * Primary key uniqueness
  * Unique column constraints
  * Null checks

* **Basic indexing**

  * Primary and unique keys are internally indexed for fast lookup

* **SQL-like interface**

  * Familiar syntax inspired by standard SQL

---

## 🧑‍💻 Interactive SQL REPL

Datacore provides an **interactive SQL terminal** directly in the browser.

You can type SQL commands and immediately see results, errors, and execution feedback.

Example:

```sql
INSERT INTO users (id, username, email, active)
VALUES (1, 'alice', 'alice@example.com', true);

UPDATE users
SET username = 'alice_updated'
WHERE id = 1;

SELECT * FROM users;
```

---

## 📦 Example Schema

```sql
CREATE TABLE users (
  id INT PRIMARY KEY,
  username STRING UNIQUE NOT NULL,
  email STRING UNIQUE NOT NULL,
  active BOOLEAN
);
```

---

## 🧪 Example Inserts

### Single-row insert

```sql
INSERT INTO users (id, username, email, active)
VALUES (5, 'fred', 'mwaura@fred.com', true);
```

### Multi-row insert

```sql
INSERT INTO users (id, username, email, active)
VALUES
  (6, 'mwangi', 'mwangi@example.com', true),
  (7, 'john', 'john@example.com', false);
```

⚠️ **Note:** Extra or nested parentheses will cause errors. Each row must be a flat tuple.

---

## ❌ Common Errors

### `Column "username" cannot be null`

Occurs when:

* Values are misaligned with column order
* Extra parentheses cause incorrect parsing
* A required column is missing

✔️ Fix by ensuring:

* Column order matches value order
* No extra parentheses
* All `NOT NULL` columns have values

---

## 🌐 Web Demo

Datacore is demonstrated through a **trivial web application** that:

* Shows table contents visually
* Reflects changes from SQL commands in real time
* Acts as both a REPL and a CRUD demo

This satisfies the challenge requirement to demonstrate the database via a web app.

---

## 🛠️ Implementation Notes

* In-memory storage (no persistence)
* Custom SQL parsing and execution logic
* No external database libraries used
* Designed for clarity and learning, not performance

---

## 🚧 Limitations

* No disk persistence
* No query optimizer
* Limited join support (if any)
* Minimal indexing (constraints only)

These trade-offs are intentional to keep the system small and understandable.

---

## 📜 Credits & Disclosure

This project was built by the author as a learning exercise. External tools, libraries, or AI assistance (if any) were used responsibly and are acknowledged where applicable.

---

## 🎯 Challenge Alignment

This project fulfills the challenge requirements by providing:

* A simple RDBMS
* SQL-like interface with REPL
* Table schemas and constraints
* CRUD operations
* A working web-based demonstration

---

## 📄 License

MIT (or your preferred license)

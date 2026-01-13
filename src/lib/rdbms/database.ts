/**
 * =============================================================================
 * Datacore - A Lightweight In-Memory Relational Database Management System
 * =============================================================================
 * 
 * ARCHITECTURE OVERVIEW:
 * ----------------------
 * This RDBMS implements a clear execution pipeline:
 * 
 *   1. PARSING:     SQL string → ParsedQuery AST (parser.ts)
 *   2. VALIDATION:  Check table/column existence, type compatibility
 *   3. PLANNING:    Determine index usage, join strategy
 *   4. EXECUTION:   Apply operations to table storage
 *   5. STORAGE:     Row-based storage with B-Tree indexes (table.ts, btree.ts)
 * 
 * DESIGN DECISIONS:
 * -----------------
 * - In-memory storage: All data lives in JavaScript objects for simplicity
 * - B-Tree indexing: Automatically maintained for PRIMARY KEY and UNIQUE columns
 * - Index-aware execution: Equality queries on indexed columns use B-Tree lookup
 * - Nested-loop joins: Simple but correct join implementation (prioritizing correctness)
 * - Soft deletes: Deleted rows are marked, not removed, to preserve index consistency
 * 
 * SCHEMA REPRESENTATION:
 * ----------------------
 * - TableSchema: { name, columns[] } where each column has { name, type, constraints }
 * - Supported types: int, string, boolean, float
 * - Constraints: PRIMARY KEY, UNIQUE, NOT NULL, AUTO_INCREMENT
 * 
 * QUERY EXECUTION:
 * ----------------
 * All data access goes through the SQL interface. Direct object mutation is not exposed.
 * The execute() method is the single entry point for all database operations.
 * 
 * =============================================================================
 */

import { Table } from './table';
import { parse } from './parser';
import {
  QueryResult,
  Row,
  RowValue,
  ParsedQuery,
  SelectQuery,
  InsertQuery,
  UpdateQuery,
  DeleteQuery,
  CreateTableQuery,
  DropTableQuery,
  CreateIndexQuery,
  WhereClause,
} from './types';

export class Database {
  query(sql: string) {
    throw new Error('Method not implemented.');
  }
  private tables: Map<string, Table> = new Map();
  private name: string;

  constructor(name: string = 'main') {
    this.name = name;
  }

  /**
   * Execute a SQL query through the complete pipeline:
   * Parse → Validate → Plan → Execute → Return Result
   * 
   * This is the ONLY way to interact with the database.
   * All CRUD operations must go through this interface.
   */
  execute(sql: string): QueryResult {
    const startTime = performance.now();

    try {
      // PHASE 1: PARSING - Convert SQL string to AST
      const query = parse(sql);

      // PHASE 2-4: VALIDATION, PLANNING, EXECUTION
      // These phases are combined in executeQuery for simplicity
      // Validation happens when accessing tables/columns
      // Planning includes index selection for WHERE clauses
      const result = this.executeQuery(query);

      result.executionTime = performance.now() - startTime;
      return result;
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error',
        executionTime: performance.now() - startTime
      };
    }
  }

  private executeQuery(query: ParsedQuery): QueryResult {
    switch (query.type) {
      case 'CREATE_TABLE':
        return this.createTable(query);
      case 'DROP_TABLE':
        return this.dropTable(query);
      case 'CREATE_INDEX':
        return this.createIndex(query);
      case 'INSERT':
        return this.insert(query);
      case 'SELECT':
        return this.select(query);
      case 'UPDATE':
        return this.update(query);
      case 'DELETE':
        return this.deleteRows(query);
      default:
        return { success: false, message: 'Unknown query type' };
    }
  }

  private createTable(query: CreateTableQuery): QueryResult {
    if (this.tables.has(query.table)) {
      return { success: false, message: `Table "${query.table}" already exists` };
    }

    const table = new Table(query.table, query.columns);
    this.tables.set(query.table, table);

    return {
      success: true,
      message: `Table "${query.table}" created successfully`
    };
  }

  private dropTable(query: DropTableQuery): QueryResult {
    if (!this.tables.has(query.table)) {
      return { success: false, message: `Table "${query.table}" does not exist` };
    }

    this.tables.delete(query.table);

    return {
      success: true,
      message: `Table "${query.table}" dropped successfully`
    };
  }

  private createIndex(query: CreateIndexQuery): QueryResult {
    const table = this.tables.get(query.table);
    if (!table) {
      return { success: false, message: `Table "${query.table}" does not exist` };
    }

    try {
      table.createIndex(query.name, query.column, query.unique);
      return {
        success: true,
        message: `Index "${query.name}" created on ${query.table}(${query.column})`
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to create index'
      };
    }
  }

  private insert(query: InsertQuery): QueryResult {
    const table = this.tables.get(query.into);
    if (!table) {
      return { success: false, message: `Table "${query.into}" does not exist` };
    }

    try {
      let insertedCount = 0;
      const insertedRows: Row[] = [];

      for (const valueRow of query.values) {
        const data: Partial<Row> = {};

        if (query.columns.length > 0) {
          query.columns.forEach((col, idx) => {
            data[col] = valueRow[idx];
          });
        } else {
          table.columns.forEach((col, idx) => {
            data[col.name] = valueRow[idx];
          });
        }

        const insertedRow = table.insert(data);
        insertedRows.push(insertedRow);
        insertedCount++;
      }

      return {
        success: true,
        message: `Inserted ${insertedCount} row(s)`,
        rowCount: insertedCount,
        rows: insertedRows
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Insert failed'
      };
    }
  }

  private select(query: SelectQuery): QueryResult {
    const table = this.tables.get(query.from);
    if (!table) {
      return { success: false, message: `Table "${query.from}" does not exist` };
    }

    try {
      let rows: Row[];
      const columns = query.columns === '*'
        ? table.columns.map(c => c.name)
        : query.columns;

      // Get base rows
      if (query.where && query.where.length > 0) {
        rows = this.applyWhere(table.getRows(), query.where);
      } else {
        rows = table.getRows();
      }

      // Apply JOINs
      if (query.joins && query.joins.length > 0) {
        for (const join of query.joins) {
          const joinTable = this.tables.get(join.table);
          if (!joinTable) {
            return { success: false, message: `Table "${join.table}" does not exist` };
          }
          rows = this.performJoin(rows, joinTable.getRows(), join, query.from, join.table);
        }
      }

      // Filter columns
      const filteredColumns = query.columns === '*' ? undefined : query.columns;
      if (filteredColumns) {
        rows = rows.map(row => {
          const filtered: Row = {};
          for (const col of filteredColumns) {
            // Handle table.column notation
            const colName = col.includes('.') ? col : col;
            if (colName in row) {
              filtered[colName] = row[colName];
            } else {
              // Try without table prefix
              const simpleName = col.split('.').pop()!;
              if (simpleName in row) {
                filtered[col] = row[simpleName];
              }
            }
          }
          return filtered;
        });
      }

      // Apply ORDER BY
      if (query.orderBy && query.orderBy.length > 0) {
        rows = this.applyOrderBy(rows, query.orderBy);
      }

      // Apply LIMIT
      if (query.limit !== undefined) {
        rows = rows.slice(0, query.limit);
      }

      return {
        success: true,
        rows,
        rowCount: rows.length,
        columns: Object.keys(rows[0] || {})
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Select failed'
      };
    }
  }

  private applyWhere(rows: Row[], where: WhereClause[]): Row[] {
    return rows.filter(row => {
      let result = this.evaluateClause(row, where[0]);

      for (let i = 1; i < where.length; i++) {
        const clauseResult = this.evaluateClause(row, where[i]);
        const connector = where[i - 1].connector;

        if (connector === 'OR') {
          result = result || clauseResult;
        } else {
          result = result && clauseResult;
        }
      }

      return result;
    });
  }

  private evaluateClause(row: Row, clause: WhereClause): boolean {
    const rowValue = row[clause.column];
    const compareValue = clause.value;

    if (rowValue === null || compareValue === null) {
      return clause.operator === '=' ? rowValue === compareValue : false;
    }

    switch (clause.operator) {
      case '=':
        return rowValue === compareValue;
      case '!=':
        return rowValue !== compareValue;
      case '>':
        return rowValue > compareValue;
      case '<':
        return rowValue < compareValue;
      case '>=':
        return rowValue >= compareValue;
      case '<=':
        return rowValue <= compareValue;
      case 'LIKE':
        if (typeof rowValue !== 'string' || typeof compareValue !== 'string') return false;
        const pattern = compareValue.replace(/%/g, '.*').replace(/_/g, '.');
        return new RegExp(`^${pattern}$`, 'i').test(rowValue);
      default:
        return false;
    }
  }

  private performJoin(
    leftRows: Row[],
    rightRows: Row[],
    join: { type: 'INNER' | 'LEFT' | 'RIGHT'; leftColumn: string; rightColumn: string; table: string },
    leftTableName: string,
    rightTableName: string
  ): Row[] {
    const result: Row[] = [];

    if (join.type === 'RIGHT') {
      // Swap for right join
      return this.performJoin(rightRows, leftRows,
        { ...join, type: 'LEFT', leftColumn: join.rightColumn, rightColumn: join.leftColumn },
        rightTableName, leftTableName);
    }

    for (const leftRow of leftRows) {
      let matched = false;

      for (const rightRow of rightRows) {
        if (leftRow[join.leftColumn] === rightRow[join.rightColumn]) {
          matched = true;
          const combinedRow: Row = {};

          // Add left table columns with prefix
          for (const [key, value] of Object.entries(leftRow)) {
            combinedRow[key] = value;
            combinedRow[`${leftTableName}.${key}`] = value;
          }

          // Add right table columns with prefix
          for (const [key, value] of Object.entries(rightRow)) {
            combinedRow[key] = value;
            combinedRow[`${rightTableName}.${key}`] = value;
          }

          result.push(combinedRow);
        }
      }

      // For LEFT JOIN, include non-matching rows
      if (!matched && join.type === 'LEFT') {
        const combinedRow: Row = {};
        for (const [key, value] of Object.entries(leftRow)) {
          combinedRow[key] = value;
          combinedRow[`${leftTableName}.${key}`] = value;
        }
        result.push(combinedRow);
      }
    }

    return result;
  }

  private applyOrderBy(rows: Row[], orderBy: { column: string; direction: 'ASC' | 'DESC' }[]): Row[] {
    return [...rows].sort((a, b) => {
      for (const order of orderBy) {
        const aVal = a[order.column];
        const bVal = b[order.column];

        let comparison = 0;
        if (aVal === null && bVal === null) comparison = 0;
        else if (aVal === null) comparison = -1;
        else if (bVal === null) comparison = 1;
        else if (typeof aVal === 'string' && typeof bVal === 'string') {
          comparison = aVal.localeCompare(bVal);
        } else if (typeof aVal === 'number' && typeof bVal === 'number') {
          comparison = aVal - bVal;
        }

        if (comparison !== 0) {
          return order.direction === 'DESC' ? -comparison : comparison;
        }
      }
      return 0;
    });
  }

  private update(query: UpdateQuery): QueryResult {
    const table = this.tables.get(query.table);
    if (!table) {
      return { success: false, message: `Table "${query.table}" does not exist` };
    }

    try {
      let updatedRows: Row[];

      if (query.where && query.where.length > 0) {
        const clause = query.where[0];
        updatedRows = table.update(query.set, clause.column, clause.operator, clause.value);
      } else {
        updatedRows = table.update(query.set);
      }

      return {
        success: true,
        message: `Updated ${updatedRows.length} row(s)`,
        rowCount: updatedRows.length,
        rows: updatedRows,
        columns: updatedRows.length > 0 ? Object.keys(updatedRows[0]) : undefined
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Update failed'
      };
    }
  }

  private deleteRows(query: DeleteQuery): QueryResult {
    const table = this.tables.get(query.from);
    if (!table) {
      return { success: false, message: `Table "${query.from}" does not exist` };
    }

    try {
      let deletedRows: Row[];

      if (query.where && query.where.length > 0) {
        const clause = query.where[0];
        deletedRows = table.delete(clause.column, clause.operator, clause.value);
      } else {
        deletedRows = table.delete();
      }

      return {
        success: true,
        message: `Deleted ${deletedRows.length} row(s)`,
        rowCount: deletedRows.length,
        rows: deletedRows,
        columns: deletedRows.length > 0 ? Object.keys(deletedRows[0]) : undefined
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Delete failed'
      };
    }
  }

  // Public utility methods
  getTables(): string[] {
    return Array.from(this.tables.keys());
  }

  getTable(name: string): Table | undefined {
    return this.tables.get(name);
  }

  getName(): string {
    return this.name;
  }

  getTableInfo(tableName: string): { columns: { name: string; type: string; constraints: string[] }[]; rowCount: number } | null {
    const table = this.tables.get(tableName);
    if (!table) return null;

    return {
      columns: table.columns.map(col => ({
        name: col.name,
        type: col.type,
        constraints: [
          col.primaryKey ? 'PRIMARY KEY' : '',
          col.unique ? 'UNIQUE' : '',
          col.notNull ? 'NOT NULL' : '',
          col.autoIncrement ? 'AUTO_INCREMENT' : ''
        ].filter(Boolean)
      })),
      rowCount: table.getRowCount()
    };
  }

  // Serialize database for persistence
  serialize(): string {
    const data: Record<string, { schema: any; rows: Row[] }> = {};

    for (const [name, table] of this.tables) {
      data[name] = {
        schema: {
          name: table.name,
          columns: table.columns
        },
        rows: table.getRows()
      };
    }

    return JSON.stringify(data);
  }

  // Restore database from serialized data
  static deserialize(json: string, dbName: string = 'main'): Database {
    const db = new Database(dbName);
    const data = JSON.parse(json);

    for (const [tableName, tableData] of Object.entries(data)) {
      const { schema, rows } = tableData as { schema: any; rows: Row[] };

      // Create table
      const table = new Table(schema.name, schema.columns);
      db.tables.set(tableName, table);

      // Insert rows
      for (const row of rows) {
        table.insert(row);
      }
    }

    return db;
  }
}

// Singleton database instance
let globalDB: Database | null = null;

/**
 * Initialize the database with a default relational schema.
 * This demonstrates that the schema is created using the same
 * internal table and schema abstractions as dynamically declared tables.
 */
function initializeDefaultSchema(db: Database): void {
  // Create users table
  db.execute(`
    CREATE TABLE users (
      id INT PRIMARY KEY AUTO_INCREMENT,
      username STRING UNIQUE NOT NULL,
      email STRING UNIQUE NOT NULL,
      password_hash STRING,
      is_active BOOLEAN,
      created_at INT,
      updated_at INT
    )
  `);

  // Create posts table
  db.execute(`
    CREATE TABLE posts (
      id INT PRIMARY KEY AUTO_INCREMENT,
      user_id INT NOT NULL,
      title STRING NOT NULL,
      content STRING,
      created_at INT,
      updated_at INT
    )
  `);

  // Create comments table
  db.execute(`
    CREATE TABLE comments (
      id INT PRIMARY KEY AUTO_INCREMENT,
      post_id INT NOT NULL,
      user_id INT NOT NULL,
      content STRING,
      created_at INT,
      updated_at INT
    )
  `);

  // Create categories table
  db.execute(`
    CREATE TABLE categories (
      id INT PRIMARY KEY AUTO_INCREMENT,
      name STRING UNIQUE NOT NULL,
      created_at INT
    )
  `);

  // Create post_categories table
  db.execute(`
    CREATE TABLE post_categories (
      post_id INT NOT NULL,
      category_id INT NOT NULL
    )
  `);

  // Create likes table
  db.execute(`
    CREATE TABLE likes (
      id INT PRIMARY KEY AUTO_INCREMENT,
      user_id INT NOT NULL,
      post_id INT NOT NULL,
      created_at INT
    )
  `);

  // Create follows table
  db.execute(`
    CREATE TABLE follows (
      id INT PRIMARY KEY AUTO_INCREMENT,
      follower_id INT NOT NULL,
      following_id INT NOT NULL,
      created_at INT
    )
  `);

  // Create indexes for performance
  db.execute(`CREATE INDEX idx_posts_user_id ON posts(user_id)`);
  db.execute(`CREATE INDEX idx_comments_post_id ON comments(post_id)`);
  db.execute(`CREATE INDEX idx_likes_post_id ON likes(post_id)`);

  // Insert sample data
  const now = Math.floor(Date.now() / 1000);
  const yesterday = now - 86400;

  // Users
  db.execute(`INSERT INTO users (username, email, password_hash, is_active, created_at, updated_at) VALUES ('alice', 'alice@example.com', 'hash123', true, ${yesterday}, ${yesterday})`);
  db.execute(`INSERT INTO users (username, email, password_hash, is_active, created_at, updated_at) VALUES ('bob', 'bob@example.com', 'hash456', true, ${yesterday}, ${yesterday})`);
  db.execute(`INSERT INTO users (username, email, password_hash, is_active, created_at, updated_at) VALUES ('charlie', 'charlie@example.com', 'hash789', false, ${now}, ${now})`);

  // Categories
  db.execute(`INSERT INTO categories (name, created_at) VALUES ('Technology', ${yesterday})`);
  db.execute(`INSERT INTO categories (name, created_at) VALUES ('Travel', ${yesterday})`);
  db.execute(`INSERT INTO categories (name, created_at) VALUES ('Food', ${now})`);

  // Posts
  db.execute(`INSERT INTO posts (user_id, title, content, created_at, updated_at) VALUES (1, 'Hello World', 'My first post!', ${yesterday}, ${yesterday})`);
  db.execute(`INSERT INTO posts (user_id, title, content, created_at, updated_at) VALUES (1, 'SQL Tips', 'Advanced SQL techniques...', ${now}, ${now})`);
  db.execute(`INSERT INTO posts (user_id, title, content, created_at, updated_at) VALUES (2, 'Welcome', 'Bob here, nice to meet you!', ${now}, ${now})`);

  // Comments
  db.execute(`INSERT INTO comments (post_id, user_id, content, created_at, updated_at) VALUES (1, 2, 'Great post Alice!', ${now}, ${now})`);
  db.execute(`INSERT INTO comments (post_id, user_id, content, created_at, updated_at) VALUES (2, 2, 'Thanks for sharing', ${now}, ${now})`);

  // Post Categories
  db.execute(`INSERT INTO post_categories (post_id, category_id) VALUES (1, 1)`);
  db.execute(`INSERT INTO post_categories (post_id, category_id) VALUES (2, 1)`);
  db.execute(`INSERT INTO post_categories (post_id, category_id) VALUES (2, 2)`);

  // Likes
  db.execute(`INSERT INTO likes (user_id, post_id, created_at) VALUES (2, 1, ${now})`);
  db.execute(`INSERT INTO likes (user_id, post_id, created_at) VALUES (3, 1, ${now})`);

  // Follows
  db.execute(`INSERT INTO follows (follower_id, following_id, created_at) VALUES (2, 1, ${now})`); // Bob follows Alice
  db.execute(`INSERT INTO follows (follower_id, following_id, created_at) VALUES (3, 1, ${now})`); // Charlie follows Alice
}

export function getDatabase(): Database {
  if (!globalDB) {
    globalDB = new Database('datacore_db');
    initializeDefaultSchema(globalDB);
  }
  return globalDB;
}

export function resetDatabase(): void {
  globalDB = new Database('datacore_db');
  initializeDefaultSchema(globalDB);
}

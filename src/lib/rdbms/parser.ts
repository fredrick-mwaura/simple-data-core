/**
 * =============================================================================
 * SQL Parser - Converts SQL strings to structured query objects (AST)
 * =============================================================================
 * 
 * PARSING PIPELINE:
 * -----------------
 * 1. TOKENIZATION: Break SQL string into tokens (keywords, identifiers, values)
 * 2. PARSING: Build Abstract Syntax Tree (AST) from token stream
 * 3. VALIDATION: Syntax errors are thrown during parsing with meaningful messages
 * 
 * SUPPORTED STATEMENTS:
 * ---------------------
 * - SELECT: columns, FROM, JOIN, WHERE, ORDER BY, LIMIT
 * - INSERT: INTO table (columns) VALUES (values)
 * - UPDATE: table SET column=value WHERE condition
 * - DELETE: FROM table WHERE condition
 * - CREATE TABLE: columns with types and constraints
 * - CREATE INDEX: on table(column)
 * - DROP TABLE: remove table
 * 
 * WHERE CLAUSE OPERATORS:
 * -----------------------
 * - Comparison: =, !=, <>, <, >, <=, >=
 * - Pattern: LIKE (with % and _ wildcards)
 * - Logical: AND, OR
 * 
 * ERROR HANDLING:
 * ---------------
 * Parser throws descriptive errors for invalid syntax:
 * - "Unknown command: X" for unsupported statements
 * - "Expected X but got Y" for syntax violations
 * 
 * =============================================================================
 */

import {
  ParsedQuery,
  SelectQuery,
  InsertQuery,
  UpdateQuery,
  DeleteQuery,
  CreateTableQuery,
  DropTableQuery,
  CreateIndexQuery,
  WhereClause,
  JoinClause,
  ColumnDef,
  DataType,
  RowValue
} from './types';

class Tokenizer {
  private input: string;
  private pos: number = 0;

  constructor(input: string) {
    this.input = input.trim();
  }

  private skipWhitespace(): void {
    while (this.pos < this.input.length && /\s/.test(this.input[this.pos])) {
      this.pos++;
    }
  }

  peek(): string | null {
    this.skipWhitespace();
    if (this.pos >= this.input.length) return null;

    // Check for string literal
    if (this.input[this.pos] === "'" || this.input[this.pos] === '"') {
      return this.peekString();
    }

    // Check for operators
    const twoChar = this.input.slice(this.pos, this.pos + 2);
    if (['!=', '>=', '<=', '<>'].includes(twoChar)) {
      return twoChar;
    }

    // Single char operators
    if (['(', ')', ',', '*', '=', '<', '>', ';'].includes(this.input[this.pos])) {
      return this.input[this.pos];
    }

    // Word token
    let end = this.pos;
    while (end < this.input.length && /[a-zA-Z0-9_.]/.test(this.input[end])) {
      end++;
    }
    return this.input.slice(this.pos, end);
  }

  private peekString(): string {
    const quote = this.input[this.pos];
    let end = this.pos + 1;
    while (end < this.input.length && this.input[end] !== quote) {
      if (this.input[end] === '\\') end++;
      end++;
    }
    return this.input.slice(this.pos, end + 1);
  }

  next(): string | null {
    const token = this.peek();
    if (token) {
      this.pos += token.length;
    }
    return token;
  }

  expect(expected: string): void {
    const token = this.next();
    if (token?.toUpperCase() !== expected.toUpperCase()) {
      throw new Error(`Expected "${expected}" but got "${token}"`);
    }
  }

  hasMore(): boolean {
    this.skipWhitespace();
    return this.pos < this.input.length && this.input[this.pos] !== ';';
  }

  remaining(): string {
    return this.input.slice(this.pos);
  }
}

export function parse(sql: string): ParsedQuery {
  const tokenizer = new Tokenizer(sql);
  const firstToken = tokenizer.peek()?.toUpperCase();

  switch (firstToken) {
    case 'SELECT':
      return parseSelect(tokenizer);
    case 'INSERT':
      return parseInsert(tokenizer);
    case 'UPDATE':
      return parseUpdate(tokenizer);
    case 'DELETE':
      return parseDelete(tokenizer);
    case 'CREATE':
      return parseCreate(tokenizer);
    case 'DROP':
      return parseDrop(tokenizer);
    default:
      throw new Error(`Unknown command: ${firstToken}`);
  }
}

function parseSelect(tokenizer: Tokenizer): SelectQuery {
  tokenizer.expect('SELECT');

  // Parse columns
  const columns: string[] = [];
  let isAllColumns = false;

  if (tokenizer.peek() === '*') {
    tokenizer.next();
    isAllColumns = true;
  } else {
    do {
      if (tokenizer.peek() === ',') tokenizer.next();
      const col = tokenizer.next();
      if (col) columns.push(col);
    } while (tokenizer.peek() === ',');
  }

  // FROM clause
  tokenizer.expect('FROM');
  const from = tokenizer.next()!;

  const query: SelectQuery = {
    type: 'SELECT',
    columns: isAllColumns ? '*' : columns,
    from
  };

  // Parse JOINs
  while (tokenizer.hasMore()) {
    const nextToken = tokenizer.peek()?.toUpperCase();
    
    if (nextToken === 'INNER' || nextToken === 'LEFT' || nextToken === 'RIGHT' || nextToken === 'JOIN') {
      if (!query.joins) query.joins = [];
      
      let joinType: 'INNER' | 'LEFT' | 'RIGHT' = 'INNER';
      if (nextToken === 'LEFT' || nextToken === 'RIGHT' || nextToken === 'INNER') {
        joinType = nextToken as 'INNER' | 'LEFT' | 'RIGHT';
        tokenizer.next();
      }
      
      tokenizer.expect('JOIN');
      const joinTable = tokenizer.next()!;
      tokenizer.expect('ON');
      
      const leftPart = tokenizer.next()!;
      tokenizer.expect('=');
      const rightPart = tokenizer.next()!;
      
      const [, leftColumn] = leftPart.includes('.') ? leftPart.split('.') : [from, leftPart];
      const [, rightColumn] = rightPart.includes('.') ? rightPart.split('.') : [joinTable, rightPart];
      
      query.joins.push({
        type: joinType,
        table: joinTable,
        leftColumn,
        rightColumn
      });
    } else if (nextToken === 'WHERE') {
      query.where = parseWhere(tokenizer);
    } else if (nextToken === 'ORDER') {
      tokenizer.expect('ORDER');
      tokenizer.expect('BY');
      query.orderBy = [];
      do {
        if (tokenizer.peek() === ',') tokenizer.next();
        const col = tokenizer.next()!;
        let direction: 'ASC' | 'DESC' = 'ASC';
        if (tokenizer.peek()?.toUpperCase() === 'ASC' || tokenizer.peek()?.toUpperCase() === 'DESC') {
          direction = tokenizer.next()!.toUpperCase() as 'ASC' | 'DESC';
        }
        query.orderBy.push({ column: col, direction });
      } while (tokenizer.peek() === ',');
    } else if (nextToken === 'LIMIT') {
      tokenizer.expect('LIMIT');
      query.limit = parseInt(tokenizer.next()!, 10);
    } else {
      break;
    }
  }

  return query;
}

function parseWhere(tokenizer: Tokenizer): WhereClause[] {
  tokenizer.expect('WHERE');
  const clauses: WhereClause[] = [];

  do {
    if (clauses.length > 0) {
      const connector = tokenizer.next()?.toUpperCase();
      if (connector !== 'AND' && connector !== 'OR') {
        throw new Error(`Expected AND/OR but got "${connector}"`);
      }
      clauses[clauses.length - 1].connector = connector as 'AND' | 'OR';
    }

    const column = tokenizer.next()!;
    let operator = tokenizer.next()!;
    
    // Handle LIKE operator
    if (operator.toUpperCase() === 'LIKE') {
      operator = 'LIKE';
    } else if (operator === '<>') {
      operator = '!=';
    }
    
    const value = parseValue(tokenizer.next()!);

    clauses.push({
      column,
      operator: operator as WhereClause['operator'],
      value
    });
  } while (
    tokenizer.hasMore() && 
    (tokenizer.peek()?.toUpperCase() === 'AND' || tokenizer.peek()?.toUpperCase() === 'OR')
  );

  return clauses;
}

function parseValue(token: string): RowValue {
  // String literal
  if ((token.startsWith("'") && token.endsWith("'")) || 
      (token.startsWith('"') && token.endsWith('"'))) {
    return token.slice(1, -1);
  }

  // Boolean
  if (token.toUpperCase() === 'TRUE') return true;
  if (token.toUpperCase() === 'FALSE') return false;
  if (token.toUpperCase() === 'NULL') return null;

  // Number
  const num = parseFloat(token);
  if (!isNaN(num)) return num;

  return token;
}

function parseInsert(tokenizer: Tokenizer): InsertQuery {
  tokenizer.expect('INSERT');
  tokenizer.expect('INTO');
  const into = tokenizer.next()!;

  // Parse column names
  const columns: string[] = [];
  if (tokenizer.peek() === '(') {
    tokenizer.next(); // (
    do {
      if (tokenizer.peek() === ',') tokenizer.next();
      const col = tokenizer.next();
      if (col && col !== ')') columns.push(col);
    } while (tokenizer.peek() !== ')');
    tokenizer.next(); // )
  }

  tokenizer.expect('VALUES');

  // Parse values
  const values: RowValue[][] = [];
  do {
    if (tokenizer.peek() === ',') tokenizer.next();
    tokenizer.expect('(');
    const row: RowValue[] = [];
    do {
      if (tokenizer.peek() === ',') tokenizer.next();
      const val = tokenizer.next();
      if (val && val !== ')') row.push(parseValue(val));
    } while (tokenizer.peek() !== ')');
    tokenizer.next(); // )
    values.push(row);
  } while (tokenizer.peek() === ',');

  return {
    type: 'INSERT',
    into,
    columns,
    values
  };
}

function parseUpdate(tokenizer: Tokenizer): UpdateQuery {
  tokenizer.expect('UPDATE');
  const table = tokenizer.next()!;
  tokenizer.expect('SET');

  const set: Record<string, RowValue> = {};
  do {
    if (tokenizer.peek() === ',') tokenizer.next();
    const column = tokenizer.next()!;
    tokenizer.expect('=');
    const value = parseValue(tokenizer.next()!);
    set[column] = value;
  } while (tokenizer.peek() === ',');

  const query: UpdateQuery = {
    type: 'UPDATE',
    table,
    set
  };

  if (tokenizer.peek()?.toUpperCase() === 'WHERE') {
    query.where = parseWhere(tokenizer);
  }

  return query;
}

function parseDelete(tokenizer: Tokenizer): DeleteQuery {
  tokenizer.expect('DELETE');
  tokenizer.expect('FROM');
  const from = tokenizer.next()!;

  const query: DeleteQuery = {
    type: 'DELETE',
    from
  };

  if (tokenizer.peek()?.toUpperCase() === 'WHERE') {
    query.where = parseWhere(tokenizer);
  }

  return query;
}

function parseCreate(tokenizer: Tokenizer): CreateTableQuery | CreateIndexQuery {
  tokenizer.expect('CREATE');
  const nextToken = tokenizer.peek()?.toUpperCase();

  if (nextToken === 'TABLE') {
    return parseCreateTable(tokenizer);
  } else if (nextToken === 'INDEX' || nextToken === 'UNIQUE') {
    return parseCreateIndex(tokenizer);
  }

  throw new Error(`Expected TABLE or INDEX after CREATE`);
}

function parseCreateTable(tokenizer: Tokenizer): CreateTableQuery {
  tokenizer.expect('TABLE');
  const table = tokenizer.next()!;
  tokenizer.expect('(');

  const columns: ColumnDef[] = [];
  
  do {
    if (tokenizer.peek() === ',') tokenizer.next();
    
    const name = tokenizer.next()!;
    if (name === ')') break;
    
    const typeToken = tokenizer.next()?.toUpperCase();
    
    let type: DataType;
    switch (typeToken) {
      case 'INT':
      case 'INTEGER':
        type = 'int';
        break;
      case 'FLOAT':
      case 'DOUBLE':
      case 'REAL':
        type = 'float';
        break;
      case 'BOOL':
      case 'BOOLEAN':
        type = 'boolean';
        break;
      case 'STRING':
      case 'TEXT':
      case 'VARCHAR':
        type = 'string';
        // Skip length specification if present
        if (tokenizer.peek() === '(') {
          tokenizer.next(); // (
          tokenizer.next(); // length
          tokenizer.next(); // )
        }
        break;
      default:
        type = 'string';
    }

    const column: ColumnDef = { name, type };

    // Parse constraints
    while (tokenizer.hasMore() && tokenizer.peek() !== ',' && tokenizer.peek() !== ')') {
      const constraint = tokenizer.next()?.toUpperCase();
      if (constraint === 'PRIMARY') {
        tokenizer.expect('KEY');
        column.primaryKey = true;
        column.notNull = true;
      } else if (constraint === 'UNIQUE') {
        column.unique = true;
      } else if (constraint === 'NOT') {
        tokenizer.expect('NULL');
        column.notNull = true;
      } else if (constraint === 'AUTO_INCREMENT' || constraint === 'AUTOINCREMENT') {
        column.autoIncrement = true;
      }
    }

    columns.push(column);
  } while (tokenizer.peek() !== ')');

  tokenizer.next(); // )

  return {
    type: 'CREATE_TABLE',
    table,
    columns
  };
}

function parseCreateIndex(tokenizer: Tokenizer): CreateIndexQuery {
  let unique = false;
  if (tokenizer.peek()?.toUpperCase() === 'UNIQUE') {
    tokenizer.next();
    unique = true;
  }

  tokenizer.expect('INDEX');
  const name = tokenizer.next()!;
  tokenizer.expect('ON');
  const table = tokenizer.next()!;
  tokenizer.expect('(');
  const column = tokenizer.next()!;
  tokenizer.expect(')');

  return {
    type: 'CREATE_INDEX',
    name,
    table,
    column,
    unique
  };
}

function parseDrop(tokenizer: Tokenizer): DropTableQuery {
  tokenizer.expect('DROP');
  tokenizer.expect('TABLE');
  const table = tokenizer.next()!;

  return {
    type: 'DROP_TABLE',
    table
  };
}

export function highlightSQL(sql: string): string {
  const keywords = [
    'SELECT', 'FROM', 'WHERE', 'INSERT', 'INTO', 'VALUES', 'UPDATE', 'SET',
    'DELETE', 'CREATE', 'TABLE', 'DROP', 'INDEX', 'ON', 'JOIN', 'INNER',
    'LEFT', 'RIGHT', 'AND', 'OR', 'NOT', 'NULL', 'PRIMARY', 'KEY', 'UNIQUE',
    'AUTO_INCREMENT', 'AUTOINCREMENT', 'ORDER', 'BY', 'ASC', 'DESC', 'LIMIT',
    'INT', 'INTEGER', 'STRING', 'TEXT', 'VARCHAR', 'BOOLEAN', 'BOOL', 'FLOAT',
    'DOUBLE', 'REAL', 'TRUE', 'FALSE', 'LIKE'
  ];

  let result = sql;

  // Highlight strings (must be done first)
  result = result.replace(/'[^']*'/g, '<span class="syntax-string">$&</span>');
  result = result.replace(/"[^"]*"/g, '<span class="syntax-string">$&</span>');

  // Highlight numbers (but not inside already highlighted spans)
  result = result.replace(/\b(\d+\.?\d*)\b(?![^<]*>)/g, '<span class="syntax-number">$1</span>');

  // Highlight operators
  result = result.replace(/(!=|>=|<=|<>|[=<>])/g, '<span class="syntax-operator">$1</span>');

  // Highlight keywords (case insensitive)
  for (const keyword of keywords) {
    const regex = new RegExp(`\\b(${keyword})\\b(?![^<]*>)`, 'gi');
    result = result.replace(regex, '<span class="syntax-keyword">$1</span>');
  }

  // Highlight * for SELECT *
  result = result.replace(/\*/g, '<span class="syntax-operator">*</span>');

  return result;
}

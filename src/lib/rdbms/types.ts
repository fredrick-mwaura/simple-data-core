// Core type definitions for the RDBMS

export type DataType = 'int' | 'string' | 'boolean' | 'float';

export interface ColumnDef {
  name: string;
  type: DataType;
  primaryKey?: boolean;
  unique?: boolean;
  notNull?: boolean;
  autoIncrement?: boolean;
}

export interface TableSchema {
  name: string;
  columns: ColumnDef[];
}

export type RowValue = string | number | boolean | null;
export type Row = Record<string, RowValue>;

export interface QueryResult {
  success: boolean;
  message?: string;
  rows?: Row[];
  rowCount?: number;
  columns?: string[];
  executionTime?: number;
}

export interface WhereClause {
  column: string;
  operator: '=' | '!=' | '>' | '<' | '>=' | '<=' | 'LIKE';
  value: RowValue;
  connector?: 'AND' | 'OR';
}

export interface JoinClause {
  type: 'INNER' | 'LEFT' | 'RIGHT';
  table: string;
  leftColumn: string;
  rightColumn: string;
}

export interface SelectQuery {
  type: 'SELECT';
  columns: string[] | '*';
  from: string;
  joins?: JoinClause[];
  where?: WhereClause[];
  orderBy?: { column: string; direction: 'ASC' | 'DESC' }[];
  limit?: number;
}

export interface InsertQuery {
  type: 'INSERT';
  into: string;
  columns: string[];
  values: RowValue[][];
}

export interface UpdateQuery {
  type: 'UPDATE';
  table: string;
  set: Record<string, RowValue>;
  where?: WhereClause[];
}

export interface DeleteQuery {
  type: 'DELETE';
  from: string;
  where?: WhereClause[];
}

export interface CreateTableQuery {
  type: 'CREATE_TABLE';
  table: string;
  columns: ColumnDef[];
}

export interface DropTableQuery {
  type: 'DROP_TABLE';
  table: string;
}

export interface CreateIndexQuery {
  type: 'CREATE_INDEX';
  name: string;
  table: string;
  column: string;
  unique?: boolean;
}

export type ParsedQuery = 
  | SelectQuery 
  | InsertQuery 
  | UpdateQuery 
  | DeleteQuery 
  | CreateTableQuery 
  | DropTableQuery
  | CreateIndexQuery;

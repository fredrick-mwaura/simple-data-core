/**
 * =============================================================================
 * Table Implementation - Row Storage and Index Management
 * =============================================================================
 * 
 * ROW STORAGE:
 * ------------
 * - Rows are stored as an array of Record<string, RowValue> objects
 * - Each row is a map from column name to value
 * - Deleted rows are tracked via a Set of indices (soft delete)
 * - This allows index references to remain valid after deletes
 * 
 * INDEX MANAGEMENT:
 * -----------------
 * - B-Tree indexes are automatically created for PRIMARY KEY and UNIQUE columns
 * - Additional indexes can be created via CREATE INDEX
 * - Indexes are automatically maintained during INSERT, UPDATE, DELETE
 * - Query executor uses indexes for equality-based lookups (O(log n) vs O(n))
 * 
 * CONSTRAINT ENFORCEMENT:
 * -----------------------
 * - PRIMARY KEY: Unique, not null, auto-indexed
 * - UNIQUE: Checked via index lookup before insert/update
 * - NOT NULL: Validated during insert/update
 * - AUTO_INCREMENT: Counter maintained per-column
 * 
 * =============================================================================
 */

import { ColumnDef, Row, RowValue, DataType } from './types';
import { BTree } from './btree';

export interface Index {
  name: string;
  column: string;
  unique: boolean;
  tree: BTree;
}

export class Table {
  public name: string;
  public columns: ColumnDef[];
  private rows: Row[] = [];
  private indexes: Map<string, Index> = new Map();
  private autoIncrementCounters: Map<string, number> = new Map();
  private deletedIndices: Set<number> = new Set();

  constructor(name: string, columns: ColumnDef[]) {
    this.name = name;
    this.columns = columns;

    // Create indexes for primary keys and unique columns
    for (const col of columns) {
      if (col.primaryKey || col.unique) {
        this.createIndex(`idx_${name}_${col.name}`, col.name, true);
      }
      if (col.autoIncrement) {
        this.autoIncrementCounters.set(col.name, 0);
      }
    }
  }

  createIndex(name: string, column: string, unique: boolean = false): void {
    if (this.indexes.has(name)) {
      throw new Error(`Index "${name}" already exists`);
    }

    const colDef = this.columns.find(c => c.name === column);
    if (!colDef) {
      throw new Error(`Column "${column}" does not exist in table "${this.name}"`);
    }

    const index: Index = {
      name,
      column,
      unique,
      tree: new BTree()
    };

    // Build index from existing data
    this.rows.forEach((row, idx) => {
      if (!this.deletedIndices.has(idx)) {
        index.tree.insert(row[column], idx);
      }
    });

    this.indexes.set(name, index);
  }

  private validateValue(value: RowValue, type: DataType): RowValue {
    if (value === null) return null;

    switch (type) {
      case 'int':
        const intVal = parseInt(String(value), 10);
        if (isNaN(intVal)) throw new Error(`Invalid integer value: ${value}`);
        return intVal;
      case 'float':
        const floatVal = parseFloat(String(value));
        if (isNaN(floatVal)) throw new Error(`Invalid float value: ${value}`);
        return floatVal;
      case 'boolean':
        if (typeof value === 'boolean') return value;
        if (value === 'true' || value === 1) return true;
        if (value === 'false' || value === 0) return false;
        throw new Error(`Invalid boolean value: ${value}`);
      case 'string':
        return String(value);
      default:
        return value;
    }
  }

  insert(data: Partial<Row>): Row {
    const newRow: Row = {};

    // Process each column
    for (const col of this.columns) {
      let value = data[col.name];

      // Handle auto-increment
      if (col.autoIncrement && (value === undefined || value === null)) {
        const counter = this.autoIncrementCounters.get(col.name)! + 1;
        this.autoIncrementCounters.set(col.name, counter);
        value = counter;
      }

      // Check NOT NULL constraint
      if (col.notNull && (value === undefined || value === null)) {
        throw new Error(`Column "${col.name}" cannot be null`);
      }

      // Validate and convert type
      if (value !== undefined) {
        newRow[col.name] = this.validateValue(value, col.type);
      } else {
        newRow[col.name] = null;
      }
    }

    // Check unique constraints via indexes
    for (const [, index] of this.indexes) {
      if (index.unique) {
        const value = newRow[index.column];
        if (value !== null) {
          const existing = index.tree.search(value);
          if (existing.length > 0) {
            throw new Error(`Duplicate value "${value}" for unique column "${index.column}"`);
          }
        }
      }
    }

    // Add row
    const rowIndex = this.rows.length;
    this.rows.push(newRow);

    // Update all indexes
    for (const [, index] of this.indexes) {
      index.tree.insert(newRow[index.column], rowIndex);
    }

    return { ...newRow };
  }

  select(columns?: string[]): Row[] {
    const colsToSelect = columns || this.columns.map(c => c.name);
    
    return this.rows
      .map((row, idx) => {
        if (this.deletedIndices.has(idx)) return null;
        const result: Row = {};
        for (const col of colsToSelect) {
          if (col in row) {
            result[col] = row[col];
          }
        }
        return result;
      })
      .filter((row): row is Row => row !== null);
  }

  /**
   * Select rows with a WHERE condition.
   * 
   * INDEX USAGE STRATEGY:
   * - For equality (=) operators on indexed columns: Use B-Tree lookup O(log n)
   * - For all other operators or non-indexed columns: Full table scan O(n)
   * 
   * This is a key optimization point - the query executor automatically
   * takes advantage of available indexes for equality-based queries.
   */
  selectWhere(column: string, operator: string, value: RowValue, columns?: string[]): Row[] {
    let indices: number[];

    // QUERY PLANNING: Determine if we can use an index
    const index = this.findIndexForColumn(column);
    
    if (index && operator === '=') {
      // INDEX SCAN: Use B-Tree for O(log n) lookup
      indices = index.tree.search(value);
    } else {
      // FULL TABLE SCAN: No applicable index, scan all rows O(n)
      indices = [];
      this.rows.forEach((row, idx) => {
        if (!this.deletedIndices.has(idx) && this.evaluateCondition(row[column], operator, value)) {
          indices.push(idx);
        }
      });
    }

    const colsToSelect = columns || this.columns.map(c => c.name);

    return indices
      .filter(idx => !this.deletedIndices.has(idx))
      .map(idx => {
        const row = this.rows[idx];
        const result: Row = {};
        for (const col of colsToSelect) {
          if (col in row) {
            result[col] = row[col];
          }
        }
        return result;
      });
  }

  private evaluateCondition(rowValue: RowValue, operator: string, compareValue: RowValue): boolean {
    if (rowValue === null || compareValue === null) {
      return operator === '=' ? rowValue === compareValue : false;
    }

    switch (operator) {
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

  private findIndexForColumn(column: string): Index | undefined {
    for (const [, index] of this.indexes) {
      if (index.column === column) {
        return index;
      }
    }
    return undefined;
  }

  update(setValues: Partial<Row>, whereColumn?: string, whereOp?: string, whereValue?: RowValue): number {
    let count = 0;
    const indicesToUpdate: number[] = [];

    // Find rows to update
    if (whereColumn) {
      const index = this.findIndexForColumn(whereColumn);
      if (index && whereOp === '=') {
        indicesToUpdate.push(...index.tree.search(whereValue!));
      } else {
        this.rows.forEach((row, idx) => {
          if (!this.deletedIndices.has(idx) && 
              this.evaluateCondition(row[whereColumn], whereOp || '=', whereValue!)) {
            indicesToUpdate.push(idx);
          }
        });
      }
    } else {
      this.rows.forEach((_, idx) => {
        if (!this.deletedIndices.has(idx)) {
          indicesToUpdate.push(idx);
        }
      });
    }

    // Check unique constraints before updating
    for (const [, index] of this.indexes) {
      if (index.unique && index.column in setValues) {
        const newValue = setValues[index.column];
        if (newValue !== null) {
          const existing = index.tree.search(newValue!);
          const otherRows = existing.filter(idx => !indicesToUpdate.includes(idx));
          if (otherRows.length > 0) {
            throw new Error(`Duplicate value "${newValue}" for unique column "${index.column}"`);
          }
        }
      }
    }

    // Update rows
    for (const idx of indicesToUpdate) {
      if (this.deletedIndices.has(idx)) continue;

      const row = this.rows[idx];
      const oldValues: Partial<Row> = {};

      // Store old values for index updates
      for (const [, index] of this.indexes) {
        if (index.column in setValues) {
          oldValues[index.column] = row[index.column];
        }
      }

      // Update values
      for (const [col, value] of Object.entries(setValues)) {
        const colDef = this.columns.find(c => c.name === col);
        if (colDef) {
          row[col] = this.validateValue(value, colDef.type);
        }
      }

      // Update indexes
      for (const [, index] of this.indexes) {
        if (index.column in setValues) {
          index.tree.delete(oldValues[index.column]!, idx);
          index.tree.insert(row[index.column], idx);
        }
      }

      count++;
    }

    return count;
  }

  delete(whereColumn?: string, whereOp?: string, whereValue?: RowValue): number {
    let count = 0;
    const indicesToDelete: number[] = [];

    if (whereColumn) {
      const index = this.findIndexForColumn(whereColumn);
      if (index && whereOp === '=') {
        indicesToDelete.push(...index.tree.search(whereValue!));
      } else {
        this.rows.forEach((row, idx) => {
          if (!this.deletedIndices.has(idx) && 
              this.evaluateCondition(row[whereColumn], whereOp || '=', whereValue!)) {
            indicesToDelete.push(idx);
          }
        });
      }
    } else {
      this.rows.forEach((_, idx) => {
        if (!this.deletedIndices.has(idx)) {
          indicesToDelete.push(idx);
        }
      });
    }

    for (const idx of indicesToDelete) {
      if (this.deletedIndices.has(idx)) continue;

      const row = this.rows[idx];

      // Remove from indexes
      for (const [, index] of this.indexes) {
        index.tree.delete(row[index.column], idx);
      }

      this.deletedIndices.add(idx);
      count++;
    }

    return count;
  }

  getRowCount(): number {
    return this.rows.length - this.deletedIndices.size;
  }

  getRows(): Row[] {
    return this.rows
      .map((row, idx) => this.deletedIndices.has(idx) ? null : { ...row })
      .filter((row): row is Row => row !== null);
  }

  getRowsWithIndices(): Array<{ row: Row; index: number }> {
    return this.rows
      .map((row, idx) => this.deletedIndices.has(idx) ? null : { row: { ...row }, index: idx })
      .filter((item): item is { row: Row; index: number } => item !== null);
  }

  getIndexes(): Index[] {
    return Array.from(this.indexes.values());
  }
}

import React, { useState } from 'react';
import { Database } from '@/lib/rdbms/database';
import { Row, RowValue } from '@/lib/rdbms/types';
import { Table as TableIcon, RefreshCw, Trash2, Plus, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from '@/lib/utils';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface TableViewerProps {
  database: Database;
  tableName: string;
  refreshTrigger: () => void;
  onTableDropped: (tableName: string) => void;
  onRunExample: (sql: string) => void;
  onRefresh?: () => void; // Keeping this for backward compatibility
}

export const TableViewer: React.FC<TableViewerProps> = ({
  database,
  tableName,
  refreshTrigger,
  onTableDropped,
  onRunExample,
  onRefresh
}) => {
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'ASC' | 'DESC'>('ASC');
  const [dialogState, setDialogState] = useState<{ mode: 'create' | 'edit', row: Row } | null>(null);
  const [fkOptions, setFkOptions] = useState<Record<string, { value: any; label: string }[]>>({});

  const table = database.getTable(tableName);
  if (!table) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        Table not found
      </div>
    );
  }

  const columns = table.columns;
  let rows = table.getRows();

  // Helper for dynamic labels (e.g., "users" -> "User")
  const getSingularName = (name: string) => {
    const singular = name.endsWith('s') ? name.slice(0, -1) : name;
    return singular.charAt(0).toUpperCase() + singular.slice(1);
  };
  const entityName = getSingularName(tableName);

  // Apply sorting
  if (sortColumn) {
    rows = [...rows].sort((a, b) => {
      const aVal = a[sortColumn];
      const bVal = b[sortColumn];

      if (aVal === null && bVal === null) return 0;
      if (aVal === null) return sortDirection === 'ASC' ? -1 : 1;
      if (bVal === null) return sortDirection === 'ASC' ? 1 : -1;

      let comparison = 0;
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        comparison = aVal.localeCompare(bVal);
      } else if (typeof aVal === 'number' && typeof bVal === 'number') {
        comparison = aVal - bVal;
      }

      return sortDirection === 'DESC' ? -comparison : comparison;
    });
  }

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(prev => prev === 'ASC' ? 'DESC' : 'ASC');
    } else {
      setSortColumn(column);
      setSortDirection('ASC');
    }
  };

  const handleDeleteRow = (row: Row) => {
    // Determine the Primary Key column
    const pkColumn = columns.find(col => col.primaryKey);
    let deleteQuery = '';

    if (pkColumn) {
      const pkValue = row[pkColumn.name];
      const valStr = typeof pkValue === 'string' ? `'${pkValue}'` : pkValue;
      deleteQuery = `DELETE FROM ${tableName} WHERE ${pkColumn.name} = ${valStr}`;
    } else {
      // If no PK, try to match all columns (simplified, might fail on duplicate rows)
      const conditions = columns.map(col => {
        const val = row[col.name];
        if (val === null) return `${col.name} = NULL`; // Assuming DB handles this or null check logic
        const valStr = typeof val === 'string' ? `'${val}'` : val;
        return `${col.name} = ${valStr}`;
      }).join(' AND ');
      deleteQuery = `DELETE FROM ${tableName} WHERE ${conditions}`;
    }

    try {
      database.execute(deleteQuery);
      refreshTrigger();
      if (onRefresh) onRefresh();
    } catch (e) {
      console.error('Failed to delete row', e);
    }
  };

  const handleUpdateRow = (originalRow: Row, newRow: Row) => {
    // Generate SET clause
    const updates: string[] = [];
    columns.forEach(col => {
      // Skip immutable fields in the user-provided update list
      // We will handle them separately or ignore changes to them if they somehow got through
      if (col.name === 'created_at' || col.name === 'updated_at' || col.primaryKey || col.name.endsWith('_id')) {
        return;
      }

      // Only update changed values
      if (originalRow[col.name] !== newRow[col.name]) {
        const val = newRow[col.name];
        const valStr = typeof val === 'string' ? `'${val}'` : val;
        // Handle boolean
        const finalVal = typeof val === 'boolean' ? (val ? 'true' : 'false') : val === null ? 'NULL' : valStr;
        updates.push(`${col.name} = ${finalVal}`);
      }
    });

    // Auto-update 'updated_at' if it exists
    const hasUpdatedAt = columns.some(col => col.name === 'updated_at');
    if (hasUpdatedAt) {
      const now = Math.floor(Date.now() / 1000);
      updates.push(`updated_at = ${now}`);
    }

    if (updates.length === 0) return;

    // Generate WHERE clause (same as delete)
    const pkColumn = columns.find(col => col.primaryKey);
    let whereClause = '';

    if (pkColumn) {
      const pkValue = originalRow[pkColumn.name];
      const valStr = typeof pkValue === 'string' ? `'${pkValue}'` : pkValue;
      whereClause = `${pkColumn.name} = ${valStr}`;
    } else {
      // Match all original values
      whereClause = columns.map(col => {
        const val = originalRow[col.name];
        if (val === null) return `${col.name} = NULL`;
        const valStr = typeof val === 'string' ? `'${val}'` : val;
        return `${col.name} = ${valStr}`;
      }).join(' AND ');
    }

    const query = `UPDATE ${tableName} SET ${updates.join(', ')} WHERE ${whereClause}`;

    try {
      database.execute(query);
      refreshTrigger();
      if (onRefresh) onRefresh();
      setDialogState(null);
    } catch (e) {
      console.error('Failed to update row', e);
    }
  };

  const handleCreateRow = (newRow: Row) => {
    const columnsToInsert: string[] = [];
    const valuesToInsert: string[] = [];

    columns.forEach(col => {
      // Skip auto-increment PKs (let DB handle them)
      if (col.autoIncrement) return;

      // Handle timestamps
      if (col.name === 'created_at' || col.name === 'updated_at') {
        columnsToInsert.push(col.name);
        valuesToInsert.push(String(Math.floor(Date.now() / 1000)));
        return;
      }

      const val = newRow[col.name];
      // Skip nulls if not required? Better to send NULL explicitly if supported
      if (val === undefined || val === null) {
        // If it's not null but we have no value, maybe skip?
        // But for SQL INSERT, we usually want to be explicit or rely on defaults.
        // Our simplified DB might need NULL.
        columnsToInsert.push(col.name);
        valuesToInsert.push('NULL');
        return;
      }

      columnsToInsert.push(col.name);
      const finalVal = typeof val === 'boolean' ? (val ? 'true' : 'false') : typeof val === 'string' ? `'${val}'` : String(val);
      valuesToInsert.push(finalVal);
    });

    const query = `INSERT INTO ${tableName} (${columnsToInsert.join(', ')}) VALUES (${valuesToInsert.join(', ')})`;

    try {
      database.execute(query);
      refreshTrigger();
      if (onRefresh) onRefresh();
      setDialogState(null);
    } catch (e) {
      console.error('Failed to create row', e);
      // Ideally show error to user, but console for now as per minimal scope
    }
  };

  const openCreateDialog = () => {
    const emptyRow: Row = {};
    columns.forEach(col => {
      emptyRow[col.name] = null;
    });

    // Prepare FK options
    const options: Record<string, { value: any; label: string }[]> = {};
    columns.forEach(col => {
      if (col.name.endsWith('_id')) {
        let refTableName = col.name.replace('_id', 's'); // Default: user_id -> users

        // Overrides for irregular pluralization or specific mappings
        if (col.name === 'category_id') refTableName = 'categories';
        if (col.name === 'follower_id' || col.name === 'following_id') refTableName = 'users'; // Follows table links to users

        const refTable = database.getTable(refTableName);
        if (refTable) {
          options[col.name] = refTable.getRows().map(r => {
            // Try to find a good label column (username, title, name, or fallback to first string, or ID)
            const labelCol = refTable.columns.find(
              c => c.name === 'username' || c.name === 'title' || c.name === 'name' || c.name === 'email'
            ) || refTable.columns.find(c => c.type === 'STRING');

            const label = labelCol ? String(r[labelCol.name]) : `ID: ${r['id']}`;
            return { value: r['id'], label: `${label} (${r['id']})` };
          });
        }
      }
    });
    setFkOptions(options);

    setDialogState({ mode: 'create', row: emptyRow });
  };

  return (
    <div className="flex flex-col h-full bg-card rounded-lg border border-border overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
        <div className="flex items-center gap-2">
          <TableIcon className="w-5 h-5 text-syntax-table" />
          <h3 className="font-semibold text-foreground">{tableName}</h3>
          <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
            {rows.length} row{rows.length !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="default"
            size="sm"
            onClick={openCreateDialog}
            className="text-muted-foreground hover:text-foreground gap-1"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline text-bold text-[#000]">Add {entityName}</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onRefresh}
            className="text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto terminal-scrollbar">
        {rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <TableIcon className="w-12 h-12 mb-4 opacity-30" />
            <p>No data in this table</p>
            <p className="text-xs mt-1">Use INSERT to add rows</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm">
              <tr>
                {columns.map((col) => (
                  <th
                    key={col.name}
                    onClick={() => handleSort(col.name)}
                    className={cn(
                      "px-4 py-3 text-left font-semibold text-foreground border-b border-border cursor-pointer hover:bg-muted transition-colors",
                      sortColumn === col.name && "text-primary"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span>{col.name}</span>
                      <span className="text-xs text-muted-foreground font-normal">
                        {col.type}
                      </span>
                      {sortColumn === col.name && (
                        <span className="text-primary">
                          {sortDirection === 'ASC' ? '↑' : '↓'}
                        </span>
                      )}
                      {col.primaryKey && (
                        <span className="text-xs bg-warning/20 text-warning px-1.5 py-0.5 rounded">
                          PK
                        </span>
                      )}
                      {col.unique && !col.primaryKey && (
                        <span className="text-xs bg-info/20 text-info px-1.5 py-0.5 rounded">
                          UQ
                        </span>
                      )}
                    </div>
                  </th>
                ))}
                <th className="px-4 py-3 text-left font-semibold text-foreground border-b border-border w-10">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr
                  key={idx}
                  className="hover:bg-muted/30 transition-colors border-b border-border/50"
                >
                  {columns.map((col) => (
                    <td key={col.name} className="px-4 py-3">
                      <CellValue value={row[col.name]} type={col.type} columnName={col.name} />
                    </td>
                  ))}

                  <td className="px-4 py-3 border-b border-border/50">
                    <div className="flex items-center gap-1">
                      {!['likes', 'follows', 'comments', 'post_categories'].includes(tableName) && (
                        <button
                          onClick={() => setDialogState({ mode: 'edit', row })}
                          className="p-1 hover:bg-primary/10 hover:text-primary rounded-md text-muted-foreground transition-colors"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                      )}

                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <button className="p-1 hover:bg-destructive/10 hover:text-destructive rounded-md text-muted-foreground transition-colors">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete {entityName}?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to delete this {entityName.toLowerCase()}? This action cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleDeleteRow(row)}
                              className="bg-destructive hover:bg-destructive/90"
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Footer stats */}
      <div className="px-4 py-2 border-t border-border bg-muted/30 text-xs text-muted-foreground">
        <div className="flex items-center justify-between">
          <span>{columns.length} column{columns.length !== 1 ? 's' : ''}</span>
          <span>
            {table.getIndexes().length} index{table.getIndexes().length !== 1 ? 'es' : ''}
          </span>
        </div>
      </div>

      {dialogState && (
        <RecordDialog
          open={!!dialogState}
          onOpenChange={(open) => !open && setDialogState(null)}
          row={dialogState.row}
          mode={dialogState.mode}
          columns={columns}
          entityName={entityName}
          fkOptions={fkOptions}
          onSave={(newRow) => {
            if (dialogState.mode === 'create') {
              handleCreateRow(newRow);
            } else {
              handleUpdateRow(dialogState.row, newRow);
            }
          }}
        />
      )}
    </div >
  );
};

const CellValue: React.FC<{ value: RowValue; type: string; columnName?: string }> = ({ value, type, columnName }) => {
  if (value === null) {
    return <span className="text-muted-foreground/60 italic font-mono">NULL</span>;
  }

  if (typeof value === 'boolean') {
    return (
      <span className={cn(
        "px-2 py-0.5 rounded-full text-xs font-medium",
        value
          ? "bg-success/20 text-success"
          : "bg-destructive/20 text-destructive"
      )}>
        {String(value)}
      </span>
    );
  }

  if (typeof value === 'number') {
    // Format dates (simple heuristic based on column name)
    if (columnName && (columnName.endsWith('_at') || columnName.endsWith('_date'))) {
      try {
        const date = new Date(value * 1000); // Assuming Unix timestamp in seconds
        return (
          <span className="text-foreground font-medium" title={value.toString()}>
            {date.toLocaleString()}
          </span>
        );
      } catch (e) {
        // Fallback to number
      }
    }
    return <span className="font-mono text-syntax-number">{value}</span>;
  }

  if (typeof value === 'string') {
    // Truncate long strings
    const maxLength = 50;
    const displayValue = value.length > maxLength
      ? value.slice(0, maxLength) + '...'
      : value;
    return (
      <span className="text-foreground" title={value}>
        {displayValue}
      </span>
    );
  }

  return <span className="font-mono">{String(value)}</span>;
};

interface RecordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  row: Row;
  mode: 'create' | 'edit';
  columns: { name: string; type: string; primaryKey?: boolean }[];
  entityName: string;
  fkOptions?: Record<string, { value: any; label: string }[]>;
  onSave: (newRow: Row) => void;
}

const RecordDialog: React.FC<RecordDialogProps> = ({
  open,
  onOpenChange,
  row,
  mode,
  columns,
  entityName,
  fkOptions = {},
  onSave
}) => {
  const [formData, setFormData] = useState<Row>(row);

  const handleChange = (column: string, value: string | number | boolean | null) => {
    setFormData(prev => ({ ...prev, [column]: value }));
  };

  const formatDateForInput = (timestamp: number) => {
    if (!timestamp) return '';
    // Create a date object from the timestamp (seconds to ms)
    const date = new Date(timestamp * 1000);
    // Format to YYYY-MM-DDThh:mm for datetime-local input
    const pad = (n: number) => n < 10 ? '0' + n : n;
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  };

  const handleDateChange = (column: string, dateString: string) => {
    if (!dateString) {
      handleChange(column, null);
      return;
    }
    const date = new Date(dateString);
    // Convert back to seconds
    const timestamp = Math.floor(date.getTime() / 1000);
    handleChange(column, timestamp);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto bg-card text-card-foreground">
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? `Create ${entityName}` : `Update ${entityName}`}</DialogTitle>
          <DialogDescription>
            {mode === 'create' ? `Enter values for the new ${entityName.toLowerCase()}.` : `Make changes to the ${entityName.toLowerCase()} below.`} Click save when you're done.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {columns
            .filter(col => {
              // Always hide timestamps
              if (col.name === 'created_at' || col.name === 'updated_at') return false;
              // Always hide PK (assuming auto-increment for now)
              if (col.primaryKey) return false;

              // Foreign Keys:
              // - Create: Show (user must link)
              // - Edit: Hide (immutable)
              if (col.name.endsWith('_id')) {
                return mode === 'create';
              }

              return true;
            })
            .map((col) => (
              <div key={col.name} className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor={col.name} className="text-right font-medium">
                  {col.name}
                </Label>
                <div className="col-span-3">
                  {col.type === 'BOOLEAN' ? (
                    <select
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                      value={formData[col.name] === null ? '' : String(formData[col.name])}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === '') handleChange(col.name, null);
                        else handleChange(col.name, val === 'true');
                      }}
                    >
                      <option value="">Select...</option>
                      <option value="true">True</option>
                      <option value="false">False</option>
                    </select>
                  ) : (col.name.endsWith('_id') && fkOptions && fkOptions[col.name]) ? (
                    <select
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                      value={String(formData[col.name] || '')}
                      onChange={(e) => {
                        const val = e.target.value;
                        handleChange(col.name, val ? Number(val) : null);
                      }}
                    >
                      <option value="">Select {col.name.replace('_id', '')}...</option>
                      {fkOptions[col.name].map(opt => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  ) : (col.type === 'INT' && (col.name.endsWith('_at') || col.name.endsWith('_date'))) ? (
                    <Input
                      id={col.name}
                      type="datetime-local"
                      value={formatDateForInput(formData[col.name] as number)}
                      onChange={(e) => handleDateChange(col.name, e.target.value)}
                    />
                  ) : (
                    <Input
                      id={col.name}
                      type={col.type === 'INT' || col.type === 'FLOAT' ? 'number' : 'text'}
                      value={formData[col.name]?.toString() ?? ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (col.type === 'INT') {
                          handleChange(col.name, parseInt(val));
                        } else if (col.type === 'FLOAT') {
                          handleChange(col.name, parseFloat(val));
                        } else {
                          handleChange(col.name, val);
                        }
                      }}
                    />
                  )}
                </div>
              </div>
            ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => onSave(formData)}>
            {mode === 'create' ? 'Create' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

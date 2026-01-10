import React, { useState } from 'react';
import { Database } from '@/lib/rdbms/database';
import { Table as TableIcon, RefreshCw, Trash2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface TableViewerProps {
  database: Database;
  tableName: string;
  onRefresh?: () => void;
}

export const TableViewer: React.FC<TableViewerProps> = ({
  database,
  tableName,
  onRefresh
}) => {
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'ASC' | 'DESC'>('ASC');

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
                      <CellValue value={row[col.name]} type={col.type} />
                    </td>
                  ))}
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
    </div>
  );
};

const CellValue: React.FC<{ value: any; type: string }> = ({ value, type }) => {
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

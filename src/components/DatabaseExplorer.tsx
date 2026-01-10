import React from 'react';
import { Database } from '@/lib/rdbms/database';
import { Table, Database as DatabaseIcon, Columns, Key, Hash } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DatabaseExplorerProps {
  database: Database;
  selectedTable: string | null;
  onSelectTable: (tableName: string | null) => void;
  refreshTrigger?: number;
}

export const DatabaseExplorer: React.FC<DatabaseExplorerProps> = ({
  database,
  selectedTable,
  onSelectTable,
  refreshTrigger
}) => {
  const tables = database.getTables();

  return (
    <div className="h-full flex flex-col bg-sidebar border-r border-sidebar-border">
      {/* Header */}
      <div className="p-4 border-b border-sidebar-border">
        <div className="flex items-center gap-2">
          <DatabaseIcon className="w-5 h-5 text-primary" />
          <h2 className="font-semibold text-sidebar-foreground">
            {database.getName()}
          </h2>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          {tables.length} table{tables.length !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Tables list */}
      <div className="flex-1 overflow-y-auto p-2 terminal-scrollbar">
        {tables.length === 0 ? (
          <div className="p-4 text-center text-muted-foreground text-sm">
            <Table className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>No tables yet</p>
            <p className="text-xs mt-1">Create one using SQL</p>
          </div>
        ) : (
          <div className="space-y-1">
            {tables.map((tableName) => (
              <TableItem
                key={tableName}
                database={database}
                tableName={tableName}
                isSelected={selectedTable === tableName}
                onSelect={() => onSelectTable(selectedTable === tableName ? null : tableName)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-3 border-t border-sidebar-border">
        <div className="text-xs text-muted-foreground">
          <span className="font-mono">LovableDB</span> v1.0
        </div>
      </div>
    </div>
  );
};

interface TableItemProps {
  database: Database;
  tableName: string;
  isSelected: boolean;
  onSelect: () => void;
}

const TableItem: React.FC<TableItemProps> = ({
  database,
  tableName,
  isSelected,
  onSelect
}) => {
  const tableInfo = database.getTableInfo(tableName);

  return (
    <div
      className={cn(
        "rounded-md transition-all cursor-pointer",
        isSelected 
          ? "bg-sidebar-accent" 
          : "hover:bg-sidebar-accent/50"
      )}
    >
      <button
        onClick={onSelect}
        className="w-full text-left p-3"
      >
        <div className="flex items-center gap-2">
          <Table className="w-4 h-4 text-syntax-table" />
          <span className="font-medium text-sidebar-foreground">{tableName}</span>
          <span className="ml-auto text-xs text-muted-foreground">
            {tableInfo?.rowCount || 0} rows
          </span>
        </div>
      </button>

      {/* Expanded details */}
      {isSelected && tableInfo && (
        <div className="px-3 pb-3 animate-slide-in">
          <div className="mt-2 space-y-1 text-xs">
            {tableInfo.columns.map((col) => (
              <div 
                key={col.name}
                className="flex items-center gap-2 py-1 px-2 rounded bg-background/50"
              >
                {col.constraints.includes('PRIMARY KEY') ? (
                  <Key className="w-3 h-3 text-warning" />
                ) : col.constraints.includes('UNIQUE') ? (
                  <Hash className="w-3 h-3 text-info" />
                ) : (
                  <Columns className="w-3 h-3 text-muted-foreground" />
                )}
                <span className="font-mono text-foreground">{col.name}</span>
                <span className="text-muted-foreground ml-auto">{col.type}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

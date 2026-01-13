import React from 'react';
import { Database } from '@/lib/rdbms/database';
import { Table, Database as DatabaseIcon, Columns, Key, Hash, Trash2, MoreHorizontal, FileCode } from 'lucide-react';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface DatabaseExplorerProps {
  database: Database;
  selectedTable: string | null;
  onSelectTable: (tableName: string | null) => void;
  refreshTrigger?: number;
  onTableDropped?: (tableName: string) => void;
  onRunExample?: (sql: string) => void;
}

export const DatabaseExplorer: React.FC<DatabaseExplorerProps> = ({
  database,
  selectedTable,
  onSelectTable,
  refreshTrigger,
  onTableDropped,
  onRunExample
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
                onDelete={(name) => {
                  database.execute(`DROP TABLE ${name}`);
                  if (selectedTable === name) {
                    onSelectTable(null);
                  }
                  onTableDropped?.(name);
                }}
                onRunExample={onRunExample}
              />
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-3 border-t border-sidebar-border">
        <div className="text-xs text-muted-foreground">
          <span className="font-mono">Datacore</span> v1.0
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
  onDelete: (tableName: string) => void;
  onRunExample?: (sql: string) => void;
}

const TableItem: React.FC<TableItemProps> = ({
  database,
  tableName,
  isSelected,
  onSelect,
  onDelete,
  onRunExample
}) => {
  const tableInfo = database.getTableInfo(tableName);

  const generateQuery = (type: 'INSERT' | 'UPDATE' | 'DELETE' | 'JOIN') => {
    if (!tableInfo || !onRunExample) return;

    let sql = '';
    const cols = tableInfo.columns.map(c => c.name);

    switch (type) {
      case 'INSERT':
        const insertCols = cols.filter(c => c !== 'id' && c !== 'created_at' && c !== 'updated_at');
        const placeholders = insertCols.map(() => `'value'`);
        sql = `INSERT INTO ${tableName} (${insertCols.join(', ')}) VALUES (${placeholders.join(', ')})`;
        break;
      case 'UPDATE':
        const updateCol = cols.find(c => c !== 'id' && c !== 'created_at' && c !== 'updated_at') || 'column';
        sql = `UPDATE ${tableName} SET ${updateCol} = 'value' WHERE id = 1`;
        break;
      case 'DELETE':
        sql = `DELETE FROM ${tableName} WHERE id = 1`;
        break;
      case 'JOIN':
        // Find first FK
        const fkCol = cols.find(c => c.endsWith('_id'));
        if (fkCol) {
          const targetTable = fkCol.replace('_id', 's').replace('categorys', 'categories'); // Simple pluralizer
          sql = `SELECT * \nFROM ${tableName} t1 \nJOIN ${targetTable} t2 ON t1.${fkCol} = t2.id\nLIMIT 10`;
        } else {
          sql = `SELECT * FROM ${tableName}`;
        }
        break;
    }

    if (sql) onRunExample(sql);
  };

  return (
    <div
      className={cn(
        "rounded-md transition-all cursor-pointer relative group",
        isSelected
          ? "bg-sidebar-accent"
          : "hover:bg-sidebar-accent/50"
      )}
    >
      <div
        role="button"
        tabIndex={0}
        onClick={onSelect}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelect();
          }
        }}
        className="w-full text-left p-3 focus:outline-none focus:ring-2 focus:ring-primary/20 rounded-md"
      >
        <div className="flex items-center gap-2">
          <Table className="w-4 h-4 text-syntax-table" />
          <span className="font-medium text-sidebar-foreground">{tableName}</span>
          <span className="ml-auto text-xs text-muted-foreground">
            {tableInfo?.rowCount || 0} rows
          </span>
        </div>
      </div>

      <div className="absolute right-2 top-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-sidebar rounded-md shadow-sm">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="p-1 hover:bg-sidebar-accent/80 rounded-md text-muted-foreground transition-colors outline-none focus:ring-2 focus:ring-primary/20"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel>Generate Query</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); generateQuery('INSERT'); }}>
              <FileCode className="w-4 h-4 mr-2" />
              <span>Insert Record</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); generateQuery('UPDATE'); }}>
              <FileCode className="w-4 h-4 mr-2" />
              <span>Update Record</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); generateQuery('DELETE'); }}>
              <FileCode className="w-4 h-4 mr-2" />
              <span>Delete Record</span>
            </DropdownMenuItem>
            {tableInfo?.columns.some(c => c.name.endsWith('_id')) && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); generateQuery('JOIN'); }}>
                  <FileCode className="w-4 h-4 mr-2" />
                  <span>Join Related</span>
                </DropdownMenuItem>
              </>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={(e) => { e.stopPropagation(); /* Let the delete dialog open */ }}
              asChild
            >
              {/* We wrap the alert dialog trigger here seamlessly if possible, 
                   but DropdownMenuItem asChild wrapping AlertDialogTrigger is tricky.
                   Alternative: Just use a state or keep delete separate?
                   For now, let's keep Delete separate in the main UI or open the dialog programmatically.
                   Actually, let's just keep the Delete button outside for quick access as before, 
                   and maybe remove it from here to avoid complexity or strictly use it for query generation.
                   
                   Wait, the user wants "Generate DELETE query". So the menu item above generates SQL.
                   The trash icon outside is for *executing* DROP TABLE.
                   
                   I will NOT put DROP TABLE in this menu to avoid confusion, 
                   or I can move the Trash icon into this menu "Drop Table".
                   
                   The prompt asked for "Templates".
                   "Generate DELETE" -> `DELETE FROM ...`.
                   
                   The existing Trash icon destroys the table. I will leave it as is for now.
               */}
              <span>
              </span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <button
              className="p-1 hover:bg-destructive/10 hover:text-destructive rounded-md text-muted-foreground transition-colors"
              onClick={(e) => e.stopPropagation()}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Table?</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete table "{tableName}"? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={(e) => e.stopPropagation()}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(tableName);
                }}
                className="bg-destructive hover:bg-destructive/90"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {/* Expanded details */}
      {
        isSelected && tableInfo && (
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
        )
      }
    </div >
  );
};

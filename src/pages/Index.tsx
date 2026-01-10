import React, { useState, useCallback, useRef } from 'react';
import { Database, getDatabase, resetDatabase } from '@/lib/rdbms/database';
import { Terminal } from '@/components/Terminal';
import { DatabaseExplorer } from '@/components/DatabaseExplorer';
import { TableViewer } from '@/components/TableViewer';
import { QuickStart } from '@/components/QuickStart';
import {
  PanelLeftClose,
  PanelLeft,
  Database as DatabaseIcon,
  RotateCcw,
  Github,
  GripVertical,
  GripHorizontal
} from 'lucide-react';
import { Button } from '@/components/ui/button';
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
import { cn } from '@/lib/utils';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';

const Index: React.FC = () => {
  const [database, setDatabase] = useState<Database>(() => getDatabase());

  // Initialize from URL
  const [selectedTable, setSelectedTable] = useState<string | null>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('table');
  });
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [terminalInput, setTerminalInput] = useState<string>('');
  const terminalRef = useRef<{ executeQuery: (sql: string) => void } | null>(null);

  const handleQueryExecuted = useCallback(() => {
    setRefreshTrigger(prev => prev + 1);
  }, []);

  const handleTableSelect = useCallback((table: string | null) => {
    setSelectedTable(table);
    const newUrl = new URL(window.location.href);
    if (table) {
      newUrl.searchParams.set('table', table);
      setTerminalInput(`SELECT * FROM ${table}`);
    } else {
      newUrl.searchParams.delete('table');
    }
    window.history.pushState({}, '', newUrl);
  }, []);

  const handleReset = useCallback(() => {
    resetDatabase();
    setDatabase(getDatabase());
    handleTableSelect(null);
    setRefreshTrigger(prev => prev + 1);
  }, [handleTableSelect]);

  const handleRunExample = useCallback((sql: string) => {
    setTerminalInput(sql);
  }, []);

  const handleExternalInputConsumed = useCallback(() => {
    setTerminalInput('');
  }, []);

  const handleTableDropped = useCallback((tableName: string) => {
    if (selectedTable === tableName) {
      handleTableSelect(null);
    }
    setRefreshTrigger(prev => prev + 1);
  }, [selectedTable, handleTableSelect]);

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-border bg-card/50 backdrop-blur-sm">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="text-muted-foreground hover:text-foreground"
          >
            {sidebarOpen ? (
              <PanelLeftClose className="h-5 w-5" />
            ) : (
              <PanelLeft className="h-5 w-5" />
            )}
            <span className="sr-only">Toggle sidebar</span>
          </Button>
          <div className="flex items-center gap-2">
            <DatabaseIcon className="h-5 w-5 text-primary" />
            <h1 className="font-semibold">Simple Data Core</h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
              >
                <RotateCcw className="h-4 w-4" />
                Reset Database
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                <AlertDialogDescription>
                  This action cannot be undone. This will permanently delete all tables and data
                  and reset the database to its initial demo state.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleReset}>Continue</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <Button variant="outline" size="icon" asChild>
            <a
              href="https://github.com/fredrick-mwaura/simple-data-core"
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground"
            >
              <Github className="h-5 w-5" />
              <span className="sr-only">GitHub</span>
            </a>
          </Button>
        </div>
      </header>

      {/* Main content with resizable panels */}
      <div className="flex-1 flex overflow-hidden">
        <PanelGroup direction="horizontal" className="flex-1">
          {/* Sidebar Panel */}
          <Panel
            defaultSize={20}
            minSize={15}
            maxSize={40}
            className={cn(
              "h-full flex flex-col bg-sidebar border-r border-sidebar-border",
              !sidebarOpen && "hidden"
            )}
          >
            <DatabaseExplorer
              database={database}
              selectedTable={selectedTable}
              onSelectTable={handleTableSelect}
              refreshTrigger={refreshTrigger}
              onTableDropped={handleTableDropped}
              onRunExample={handleRunExample}
            />
          </Panel>

          <PanelResizeHandle className="w-1 bg-border hover:bg-primary/50 transition-colors relative group">
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-1 h-8 bg-muted-foreground/30 rounded-full group-hover:bg-primary" />
          </PanelResizeHandle>

          {/* Main Content Panel */}
          <Panel defaultSize={80} minSize={30} className="flex flex-col">
            <PanelGroup direction="vertical">

              <Panel defaultSize={30} minSize={15}>
                <Terminal
                  ref={terminalRef}
                  database={database}
                  onQueryExecuted={handleQueryExecuted}
                  externalInput={terminalInput}
                  onExternalInputConsumed={handleExternalInputConsumed}
                />
              </Panel><PanelResizeHandle className="h-2 bg-border hover:bg-primary/50 transition-colors relative group">
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-1 bg-muted-foreground/30 rounded-full group-hover:bg-primary" />
              </PanelResizeHandle>

              {/* Table View or Welcome Screen */}
              <Panel defaultSize={70} minSize={30}>
                {selectedTable ? (
                  <div className="h-full overflow-auto">
                    <TableViewer
                      tableName={selectedTable}
                      database={database}
                      refreshTrigger={() => setRefreshTrigger(prev => prev + 1)}
                      onTableDropped={handleTableDropped}
                      onRunExample={handleRunExample}
                    />
                  </div>
                ) : (
                  <QuickStart onRunExample={handleRunExample} database={database} />
                )}
              </Panel>
            </PanelGroup>
          </Panel>
        </PanelGroup>
      </div>
    </div>
  );
};

export default Index;
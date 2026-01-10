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
  Github
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const Index: React.FC = () => {
  const [database, setDatabase] = useState<Database>(() => getDatabase());
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [terminalInput, setTerminalInput] = useState<string>('');
  const terminalRef = useRef<{ executeQuery: (sql: string) => void } | null>(null);

  const handleQueryExecuted = useCallback(() => {
    setRefreshTrigger(prev => prev + 1);
  }, []);

  const handleReset = useCallback(() => {
    resetDatabase();
    setDatabase(getDatabase());
    setSelectedTable(null);
    setRefreshTrigger(prev => prev + 1);
  }, []);

  const handleRunExample = useCallback((sql: string) => {
    setTerminalInput(sql);
  }, []);

  const handleExternalInputConsumed = useCallback(() => {
    setTerminalInput('');
  }, []);

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-border bg-card/50 backdrop-blur-sm">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="text-muted-foreground hover:text-foreground"
          >
            {sidebarOpen ? (
              <PanelLeftClose className="w-5 h-5" />
            ) : (
              <PanelLeft className="w-5 h-5" />
            )}
          </Button>
          
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-md bg-primary/10">
              <DatabaseIcon className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-foreground">LovableDB</h1>
              <p className="text-xs text-muted-foreground -mt-0.5">
                In-Memory RDBMS
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleReset}
            className="text-muted-foreground hover:text-foreground"
          >
            <RotateCcw className="w-4 h-4 mr-2" />
            Reset DB
          </Button>
          <a
            href="https://github.com"
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <Github className="w-5 h-5" />
          </a>
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <aside 
          className={cn(
            "transition-all duration-300 overflow-hidden",
            sidebarOpen ? "w-64" : "w-0"
          )}
        >
          <DatabaseExplorer
            database={database}
            selectedTable={selectedTable}
            onSelectTable={setSelectedTable}
            refreshTrigger={refreshTrigger}
          />
        </aside>

        {/* Main area */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {/* Terminal */}
          <div className="flex-1 p-4 overflow-hidden">
            <Terminal 
              database={database}
              onQueryExecuted={handleQueryExecuted}
              externalInput={terminalInput}
              onExternalInputConsumed={handleExternalInputConsumed}
            />
          </div>

          {/* Bottom panel - Table viewer or Quick start */}
          <div className="h-72 border-t border-border bg-card/30 overflow-hidden">
            {selectedTable ? (
              <TableViewer
                database={database}
                tableName={selectedTable}
                onRefresh={() => setRefreshTrigger(prev => prev + 1)}
              />
            ) : (
              <QuickStart
                database={database}
                onRunExample={handleRunExample}
              />
            )}
          </div>
        </main>
      </div>

      {/* Attribution footer */}
      <footer className="px-4 py-2 border-t border-border bg-card/30 text-xs text-muted-foreground flex items-center justify-between">
        <div>
          Built with React, TypeScript, and Tailwind CSS • B-Tree indexing • SQL Parser
        </div>
        <div>
          Custom RDBMS implementation - no external database libraries used
        </div>
      </footer>
    </div>
  );
};

export default Index;

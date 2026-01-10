import React, { useState, useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import { Database } from '@/lib/rdbms/database';
import { highlightSQL } from '@/lib/rdbms/parser';
import { QueryResult, Row, RowValue } from '@/lib/rdbms/types';
export interface TerminalHandle {
  executeQuery: (sql: string) => Promise<QueryResult>;
}
interface TerminalProps {
  database: Database;
  onQueryExecuted?: (result: QueryResult) => void;
  externalInput?: string;
  onExternalInputConsumed?: () => void;
}
interface HistoryEntry {
  id: number;
  query: string;
  result: QueryResult;
  timestamp: Date;
}
export const Terminal = forwardRef<TerminalHandle, TerminalProps>(({
  database,
  onQueryExecuted,
  externalInput,
  onExternalInputConsumed
}, ref) => {
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const idCounter = useRef(0);
  useImperativeHandle(ref, () => ({
    executeQuery: async (sql: string) => {
      if (!sql.trim()) return;

      try {
        const result = database.execute(sql);
        const newEntry: HistoryEntry = {
          id: idCounter.current++,
          query: sql,
          result,
          timestamp: new Date()
        };

        setHistory(prev => [...prev, newEntry]);
        onQueryExecuted?.(result);
        setCommandHistory(prev => [...prev, sql]);
        return result;
      } catch (error) {
        console.error('Error executing query:', error);
        // Create an error entry in history
        const errorEntry: HistoryEntry = {
          id: idCounter.current++,
          query: sql,
          result: {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            rows: [],
            columns: [],
            rowCount: 0,
            duration: 0
          },
          timestamp: new Date()
        };
        setHistory(prev => [...prev, errorEntry]);
        throw error;
      }
    }
  }));

  const scrollToBottom = useCallback(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [history, scrollToBottom]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Handle external input from Quick Start
  useEffect(() => {
    if (externalInput && externalInput.trim()) {
      setInput(externalInput);
      inputRef.current?.focus();
      // Auto-resize textarea
      if (inputRef.current) {
        inputRef.current.style.height = 'auto';
        inputRef.current.style.height = inputRef.current.scrollHeight + 'px';
      }
      onExternalInputConsumed?.();
    }
  }, [externalInput, onExternalInputConsumed]);

  const executeQuery = useCallback((query: string) => {
    if (!query.trim()) return;

    if (query.trim().toLowerCase() === 'clear') {
      setHistory([]);
      setCommandHistory(prev => [...prev, query.trim()]);
      setHistoryIndex(-1);
      setInput('');
      return;
    }

    const result = database.execute(query);
    const entry: HistoryEntry = {
      id: idCounter.current++,
      query: query.trim(),
      result,
      timestamp: new Date()
    };

    setHistory(prev => [...prev, entry]);
    setCommandHistory(prev => [...prev, query.trim()]);
    setHistoryIndex(-1);
    setInput('');

    onQueryExecuted?.(result);
  }, [database, onQueryExecuted]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      executeQuery(input);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (commandHistory.length > 0) {
        const newIndex = historyIndex === -1
          ? commandHistory.length - 1
          : Math.max(0, historyIndex - 1);
        setHistoryIndex(newIndex);
        setInput(commandHistory[newIndex]);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex !== -1) {
        const newIndex = historyIndex + 1;
        if (newIndex >= commandHistory.length) {
          setHistoryIndex(-1);
          setInput('');
        } else {
          setHistoryIndex(newIndex);
          setInput(commandHistory[newIndex]);
        }
      }
    } else if (e.key === 'Tab') {
      e.preventDefault();

      const textarea = inputRef.current;
      if (!textarea) return;

      const cursor = textarea.selectionStart;
      const text = input;

      // Find the word being typed (backwards from cursor)
      const textBeforeCursor = text.slice(0, cursor);
      const match = textBeforeCursor.match(/(\w+)$/);

      if (match) {
        const partialWord = match[1].toUpperCase(); // Case insensitive match, but preserve original case? 
        // SQL keywords usually uppercase, tables usually lowercase? 
        // Let's just match case-insensitive and replace with specific case (Upper for keywords, exact for tables)

        const keywords = [
          'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'FROM', 'WHERE', 'JOIN', 'ON',
          'VALUES', 'SET', 'INTO', 'CREATE', 'TABLE', 'DROP', 'ALTER', 'INDEX',
          'ORDER', 'BY', 'LIMIT', 'AND', 'OR', 'NOT', 'NULL', 'TRUE', 'FALSE'
        ];

        const tableNames = database.getTables();

        // Combine candidates
        // Prioritize keywords if starts with check matches
        const candidates = [
          ...keywords.map(k => ({ value: k, type: 'keyword' })),
          ...tableNames.map(t => ({ value: t, type: 'table' }))
        ];

        const partialOriginal = match[1];
        const matched = candidates.find(c => c.value.toUpperCase().startsWith(partialWord));

        if (matched) {
          const completion = matched.value;
          const newText = text.slice(0, cursor - partialOriginal.length) + completion + text.slice(cursor);
          setInput(newText);

          // Move cursor to end of inserted word
          // We need to wait for render or just manually calculate? 
          // Setting state is async, but value update is fast. 
          // Better to use setTimeout to set selection range after render?
          // Actually, in controlled component, we update state, then restore cursor?
          // Simple approach: calculate new position
          const newCursorPos = cursor - partialOriginal.length + completion.length;

          // React state update is batched. We need to set cursor position after render.
          requestAnimationFrame(() => {
            if (inputRef.current) {
              inputRef.current.selectionStart = newCursorPos;
              inputRef.current.selectionEnd = newCursorPos;
            }
          });
        }
      }
    }
  };

  const formatTime = (time: number) => {
    if (time < 1) return `${(time * 1000).toFixed(2)}µs`;
    if (time < 1000) return `${time.toFixed(2)}ms`;
    return `${(time / 1000).toFixed(2)}s`;
  };

  return (
    <div className="flex flex-col h-full bg-terminal-bg rounded-lg border border-terminal-border overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-terminal-border bg-card/50">
        <div className="flex gap-1.5">
          <div className="w-3 h-3 rounded-full bg-destructive/80" />
          <div className="w-3 h-3 rounded-full bg-warning/80" />
          <div className="w-3 h-3 rounded-full bg-success/80" />
        </div>
        <span className="ml-2 text-sm font-mono text-muted-foreground">
          {database.getName()} — SQL Terminal
        </span>
      </div>

      {/* Output area */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto p-4 font-mono text-sm terminal-scrollbar"
        onClick={() => inputRef.current?.focus()}
      >
        {/* Welcome message */}
        {history.length === 0 && (
          <div className="text-muted-foreground mb-4 animate-fade-in">
            <p className="text-primary font-semibold mb-2">Welcome to LovableDB v1.0</p>
            <p>A lightweight in-memory RDBMS with SQL support.</p>
            <p className="mt-2 text-xs">
              Supports: CREATE TABLE, INSERT, SELECT, UPDATE, DELETE, JOIN, INDEX
            </p>
            <p className="text-xs mt-1">
              Press <kbd className="px-1.5 py-0.5 bg-muted rounded text-foreground">Enter</kbd> to execute,
              <kbd className="px-1.5 py-0.5 bg-muted rounded text-foreground ml-1">↑/↓</kbd> for history and <kbd className="px-1.5 py-0.5 bg-muted rounded text-foreground ml-1">clear</kbd> to clear history
            </p>
          </div>
        )}

        {/* History entries */}
        {history.map((entry) => (
          <div key={entry.id} className="mb-4 animate-fade-in">
            {/* Query */}
            <div className="flex items-start gap-2">
              <span className="text-primary font-bold select-none">❯</span>
              <pre
                className="flex-1 whitespace-pre-wrap break-words"
                dangerouslySetInnerHTML={{ __html: highlightSQL(entry.query) }}
              />
            </div>

            {/* Result */}
            <div className="ml-5 mt-2">
              {entry.result.success ? (
                <>
                  {entry.result.rows && entry.result.rows.length > 0 ? (
                    <ResultTable
                      rows={entry.result.rows}
                      columns={entry.result.columns || Object.keys(entry.result.rows[0])}
                    />
                  ) : entry.result.message ? (
                    <p className="text-success">{entry.result.message}</p>
                  ) : (
                    <p className="text-muted-foreground">Query executed successfully.</p>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">
                    {entry.result.rowCount !== undefined && `${entry.result.rowCount} row(s) affected • `}
                    {formatTime(entry.result.executionTime || 0)}
                  </p>
                </>
              ) : (
                <p className="text-destructive">
                  Error: {entry.result.message}
                </p>
              )}
            </div>
          </div>
        ))}

        {/* Input line */}
        <div className="flex items-start gap-2">
          <span className="text-primary font-bold select-none">❯</span>
          <div className="flex-1 relative">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              className="w-full bg-transparent border-none outline-none resize-none font-mono text-foreground caret-terminal-cursor"
              placeholder="Enter SQL query or click table to generate query..."
              rows={1}
              style={{
                minHeight: '1.5em',
                height: 'auto'
              }}
              onInput={(e) => {
                const target = e.target as HTMLTextAreaElement;
                target.style.height = 'auto';
                target.style.height = target.scrollHeight + 'px';
              }}
            />
            {input === '' && (
              <span className="absolute left-0 top-0 w-2 h-5 bg-terminal-cursor animate-blink" />
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

// Result table component
interface ResultTableProps {
  rows: Row[];
  columns: string[];
}

const ResultTable: React.FC<ResultTableProps> = ({ rows, columns }) => {
  // Determine if we have joined columns (prefixed with table name)
  const hasJoinedColumns = columns.some(col => col.includes('.'));

  // If we have joined columns, prefer the prefixed ones to avoid ambiguity
  // Otherwise, fallback to the simple column names
  const displayColumns = hasJoinedColumns
    ? columns.filter(col => col.includes('.'))
    : columns;

  return (
    <div className="overflow-x-auto rounded border border-border">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-muted/50">
            {displayColumns.map((col) => (
              <th
                key={col}
                className="px-3 py-2 text-left font-semibold text-foreground border-b border-border"
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr
              key={idx}
              className="hover:bg-muted/30 transition-colors"
            >
              {displayColumns.map((col) => (
                <td
                  key={col}
                  className="px-3 py-2 border-b border-border/50"
                >
                  <CellValue value={row[col]} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const CellValue: React.FC<{ value: RowValue }> = ({ value }) => {
  if (value === null) {
    return <span className="text-muted-foreground italic">NULL</span>;
  }
  if (typeof value === 'boolean') {
    return <span className={value ? 'text-success' : 'text-destructive'}>{String(value)}</span>;
  }
  if (typeof value === 'number') {
    return <span className="syntax-number">{value}</span>;
  }
  if (typeof value === 'string') {
    return <span className="syntax-string">"{value}"</span>;
  }
  return <span>{String(value)}</span>;
};

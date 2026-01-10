import React from 'react';
import { Database } from '@/lib/rdbms/database';
import { Play, BookOpen, Zap, Table, Users, Package } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface QuickStartProps {
  database: Database;
  onRunExample: (sql: string) => void;
  executedQueries?: Set<string>;
}

const examples = [
  {
    icon: Table,
    title: 'Create a table',
    description: 'Create a users table with columns',
    sql: `CREATE TABLE users (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name STRING NOT NULL,
  email STRING UNIQUE,
  active BOOLEAN
)`
  },
  {
    icon: Users,
    title: 'Insert data',
    description: 'Add some sample users',
    sql: `INSERT INTO users (name, email, active) VALUES 
  ('Alice Johnson', 'alice@example.com', true),
  ('Bob Smith', 'bob@example.com', true),
  ('Charlie Brown', 'charlie@example.com', false)`
  },
  {
    icon: Zap,
    title: 'Query data',
    description: 'Select all active users',
    sql: `SELECT * FROM users WHERE active = true`
  },
  {
    icon: Package,
    title: 'Create products',
    description: 'Add a products table',
    sql: `CREATE TABLE products (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name STRING NOT NULL,
  price FLOAT,
  in_stock BOOLEAN
)`
  },
  {
    icon: BookOpen,
    title: 'Create orders',
    description: 'Orders table with foreign keys',
    sql: `CREATE TABLE orders (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  product_id INT NOT NULL,
  quantity INT,
  created_at STRING
)`
  },
  {
    icon: Play,
    title: 'Join tables',
    description: 'Query across multiple tables',
    sql: `SELECT users.name, orders.quantity 
FROM orders 
JOIN users ON orders.user_id = users.id`
  }
];

export const QuickStart: React.FC<QuickStartProps> = ({ database, onRunExample }) => {
  return (
    <div className="p-6">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-foreground mb-2">Quick Start</h2>
        <p className="text-muted-foreground text-sm">
          Click any example to run it in the terminal
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {examples.map((example, idx) => (
          <button
            key={idx}
            onClick={() => onRunExample(example.sql)}
            className="group text-left p-4 rounded-lg border border-border bg-card hover:bg-muted/50 hover:border-primary/50 transition-all"
          >
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-md bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                <example.icon className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-medium text-foreground group-hover:text-primary transition-colors">
                  {example.title}
                </h3>
                <p className="text-xs text-muted-foreground mt-1">
                  {example.description}
                </p>
              </div>
            </div>
            <pre className="mt-3 p-2 rounded bg-terminal-bg text-xs font-mono text-muted-foreground overflow-x-auto whitespace-pre-wrap">
              {example.sql.length > 80 ? example.sql.slice(0, 80) + '...' : example.sql}
            </pre>
          </button>
        ))}
      </div>
    </div>
  );
};

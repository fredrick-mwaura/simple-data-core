import React from 'react';
import { Database } from '@/lib/rdbms/database';
import { Play, BookOpen, Zap, Table, Users, Search, Edit, Trash2 } from 'lucide-react';

interface QuickStartProps {
  database: Database;
  onRunExample: (sql: string) => void;
  executedQueries?: Set<string>;
}

/**
 * Quick Start examples demonstrating the pre-loaded schema.
 * The database initializes with: users, posts, categories, post_categories tables
 * These examples showcase CRUD operations and joins on the existing data.
 */
const examples = [
  {
    icon: Search,
    title: 'View all users',
    description: 'Query the pre-loaded users table',
    sql: `SELECT * FROM users`
  },
  {
    icon: Play,
    title: 'Join users & posts',
    description: 'Inner join to see posts with authors',
    sql: `SELECT users.username, posts.title, posts.content
FROM posts
JOIN users ON posts.user_id = users.id`
  },
  {
    icon: Zap,
    title: 'Filter with WHERE',
    description: 'Find active users only',
    sql: `SELECT * FROM users WHERE active = true`
  },
  {
    icon: Users,
    title: 'Insert a new user',
    description: 'Add a new user to the database',
    sql: `INSERT INTO users (username, email, active) 
VALUES ('diana', 'diana@example.com', true)`
  },
  {
    icon: Edit,
    title: 'Update data',
    description: 'Modify an existing user',
    sql: `UPDATE users SET active = false WHERE username = 'bob'`
  },
  {
    icon: Trash2,
    title: 'Delete data',
    description: 'Remove a user from the database',
    sql: `DELETE FROM users WHERE username = 'charlie'`
  },
  {
    icon: Table,
    title: 'Create new table',
    description: 'Define a new products table',
    sql: `CREATE TABLE products (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name STRING NOT NULL,
  price FLOAT,
  in_stock BOOLEAN
)`
  },
  {
    icon: BookOpen,
    title: 'Left join example',
    description: 'Include users without posts',
    sql: `SELECT users.username, posts.title
FROM users
LEFT JOIN posts ON users.id = posts.user_id`
  }
];

export const QuickStart: React.FC<QuickStartProps> = ({ database, onRunExample }) => {
  return (
    <div className="p-6 h-full overflow-y-auto">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-foreground mb-1">Quick Start</h2>
        <p className="text-muted-foreground text-sm">
          Database is pre-loaded with <code className="px-1 py-0.5 bg-muted rounded text-xs">users</code>, 
          <code className="px-1 py-0.5 bg-muted rounded text-xs ml-1">posts</code>, 
          <code className="px-1 py-0.5 bg-muted rounded text-xs ml-1">categories</code> tables. 
          Click any example to load it into the terminal.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        {examples.map((example, idx) => (
          <button
            key={idx}
            onClick={() => onRunExample(example.sql)}
            className="group text-left p-3 rounded-lg border border-border bg-card hover:bg-muted/50 hover:border-primary/50 transition-all"
          >
            <div className="flex items-start gap-2">
              <div className="p-1.5 rounded-md bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                <example.icon className="w-3.5 h-3.5" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-medium text-sm text-foreground group-hover:text-primary transition-colors">
                  {example.title}
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                  {example.description}
                </p>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};

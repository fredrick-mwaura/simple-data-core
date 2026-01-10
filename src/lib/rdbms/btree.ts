// B-Tree implementation for indexing

import { RowValue } from './types';

const ORDER = 4; // B-tree order (max children per node)

interface BTreeNode {
  keys: RowValue[];
  values: number[][]; // Array of row indices for each key
  children: BTreeNode[];
  isLeaf: boolean;
}

export class BTree {
  private root: BTreeNode;
  private comparator: (a: RowValue, b: RowValue) => number;

  constructor() {
    this.root = this.createNode(true);
    this.comparator = this.defaultComparator;
  }

  private createNode(isLeaf: boolean): BTreeNode {
    return {
      keys: [],
      values: [],
      children: [],
      isLeaf
    };
  }

  private defaultComparator(a: RowValue, b: RowValue): number {
    if (a === null && b === null) return 0;
    if (a === null) return -1;
    if (b === null) return 1;
    if (typeof a === 'string' && typeof b === 'string') {
      return a.localeCompare(b);
    }
    if (typeof a === 'number' && typeof b === 'number') {
      return a - b;
    }
    if (typeof a === 'boolean' && typeof b === 'boolean') {
      return (a ? 1 : 0) - (b ? 1 : 0);
    }
    return String(a).localeCompare(String(b));
  }

  insert(key: RowValue, rowIndex: number): void {
    const root = this.root;

    if (root.keys.length === ORDER - 1) {
      const newRoot = this.createNode(false);
      newRoot.children.push(root);
      this.splitChild(newRoot, 0);
      this.root = newRoot;
      this.insertNonFull(newRoot, key, rowIndex);
    } else {
      this.insertNonFull(root, key, rowIndex);
    }
  }

  private splitChild(parent: BTreeNode, index: number): void {
    const child = parent.children[index];
    const mid = Math.floor((ORDER - 1) / 2);

    const newNode = this.createNode(child.isLeaf);
    newNode.keys = child.keys.splice(mid + 1);
    newNode.values = child.values.splice(mid + 1);

    if (!child.isLeaf) {
      newNode.children = child.children.splice(mid + 1);
    }

    const midKey = child.keys.pop()!;
    const midValue = child.values.pop()!;

    parent.keys.splice(index, 0, midKey);
    parent.values.splice(index, 0, midValue);
    parent.children.splice(index + 1, 0, newNode);
  }

  private insertNonFull(node: BTreeNode, key: RowValue, rowIndex: number): void {
    let i = node.keys.length - 1;

    if (node.isLeaf) {
      // Find position for new key
      while (i >= 0 && this.comparator(key, node.keys[i]) < 0) {
        i--;
      }

      // Check if key already exists
      if (i >= 0 && this.comparator(key, node.keys[i]) === 0) {
        // Add to existing values array
        if (!node.values[i].includes(rowIndex)) {
          node.values[i].push(rowIndex);
        }
        return;
      }

      node.keys.splice(i + 1, 0, key);
      node.values.splice(i + 1, 0, [rowIndex]);
    } else {
      while (i >= 0 && this.comparator(key, node.keys[i]) < 0) {
        i--;
      }

      // Check if key already exists at this level
      if (i >= 0 && this.comparator(key, node.keys[i]) === 0) {
        if (!node.values[i].includes(rowIndex)) {
          node.values[i].push(rowIndex);
        }
        return;
      }

      i++;

      if (node.children[i].keys.length === ORDER - 1) {
        this.splitChild(node, i);
        if (this.comparator(key, node.keys[i]) > 0) {
          i++;
        } else if (this.comparator(key, node.keys[i]) === 0) {
          if (!node.values[i].includes(rowIndex)) {
            node.values[i].push(rowIndex);
          }
          return;
        }
      }

      this.insertNonFull(node.children[i], key, rowIndex);
    }
  }

  search(key: RowValue): number[] {
    return this.searchNode(this.root, key);
  }

  private searchNode(node: BTreeNode, key: RowValue): number[] {
    let i = 0;

    while (i < node.keys.length && this.comparator(key, node.keys[i]) > 0) {
      i++;
    }

    if (i < node.keys.length && this.comparator(key, node.keys[i]) === 0) {
      return [...node.values[i]];
    }

    if (node.isLeaf) {
      return [];
    }

    return this.searchNode(node.children[i], key);
  }

  searchRange(from: RowValue, to: RowValue): number[] {
    const results: number[] = [];
    this.rangeSearch(this.root, from, to, results);
    return results;
  }

  private rangeSearch(node: BTreeNode, from: RowValue, to: RowValue, results: number[]): void {
    let i = 0;

    while (i < node.keys.length) {
      if (!node.isLeaf && (from === null || this.comparator(from, node.keys[i]) <= 0)) {
        this.rangeSearch(node.children[i], from, to, results);
      }

      if ((from === null || this.comparator(from, node.keys[i]) <= 0) &&
          (to === null || this.comparator(node.keys[i], to) <= 0)) {
        results.push(...node.values[i]);
      }

      i++;
    }

    if (!node.isLeaf && node.children[i]) {
      this.rangeSearch(node.children[i], from, to, results);
    }
  }

  delete(key: RowValue, rowIndex: number): boolean {
    return this.deleteFromNode(this.root, key, rowIndex);
  }

  private deleteFromNode(node: BTreeNode, key: RowValue, rowIndex: number): boolean {
    let i = 0;

    while (i < node.keys.length && this.comparator(key, node.keys[i]) > 0) {
      i++;
    }

    if (i < node.keys.length && this.comparator(key, node.keys[i]) === 0) {
      const valueIndex = node.values[i].indexOf(rowIndex);
      if (valueIndex !== -1) {
        node.values[i].splice(valueIndex, 1);
        if (node.values[i].length === 0) {
          node.keys.splice(i, 1);
          node.values.splice(i, 1);
        }
        return true;
      }
      return false;
    }

    if (node.isLeaf) {
      return false;
    }

    return this.deleteFromNode(node.children[i], key, rowIndex);
  }

  clear(): void {
    this.root = this.createNode(true);
  }

  getAllEntries(): Array<{ key: RowValue; indices: number[] }> {
    const entries: Array<{ key: RowValue; indices: number[] }> = [];
    this.collectEntries(this.root, entries);
    return entries;
  }

  private collectEntries(node: BTreeNode, entries: Array<{ key: RowValue; indices: number[] }>): void {
    for (let i = 0; i < node.keys.length; i++) {
      if (!node.isLeaf && node.children[i]) {
        this.collectEntries(node.children[i], entries);
      }
      entries.push({ key: node.keys[i], indices: [...node.values[i]] });
    }
    if (!node.isLeaf && node.children[node.keys.length]) {
      this.collectEntries(node.children[node.keys.length], entries);
    }
  }
}

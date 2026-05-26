import { create } from 'zustand';
import type { ParsedDependency } from '../lib/parsers/types';
import type { PackageAnalysisData } from '../types/analysis';
import { analyzePackage } from '../lib/fetchers/orchestrator';

export type BatchStatus = 'IDLE' | 'SELECTING' | 'RUNNING' | 'COMPLETE';

export interface BatchItem extends ParsedDependency {
  selected: boolean;
  status: 'PENDING' | 'SCANNING' | 'DONE' | 'FAILED';
  result?: Partial<PackageAnalysisData>;
  error?: string;
}

interface BatchState {
  status: BatchStatus;
  items: BatchItem[];
  
  startBatch: (dependencies: ParsedDependency[]) => void;
  toggleSelection: (index: number, selected: boolean) => void;
  toggleAll: (selected: boolean) => void;
  runAnalysis: () => Promise<void>;
  resetBatch: () => void;
}

export const useBatchStore = create<BatchState>((set, get) => ({
  status: 'IDLE',
  items: [],
  
  startBatch: (dependencies) => {
    // Deduplicate by name and ecosystem
    const uniqueMap = new Map<string, ParsedDependency>();
    dependencies.forEach(d => uniqueMap.set(`${d.ecosystem}:${d.name}`, d));
    
    const items: BatchItem[] = Array.from(uniqueMap.values()).map(d => ({
      ...d,
      selected: true,
      status: 'PENDING'
    }));
    
    set({ status: 'SELECTING', items });
  },
  
  toggleSelection: (index, selected) => {
    const items = [...get().items];
    if (items[index]) {
      items[index].selected = selected;
      set({ items });
    }
  },
  
  toggleAll: (selected) => {
    const items = get().items.map(item => ({ ...item, selected }));
    set({ items });
  },
  
  runAnalysis: async () => {
    set({ status: 'RUNNING' });
    const items = [...get().items];
    const selectedItems = items.filter(i => i.selected && i.status === 'PENDING');
    
    // Batch processing: max 5 at a time
    const BATCH_SIZE = 5;
    
    for (let i = 0; i < selectedItems.length; i += BATCH_SIZE) {
      const batch = selectedItems.slice(i, i + BATCH_SIZE);
      
      // Mark as scanning
      batch.forEach(item => { item.status = 'SCANNING'; });
      set({ items: [...items] });
      
      // Run batch in parallel
      await Promise.all(batch.map(async (item) => {
        try {
          const result = await analyzePackage(item.name, item.version, item.ecosystem);
          item.result = result;
          item.status = 'DONE';
        } catch (e: any) {
          item.error = e.message;
          item.status = 'FAILED';
        }
        set({ items: [...items] });
      }));
    }
    
    set({ status: 'COMPLETE' });
  },
  
  resetBatch: () => {
    set({ status: 'IDLE', items: [] });
  }
}));

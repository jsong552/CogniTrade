import type { TimeRange } from '@/lib/mockData';

import csv2 from '../../backend/mock_data/fake_transactions_2.csv?raw';
import csv3 from '../../backend/mock_data/fake_transactions_3.csv?raw';
import csv4 from '../../backend/mock_data/fake_transactions_4.csv?raw';
import csv5 from '../../backend/mock_data/fake_transactions_5.csv?raw';
import csv6 from '../../backend/mock_data/fake_transactions_6.csv?raw';

interface TransactionRecord {
  timestampMs: number;
  ticker: string;
  price: number;
}

const CSV_FILES = [csv2, csv3, csv4, csv5, csv6];

function parseTimestampMs(timestamp: string): number | null {
  const normalized = timestamp.trim().replace(' ', 'T');
  const parsed = Date.parse(normalized);
  return Number.isNaN(parsed) ? null : parsed;
}

function parseCsv(raw: string): TransactionRecord[] {
  const lines = raw.trim().split(/\r?\n/);
  if (lines.length <= 1) return [];

  return lines.slice(1).map(line => {
    const parts = line.split(',');
    const timestamp = parts[0]?.trim();
    const ticker = parts[2]?.trim();
    const price = Number(parts[4]);
    const timestampMs = timestamp ? parseTimestampMs(timestamp) : null;

    if (!ticker || !Number.isFinite(price) || timestampMs === null) {
      return null;
    }

    return { timestampMs, ticker, price };
  }).filter((record): record is TransactionRecord => record !== null);
}

const ALL_RECORDS = CSV_FILES.flatMap(parseCsv).sort((a, b) => a.timestampMs - b.timestampMs);
const RECORDS_BY_SYMBOL = new Map<string, TransactionRecord[]>();

for (const record of ALL_RECORDS) {
  const list = RECORDS_BY_SYMBOL.get(record.ticker) ?? [];
  list.push(record);
  RECORDS_BY_SYMBOL.set(record.ticker, list);
}

function getRecordsForSymbol(symbol: string): TransactionRecord[] {
  return RECORDS_BY_SYMBOL.get(symbol) ?? [];
}

function getRangeDurationMs(range: TimeRange): number {
  switch (range) {
    case '1D':
      return 24 * 60 * 60 * 1000;
    case '1W':
      return 7 * 24 * 60 * 60 * 1000;
    case '1M':
      return 30 * 24 * 60 * 60 * 1000;
    case '1Y':
      return 365 * 24 * 60 * 60 * 1000;
    default:
      return 30 * 24 * 60 * 60 * 1000;
  }
}

function formatPointTime(timestampMs: number, range: TimeRange): string {
  const date = new Date(timestampMs);

  switch (range) {
    case '1D':
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    case '1W':
      return date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
    case '1M':
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    case '1Y':
      return date.toLocaleDateString([], { month: 'short', year: '2-digit' });
    default:
      return date.toLocaleDateString();
  }
}

export function buildTickersFromTransactions() {
  const symbols = Array.from(RECORDS_BY_SYMBOL.keys()).sort();

  return symbols.map(symbol => {
    const records = getRecordsForSymbol(symbol);
    const last = records[records.length - 1];
    const prev = records.length > 1 ? records[records.length - 2] : last;
    const change = last ? last.price - prev.price : 0;
    const changePercent = prev && prev.price ? (change / prev.price) * 100 : 0;

    return {
      symbol,
      name: symbol,
      price: last ? Number(last.price.toFixed(2)) : 0,
      change: Number(change.toFixed(2)),
      changePercent: Number(changePercent.toFixed(2)),
      sector: 'Transactions',
    };
  });
}

export function getHistoricalPricePoints(symbol: string, range: TimeRange): Array<{ time: string; price: number }> {
  const records = getRecordsForSymbol(symbol);
  if (records.length === 0) {
    return [];
  }

  const rangeEnd = records[records.length - 1].timestampMs;
  const rangeStart = rangeEnd - getRangeDurationMs(range);
  const filtered = records.filter(record => record.timestampMs >= rangeStart && record.timestampMs <= rangeEnd);
  const useRecords = filtered.length > 0 ? filtered : records;

  return useRecords.map(record => ({
    time: formatPointTime(record.timestampMs, range),
    price: Number(record.price.toFixed(2)),
  }));
}

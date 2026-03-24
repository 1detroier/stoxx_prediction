// Type declarations for yfinance module
declare module 'yfinance' {
  export interface HistoryOptions {
    start?: string
    end?: string
    period?: string
    interval?: string
  }

  export interface HistoryRow {
    Date?: Date | string
    date?: Date | string
    index?: Date | string
    Open?: number
    open?: number
    High?: number
    high?: number
    Low?: number
    low?: number
    Close?: number
    close?: number
    Volume?: number
    volume?: number
    Dividends?: number
    'Stock Splits'?: number
  }

  export interface Info {
    regularMarketPrice?: number
    previousClose?: number
    regularMarketDayHigh?: number
    regularMarketDayLow?: number
    regularMarketOpen?: number
    regularMarketVolume?: number
    [key: string]: unknown
  }

  export interface Ticker {
    info: Promise<Info>
    history(options?: HistoryOptions): Promise<HistoryRow[]>
    fastInfo: { get: (key: string) => unknown }
  }

  export function ticker(symbol: string): Ticker

  const yfinance: {
    ticker: typeof ticker
  }

  export default yfinance
}
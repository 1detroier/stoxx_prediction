declare module 'yfinance' {
  export interface Tick {
    Open: number
    High: number
    Low: number
    Close: number
    Adj Close: number
    Volume: number
  }

  export interface HistoryData {
    index: Date[]
    Open: number[]
    High: number[]
    Low: number[]
    Close: number[]
    Adj Close: number[]
    Volume: number[]
    iloc: {
      (i: number): Tick
    }
    empty: boolean
  }

  export interface Ticker {
    history(options?: {
      period?: string
      interval?: string
      start?: string
      end?: string
    }): HistoryData
  }

  export function Ticker(ticker: string): Ticker
}

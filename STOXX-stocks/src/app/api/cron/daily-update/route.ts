import { NextRequest, NextResponse } from 'next/server'
import yfinance from 'yfinance'

const TICKERS = [
  'ASML.AS', 'SAP.DE', 'NOVO-B.CO', 'MC.PA', 'NESN.SW', 'ROG.SW',
  'SIE.DE', 'TTE.PA', 'AZN.L', 'HSBA.L', 'SU.PA', 'ALV.DE', 'SAF.PA',
  'BNP.PA', 'SAN.MC', 'ULVR.L', 'ADYEN.AS', 'ABBN.SW', 'DSY.PA',
  'AIR.PA', 'RR.L', 'ISP.MI', 'INGA.AS', 'CS.PA', 'OR.PA', 'ABI.BR',
  'GSK.L', 'BHP.L', 'SHEL.L', 'IBE.MC', 'ENEL.MI', 'DTE.DE', 'VOW3.DE',
  'TKA.DE', 'UBI.PA', 'SINCH.ST', 'SDF.DE', 'DBK.DE', 'VNA.DE', 'CRH.L',
  'FLTR.L', 'NOKIA.HE', 'VOLV-B.ST', 'CARL-B.CO', 'KBC.BR'
]

/**
 * Cron job: Daily price update
 * 
 * Fetches end-of-day prices using yfinance and stores in Supabase.
 * Runs after market close (5:30pm CET = 4:30pm UTC = 16:30 UTC)
 * 
 * Cron schedule: Every day at 16:30 UTC
 * 
 * Security: Protected by CRON_SECRET header
 */
export async function GET(request: NextRequest) {
  // Verify cron secret
  const cronSecret = request.headers.get('x-cron-secret')
  const expectedSecret = process.env.CRON_SECRET

  if (!expectedSecret) {
    console.error('CRON_SECRET not configured')
    return NextResponse.json(
      { error: 'Cron not configured' },
      { status: 500 }
    )
  }

  if (cronSecret !== expectedSecret) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    )
  }

  try {
    const prices: Array<{
      ticker: string
      date: string
      open: number
      high: number
      low: number
      close: number
      adjusted_close: number
      volume: number
    }> = []

    // Fetch data for all tickers
    console.log(`Fetching EOD prices for ${TICKERS.length} tickers...`)

    for (const ticker of TICKERS) {
      try {
        const stock = yfinance.Ticker(ticker)
        const data = stock.history({ period: '1d', interval: '1d' })

        if (data.empty) {
          console.warn(`No data for ${ticker}`)
          continue
        }

        const latest = data.iloc[-1]
        const date = data.index[-1].strftime('%Y-%m-%d')

        prices.push({
          ticker,
          date,
          open: Number(latest.Open),
          high: Number(latest.High),
          low: Number(latest.Low),
          close: Number(latest.Close),
          adjusted_close: Number(latest['Adj Close'] || latest.Close),
          volume: Number(latest.Volume)
        })

        console.log(`Fetched ${ticker}: ${date} = ${latest.Close}`)
      } catch (tickerError) {
        console.error(`Error fetching ${ticker}:`, tickerError)
      }
    }

    if (prices.length === 0) {
      return NextResponse.json(
        { error: 'No data fetched', message: 'Could not fetch any prices' },
        { status: 500 }
      )
    }

    // Insert into Supabase
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json(
        { error: 'Database not configured' },
        { status: 500 }
      )
    }

    const insertResponse = await fetch(`${supabaseUrl}/rest/v1/prices`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Prefer': 'resolution=ignore-duplicates'
      },
      body: JSON.stringify(prices)
    })

    if (!insertResponse.ok) {
      const errorText = await insertResponse.text()
      console.error('Supabase insert error:', errorText)
      return NextResponse.json(
        { error: 'Database insert failed', details: errorText },
        { status: 500 }
      )
    }

    console.log(`Successfully inserted ${prices.length} price records`)

    return NextResponse.json({
      success: true,
      ticker_count: prices.length,
      message: `Updated ${prices.length} prices`
    })

  } catch (error) {
    console.error('Daily update error:', error)
    return NextResponse.json(
      { error: 'Update failed', details: String(error) },
      { status: 500 }
    )
  }
}

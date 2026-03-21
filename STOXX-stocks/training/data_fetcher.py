#!/usr/bin/env python3
"""
Phase 5.1: Data Fetcher for STOXX-stocks Training Pipeline

Fetches historical daily adjusted prices using Yahoo Finance (yfinance).
No API key required, no rate limits.

Usage:
    python data_fetcher.py --output ../data/raw/
    python data_fetcher.py --tickers ASML.AS SAP.DE --output ../data/raw/
"""

import os
import sys
import time
import csv
import logging
import argparse
from pathlib import Path
from datetime import datetime

import yfinance as yf

# Load .env file from same directory as this script
from dotenv import load_dotenv
load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger(__name__)

# Constants
START_DATE = "2021-01-01"  # 5 years is sufficient for LSTM training
END_DATE = datetime.now().strftime("%Y-%m-%d")

# 45 STOXX European companies (38 Healthy + 7 Distressed)
TICKERS = [
    "ASML.AS", "SAP.DE", "NOVO-B.CO", "MC.PA", "NESN.SW", "ROG.SW",
    "SIE.DE", "TTE.PA", "AZN.L", "HSBA.L", "SU.PA", "ALV.DE", "SAF.PA",
    "BNP.PA", "SAN.MC", "ULVR.L", "ADYEN.AS", "ABBN.SW", "DSY.PA",
    "AIR.PA", "RR.L", "ISP.MI", "INGA.AS", "CS.PA", "OR.PA", "ABI.BR",
    "GSK.L", "BHP.L", "SHEL.L", "IBE.MC", "ENEL.MI", "DTE.DE", "VOW3.DE",
    "TKA.DE", "UBI.PA", "SINCH.ST", "SDF.DE", "DBK.DE", "VNA.DE", "CRH.L",
    "FLTR.L", "NOKIA.HE", "VOLV-B.ST", "CARL-B.CO", "KBC.BR"
]

# Distressed companies (for logging purposes)
DISTRESSED_TICKERS = [
    "VOW3.DE",  # Volkswagen
    "TKA.DE",   # Thyssenkrupp
    "UBI.PA",   # Ubisoft
    "SINCH.ST", # Sinch
    "SDF.DE",   # K+S
    "DBK.DE",   # Deutsche Bank
    "VNA.DE"    # Vonovia
]


def fetch_ticker_data(
    ticker: str,
    output_file: str,
    start_date: str = START_DATE,
    end_date: str = END_DATE
) -> bool:
    """
    Fetch daily adjusted time series for a single ticker using yfinance.
    
    Args:
        ticker: Stock ticker symbol (e.g., "ASML.AS")
        output_file: Path to output CSV file
        start_date: Start date for historical data
        end_date: End date for historical data
        
    Returns:
        bool: True if successful, False otherwise
    """
    try:
        logger.info(f"Fetching {ticker} ({start_date} to {end_date})")
        
        # Download data from yfinance
        stock = yf.Ticker(ticker)
        df = stock.history(start=start_date, end=end_date)
        
        if df.empty:
            logger.error(f"No data found for {ticker}")
            return False
        
        # Prepare output directory
        output_path = Path(output_file)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        
        # Print column names for debugging
        logger.debug(f"Columns for {ticker}: {list(df.columns)}")
        
        # Write to CSV with standard column names
        with open(output_path, 'w', newline='') as f:
            writer = csv.DictWriter(
                f,
                fieldnames=[
                    'date', 'open', 'high', 'low', 'close',
                    'adjusted_close', 'volume', 'dividend_amount',
                    'split_coefficient'
                ]
            )
            writer.writeheader()
            
            for index, row in df.iterrows():
                # Handle different yfinance column name versions
                adj_close = row.get('Adj Close') or row.get('Close', 0)
                if adj_close == 0:
                    adj_close = row.get('Close', 0)
                
                # Convert numpy types to Python native types
                date_str = index.strftime('%Y-%m-%d') if hasattr(index, 'strftime') else str(index)[:10]
                
                writer.writerow({
                    'date': date_str,
                    'open': float(row.get('Open', 0) or 0),
                    'high': float(row.get('High', 0) or 0),
                    'low': float(row.get('Low', 0) or 0),
                    'close': float(row.get('Close', 0) or 0),
                    'adjusted_close': float(adj_close or 0),
                    'volume': int(row.get('Volume', 0) or 0),
                    'dividend_amount': float(row.get('Dividends', 0) or 0),
                    'split_coefficient': float(row.get('Stock Splits', 1) or 1)
                })
        
        logger.info(f"Successfully saved {len(df)} days of data for {ticker} to {output_file}")
        return True
        
    except Exception as e:
        logger.error(f"Error fetching {ticker}: {e}")
        import traceback
        logger.debug(traceback.format_exc())
        return False


def fetch_all_tickers(
    tickers: list,
    output_dir: str,
    start_date: str = START_DATE,
    end_date: str = END_DATE
) -> tuple:
    """
    Fetch daily adjusted prices for all tickers.
    
    Args:
        tickers: List of ticker symbols
        output_dir: Directory to save CSV files
        start_date: Start date for historical data
        end_date: End date for historical data
        
    Returns:
        Tuple of (results dict, success_count, failure_count)
    """
    results = {}
    success_count = 0
    failure_count = 0
    
    for i, ticker in enumerate(tickers, 1):
        is_distressed = ticker in DISTRESSED_TICKERS
        status_label = "[DISTRESSED]" if is_distressed else "[HEALTHY ]"
        
        logger.info(
            f"Progress: {i}/{len(tickers)} {status_label} "
            f"Fetching {ticker}..."
        )
        
        # Convert ticker to filename (replace . with _)
        ticker_filename = ticker.replace('.', '_')
        output_file = os.path.join(output_dir, f"{ticker_filename}.csv")
        
        success = fetch_ticker_data(ticker, output_file, start_date, end_date)
        
        if success:
            results[ticker] = {'success': True, 'error': None}
            success_count += 1
        else:
            results[ticker] = {
                'success': False,
                'error': 'Fetch failed'
            }
            failure_count += 1
    
    return results, success_count, failure_count


def print_summary(results: dict, success_count: int, failure_count: int):
    """Print a summary of the fetch results."""
    print("\n" + "=" * 60)
    print("DATA FETCH SUMMARY")
    print("=" * 60)
    print(f"Total tickers: {len(results)}")
    print(f"Successful:    {success_count}")
    print(f"Failed:        {failure_count}")
    print("-" * 60)
    
    if failure_count > 0:
        print("\nFailed tickers:")
        for ticker, result in results.items():
            if not result['success']:
                print(f"  - {ticker}: {result['error']}")
    
    print("=" * 60)


def main():
    """Main entry point for data fetcher."""
    parser = argparse.ArgumentParser(
        description='Fetch European stock data from Yahoo Finance',
        formatter_class=argparse.RawDescriptionHelpFormatter
    )
    
    parser.add_argument(
        '-o', '--output',
        type=str,
        default='../data/raw',
        help='Output directory for CSV files (default: ../data/raw)'
    )
    
    parser.add_argument(
        '-t', '--tickers',
        nargs='+',
        default=None,
        help='Specific tickers to fetch (default: all 45 tickers)'
    )
    
    parser.add_argument(
        '--start',
        type=str,
        default=START_DATE,
        help=f'Start date YYYY-MM-DD (default: {START_DATE})'
    )
    
    parser.add_argument(
        '--end',
        type=str,
        default=END_DATE,
        help=f'End date YYYY-MM-DD (default: {END_DATE})'
    )
    
    parser.add_argument(
        '-v', '--verbose',
        action='store_true',
        help='Enable verbose logging'
    )
    
    args = parser.parse_args()
    
    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)
    
    tickers_to_fetch = args.tickers if args.tickers else TICKERS
    
    logger.info(f"Starting data fetch for {len(tickers_to_fetch)} tickers")
    logger.info(f"Output directory: {args.output}")
    logger.info(f"Date range: {args.start} to {args.end}")
    
    results, success_count, failure_count = fetch_all_tickers(
        tickers_to_fetch,
        args.output,
        args.start,
        args.end
    )
    
    print_summary(results, success_count, failure_count)
    
    if failure_count > 0:
        logger.warning(
            f"{failure_count} tickers failed to fetch. "
            f"You can retry by running with specific tickers."
        )
        sys.exit(1)
    else:
        logger.info("All tickers fetched successfully!")
        sys.exit(0)


if __name__ == '__main__':
    # Import pandas for pd.isna check
    import pandas as pd
    main()

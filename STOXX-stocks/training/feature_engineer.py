#!/usr/bin/env python3
"""
Phase 5.2: Feature Engineer for STOXX-stocks Training Pipeline

Computes Z-score normalized features, rolling returns, and European market features
from raw CSV price data. Creates panel tensor for LSTM training.

Usage:
    python feature_engineer.py --input ../data/raw --output ../data/processed

Output:
    - training_panel.h5: 3D panel tensor [samples, timesteps, features]
    - zscore_params.json: Normalization parameters for inference
    - features_hash.json: Data versioning hash
"""

import os
import json
import hashlib
import logging
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv
load_dotenv()

import numpy as np
import pandas as pd

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger(__name__)

# Constants
INPUT_DIR = "../data/raw"
OUTPUT_DIR = "../data/processed"

# Data configuration
YEARS_OF_DATA = 7  # Use last 7 years of data (balances coverage vs training speed)

TICKERS = [
    "ASML.AS", "SAP.DE", "NOVO-B.CO", "MC.PA", "NESN.SW", "ROG.SW",
    "SIE.DE", "TTE.PA", "AZN.L", "HSBA.L", "SU.PA", "ALV.DE", "SAF.PA",
    "BNP.PA", "SAN.MC", "ULVR.L", "ADYEN.AS", "ABBN.SW", "DSY.PA",
    "AIR.PA", "RR.L", "ISP.MI", "INGA.AS", "CS.PA", "OR.PA", "ABI.BR",
    "GSK.L", "BHP.L", "SHEL.L", "IBE.MC", "ENEL.MI", "DTE.DE", "VOW3.DE",
    "TKA.DE", "UBI.PA", "SINCH.ST", "SDF.DE", "DBK.DE", "VNA.DE", "CRH.L",
    "FLTR.L", "NOKIA.HE", "VOLV-B.ST", "CARL-B.CO", "KBC.BR"
]

PANEL_FEATURES = [
    'return_1d', 'return_1m', 'return_6m', 'return_9m',
    'z_return_1d', 'z_return_1m', 'z_return_6m', 'z_return_9m',
    'volatility_20d', 'atr_ratio', 'volume_ratio',
    'rsi_14', 'macd', 'macd_signal', 'macd_hist',
    'eur_strength', 'cross_border', 'ecb_policy_phase'
]

# Distressed companies for special handling
DISTRESSED_TICKERS = [
    "VOW3.DE",  # Volkswagen
    "TKA.DE",   # Thyssenkrupp
    "UBI.PA",   # Ubisoft
    "SINCH.ST", # Sinch
    "SDF.DE",   # K+S
    "DBK.DE",   # Deutsche Bank
    "VNA.DE"    # Vonovia
]

# Synthetic distress cases (historical delistings)
SYNTHETIC_DISTRESS_CASES = [
    {
        "ticker": "WDI.DE",  # Wirecard (delisted 2020)
        "name": "Wirecard",
        "crash_date": "2020-06-25",
        "data": None  # Generated synthetically
    },
    {
        "ticker": "SNH.NA",  # Steinhoff (delisted, approximate)
        "name": "Steinhoff",
        "crash_date": "2017-12-07",
        "data": None
    },
    {
        "ticker": "NMC.L",   # NMC Health (delisted 2020)
        "name": "NMC Health",
        "crash_date": "2020-04-06",
        "data": None
    }
]

# European feature constants
EURUSD_CORRELATION_WINDOW = 20  # 20-day rolling correlation approximation


def load_csv(ticker: str, input_dir: str, years: int = YEARS_OF_DATA) -> Optional[pd.DataFrame]:
    """
    Load CSV file for a ticker, filtered to last N years.
    
    Args:
        ticker: Stock ticker symbol (e.g., "ASML.AS")
        input_dir: Directory containing CSV files
        years: Number of years of data to keep (default: 7)
        
    Returns:
        DataFrame with price data or None if file not found
    """
    # Convert ticker to filename format (ASML.AS -> ASML_AS.csv)
    filename = ticker.replace('.', '_') + '.csv'
    filepath = os.path.join(input_dir, filename)
    
    if not os.path.exists(filepath):
        logger.warning(f"CSV file not found for {ticker}: {filepath}")
        return None
    
    df = pd.read_csv(filepath, parse_dates=['date'])
    df = df.sort_values('date').reset_index(drop=True)
    
    # Use adjusted close for all calculations
    df = df.rename(columns={'adjusted_close': 'adj_close'})
    
    # Filter to last N years
    cutoff_date = pd.Timestamp.now() - pd.DateOffset(years=years)
    mask = df['date'] >= cutoff_date
    df = df.loc[mask].reset_index(drop=True)
    
    logger.debug(f"Loaded {len(df)} rows for {ticker} (last {years} years)")
    return df


def calculate_rolling_returns(df: pd.DataFrame) -> pd.DataFrame:
    """
    Calculate rolling returns at different horizons using LOG returns.
    
    Log returns are superior to raw returns:
    - Additive over time: log_R_1d + log_R_1d = log_R_2d
    - Better statistical properties (closer to normal distribution)
    - Unbounded downside (vs -100% cap for raw returns)
    
    Args:
        df: DataFrame with 'adj_close' column
        
    Returns:
        DataFrame with added return columns (all as log returns)
    """
    df = df.copy()
    
    # Log returns using pandas shift (native pandas-numpy interoperability)
    df['return_1d'] = np.log(df['adj_close'] / df['adj_close'].shift(1))
    
    # 1-month log returns (21 trading days)
    df['return_1m'] = np.log(df['adj_close'] / df['adj_close'].shift(21))
    
    # 6-month log returns (126 trading days)
    df['return_6m'] = np.log(df['adj_close'] / df['adj_close'].shift(126))
    
    # 9-month log returns (189 trading days)
    df['return_9m'] = np.log(df['adj_close'] / df['adj_close'].shift(189))
    
    return df


def calculate_zscore(
    df: pd.DataFrame,
    features: list[str],
    is_train: bool = True,
    params: Optional[dict] = None
) -> tuple[pd.DataFrame, dict]:
    """
    Z-score normalize features.
    
    Args:
        df: DataFrame with feature columns
        features: List of feature column names to normalize
        is_train: If True, calculate and return params; if False, use provided params
        params: Existing z-score parameters {feature: {mean, std}}
        
    Returns:
        Tuple of (normalized DataFrame, z-score parameters)
    """
    df = df.copy()
    zscore_params = params if params else {}
    
    for feature in features:
        if feature not in df.columns:
            continue
            
        mean: float = 0.0
        std: float = 1.0
        if is_train:
            # Calculate statistics from training data
            mean = float(df[feature].mean())  # type: ignore[arg-type]
            std = float(df[feature].std())  # type: ignore[arg-type]
            zscore_params[feature] = {'mean': mean, 'std': std}
        else:
            # Use provided parameters
            if feature not in zscore_params:
                logger.warning(f"No z-score params for {feature}, using raw values")
                continue
            mean = zscore_params[feature]['mean']
            std = zscore_params[feature]['std']
        
        # Apply z-score normalization (handle zero std)
        if std > 0:
            df[f'z_{feature}'] = (df[feature] - mean) / std
        else:
            df[f'z_{feature}'] = 0
    
    return df, zscore_params


def calculate_european_features(df: pd.DataFrame) -> pd.DataFrame:
    """
    Calculate European market-specific features.
    
    Features:
    - eur_strength: Approximation of EUR/USD correlation (20-day rolling)
    - cross_border: Simplified multinational flag (for European companies)
    - has_adr: Secondary ADR listing flag
    - ecb_policy_phase: Rate regime indicator (simplified)
    
    Args:
        df: DataFrame with price data
        
    Returns:
        DataFrame with European feature columns
    """
    df = df.copy()
    
    # EUR strength approximation: rolling correlation with EUR ETF proxy
    # Since we don't have EUR/USD data, we approximate using price momentum patterns
    # that correlate with EUR strength for European exporters/importers
    
    # Create synthetic EUR strength signal (20-day rolling std of returns)
    df['eur_strength'] = df['return_1d'].rolling(window=EURUSD_CORRELATION_WINDOW).std()
    
    # Cross-border flag: Simplified - European multinationals typically have
    # >50% revenue outside home country. We'll use volatility patterns as proxy.
    # High correlation with market return indicates multinational exposure.
    df['cross_border'] = (df['return_1d'].rolling(60).std() > 0.02).astype(float)
    
    # ADR listing flag: Known European companies with ADRs
    # This is a simplification - in production, this would come from a database
    ADR_TICKERS = {
        'ASML.AS': 1, 'SAP.DE': 1, 'NOVO-B.CO': 1, 'NESN.SW': 1,
        'ROG.SW': 1, 'SIE.DE': 1, 'TTE.PA': 1, 'AZN.L': 1,
        'HSBA.L': 1, 'ULVR.L': 1, 'SHEL.L': 1, 'IBE.MC': 1,
        'DBK.DE': 1, 'DTE.DE': 1, 'ALV.DE': 1, 'BNP.PA': 1
    }
    
    # ECB policy phase: Simplified rate regime indicator
    # Based on date ranges (approximation of ECB policy periods)
    # 2015-2019: Low rates, QE
    # 2020-2022: COVID emergency, then rate rises
    # 2022-2024: High rates to combat inflation
    def get_ecb_phase(date):
        year = date.year
        if year < 2020:
            return 0  # Low rate environment
        elif year < 2022:
            return 1  # COVID emergency
        else:
            return 2  # High rate environment
    
    df['ecb_policy_phase'] = df['date'].apply(get_ecb_phase)
    
    return df


def create_features(df: pd.DataFrame) -> pd.DataFrame:
    """
    Create all features from raw price data.
    
    Features (18 total):
    - Returns (4): log returns at 1d, 1m, 6m, 9m horizons
    - Volatility (3): 20d, 60d volatility, ATR ratio
    - Volume (2): 20d MA ratio, volume ratio
    - Momentum (4): 20d/60d momentum, RSI-14, MACD
    - European (3): EUR strength, cross-border, ECB phase
    
    Args:
        df: DataFrame with raw price data
        
    Returns:
        DataFrame with all engineered features
    """
    # Calculate returns (using LOG returns)
    df = calculate_rolling_returns(df)
    
    # Volatility features
    df['volatility_20d'] = df['return_1d'].rolling(window=20).std()
    df['volatility_60d'] = df['return_1d'].rolling(window=60).std()
    
    # Average True Range (ATR) - volatility measure
    df['tr'] = np.maximum(
        df['high'] - df['low'],
        np.maximum(
            np.abs(df['high'] - df['close'].shift(1)),
            np.abs(df['low'] - df['close'].shift(1))
        )
    )
    df['atr_14'] = df['tr'].rolling(14).mean()
    df['atr_ratio'] = df['atr_14'] / (df['close'] + 1e-10)
    
    # Volume features
    df['volume_ma20'] = df['volume'].rolling(window=20).mean()
    df['volume_ratio'] = df['volume'] / (df['volume_ma20'] + 1e-10)
    
    # Price momentum (raw, not log for display purposes)
    df['momentum_20d'] = df['adj_close'] / df['adj_close'].shift(20) - 1
    df['momentum_60d'] = df['adj_close'] / df['adj_close'].shift(60) - 1
    
    # High-low range (volatility proxy)
    df['hl_range'] = (df['high'] - df['low']) / df['close']
    df['hl_range_ma20'] = df['hl_range'].rolling(20).mean()
    
    # RSI (Relative Strength Index) - momentum oscillator
    delta = df['adj_close'].diff()
    gain = (delta.where(delta > 0, 0)).rolling(window=14).mean()
    loss = (-delta.where(delta < 0, 0)).rolling(window=14).mean()
    rs = gain / (loss + 1e-10)
    df['rsi_14'] = 100 - (100 / (1 + rs))
    
    # MACD (Moving Average Convergence Divergence)
    ema12 = df['adj_close'].ewm(span=12, adjust=False).mean()
    ema26 = df['adj_close'].ewm(span=26, adjust=False).mean()
    df['macd'] = ema12 - ema26
    df['macd_signal'] = df['macd'].ewm(span=9, adjust=False).mean()
    df['macd_hist'] = df['macd'] - df['macd_signal']
    
    # Calculate European features
    df = calculate_european_features(df)
    
    return df


def validate_feature_columns(df: pd.DataFrame, ticker: str, features: list[str]) -> None:
    """Fail fast if required feature columns are missing or degenerate."""
    missing = [feature for feature in features if feature not in df.columns]
    if missing:
        raise ValueError(
            f"Missing engineered features for {ticker}: {missing}. "
            "Check feature creation and z-score ordering."
        )

    z_return_features = ['z_return_1d', 'z_return_1m', 'z_return_6m', 'z_return_9m']
    for feature in z_return_features:
        series = df[feature].dropna()
        if len(series) == 0:
            raise ValueError(f"Feature {feature} for {ticker} is all-NaN")
        if float(np.asarray(series).std()) == 0.0:
            raise ValueError(
                f"Feature {feature} for {ticker} is constant. "
                "This usually indicates z-score calculation was applied in the wrong order."
            )


def create_panel_tensor(
    df_list: list[pd.DataFrame],
    tickers: list[str],
    timesteps: int = 60,
    features: Optional[list[str]] = None
) -> tuple[np.ndarray, np.ndarray, list]:
    """
    Create 3D panel tensor from list of DataFrames.
    
    Args:
        df_list: List of DataFrames with features
        tickers: List of ticker symbols (same order as df_list)
        timesteps: Number of timesteps per sample (lookback window)
        features: List of feature column names to use (default: 18 features)
        
    Returns:
        Tuple of (X, y, sample_info)
        - X: 3D tensor [samples, timesteps, features]
        - y: Labels [samples] (1 if price up in 3 days, 0 otherwise)
        - sample_info: List of {ticker, date, is_distressed}
    """
    if features is None:
        # Default feature list (18 features total)
        # Returns (4): log returns at different horizons
        # Z-scored returns (4): normalized log returns
        # Volatility (3): 20d/60d volatility, ATR ratio
        # Momentum (4): RSI, MACD + signal + histogram
        # European (3): EUR strength, cross-border, ECB phase
        features = [
            'return_1d', 'return_1m', 'return_6m', 'return_9m',           # Log returns (4)
            'z_return_1d', 'z_return_1m', 'z_return_6m', 'z_return_9m',   # Z-scored log returns (4)
            'volatility_20d', 'atr_ratio', 'volume_ratio',                   # Volatility/Volume (3)
            'rsi_14', 'macd', 'macd_signal',                                  # Momentum (3)
            'eur_strength', 'cross_border', 'ecb_policy_phase'             # European (3)
            # Total: 4 + 4 + 3 + 3 + 3 = 17 features
            # Plus macd_hist would make 18
        ]
    
    X_list = []
    y_list = []
    sample_info = []
    
    for df, ticker in zip(df_list, tickers):
        if df is None or len(df) < timesteps + 10:  # Need extra rows for labels
            continue
        
        is_distressed = ticker in DISTRESSED_TICKERS
        
        # Get feature data
        feature_data = []
        for feat in features:
            if feat in df.columns:
                feature_data.append(df[feat].values)
            else:
                # Use zeros if feature not available
                feature_data.append(np.zeros(len(df)))
        
        feature_matrix = np.column_stack(feature_data)
        
        # Forward fill NaN values, then fill remaining with zeros
        for i in range(feature_matrix.shape[1]):
            col = feature_matrix[:, i]
            mask = np.isnan(col)
            if mask.any():
                # Forward fill
                for j in range(1, len(col)):
                    if mask[j] and j > 0:
                        col[j] = col[j - 1]
                # Fill remaining NaN with zeros
                col[mask] = 0
                feature_matrix[:, i] = col
        
        # Create samples with sliding window
        # 10-day prediction target (more predictable than 3-day)
        PREDICTION_HORIZON = 10
        for i in range(timesteps, len(df) - PREDICTION_HORIZON):  # Leave 10 days for label
            # Skip if any NaN in window
            window = feature_matrix[i - timesteps:i]
            if np.any(np.isnan(window)):
                continue
            
            # Create label: 1 if price UP in 10 days, 0 otherwise
            current_price = df['adj_close'].values[i]
            future_price = df['adj_close'].values[i + PREDICTION_HORIZON]
            label = 1 if future_price > current_price else 0
            
            X_list.append(window)
            y_list.append(label)
            sample_info.append({
                'ticker': ticker,
                'date': df['date'].values[i],
                'is_distressed': is_distressed
            })
    
    X = np.array(X_list)
    y = np.array(y_list)
    
    return X, y, sample_info


def handle_distress_cases(
    X: np.ndarray,
    y: np.ndarray,
    sample_info: list
) -> tuple[np.ndarray, np.ndarray, list, list]:
    """
    Balance dataset to ensure 15% distressed samples.
    
    Args:
        X: Feature tensor
        y: Labels
        sample_info: Sample metadata
        
    Returns:
        Tuple of (X_balanced, y_balanced, healthy_samples, distressed_samples)
    """
    # Separate healthy and distressed samples
    healthy_idx = [i for i, info in enumerate(sample_info) if not info['is_distressed']]
    distressed_idx = [i for i, info in enumerate(sample_info) if info['is_distressed']]
    
    healthy_samples = [X[i] for i in healthy_idx]
    distressed_samples = [X[i] for i in distressed_idx]
    
    healthy_labels = [y[i] for i in healthy_idx]
    distressed_labels = [y[i] for i in distressed_idx]
    
    # Calculate current distressed ratio
    total_samples = len(sample_info)
    distressed_count = len(distressed_idx)
    current_ratio = distressed_count / total_samples if total_samples > 0 else 0
    
    logger.info(f"Current distressed ratio: {current_ratio:.2%} ({distressed_count}/{total_samples})")
    
    # Add synthetic distress cases if needed
    # For now, we log the distribution - actual synthetic data generation
    # would require external data sources
    if current_ratio < 0.10:  # Less than 10%
        logger.warning(
            f"Distressed ratio ({current_ratio:.2%}) is below target (15%). "
            f"Consider adding synthetic distress cases."
        )
    
    return (
        np.array(healthy_samples + distressed_samples),
        np.array(healthy_labels + distressed_labels),
        healthy_samples,
        distressed_samples
    )


def compute_features_hash(df_list: list[pd.DataFrame], tickers: list[str]) -> str:
    """
    Compute SHA256 hash of feature data for versioning.
    
    Args:
        df_list: List of DataFrames with features
        tickers: List of tickers
        
    Returns:
        SHA256 hash string
    """
    hasher = hashlib.sha256()
    
    for df, ticker in zip(df_list, tickers):
        if df is None:
            continue
        hasher.update(ticker.encode())
        # Hash the last 100 rows of returns (representative sample)
        for col in ['return_1d', 'return_1m', 'return_6m']:
            if col in df.columns:
                # Convert to numpy array explicitly for tobytes()
                values = np.asarray(df[col].dropna().tail(100))
                hasher.update(values.tobytes())
    
    return hasher.hexdigest()


def engineer_pipeline(input_dir: str, output_dir: str) -> dict:
    """
    Main feature engineering pipeline.
    
    Args:
        input_dir: Directory with raw CSV files
        output_dir: Directory for processed outputs
        
    Returns:
        Metadata dictionary with z-score params and hash
    """
    # Create output directory
    Path(output_dir).mkdir(parents=True, exist_ok=True)
    
    # Load all CSVs
    logger.info(f"Loading CSV files from {input_dir}")
    df_list = []
    loaded_tickers = []
    
    for ticker in TICKERS:
        df = load_csv(ticker, input_dir)
        if df is not None:
            df_list.append(df)
            loaded_tickers.append(ticker)
    
    logger.info(f"Loaded {len(df_list)} out of {len(TICKERS)} tickers")
    
    if len(df_list) == 0:
        raise ValueError("No data loaded. Please run data_fetcher.py first.")
    
    # Create features for each ticker
    logger.info("Engineering features...")
    feature_df_list = []
    all_zscore_params = {}
    return_features = ['return_1d', 'return_1m', 'return_6m', 'return_9m']
    
    for df, ticker in zip(df_list, loaded_tickers):
        df_feat = create_features(df)
        
        # Calculate z-scores (using first ticker's data as training set)
        if len(all_zscore_params) == 0:
            df_feat, zscore_params = calculate_zscore(df_feat, return_features, is_train=True)
            all_zscore_params = zscore_params
            logger.info(f"Z-score params calculated: {list(zscore_params.keys())}")
        else:
            df_feat, _ = calculate_zscore(df_feat, return_features, is_train=False, params=all_zscore_params)

        validate_feature_columns(df_feat, ticker, PANEL_FEATURES)
        feature_df_list.append(df_feat)
    
    # Compute features hash for versioning
    features_hash = compute_features_hash(feature_df_list, loaded_tickers)
    logger.info(f"Features hash: {features_hash}")
    
    logger.info(f"Using {len(PANEL_FEATURES)} features: {PANEL_FEATURES}")
    
    logger.info("Creating panel tensor...")
    X, y, sample_info = create_panel_tensor(
        feature_df_list,
        loaded_tickers,
        timesteps=60,
        features=PANEL_FEATURES
    )
    
    logger.info(f"Panel tensor shape: {X.shape}")
    logger.info(f"Labels shape: {y.shape}")
    
    # Balance dataset
    logger.info("Handling distress cases...")
    X_balanced, y_balanced, healthy_samples, distressed_samples = handle_distress_cases(
        X, y, sample_info
    )
    
    logger.info(f"Balanced tensor shape: {X_balanced.shape}")
    
    # Save panel tensor
    panel_path = os.path.join(output_dir, 'training_panel.h5')
    try:
        import h5py
        with h5py.File(panel_path, 'w') as f:
            f.create_dataset('X', data=X_balanced)
            f.create_dataset('y', data=y_balanced)
        logger.info(f"Saved panel tensor to {panel_path}")
    except ImportError:
        logger.warning("h5py not installed. Saving as numpy arrays instead.")
        np.save(os.path.join(output_dir, 'X_train.npy'), X_balanced)
        np.save(os.path.join(output_dir, 'y_train.npy'), y_balanced)
        panel_path = os.path.join(output_dir, 'X_train.npy')
    
    # Save z-score parameters
    zscore_path = os.path.join(output_dir, 'zscore_params.json')
    with open(zscore_path, 'w') as f:
        json.dump(all_zscore_params, f, indent=2)
    logger.info(f"Saved z-score params to {zscore_path}")
    
    # Save features hash with updated feature list
    hash_path = os.path.join(output_dir, 'features_hash.json')
    with open(hash_path, 'w') as f:
        json.dump({
            'features_hash': features_hash,
            'features': PANEL_FEATURES,
            'n_features': len(PANEL_FEATURES),
            'tickers': loaded_tickers,
            'timesteps': 60
        }, f, indent=2)
    logger.info(f"Saved features hash to {hash_path}")
    
    # Return metadata
    return {
        'panel_path': panel_path,
        'zscore_path': zscore_path,
        'features_hash': features_hash,
        'n_samples': len(X_balanced),
        'n_features': X_balanced.shape[2],
        'n_timesteps': X_balanced.shape[1],
        'n_tickers': len(loaded_tickers),
        'healthy_samples': len(healthy_samples),
        'distressed_samples': len(distressed_samples)
    }


def main():
    """Main entry point for feature engineer."""
    import argparse
    
    parser = argparse.ArgumentParser(
        description='Engineer features from raw price data',
        formatter_class=argparse.RawDescriptionHelpFormatter
    )
    
    parser.add_argument(
        '-i', '--input',
        type=str,
        default=INPUT_DIR,
        help=f'Input directory with raw CSV files (default: {INPUT_DIR})'
    )
    
    parser.add_argument(
        '-o', '--output',
        type=str,
        default=OUTPUT_DIR,
        help=f'Output directory for processed data (default: {OUTPUT_DIR})'
    )
    
    args = parser.parse_args()
    
    logger.info("Starting feature engineering pipeline...")
    logger.info(f"Input: {args.input}")
    logger.info(f"Output: {args.output}")
    
    metadata = engineer_pipeline(args.input, args.output)
    
    print("\n" + "=" * 60)
    print("FEATURE ENGINEERING COMPLETE")
    print("=" * 60)
    print(f"Panel shape:  [{metadata['n_samples']}, {metadata['n_timesteps']}, {metadata['n_features']}]")
    print(f"Tickers:      {metadata['n_tickers']}")
    print(f"Healthy:      {metadata['healthy_samples']} samples")
    print(f"Distressed:  {metadata['distressed_samples']} samples")
    print(f"Hash:         {metadata['features_hash'][:16]}...")
    print("=" * 60)


if __name__ == '__main__':
    main()

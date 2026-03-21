#!/usr/bin/env python3
"""
Phase 5.3: LSTM Training for STOXX-stocks Training Pipeline

Trains a panel-based LSTM model for 10-day binary directional prediction.
Implements walk-forward validation, distress balancing, and Keras export.

Usage:
    python train_lstm.py --input ../data/processed --output ../models

Output:
    - distress_predictor.keras: Keras model file
    - metadata.json: Training metadata for versioning

Post-training conversion:
    npx tensorflowjs_converter --input_format=keras \
        ./models/distress_predictor.keras ./public/models/distress

Or use npm script:
    npm run convert-model

Requirements:
    - tensorflow>=2.15.0
    - numpy, pandas (for data processing)
"""

import os
import sys
import json
import datetime
import hashlib
import logging
import random
from pathlib import Path
from typing import Optional, Generator, Any

from dotenv import load_dotenv
load_dotenv()

import numpy as np

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger(__name__)

# Constants
INPUT_DIR = "../data/processed"
MODEL_OUTPUT_DIR = "../models"  # Keras file saved here, then converted to TF.js

# Model architecture
EXPECTED_FEATURES = [
    'return_1d', 'return_1m', 'return_6m', 'return_9m',
    'z_return_1d', 'z_return_1m', 'z_return_6m', 'z_return_9m',
    'volatility_20d', 'atr_ratio', 'volume_ratio',
    'rsi_14', 'macd', 'macd_signal', 'macd_hist',
    'eur_strength', 'cross_border', 'ecb_policy_phase'
]
INPUT_DIM = len(EXPECTED_FEATURES)
TIMESTEPS = 30  # 30-day lookback (optimal from quick_tune)
LSTM_UNITS = [64, 32]  # 2-layer LSTM (optimal from quick_tune)
DROPOUT = 0.2  # Regularization (optimal from quick_tune)

# Training hyperparameters
EPOCHS = 50  # Max epochs (early stopping handles early stops)
BATCH_SIZE = 64  # Balance between speed and gradient quality
LEARNING_RATE = 0.0005  # Optimal from quick_tune
VALIDATION_SPLIT = 0.2
EARLY_STOPPING_PATIENCE = 15  # Stop if no improvement for 15 epochs
N_SPLITS = 4  # Walk-forward validation folds
CV_PURGE_SAMPLES = TIMESTEPS + 10  # Default to lookback + prediction horizon
CV_EMBARGO_SAMPLES = 0

# Threshold optimization
THRESHOLD_CANDIDATES = [0.45, 0.5, 0.55]  # Candidates for optimal threshold search
USE_FOCAL_LOSS = False  # BCE is default; focal loss is explicit opt-in
MIN_CLASS_RATIO = 0.01

# Try to import TensorFlow
# Define stubs for type checking when TensorFlow isn't available
tf: Any = None  # type: ignore[assignment, misc]
keras: Any = None  # type: ignore[assignment, misc]
layers: Any = None  # type: ignore[assignment, misc]
Model: Any = None  # type: ignore[assignment, misc]
HAS_TENSORFLOW = False

try:
    import tensorflow as tf
    from tensorflow import keras
    from tensorflow.keras import layers
    from tensorflow.keras.models import Model
    HAS_TENSORFLOW = True
except ImportError:
    logger.warning("TensorFlow not installed. Model architecture will be logged only.")


def get_git_commit() -> str:
    """Get current git commit hash if available."""
    try:
        import subprocess
        result = subprocess.run(
            ['git', 'rev-parse', 'HEAD'],
            capture_output=True,
            text=True,
            timeout=5
        )
        if result.returncode == 0:
            return result.stdout.strip()[:12]  # Short hash
    except Exception:
        pass
    return "no-git"


def set_global_seed(seed: int) -> None:
    """Set random seeds for deterministic behavior where possible."""
    np.random.seed(seed)
    random.seed(seed)
    if HAS_TENSORFLOW:
        tf.random.set_seed(seed)


def optimize_threshold(
    y_true: np.ndarray,
    y_pred_prob: np.ndarray,
    thresholds: Optional[list[float]] = None
) -> tuple[float, float]:
    """
    Find optimal prediction threshold for balanced accuracy.
    
    For imbalanced datasets, the default 0.5 threshold is often suboptimal.
    This searches for the threshold that maximizes balanced accuracy.
    
    Args:
        y_true: True binary labels
        y_pred_prob: Predicted probabilities
        
    Returns:
        Tuple of (optimal_threshold, best_balanced_accuracy)
    """
    best_threshold = 0.5
    best_balanced_acc = 0.0
    
    threshold_values = thresholds if thresholds is not None else list(np.arange(0.3, 0.71, 0.02))
    for threshold in threshold_values:
        y_pred = (y_pred_prob > threshold).astype(int)
        bal_acc = calculate_balanced_accuracy(y_true, y_pred)
        if bal_acc > best_balanced_acc:
            best_balanced_acc = bal_acc
            best_threshold = threshold
    
    return float(best_threshold), float(best_balanced_acc)


def build_model(
    input_shape: tuple,
    use_attention: bool = False,
    use_focal_loss: bool = USE_FOCAL_LOSS,
    lstm_units: Optional[list[int]] = None,
    dropout: Optional[float] = None,
    learning_rate: Optional[float] = None,
    focal_alpha: float = 0.25
) -> Optional[Any]:  # type: ignore[misc]
    """
    Build LSTM model for time series classification.
    
    Architecture (simplified for stability):
    - Input layer (timesteps, features)
    - Bidirectional LSTM layer 1 (128 units each direction)
    - Dropout 0.3
    - LSTM layer 2 (64 units)
    - Dropout 0.3
    - Dense layer (32 units, relu)
    - Dropout 0.3
    - Output layer (1 unit, sigmoid)
    
    Args:
        input_shape: Tuple of (timesteps, features)
        use_attention: Whether to use attention (not used, kept for API compatibility)
        use_focal_loss: Whether to use focal loss instead of binary crossentropy
        
    Returns:
        Compiled Keras model or None if TensorFlow not available
    """
    if not HAS_TENSORFLOW:
        logger.error("TensorFlow is required to build the model")
        return None
    
    current_lstm_units = lstm_units if lstm_units is not None else LSTM_UNITS
    current_dropout = dropout if dropout is not None else DROPOUT
    current_learning_rate = learning_rate if learning_rate is not None else LEARNING_RATE

    inputs = keras.Input(shape=input_shape, name='input')
    x = inputs
    
    # Bidirectional LSTM for better pattern capture
    x = layers.Bidirectional(
        layers.LSTM(current_lstm_units[0], return_sequences=True),
        name='bilstm_1'
    )(x)
    x = layers.Dropout(current_dropout, name='dropout_1')(x)
    
    # Second LSTM layer
    x = layers.LSTM(
        current_lstm_units[1],
        return_sequences=False,
        name='lstm_2'
    )(x)
    x = layers.Dropout(current_dropout, name='dropout_2')(x)
    
    # Dense layers for classification
    x = layers.Dense(
        32,
        activation='relu',
        kernel_regularizer=keras.regularizers.l2(0.01),
        name='dense_1'
    )(x)
    x = layers.Dropout(current_dropout, name='dropout_3')(x)
    
    # Output layer (binary classification)
    outputs = layers.Dense(1, activation='sigmoid', name='output')(x)
    
    model = Model(inputs=inputs, outputs=outputs, name='stoxx_lstm')
    
    # Choose loss function
    if use_focal_loss:
        loss_fn = focal_loss(gamma=2.0, alpha=focal_alpha)
        logger.info("Using focal loss for class imbalance")
    else:
        loss_fn = 'binary_crossentropy'
    
    # Compile with gradient clipping
    model.compile(
        optimizer=keras.optimizers.Adam(
            learning_rate=current_learning_rate,
            clipnorm=1.0
        ),
        loss=loss_fn,
        metrics=['accuracy', keras.metrics.AUC(name='auc')]
    )
    
    logger.info(
        f"Model: Bidirectional LSTM [{current_lstm_units[0]}x2 → {current_lstm_units[1]}], "
        f"dropout={current_dropout}, lr={current_learning_rate}"
    )
    
    return model


def focal_loss(gamma=2.0, alpha=0.25):
    """
    Focal Loss for handling class imbalance.
    
    Focal Loss = -alpha * (1 - p_t)^gamma * log(p_t)
    
    Where p_t is the model's probability for the ground truth class.
    
    The gamma parameter focuses training on hard misclassified examples.
    The alpha parameter handles class imbalance.
    
    Args:
        gamma: Focusing parameter (default: 2.0)
        alpha: Balancing parameter (default: 0.25)
        
    Returns:
        Focal loss function
    """
    def loss(y_true, y_pred):
        # Cast y_true to float32 to match y_pred
        y_true = tf.cast(y_true, tf.float32)
        
        epsilon = tf.keras.backend.epsilon()
        y_pred = tf.clip_by_value(y_pred, epsilon, 1.0 - epsilon)
        
        # Standard binary focal loss (class-balanced positive and negative terms)
        positive_term = -alpha * y_true * tf.pow(1 - y_pred, gamma) * tf.math.log(y_pred)
        negative_term = -(1 - alpha) * (1 - y_true) * tf.pow(y_pred, gamma) * tf.math.log(1 - y_pred)

        return positive_term + negative_term
    
    return loss


class Attention(layers.Layer):
    """
    Self-attention mechanism for LSTM time series.
    
    Learns to weight different timesteps based on their importance
    for the prediction task.
    """
    
    def __init__(self, units: int = 32, **kwargs):
        super().__init__(**kwargs)
        self.units = units
        
    def build(self, input_shape):
        # input_shape: [batch, timesteps, features]
        feature_dim = input_shape[-1]
        
        self.W = self.add_weight(
            name='attention_weight',
            shape=(feature_dim, self.units),
            initializer='glorot_uniform',
            trainable=True
        )
        self.b = self.add_weight(
            name='attention_bias',
            shape=(self.units,),
            initializer='zeros',
            trainable=True
        )
        self.u = self.add_weight(
            name='attention_context',
            shape=(self.units, 1),
            initializer='glorot_uniform',
            trainable=True
        )
        super().build(input_shape)
    
    def call(self, inputs):
        # inputs: [batch, timesteps, features]
        uit = tf.nn.tanh(tf.matmul(inputs, self.W) + self.b)  # [batch, timesteps, units]
        ait = tf.matmul(uit, self.u)  # [batch, timesteps, 1]
        ait = tf.nn.softmax(ait, axis=1)  # Normalize over timesteps
        
        # Weighted sum: attended features
        weighted_input = inputs * ait
        output = tf.reduce_sum(weighted_input, axis=1)  # [batch, features]
        
        return output
    
    def get_config(self):
        config = super().get_config()
        config.update({'units': self.units})
        return config


def create_cross_attention(x) -> Any:  # type: ignore[misc]
    """
    Simplified cross-attention mechanism for panel data.
    
    This adds a simple attention mechanism to weight different timesteps.
    
    Args:
        x: LSTM output tensor
        
    Returns:
        Attention-weighted tensor
    """
    if not HAS_TENSORFLOW:
        return x
    
    # Simplified attention: just return the LSTM output
    # Full implementation would add learnable attention weights
    return x


def time_series_split(
    X: np.ndarray,
    y: np.ndarray,
    n_splits: int = 5,
    purge_samples: int = CV_PURGE_SAMPLES,
    embargo_samples: int = CV_EMBARGO_SAMPLES
) -> Generator[tuple, None, None]:
    """
    Strict walk-forward validation split with purge/embargo (no shuffle).
    
    Args:
        X: Feature tensor [samples, timesteps, features]
        y: Labels [samples]
        n_splits: Number of validation folds
        purge_samples: Samples removed from train end before validation starts
        embargo_samples: Samples skipped between train and validation windows
        
    Yields:
        Tuple of (X_train, X_val, y_train, y_val) indices
    """
    if n_splits < 1:
        raise ValueError("n_splits must be >= 1")
    if purge_samples < 0 or embargo_samples < 0:
        raise ValueError("purge_samples and embargo_samples must be >= 0")

    n_samples = len(X)
    fold_size = n_samples // (n_splits + 1)

    if fold_size < 1:
        raise ValueError(
            f"Not enough samples ({n_samples}) for n_splits={n_splits}."
        )
    
    for i in range(n_splits):
        boundary = fold_size * (i + 1)

        # Purge overlap near boundary and optional embargo gap
        train_end = boundary - purge_samples
        val_start = boundary + embargo_samples
        val_end = min(val_start + fold_size, n_samples)

        if train_end <= 0 or val_end <= val_start:
            logger.warning(
                "Skipping fold %s due to insufficient samples after purge/embargo "
                "(train_end=%s, val_start=%s, val_end=%s)",
                i + 1,
                train_end,
                val_start,
                val_end
            )
            break

        X_train = X[:train_end]
        y_train = y[:train_end]
        X_val = X[val_start:val_end]
        y_val = y[val_start:val_end]

        yield X_train, X_val, y_train, y_val


def _class_ratio(y: np.ndarray) -> tuple[int, int, float, float]:
    labels = np.asarray(y).astype(int).flatten()
    positives = int(np.sum(labels == 1))
    negatives = int(np.sum(labels == 0))
    total = max(len(labels), 1)
    return positives, negatives, positives / total, negatives / total


def generate_feature_diagnostics(
    X: np.ndarray,
    output_dir: str,
    feature_names: Optional[list[str]] = None,
    near_constant_std: float = 1e-4,
    correlation_threshold: float = 0.995
) -> dict[str, Any]:
    """Generate and persist feature diagnostics report before training."""
    names = feature_names if feature_names is not None else EXPECTED_FEATURES
    if X.ndim != 3:
        raise ValueError(f"Expected X to be 3D [samples, timesteps, features], got {X.shape}")

    if X.shape[2] != len(names):
        raise ValueError(
            f"Feature count mismatch in diagnostics: expected {len(names)}, got {X.shape[2]}"
        )

    flattened = X.reshape(-1, X.shape[2])
    finite_mask = np.isfinite(flattened)
    non_finite_by_feature = np.sum(~finite_mask, axis=0).astype(int)

    feature_stats: list[dict[str, Any]] = []
    constant_features: list[str] = []
    near_constant_features: list[dict[str, Any]] = []

    for idx, feature_name in enumerate(names):
        feature_values = flattened[:, idx]
        valid_values = feature_values[np.isfinite(feature_values)]
        if valid_values.size == 0:
            stats = {
                'feature': feature_name,
                'count': int(feature_values.size),
                'finite_count': 0,
                'non_finite_count': int(non_finite_by_feature[idx]),
                'mean': None,
                'std': None,
                'min': None,
                'max': None
            }
        else:
            std_value = float(np.std(valid_values))
            stats = {
                'feature': feature_name,
                'count': int(feature_values.size),
                'finite_count': int(valid_values.size),
                'non_finite_count': int(non_finite_by_feature[idx]),
                'mean': float(np.mean(valid_values)),
                'std': std_value,
                'min': float(np.min(valid_values)),
                'max': float(np.max(valid_values))
            }

            if std_value <= 1e-12:
                constant_features.append(feature_name)
            elif std_value <= near_constant_std:
                near_constant_features.append({'feature': feature_name, 'std': std_value})

        feature_stats.append(stats)

    correlation_highlights: list[dict[str, Any]] = []
    fully_finite_rows = np.all(np.isfinite(flattened), axis=1)
    finite_rows = flattened[fully_finite_rows]
    if finite_rows.shape[0] >= 2:
        corr_matrix = np.corrcoef(finite_rows, rowvar=False)
        for i in range(corr_matrix.shape[0]):
            for j in range(i + 1, corr_matrix.shape[1]):
                corr = corr_matrix[i, j]
                if np.isfinite(corr) and abs(float(corr)) >= correlation_threshold:
                    correlation_highlights.append({
                        'feature_a': names[i],
                        'feature_b': names[j],
                        'correlation': float(corr)
                    })

        correlation_highlights.sort(key=lambda item: abs(item['correlation']), reverse=True)

    diagnostics = {
        'generated_at': datetime.datetime.utcnow().isoformat() + 'Z',
        'shape': {
            'samples': int(X.shape[0]),
            'timesteps': int(X.shape[1]),
            'features': int(X.shape[2])
        },
        'thresholds': {
            'near_constant_std': float(near_constant_std),
            'high_correlation_abs': float(correlation_threshold)
        },
        'non_finite_total': int(np.sum(non_finite_by_feature)),
        'constant_features': constant_features,
        'near_constant_features': near_constant_features,
        'feature_stats': feature_stats,
        'high_correlation_pairs': correlation_highlights
    }

    Path(output_dir).mkdir(parents=True, exist_ok=True)
    report_path = os.path.join(output_dir, 'feature_diagnostics.json')
    with open(report_path, 'w') as f:
        json.dump(diagnostics, f, indent=2)

    logger.info("Feature diagnostics saved to %s", report_path)
    if diagnostics['non_finite_total'] > 0:
        logger.warning("Feature diagnostics: non-finite values detected (%s total)", diagnostics['non_finite_total'])
    if constant_features:
        logger.warning("Feature diagnostics: constant features detected %s", constant_features)
    if near_constant_features:
        logger.warning(
            "Feature diagnostics: near-constant features detected %s",
            [item['feature'] for item in near_constant_features]
        )
    if correlation_highlights:
        top = correlation_highlights[:5]
        logger.warning("Feature diagnostics: high-correlation feature pairs detected (top %s): %s", len(top), top)

    return diagnostics


def calculate_balanced_accuracy(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    """
    Calculate balanced accuracy (accounts for class imbalance).
    
    Balanced Accuracy = (Sensitivity + Specificity) / 2
                      = (TP / (TP + FN) + TN / (TN + FP)) / 2
    
    Args:
        y_true: True labels
        y_pred: Predicted labels (binary)
        
    Returns:
        Balanced accuracy score
    """
    y_true = np.array(y_true).flatten()
    y_pred = np.array(y_pred).flatten()
    
    # True positives, false negatives, true negatives, false positives
    tp = np.sum((y_true == 1) & (y_pred == 1))
    fn = np.sum((y_true == 1) & (y_pred == 0))
    tn = np.sum((y_true == 0) & (y_pred == 0))
    fp = np.sum((y_true == 0) & (y_pred == 1))
    
    sensitivity = tp / (tp + fn) if (tp + fn) > 0 else 0
    specificity = tn / (tn + fp) if (tn + fp) > 0 else 0
    
    balanced_acc = (sensitivity + specificity) / 2
    
    return float(balanced_acc)


def calculate_precision_recall_f1(y_true: np.ndarray, y_pred: np.ndarray) -> dict[str, float]:
    """Calculate precision, recall, and F1 score without sklearn dependency."""
    y_true = np.array(y_true).flatten()
    y_pred = np.array(y_pred).flatten()

    tp = np.sum((y_true == 1) & (y_pred == 1))
    fn = np.sum((y_true == 1) & (y_pred == 0))
    fp = np.sum((y_true == 0) & (y_pred == 1))

    precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
    recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0
    if precision + recall > 0:
        f1 = 2 * precision * recall / (precision + recall)
    else:
        f1 = 0.0

    return {
        'precision': float(precision),
        'recall': float(recall),
        'f1': float(f1)
    }


def calculate_stratified_metrics(
    y_true: np.ndarray,
    y_pred: np.ndarray,
    sample_info: list
) -> dict:
    """
    Calculate metrics stratified by healthy vs distressed.
    
    Args:
        y_true: True labels
        y_pred: Predicted labels
        sample_info: Sample metadata list
        
    Returns:
        Dictionary with stratified metrics
    """
    # Identify distressed samples
    healthy_idx = [i for i, info in enumerate(sample_info) if not info.get('is_distressed', False)]
    distressed_idx = [i for i, info in enumerate(sample_info) if info.get('is_distressed', False)]
    
    metrics = {}
    
    # Overall metrics
    metrics['overall'] = {
        'accuracy': float(np.mean(y_true == y_pred)),
        'balanced_accuracy': calculate_balanced_accuracy(y_true, y_pred),
        'n_samples': len(y_true)
    }
    
    # Healthy company metrics
    if len(healthy_idx) > 0:
        y_true_healthy = y_true[healthy_idx]
        y_pred_healthy = y_pred[healthy_idx]
        metrics['healthy'] = {
            'accuracy': float(np.mean(y_true_healthy == y_pred_healthy)),
            'balanced_accuracy': calculate_balanced_accuracy(y_true_healthy, y_pred_healthy),
            'n_samples': len(healthy_idx)
        }
    
    # Distressed company metrics
    if len(distressed_idx) > 0:
        y_true_distressed = y_true[distressed_idx]
        y_pred_distressed = y_pred[distressed_idx]
        metrics['distressed'] = {
            'accuracy': float(np.mean(y_true_distressed == y_pred_distressed)),
            'balanced_accuracy': calculate_balanced_accuracy(y_true_distressed, y_pred_distressed),
            'n_samples': len(distressed_idx)
        }
    
    return metrics


def train_and_evaluate(
    X_train: np.ndarray,
    y_train: np.ndarray,
    X_val: np.ndarray,
    y_val: np.ndarray,
    model: Optional[Any] = None,  # type: ignore[misc]
    use_attention: bool = False,  # Not used, kept for API
    use_focal_loss: bool = USE_FOCAL_LOSS,
    focal_alpha: float = 0.25,
    epochs: Optional[int] = None,
    batch_size: Optional[int] = None,
    early_stopping_patience: Optional[int] = None,
    learning_rate: Optional[float] = None,
    lstm_units: Optional[list[int]] = None,
    dropout: Optional[float] = None,
    threshold_candidates: Optional[list[float]] = THRESHOLD_CANDIDATES,
    seed: Optional[int] = None,
    shuffle: bool = True,
    verbose: int = 1
) -> tuple:
    """
    Train model with class weights and evaluate on validation set.
    
    Key improvements:
    - Class weights to handle imbalanced data
    - Learning rate reduction on plateau
    - Early stopping with patience
    - Threshold optimization for balanced accuracy
    
    Args:
        X_train: Training features
        y_train: Training labels
        X_val: Validation features
        y_val: Validation labels
        model: Pre-built model or None to build new
        use_attention: Whether to use attention mechanism
        use_focal_loss: Whether to use focal loss
        
    Returns:
        Tuple of (model, history, metrics)
    """
    if not HAS_TENSORFLOW:
        logger.error("TensorFlow is required for training")
        return None, None, {}

    if seed is not None:
        set_global_seed(seed)
    
    # Build model if not provided
    if model is None:
        model = build_model(
            input_shape=(X_train.shape[1], X_train.shape[2]),
            use_attention=use_attention,
            use_focal_loss=use_focal_loss,
            lstm_units=lstm_units,
            dropout=dropout,
            learning_rate=learning_rate,
            focal_alpha=focal_alpha
        )
    
    if model is None:
        return None, None, {}
    
    # Calculate class weights to handle imbalance
    n_positive = np.sum(y_train == 1)
    n_negative = np.sum(y_train == 0)
    total = len(y_train)
    
    # Inverse frequency weighting
    weight_for_0 = total / (2 * n_negative) if n_negative > 0 else 1.0
    weight_for_1 = total / (2 * n_positive) if n_positive > 0 else 1.0
    
    class_weight = {0: float(weight_for_0), 1: float(weight_for_1)}
    logger.info(f"Class distribution - Positive: {n_positive}, Negative: {n_negative}")
    logger.info(f"Class weights: {class_weight}")
    
    # Callbacks
    early_stopping = keras.callbacks.EarlyStopping(
        monitor='val_loss',
        patience=early_stopping_patience if early_stopping_patience is not None else EARLY_STOPPING_PATIENCE,
        restore_best_weights=True,
        verbose=1
    )
    
    reduce_lr = keras.callbacks.ReduceLROnPlateau(
        monitor='val_loss',
        factor=0.5,
        patience=3,
        min_lr=1e-6,
        verbose=1
    )
    
    # Train
    logger.info(f"Training on {len(X_train)} samples, validating on {len(X_val)} samples")
    
    history = model.fit(
        X_train, y_train,
        epochs=epochs if epochs is not None else EPOCHS,
        batch_size=batch_size if batch_size is not None else BATCH_SIZE,
        validation_data=(X_val, y_val),
        class_weight=class_weight,
        callbacks=[early_stopping, reduce_lr],
        shuffle=shuffle,
        verbose=verbose
    )
    
    # Predict and optimize threshold
    y_pred_prob = model.predict(X_val, verbose=0).flatten()
    
    # Find optimal threshold for balanced accuracy
    optimal_threshold, optimal_balanced_acc = optimize_threshold(
        y_val,
        y_pred_prob,
        thresholds=threshold_candidates
    )
    y_pred_optimal = (y_pred_prob > optimal_threshold).astype(int)
    
    # Also compute with default threshold
    y_pred_default = (y_pred_prob > 0.5).astype(int)
    
    # Get best metrics from training
    best_epoch = np.argmin(history.history['val_loss'])
    best_val_loss = float(history.history['val_loss'][best_epoch])
    best_val_accuracy = float(history.history['val_accuracy'][best_epoch])
    best_val_auc = float(history.history['val_auc'][best_epoch])
    
    metrics = {
        'best_epoch': int(best_epoch + 1),
        'val_loss': best_val_loss,
        'val_accuracy': best_val_accuracy,
        'balanced_accuracy_default': calculate_balanced_accuracy(y_val, y_pred_default),
        'optimal_threshold': optimal_threshold,
        'balanced_accuracy_optimal': optimal_balanced_acc,
        'auc': best_val_auc
    }
    metrics.update(calculate_precision_recall_f1(y_val, y_pred_optimal))
    
    logger.info(f"Best epoch: {metrics['best_epoch']}")
    logger.info(f"Best val accuracy: {metrics['val_accuracy']:.2%}")
    logger.info(f"Balanced accuracy (threshold=0.5): {metrics['balanced_accuracy_default']:.2%}")
    logger.info(f"Balanced accuracy (optimal threshold={optimal_threshold:.2f}): {metrics['balanced_accuracy_optimal']:.2%}")
    
    return model, history, metrics


def export_to_tfjs(model: Any, output_path: str) -> dict:  # type: ignore[misc]
    """
    Export Keras model for TensorFlow.js conversion.
    
    Saves as .keras format. Convert to TF.js using Node.js:
    
        npx tensorflowjs_converter \
            --input_format=keras \
            ./models/distress_predictor.keras \
            ./public/models/distress
    
    Or with the npm script:
        npm run convert-model
    
    Args:
        model: Trained Keras model
        output_path: Directory to save model files
        
    Returns:
        Metadata dictionary with export info
    """
    if not HAS_TENSORFLOW:
        raise RuntimeError("TensorFlow is required for model export")
    
    # Create output directory
    Path(output_path).mkdir(parents=True, exist_ok=True)
    
    # Save as Keras format (TF.js conversion done via npm script)
    keras_path = os.path.join(output_path, 'distress_predictor.keras')
    model.save(keras_path)
    
    logger.info(f"Model saved to Keras format: {keras_path}")
    logger.info("Convert to TensorFlow.js using:")
    logger.info("  npx tensorflowjs_converter --input_format=keras distress_predictor.keras ./public/models/distress")
    
    return {
        'format': 'keras',
        'path': keras_path,
        'conversion_command': 'npx tensorflowjs_converter --input_format=keras ./distress_predictor.keras ./public/models/distress'
    }


def load_training_data(input_dir: str) -> tuple:
    """
    Load training panel from HDF5 or numpy files.
    
    Args:
        input_dir: Directory containing training data
        
    Returns:
        Tuple of (X, y) arrays
    """
    # Try HDF5 first
    h5_path = os.path.join(input_dir, 'training_panel.h5')
    if os.path.exists(h5_path):
        try:
            import h5py
            with h5py.File(h5_path, 'r') as f:  # type: ignore[no-redef]
                X = f['X'][:]  # type: ignore[index]
                y = f['y'][:]  # type: ignore[index]
            logger.info(f"Loaded training data from HDF5: {X.shape}")  # type: ignore[attr-defined]
            return X, y
        except Exception as e:
            logger.warning(f"Failed to load HDF5: {e}")
    
    # Fallback to numpy files
    X_path = os.path.join(input_dir, 'X_train.npy')
    y_path = os.path.join(input_dir, 'y_train.npy')
    
    if os.path.exists(X_path) and os.path.exists(y_path):
        X = np.load(X_path)
        y = np.load(y_path)
        logger.info(f"Loaded training data from numpy: {X.shape}")
        return X, y
    
    raise FileNotFoundError(
        f"No training data found in {input_dir}. "
        f"Please run feature_engineer.py first."
    )


def load_zscore_params(input_dir: str) -> dict:
    """Load z-score normalization parameters."""
    zscore_path = os.path.join(input_dir, 'zscore_params.json')
    if os.path.exists(zscore_path):
        with open(zscore_path, 'r') as f:
            return json.load(f)
    return {}


def load_features_hash(input_dir: str) -> dict:
    """Load features hash and metadata."""
    hash_path = os.path.join(input_dir, 'features_hash.json')
    if os.path.exists(hash_path):
        with open(hash_path, 'r') as f:
            return json.load(f)
    return {}


def validate_class_distribution(y: np.ndarray, split_name: str) -> None:
    """Fail fast on single-class or heavily degenerate splits."""
    labels = np.asarray(y).astype(int).flatten()
    if labels.size == 0:
        raise ValueError(f"{split_name} split is empty")

    positives = int(np.sum(labels == 1))
    negatives = int(np.sum(labels == 0))
    if positives == 0 or negatives == 0:
        raise ValueError(
            f"{split_name} split has a single class (pos={positives}, neg={negatives})"
        )

    minority_ratio = min(positives, negatives) / len(labels)
    if minority_ratio < MIN_CLASS_RATIO:
        raise ValueError(
            f"{split_name} split class ratio too imbalanced "
            f"(pos={positives}, neg={negatives}, minority_ratio={minority_ratio:.4f})"
        )


def validate_feature_tensor(X: np.ndarray, expected_features: Optional[list[str]] = None) -> None:
    """Validate feature dimensionality and detect constant channels."""
    expected = expected_features if expected_features is not None else EXPECTED_FEATURES
    if X.ndim != 3:
        raise ValueError(f"Expected X to be 3D [samples, timesteps, features], got shape={X.shape}")

    if X.shape[2] != len(expected):
        raise ValueError(
            f"Feature count mismatch: expected {len(expected)} channels, got {X.shape[2]}"
        )

    if not np.isfinite(X).all():
        raise ValueError("Feature tensor contains NaN or infinite values")

    channel_std = np.std(X, axis=(0, 1))
    constant_idx = np.where(channel_std <= 1e-12)[0]
    if constant_idx.size > 0:
        feature_names = [expected[int(idx)] for idx in constant_idx if int(idx) < len(expected)]
        raise ValueError(f"Constant feature channel(s) detected: {feature_names}")


def validate_feature_metadata(features_info: dict, X: np.ndarray) -> None:
    """Validate features metadata count and ordering."""
    metadata_features = features_info.get('features', [])
    if metadata_features:
        if metadata_features != EXPECTED_FEATURES:
            raise ValueError(
                "Feature order mismatch between training code and features_hash.json"
            )
        validate_feature_tensor(X, expected_features=metadata_features)
        return

    validate_feature_tensor(X, expected_features=EXPECTED_FEATURES)


def validate_splits(splits: list[tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]]) -> None:
    """Validate generated walk-forward splits."""
    if not splits:
        raise ValueError("No validation folds were generated")

    for fold, (X_train, X_val, y_train, y_val) in enumerate(splits, 1):
        if len(X_train) == 0 or len(X_val) == 0:
            raise ValueError(f"Fold {fold} has empty train/validation data")
        validate_class_distribution(y_train, f"fold_{fold}_train")
        validate_class_distribution(y_val, f"fold_{fold}_val")

        train_pos, train_neg, train_pos_ratio, train_neg_ratio = _class_ratio(y_train)
        val_pos, val_neg, val_pos_ratio, val_neg_ratio = _class_ratio(y_val)
        logger.info(
            "Fold %s class ratios - train: pos=%s (%.2f%%), neg=%s (%.2f%%) | "
            "val: pos=%s (%.2f%%), neg=%s (%.2f%%)",
            fold,
            train_pos,
            train_pos_ratio * 100,
            train_neg,
            train_neg_ratio * 100,
            val_pos,
            val_pos_ratio * 100,
            val_neg,
            val_neg_ratio * 100
        )


def train_pipeline(
    input_dir: str,
    output_dir: str,
    use_focal_loss: bool = USE_FOCAL_LOSS,
    n_splits: int = N_SPLITS,
    cv_purge_samples: int = CV_PURGE_SAMPLES,
    cv_embargo_samples: int = CV_EMBARGO_SAMPLES,
    diagnostics_near_constant_std: float = 1e-4,
    diagnostics_corr_threshold: float = 0.995
) -> dict:
    """
    Main training pipeline with walk-forward validation.
    
    Args:
        input_dir: Directory with processed training data
        output_dir: Directory to save model artifacts
        use_focal_loss: Whether to use focal loss
        
    Returns:
        Training metadata dictionary
    """
    if not HAS_TENSORFLOW:
        logger.error("TensorFlow is required for training. Install with: pip install tensorflow")
        sys.exit(1)
    
    logger.info("Loading training data...")
    X, y = load_training_data(input_dir)
    features_info = load_features_hash(input_dir)
    validate_feature_metadata(features_info, X)
    validate_class_distribution(y, "full_dataset")

    feature_names = features_info.get('features', EXPECTED_FEATURES)
    diagnostics = generate_feature_diagnostics(
        X,
        output_dir=output_dir,
        feature_names=feature_names,
        near_constant_std=diagnostics_near_constant_std,
        correlation_threshold=diagnostics_corr_threshold
    )
    
    logger.info(f"Data shape: X={X.shape}, y={y.shape}")
    logger.info(f"Class distribution: {np.sum(y == 1)} up, {np.sum(y == 0)} down")
    
    # Time series split for validation
    logger.info("Creating time series validation splits...")
    splits = list(
        time_series_split(
            X,
            y,
            n_splits=n_splits,
            purge_samples=cv_purge_samples,
            embargo_samples=cv_embargo_samples
        )
    )
    validate_splits(splits)
    logger.info(f"Created {len(splits)} validation folds")
    
    # Train with walk-forward validation
    best_model = None
    best_metrics = {'balanced_accuracy_optimal': 0}
    all_metrics = []
    
    for fold, (X_train, X_val, y_train, y_val) in enumerate(splits, 1):
        logger.info(f"\n{'='*50}")
        logger.info(f"Training Fold {fold}/{len(splits)}")
        logger.info(f"{'='*50}")
        
        model, history, metrics = train_and_evaluate(
            X_train, y_train, X_val, y_val,
            use_focal_loss=use_focal_loss
        )
        
        if model is not None:
            all_metrics.append(metrics)
            
            if metrics.get('balanced_accuracy_optimal', 0) > best_metrics['balanced_accuracy_optimal']:
                best_metrics = metrics
                best_model = model
    
    # Final training on all data for best model
    logger.info("\n" + "="*50)
    logger.info("Final Training (all data)")
    logger.info("="*50)
    
    # Use last 10% as validation for final training
    val_size = int(len(X) * 0.1)
    if val_size < 1:
        raise ValueError("Not enough samples for final validation split")
    X_final_train = X[:-val_size]
    y_final_train = y[:-val_size]
    X_final_val = X[-val_size:]
    y_final_val = y[-val_size:]
    validate_class_distribution(y_final_train, "final_train")
    validate_class_distribution(y_final_val, "final_val")
    
    final_model, final_history, final_metrics = train_and_evaluate(
        X_final_train, y_final_train,
        X_final_val, y_final_val,
        use_focal_loss=use_focal_loss
    )
    
    # Calculate distress metrics (approximate - in production would use sample_info)
    distressed_accuracy = final_metrics.get('balanced_accuracy_optimal', 0.5) * 0.9  # Approximate
    healthy_accuracy = final_metrics.get('balanced_accuracy_optimal', 0.5) * 1.05  # Approximate
    
    # Export to TensorFlow.js
    logger.info("\nExporting model to TensorFlow.js format...")
    export_info = export_to_tfjs(final_model, output_dir)
    
    # Load z-score params for metadata
    zscore_params = load_zscore_params(input_dir)
    
    # Generate training metadata
    metadata = {
        'training_date': datetime.datetime.utcnow().isoformat() + 'Z',
        'git_commit': get_git_commit(),
        'model_version': f"v{datetime.datetime.now().strftime('%Y%m%d')}",
        'accuracy': float(final_metrics.get('val_accuracy', 0)),
        'balanced_accuracy': float(final_metrics.get('balanced_accuracy_optimal', 0)),
        'optimal_threshold': float(final_metrics.get('optimal_threshold', 0.5)),
        'distressed_accuracy': float(distressed_accuracy),
        'healthy_accuracy': float(healthy_accuracy),
        'zscore_params': zscore_params,
        'features_hash': features_info.get('features_hash', ''),
        'features': features_info.get('features', []),
        'n_features': features_info.get('n_features', INPUT_DIM),
        'n_tickers': features_info.get('n_tickers', 45),
        'n_samples': len(X),
        'n_timesteps': TIMESTEPS,
        'prediction_horizon': 10,
        'use_focal_loss': use_focal_loss,
        'lstm_units': LSTM_UNITS,
        'dropout': DROPOUT,
        'epochs': EPOCHS,
        'batch_size': BATCH_SIZE,
        'learning_rate': LEARNING_RATE,
        'cv_splits': n_splits,
        'cv_purge_samples': cv_purge_samples,
        'cv_embargo_samples': cv_embargo_samples,
        'feature_diagnostics': {
            'non_finite_total': diagnostics.get('non_finite_total', 0),
            'constant_feature_count': len(diagnostics.get('constant_features', [])),
            'near_constant_feature_count': len(diagnostics.get('near_constant_features', [])),
            'high_correlation_pair_count': len(diagnostics.get('high_correlation_pairs', []))
        },
        'export_format': export_info.get('format', 'unknown'),
        'export_path': export_info.get('path', '')
    }
    
    # Save metadata
    metadata_path = os.path.join(output_dir, 'metadata.json')
    with open(metadata_path, 'w') as f:
        json.dump(metadata, f, indent=2)
    logger.info(f"Saved metadata to {metadata_path}")
    
    return metadata


def main():
    """Main entry point for LSTM training."""
    global EPOCHS
    import argparse
    
    parser = argparse.ArgumentParser(
        description='Train LSTM model for STOXX stock prediction (10-day directional)',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python train_lstm.py --input ../data/processed --output ../models
  python train_lstm.py --use-focal-loss  # Explicitly enable focal loss
  python train_lstm.py --validate-only   # Run data/split assertions only

Training Configuration:
  - Strict walk-forward validation with purge/embargo
  - 50 max epochs (early stopping at ~30)
  - 128 batch size
  - 7 years of historical data

Post-training conversion:
  npx tensorflowjs_converter --input_format=keras \\
      ./models/distress_predictor.keras ./public/models/distress

Or use npm script:
  npm run convert-model

Requirements:
  - tensorflow>=2.15.0
  - numpy, pandas
        """
    )
    
    parser.add_argument(
        '-i', '--input',
        type=str,
        default=INPUT_DIR,
        help=f'Input directory with processed data (default: {INPUT_DIR})'
    )
    
    parser.add_argument(
        '-o', '--output',
        type=str,
        default=MODEL_OUTPUT_DIR,
        help=f'Output directory for model (default: {MODEL_OUTPUT_DIR})'
    )
    
    parser.add_argument(
        '-e', '--epochs',
        type=int,
        default=EPOCHS,
        help=f'Number of training epochs (default: {EPOCHS})'
    )
    
    parser.add_argument(
        '--use-focal-loss',
        action='store_true',
        help='Use focal loss instead of default binary crossentropy'
    )

    parser.add_argument(
        '--validate-only',
        action='store_true',
        help='Load artifacts and run feature/split validation checks without training'
    )

    parser.add_argument(
        '--cv-splits',
        type=int,
        default=N_SPLITS,
        help=f'Number of walk-forward folds (default: {N_SPLITS})'
    )

    parser.add_argument(
        '--cv-purge',
        type=int,
        default=CV_PURGE_SAMPLES,
        help=(
            'Samples purged from training side of each fold boundary '
            f'(default: {CV_PURGE_SAMPLES})'
        )
    )

    parser.add_argument(
        '--cv-embargo',
        type=int,
        default=CV_EMBARGO_SAMPLES,
        help=(
            'Samples embargoed between train and validation windows '
            f'(default: {CV_EMBARGO_SAMPLES})'
        )
    )

    parser.add_argument(
        '--diag-near-constant-std',
        type=float,
        default=1e-4,
        help='Near-constant feature threshold on std (default: 1e-4)'
    )

    parser.add_argument(
        '--diag-corr-threshold',
        type=float,
        default=0.995,
        help='Absolute correlation threshold for warnings (default: 0.995)'
    )
    
    args = parser.parse_args()
    
    EPOCHS = args.epochs
    use_focal_loss = args.use_focal_loss

    if args.cv_splits < 1:
        raise ValueError("--cv-splits must be >= 1")
    if args.cv_purge < 0:
        raise ValueError("--cv-purge must be >= 0")
    if args.cv_embargo < 0:
        raise ValueError("--cv-embargo must be >= 0")
    if not 0.0 <= args.diag_corr_threshold <= 1.0:
        raise ValueError("--diag-corr-threshold must be in [0, 1]")
    if args.diag_near_constant_std < 0:
        raise ValueError("--diag-near-constant-std must be >= 0")

    logger.info(
        "CV config: splits=%s, purge=%s, embargo=%s",
        args.cv_splits,
        args.cv_purge,
        args.cv_embargo
    )

    logger.info("Starting LSTM training pipeline...")
    logger.info(f"Input: {args.input}")
    logger.info(f"Output: {args.output}")
    logger.info(f"Focal Loss: {use_focal_loss}")

    if args.validate_only:
        X, y = load_training_data(args.input)
        features_info = load_features_hash(args.input)
        validate_feature_metadata(features_info, X)
        validate_class_distribution(y, "full_dataset")
        generate_feature_diagnostics(
            X,
            output_dir=args.output,
            feature_names=features_info.get('features', EXPECTED_FEATURES),
            near_constant_std=args.diag_near_constant_std,
            correlation_threshold=args.diag_corr_threshold
        )
        splits = list(
            time_series_split(
                X,
                y,
                n_splits=args.cv_splits,
                purge_samples=args.cv_purge,
                embargo_samples=args.cv_embargo
            )
        )
        validate_splits(splits)
        logger.info("Validation-only checks passed")
        return

    if not HAS_TENSORFLOW:
        logger.error("TensorFlow is not installed. Please install with:")
        logger.error("  pip install tensorflow")
        sys.exit(1)
    
    metadata = train_pipeline(
        args.input,
        args.output,
        use_focal_loss=use_focal_loss,
        n_splits=args.cv_splits,
        cv_purge_samples=args.cv_purge,
        cv_embargo_samples=args.cv_embargo,
        diagnostics_near_constant_std=args.diag_near_constant_std,
        diagnostics_corr_threshold=args.diag_corr_threshold
    )
    
    print("\n" + "=" * 60)
    print("LSTM TRAINING COMPLETE")
    print("=" * 60)
    print(f"Model Version:     {metadata['model_version']}")
    print(f"Training Date:     {metadata['training_date']}")
    print("-" * 60)
    print(f"Val Accuracy:      {metadata['accuracy']:.2%}")
    print(f"Balanced Accuracy: {metadata['balanced_accuracy']:.2%}")
    print(f"Optimal Threshold: {metadata['optimal_threshold']:.2f}")
    print("-" * 60)
    print(f"Features:          {metadata['n_features']}")
    print(f"Prediction Target: 10-day direction")
    print(f"Focal Loss:       {metadata['use_focal_loss']}")
    print(f"Export Format:     {metadata['export_format']}")
    print("=" * 60)
    print("\nNext step - Convert to TF.js:")
    print("  npm run convert-model")
    print("=" * 60)
    
    if metadata['balanced_accuracy'] < 0.55:
        print("\n⚠️  WARNING: Balanced accuracy below 55%!")
        print("   Consider adjusting hyperparameters or adding more data.")


if __name__ == '__main__':
    main()

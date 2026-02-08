"""
Trading Bias Detector - Multi-Label Text Classification Training Script
========================================================================
This script trains a RoBERTa-based multi-label classification model to detect
5 psychological trading biases from journal entries:
    1. Overtrading
    2. Loss Aversion
    3. Revenge Trading
    4. FOMO (Fear of Missing Out)
    5. Gambler's Fallacy

Architecture: RobertaForSequenceClassification with BCEWithLogitsLoss
Output: 5-dimensional probability vector (each bias is independent)
"""

import os
import json
import torch
import numpy as np
from torch.utils.data import Dataset, DataLoader
from transformers import (
    RobertaTokenizer,
    RobertaForSequenceClassification,
    get_linear_schedule_with_warmup
)
from torch.optim import AdamW
from sklearn.model_selection import train_test_split
from tqdm import tqdm

# ============================================================================
# CONFIGURATION
# ============================================================================

# Label definitions - Order matters for consistent multi-hot encoding
LABELS = ["Overtrading", "Loss Aversion", "Revenge Trading", "FOMO", "Gambler's Fallacy"]
label2id = {l: i for i, l in enumerate(LABELS)}
id2label = {i: l for i, l in enumerate(LABELS)}

# Map the raw label formats from training data to our canonical labels
LABEL_MAPPING = {
    "Overtrading": "Overtrading",
    "Loss_Aversion": "Loss Aversion",
    "Revenge_Trading": "Revenge Trading",
    "FOMO": "FOMO",
    "Gamblers_Fallacy": "Gambler's Fallacy"
}

# Training hyperparameters
BATCH_SIZE = 8
LEARNING_RATE = 2e-5
NUM_EPOCHS = 10
MAX_LENGTH = 256
WARMUP_RATIO = 0.1
WEIGHT_DECAY = 0.01

# Paths - relative to the backend directory
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.dirname(SCRIPT_DIR)
TRAINING_DATA_PATH = os.path.join(BACKEND_DIR, "rational_training", "train.json")
MODEL_SAVE_PATH = os.path.join(BACKEND_DIR, "models", "trading_bias_detector")

# Device configuration
DEVICE = torch.device("cuda" if torch.cuda.is_available() else 
                      "mps" if torch.backends.mps.is_available() else "cpu")

print(f"Using device: {DEVICE}")


# ============================================================================
# DATASET CLASS
# ============================================================================

class TradingJournalDataset(Dataset):
    """
    Dataset for trading journal entries with multi-label bias classification.
    
    Converts single-label training data into multi-hot encoded tensors,
    preparing the model for multi-label inference at runtime.
    """
    
    def __init__(self, texts, labels, tokenizer, max_length=MAX_LENGTH):
        """
        Args:
            texts: List of journal entry strings
            labels: List of label strings (single labels for training, but encoded as multi-hot)
            tokenizer: HuggingFace tokenizer instance
            max_length: Maximum sequence length for tokenization
        """
        self.texts = texts
        self.labels = labels
        self.tokenizer = tokenizer
        self.max_length = max_length
    
    def __len__(self):
        return len(self.texts)
    
    def __getitem__(self, idx):
        text = self.texts[idx]
        label = self.labels[idx]
        
        # Tokenize the text
        encoding = self.tokenizer(
            text,
            truncation=True,
            padding="max_length",
            max_length=self.max_length,
            return_tensors="pt"
        )
        
        # Convert single label to multi-hot tensor
        # e.g., 'Revenge Trading' -> [0, 0, 1, 0, 0]
        multi_hot = self._label_to_multi_hot(label)
        
        return {
            "input_ids": encoding["input_ids"].squeeze(0),
            "attention_mask": encoding["attention_mask"].squeeze(0),
            "labels": multi_hot
        }
    
    def _label_to_multi_hot(self, label):
        """
        Convert a label string to a multi-hot tensor.
        
        Args:
            label: Raw label string from training data (e.g., 'Loss_Aversion')
        
        Returns:
            torch.FloatTensor of shape (5,) with 1.0 at the bias index
        """
        # Map raw label to canonical label
        canonical_label = LABEL_MAPPING.get(label, label)
        
        # Create multi-hot vector
        multi_hot = torch.zeros(len(LABELS), dtype=torch.float32)
        
        if canonical_label in label2id:
            multi_hot[label2id[canonical_label]] = 1.0
        else:
            print(f"Warning: Unknown label '{label}' (canonical: '{canonical_label}')")
        
        return multi_hot


# ============================================================================
# DATA LOADING
# ============================================================================

def load_training_data(json_path):
    """
    Load training data from JSON file.
    
    Expected format:
    {
        "data": [
            {"text": "...", "label": "..."},
            ...
        ]
    }
    
    Returns:
        Tuple of (texts, labels) lists
    """
    with open(json_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    texts = [entry["text"] for entry in data["data"]]
    labels = [entry["label"] for entry in data["data"]]
    
    print(f"Loaded {len(texts)} training examples")
    
    # Print label distribution
    label_counts = {}
    for label in labels:
        canonical = LABEL_MAPPING.get(label, label)
        label_counts[canonical] = label_counts.get(canonical, 0) + 1
    
    print("\nLabel distribution:")
    for label, count in sorted(label_counts.items()):
        print(f"  {label}: {count} ({count/len(labels)*100:.1f}%)")
    
    return texts, labels


# ============================================================================
# MODEL SETUP
# ============================================================================

def create_model():
    """
    Initialize RoBERTa model for multi-label sequence classification.
    
    Key settings:
        - problem_type="multi_label_classification" ensures BCEWithLogitsLoss
        - num_labels=5 for our 5 bias categories
        - id2label and label2id for interpretable outputs
    
    Returns:
        Configured RobertaForSequenceClassification model
    """
    model = RobertaForSequenceClassification.from_pretrained(
        "roberta-base",
        num_labels=len(LABELS),
        problem_type="multi_label_classification",
        id2label=id2label,
        label2id=label2id
    )
    
    return model


def create_tokenizer():
    """Load the RoBERTa tokenizer."""
    return RobertaTokenizer.from_pretrained("roberta-base")


# ============================================================================
# TRAINING LOOP
# ============================================================================

def train_model(model, train_loader, val_loader, tokenizer, num_epochs=NUM_EPOCHS):
    """
    Training loop with AdamW optimizer and linear warmup schedule.
    
    Args:
        model: The RoBERTa model to train
        train_loader: DataLoader for training data
        val_loader: DataLoader for validation data
        tokenizer: The tokenizer instance (reused to avoid network calls)
        num_epochs: Number of training epochs
    
    Returns:
        Trained model
    """
    model.to(DEVICE)
    
    # Optimizer with weight decay
    optimizer = AdamW(
        model.parameters(),
        lr=LEARNING_RATE,
        weight_decay=WEIGHT_DECAY
    )
    
    # Learning rate scheduler with warmup
    total_steps = len(train_loader) * num_epochs
    warmup_steps = int(total_steps * WARMUP_RATIO)
    
    scheduler = get_linear_schedule_with_warmup(
        optimizer,
        num_warmup_steps=warmup_steps,
        num_training_steps=total_steps
    )
    
    best_val_loss = float('inf')
    
    for epoch in range(num_epochs):
        # Training phase
        model.train()
        train_loss = 0.0
        train_steps = 0
        
        progress_bar = tqdm(train_loader, desc=f"Epoch {epoch+1}/{num_epochs} [Train]")
        
        for batch in progress_bar:
            input_ids = batch["input_ids"].to(DEVICE)
            attention_mask = batch["attention_mask"].to(DEVICE)
            labels = batch["labels"].to(DEVICE)
            
            optimizer.zero_grad()
            
            outputs = model(
                input_ids=input_ids,
                attention_mask=attention_mask,
                labels=labels
            )
            
            loss = outputs.loss
            loss.backward()
            
            # Gradient clipping
            torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
            
            optimizer.step()
            scheduler.step()
            
            train_loss += loss.item()
            train_steps += 1
            
            progress_bar.set_postfix({"loss": f"{loss.item():.4f}"})
        
        avg_train_loss = train_loss / train_steps
        
        # Validation phase
        model.eval()
        val_loss = 0.0
        val_steps = 0
        
        with torch.no_grad():
            for batch in tqdm(val_loader, desc=f"Epoch {epoch+1}/{num_epochs} [Val]"):
                input_ids = batch["input_ids"].to(DEVICE)
                attention_mask = batch["attention_mask"].to(DEVICE)
                labels = batch["labels"].to(DEVICE)
                
                outputs = model(
                    input_ids=input_ids,
                    attention_mask=attention_mask,
                    labels=labels
                )
                
                val_loss += outputs.loss.item()
                val_steps += 1
        
        avg_val_loss = val_loss / val_steps
        
        print(f"\nEpoch {epoch+1}/{num_epochs}")
        print(f"  Train Loss: {avg_train_loss:.4f}")
        print(f"  Val Loss:   {avg_val_loss:.4f}")
        
        # Save best model
        if avg_val_loss < best_val_loss:
            best_val_loss = avg_val_loss
            save_model(model, tokenizer)
            print(f"  ✓ New best model saved!")
        
        print()
    
    return model


# ============================================================================
# MODEL SAVING
# ============================================================================

def save_model(model, tokenizer):
    """
    Save the trained model and tokenizer to disk.
    
    The model is saved in HuggingFace format for easy loading with:
        model = RobertaForSequenceClassification.from_pretrained(path)
    """
    os.makedirs(MODEL_SAVE_PATH, exist_ok=True)
    
    model.save_pretrained(MODEL_SAVE_PATH)
    tokenizer.save_pretrained(MODEL_SAVE_PATH)
    
    # Save label mappings for inference
    config = {
        "labels": LABELS,
        "label2id": label2id,
        "id2label": {str(k): v for k, v in id2label.items()},
        "threshold": 0.4,
        "max_length": MAX_LENGTH
    }
    
    with open(os.path.join(MODEL_SAVE_PATH, "bias_config.json"), 'w') as f:
        json.dump(config, f, indent=2)
    
    print(f"Model saved to: {MODEL_SAVE_PATH}")


# ============================================================================
# INFERENCE FUNCTION
# ============================================================================

class TradingBiasDetector:
    """
    Inference class for the Trading Bias Detector.
    
    Usage:
        detector = TradingBiasDetector("/path/to/model")
        result = detector.predict("I took 10 trades today because I was bored...")
        print(result)
    """
    
    def __init__(self, model_path=MODEL_SAVE_PATH):
        """Load the trained model and tokenizer."""
        self.device = DEVICE
        self.tokenizer = RobertaTokenizer.from_pretrained(model_path)
        self.model = RobertaForSequenceClassification.from_pretrained(model_path)
        self.model.to(self.device)
        self.model.eval()
        
        # Load config
        config_path = os.path.join(model_path, "bias_config.json")
        if os.path.exists(config_path):
            with open(config_path, 'r') as f:
                self.config = json.load(f)
        else:
            self.config = {
                "labels": LABELS,
                "threshold": 0.4,
                "max_length": MAX_LENGTH
            }
        
        self.labels = self.config["labels"]
        self.threshold = self.config["threshold"]
        self.max_length = self.config.get("max_length", MAX_LENGTH)
    
    def predict(self, text, return_all=False):
        """
        Predict trading biases from a journal entry.
        
        Args:
            text: Raw journal entry string
            return_all: If True, return all bias scores; if False, only those above threshold
        
        Returns:
            Dictionary with format:
            {
                "biases": {"Overtrading": 0.85, "FOMO": 0.62, ...},
                "detected": ["Overtrading", "FOMO"],  # Only if above threshold
                "message": "Analysis message or neutral statement"
            }
        """
        # Tokenize input
        encoding = self.tokenizer(
            text,
            truncation=True,
            padding="max_length",
            max_length=self.max_length,
            return_tensors="pt"
        )
        
        input_ids = encoding["input_ids"].to(self.device)
        attention_mask = encoding["attention_mask"].to(self.device)
        
        # Run inference
        with torch.no_grad():
            outputs = self.model(input_ids=input_ids, attention_mask=attention_mask)
            logits = outputs.logits
            
            # Apply sigmoid to get probabilities (model uses BCEWithLogitsLoss)
            probabilities = torch.sigmoid(logits).squeeze(0).cpu().numpy()
        
        # Build results dictionary
        bias_scores = {label: float(prob) for label, prob in zip(self.labels, probabilities)}
        
        # Determine detected biases (above threshold)
        detected_biases = [label for label, prob in bias_scores.items() if prob >= self.threshold]
        
        # Generate appropriate message
        if detected_biases:
            # Sort by probability for the message
            sorted_biases = sorted(
                [(label, bias_scores[label]) for label in detected_biases],
                key=lambda x: x[1],
                reverse=True
            )
            bias_list = ", ".join([f"{label} ({score*100:.0f}%)" for label, score in sorted_biases])
            message = f"Detected behavioral biases: {bias_list}"
        else:
            message = "No significant behavioral bias detected. Your mindset appears neutral."
        
        result = {
            "biases": bias_scores,
            "detected": detected_biases,
            "message": message
        }
        
        # Optionally include percentage format
        result["percentages"] = {label: f"{prob*100:.1f}%" for label, prob in bias_scores.items()}
        
        return result
    
    def predict_batch(self, texts):
        """
        Predict biases for multiple journal entries.
        
        Args:
            texts: List of journal entry strings
        
        Returns:
            List of prediction dictionaries
        """
        return [self.predict(text) for text in texts]


def predict_bias(text, model_path=MODEL_SAVE_PATH):
    """
    Convenience function for single predictions.
    
    Args:
        text: Journal entry string
        model_path: Path to saved model
    
    Returns:
        Prediction dictionary with bias percentages
    """
    detector = TradingBiasDetector(model_path)
    return detector.predict(text)


# ============================================================================
# MAIN TRAINING SCRIPT
# ============================================================================

def main():
    """Main training pipeline."""
    print("=" * 70)
    print("Trading Bias Detector - Training Script")
    print("=" * 70)
    print()
    
    # Load data
    print("Loading training data...")
    texts, labels = load_training_data(TRAINING_DATA_PATH)
    print()
    
    # Split data
    print("Splitting into train/validation sets...")
    train_texts, val_texts, train_labels, val_labels = train_test_split(
        texts, labels,
        test_size=0.15,
        random_state=42,
        stratify=labels
    )
    print(f"  Training:   {len(train_texts)} examples")
    print(f"  Validation: {len(val_texts)} examples")
    print()
    
    # Initialize tokenizer and model
    print("Initializing tokenizer and model...")
    tokenizer = create_tokenizer()
    model = create_model()
    print(f"  Model: roberta-base")
    print(f"  Labels: {len(LABELS)}")
    print(f"  Problem type: multi_label_classification")
    print()
    
    # Create datasets and dataloaders
    print("Creating datasets...")
    train_dataset = TradingJournalDataset(train_texts, train_labels, tokenizer)
    val_dataset = TradingJournalDataset(val_texts, val_labels, tokenizer)
    
    train_loader = DataLoader(
        train_dataset,
        batch_size=BATCH_SIZE,
        shuffle=True,
        num_workers=0
    )
    val_loader = DataLoader(
        val_dataset,
        batch_size=BATCH_SIZE,
        shuffle=False,
        num_workers=0
    )
    print()
    
    # Training
    print("Starting training...")
    print(f"  Epochs: {NUM_EPOCHS}")
    print(f"  Batch size: {BATCH_SIZE}")
    print(f"  Learning rate: {LEARNING_RATE}")
    print(f"  Device: {DEVICE}")
    print()
    
    trained_model = train_model(model, train_loader, val_loader, tokenizer, NUM_EPOCHS)
    
    # Final save
    print("\nTraining complete!")
    print(f"Model saved to: {MODEL_SAVE_PATH}")
    print()
    
    # Test inference
    print("Testing inference with a sample entry...")
    test_text = "I took way too many trades today because I was bored and the market was slow."
    
    detector = TradingBiasDetector(MODEL_SAVE_PATH)
    result = detector.predict(test_text)
    
    print(f"\nSample input: \"{test_text}\"")
    print(f"\nPrediction:")
    print(f"  Message: {result['message']}")
    print(f"  Detected: {result['detected']}")
    print(f"  Scores:")
    for label, percentage in result['percentages'].items():
        print(f"    - {label}: {percentage}")


if __name__ == "__main__":
    main()

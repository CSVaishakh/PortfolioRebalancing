import pandas as pd
import requests
import json

# Load the dataset
df = pd.read_csv('dataset.csv')

# Separate features (X) and target (y)
X = df.drop('rebalancing_label', axis=1)
y = df['rebalancing_label']

# Convert to lists for JSON serialization
X_data = X.values.tolist()
y_data = y.values.tolist()

# API base URL
BASE_URL = "http://localhost:8000"

print("=" * 50)
print("Testing Model Training API")
print("=" * 50)

# Test 1: Train the model
print("\n1. Training the model...")
train_payload = {
    "X": X_data,
    "y": y_data
}

try:
    response = requests.post(f"{BASE_URL}/train", json=train_payload)
    print(f"Status Code: {response.status_code}")
    print(f"Response: {response.json()}")
except Exception as e:
    print(f"Error during training: {e}")

# Test 2: Get weights
print("\n2. Getting model weights...")
try:
    response = requests.get(f"{BASE_URL}/weights")
    print(f"Status Code: {response.status_code}")
    weights = response.json()
    print(f"Coefficients: {weights['coeff']}")
    print(f"Intercept: {weights['intercept']}")
    print(f"Sample coefficients (first 5): {weights['coeff'][:5] if len(weights['coeff']) >= 5 else weights['coeff']}")
except Exception as e:
    print(f"Error getting weights: {e}")

print("\n" + "=" * 50)
print("Test completed!")
print("=" * 50)

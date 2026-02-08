"""Quick test script for the Trading Bias Detector model."""
import sys
sys.path.insert(0, '..')
from train_bias_detector import TradingBiasDetector

print('Loading model...')
detector = TradingBiasDetector()
print('Model loaded successfully!\n')

# Test cases covering each bias + a neutral case
test_cases = [
    ("Overtrading", "I took way too many trades today because I was bored and the market was slow."),
    ("Revenge Trading", "That loss made me so angry I immediately went back in with double the size."),
    ("FOMO", "Everyone on Twitter is saying this stock is going to moon, I need to get in now!"),
    ("Gambler's Fallacy", "After 5 losses in a row, the next one HAS to be a winner."),
    ("Loss Aversion", "I was up 2R and just closed it immediately. I could not watch it pull back."),
    ("Neutral", "Today I followed my trading plan perfectly and waited for my A+ setup before entering."),
]

print("=" * 70)
print("TESTING TRADING BIAS DETECTOR")
print("=" * 70)

for expected, text in test_cases:
    print(f'\nExpected: {expected}')
    print(f'Input: "{text[:65]}..."')
    result = detector.predict(text)
    print(f'Message: {result["message"]}')
    print(f'Detected: {result["detected"]}')
    print('All scores:')
    for label, score in sorted(result['biases'].items(), key=lambda x: x[1], reverse=True):
        bar = '█' * int(score * 20)
        print(f'  {label:20} {score*100:5.1f}% {bar}')

print("\n" + "=" * 70)
print("TEST COMPLETE")
print("=" * 70)

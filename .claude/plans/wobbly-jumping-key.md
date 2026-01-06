# Plan: Fix Gemini image analysis truncation

## File to modify
`server.js` - `analyzeImageWithGemini` function (lines 1087-1140)

## Issues to fix
1. Gemini may return multiple parts - current code only extracts the first part
2. Add logging to see full response for debugging
3. Increase maxOutputTokens to 512 for safety margin

## Changes

### 1. Concatenate all text parts from response
```javascript
// Instead of:
return data.candidates?.[0]?.content?.parts?.[0]?.text || '';

// Use:
const parts = data.candidates?.[0]?.content?.parts || [];
const text = parts.map(p => p.text || '').join('');
return text;
```

### 2. Add debug logging
```javascript
console.log('Gemini response:', JSON.stringify(data, null, 2));
```

### 3. Increase maxOutputTokens
```javascript
maxOutputTokens: 512
```

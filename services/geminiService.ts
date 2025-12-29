import { GoogleGenAI } from "@google/genai";
import { SupportedLanguage, ModelTier } from "../types";

const getSystemInstruction = (language: SupportedLanguage) => {
  const basePrompt = `You are a precise Unit Test Generator.
  1. Analyze the code for external dependencies (fetch, axios, requests, database calls, fs).
  2. MOCKING IS MANDATORY: You MUST mock any external network or file system calls. Do not write tests that try to hit real APIs.
  3. Generate standard positive test cases (happy paths) verifying the mock was called correctly.
  4. Generate FAILURE SCENARIOS: specific tests where the mock fails (e.g. 404 Not Found, 500 Internal Server Error, Network Exception).
  5. These failure tests should assert that the function handles the error gracefully (e.g. throws a specific error, returns null, or retries) matching the source code's logic.
  6. Generate explicit edge case tests (null inputs, boundaries).
  7. Ensure tests isolate failure points: test network failure separately from data validation failure.`;

  if (language === SupportedLanguage.PYTHON) {
    return `${basePrompt}
    You receive a Python function. Output ONLY valid 'pytest' code.
    - Use 'unittest.mock.patch' (as decorator or context manager) to mock external libraries (requests, etc.).
    - Example: @patch('requests.get')
    - Define mock side_effects for exceptions (e.g. requests.exceptions.Timeout) and return_values for success.
    - Use 'def test_...():'.
    - No markdown, no imports (except 'import pytest', 'from unittest.mock import ...'), no explanations.
    - If code is invalid/incomplete, output '// Waiting for valid code...'.`;
  }
  
  if (language === SupportedLanguage.TYPESCRIPT) {
    return `${basePrompt}
    You receive a TypeScript function. Output ONLY valid 'Jest' test code using TypeScript syntax.
    - Use 'jest.spyOn' or 'global.fetch = jest.fn()'.
    - Setup mocks before calls: mockResolvedValue(...) for success, mockRejectedValue(...) for errors.
    - Test that the mock was called with expected arguments.
    - Use 'describe' and 'it' blocks.
    - Assume types are available or use 'any'/'as unknown' to bypass strict checks in this snippet.
    - No markdown, no imports (assume jest globals), no explanations.
    - If code is invalid/incomplete, output '// Waiting for valid code...'.`;
  }

  // Default JavaScript
  return `${basePrompt}
  You receive a JavaScript function. Output ONLY valid 'Jest' code.
  - Use 'jest.spyOn' or 'global.fetch = jest.fn()'.
  - Mock return values for both success ({ ok: true, json: () => ... }) and failure (reject/error status).
  - Verify mock calls and error handling logic.
  - Use 'describe' and 'it' blocks.
  - No markdown, no imports, no explanations.
  - If code is invalid/incomplete, output '// Waiting for valid code...'.`;
};

let aiClient: GoogleGenAI | null = null;

// Initialize client strictly with process.env.API_KEY as per system instructions
try {
  if (process.env.API_KEY) {
    aiClient = new GoogleGenAI({ apiKey: process.env.API_KEY });
  }
} catch (error) {
  console.error("Failed to initialize GoogleGenAI client", error);
}

export const generateUnitTest = async (sourceCode: string, language: SupportedLanguage = SupportedLanguage.JAVASCRIPT, modelTier: ModelTier = ModelTier.FLASH): Promise<string> => {
  if (!aiClient) {
    return "// Error: API Key not configured in environment.";
  }

  // Loosen the restriction slightly to allow user to delete code and see "Waiting..."
  if (!sourceCode || sourceCode.trim().length < 3) {
    return "// Waiting for valid code...";
  }

  try {
    const isThinking = modelTier === ModelTier.PRO;
    
    const config: any = {
      systemInstruction: getSystemInstruction(language),
    };

    if (isThinking) {
      // Thinking model configuration: High budget, no maxOutputTokens
      config.thinkingConfig = { thinkingBudget: 32768 };
    } else {
      // Standard/Lite model configuration
      config.temperature = 0.2;
      config.maxOutputTokens = 8192; // Increased to support comprehensive mocking scenarios
    }

    const response = await aiClient.models.generateContent({
      model: modelTier,
      contents: sourceCode,
      config: config
    });

    const text = response.text;
    if (!text) {
        return "// Error: No output from model.";
    }
    
    // Strip markdown code blocks if the model accidentally includes them despite instructions
    const cleanText = text.replace(/^```[a-z]*\n/i, '').replace(/\n```$/, '');
    
    return cleanText;
  } catch (error) {
    console.error("Gemini API Error:", error);
    return `// Error generating tests: ${error instanceof Error ? error.message : "Unknown error"}`;
  }
};

export const estimateTokens = (text: string): number => {
  // Rough estimation: 1 token ~= 4 characters
  return Math.ceil(text.length / 4);
}
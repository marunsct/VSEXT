# eyAgent VS Code Extension – Guided Usage Instructions

Welcome to eyAgent! This extension brings Copilot-like AI coding assistance to VS Code using GPT-4.0. Below are the key features and how to use them:

## 1. Setup
- **Set your GPT-4 API Key:**
  - Open the Command Palette (`Ctrl+Shift+P` or `Cmd+Shift+P` on Mac).
  - Run `eyAgent: Set GPT-4 API Key` and enter your OpenAI GPT-4 API key.

## 2. Core Features
- **Inline Code Suggestions (Ghost Text):**
  - As you type, eyAgent can suggest code completions inline, similar to Copilot.
  - Enable/disable agent mode with `eyAgent: Toggle Agent Mode`.
  - Suggestions appear in the status bar and as ghost text.

- **Chat/Ask (Command Palette):**
  - Run `eyAgent: Ask GPT-4` to ask coding questions or get help.
  - Answers appear in the output panel.

- **Copilot-like Chat Panel:**
  - Run `eyAgent: Open Agent Panel` to open a side chat panel (UI similar to Copilot).
  - Type questions and get answers in a conversational format.

- **Explain Code:**
  - Select code, then run `eyAgent: Explain Code` to get a natural language explanation.

- **Refactor Code:**
  - Select code, then run `eyAgent: Refactor Code` for refactoring suggestions and explanations.

- **Generate Documentation:**
  - Select code, then run `eyAgent: Generate Documentation` to get doc comments.

- **Explain Error:**
  - Select an error message, then run `eyAgent: Explain Error` for a fix and explanation.

- **Generate Unit Tests:**
  - Select code, then run `eyAgent: Generate Unit Test` to get test code suggestions.

- **Context-Aware Chat:**
  - Run `eyAgent: Chat with Context` for a chat that uses all open files as context.
  - Use `eyAgent: Clear Chat History` to reset the chat.

- **Insert Suggestion at Cursor:**
  - Run `eyAgent: Insert Suggestion at Cursor` to insert a GPT-4 suggestion at your cursor.

## 3. Security & Privacy
- Your API key is stored securely using VS Code's SecretStorage.
- All logs are kept locally in your global storage folder (`eyAgent.log`).
- No data is sent to any server except OpenAI's API.

## 4. Agent Mode vs. GitHub Copilot
- **eyAgent Agent Mode** provides:
  - Inline code suggestions as you type (ghost text/status bar).
  - Auto-suggestions on document changes.
  - Copilot-like chat panel and command palette chat.
  - All Copilot core features: explain, refactor, doc, error, tests, context chat, and more.
- **Limitations:**
  - eyAgent does not support Copilot's cloud-based team features, telemetry, or advanced multi-user workflows.
  - All AI completions are powered by your own GPT-4 API key (no built-in models).

## 5. Troubleshooting
- If you see no suggestions, ensure agent mode is enabled and your API key is set.
- For errors, check the `eyAgent.log` file in your VS Code global storage folder.

**Enjoy coding with eyAgent!**

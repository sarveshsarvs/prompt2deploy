# prompt2deploy

`prompt2deploy` is a small React + Express app that turns a natural-language prompt into a starter project bundle.

The user writes a prompt in the UI, the backend reshapes that prompt for the model, the model returns a strict JSON file manifest, and the frontend lets the user preview and download the generated files as a zip.

## How it works

1. The frontend sends only the user's prompt to `/api/generate`.
2. The backend adds structure and stack-specific guidance before calling your model.
3. The model is forced toward a JSON response with `projectName`, `summary`, and `files`.
4. The backend validates and normalizes the file list.
5. The frontend previews the files and creates a downloadable zip in the browser.

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create `.env` from `.env.example` and add your provider key and model:

```bash
AI_API_KEY=your-provider-api-key
AI_MODEL=your-model-name
AI_BASE_URL=https://openrouter.ai/api/v1/chat/completions  or https://api.groq.com/openai/v1
```

3. Start the app:

```bash
npm run dev
```

4. Open `http://localhost:5173`.

## Notes

- The API key stays on the backend. The browser never asks the user for it.
- The backend is written against an OpenAI-compatible chat completions API, so you can point it at providers that expose that format.
- If you use a weaker or free model, the backend guidance and JSON cleanup help keep the output predictable.

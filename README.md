# prompt2deploy

`prompt2deploy` is a full-stack starter app that combines:

- a React frontend
- an Express backend
- local email/password authentication with hashed passwords
- AI-powered project generation using the Groq API

Users register first, log in with their credentials, and then enter a prompt to generate a proposed project structure. The app displays:

- recommended dependencies
- generated folders and files
- starter code for each generated file

## Features

- Email/password registration and login
- Password hashing with `bcryptjs`
- User data stored in a backend JSON file
- React frontend with a fluid, responsive UI
- Prompt-based project generation using Groq
- Dependency recommendations for generated projects
- Click-to-preview generated file contents
- Backend-served production build support

## Tech Stack

### Frontend

- React
- Vite
- CSS

### Backend

- Node.js
- Express
- bcryptjs
- dotenv

### AI Integration

- Groq Chat Completions API
- Model default: `openai/gpt-oss-20b`

## Project Structure

```text
prompt2deploy/
├─ server/
│  ├─ index.js
│  └─ users.json
├─ src/
│  ├─ App.jsx
│  ├─ main.jsx
│  └─ styles.css
├─ .env.example
├─ .gitignore
├─ index.html
├─ package.json
├─ package-lock.json
├─ README.md
└─ vite.config.js
```

## How It Works

### 1. Registration

New users must register before first login.

- The frontend sends `email` and `password` to `POST /api/register`
- The backend hashes the password using `bcryptjs`
- The user record is saved to `server/users.json`

### 2. Login

- The frontend sends credentials to `POST /api/login`
- The backend checks the email in `server/users.json`
- The hashed password is verified with `bcrypt.compare`
- On success, the frontend stores the signed-in user in `localStorage`

### 3. Prompt-Based Generation

After login:

- the user enters a prompt
- the frontend sends it to `POST /api/generate`
- the backend calls the Groq API
- the response is parsed into a normalized project plan
- the UI renders dependencies, file tree, and file contents

## Environment Variables

Create a `.env` file in the project root:

```env
GROQ_API_KEY=your_groq_api_key_here
GROQ_MODEL=openai/gpt-oss-20b
```

### Notes

- `.env.example` is safe to commit
- `.env` should never be committed
- `GROQ_API_KEY` must stay on the backend only

## Installation

### 1. Clone the repository

```powershell
git clone https://github.com/sarveshsarvs/prompt2deploy.git
cd prompt2deploy
```

### 2. Install dependencies

```powershell
npm.cmd install
```

### 3. Add environment variables

Create `.env` in the project root and add your Groq key.

### 4. Start the app

```powershell
npm.cmd run dev
```

## Available Scripts

### Start frontend + backend in development

```powershell
npm.cmd run dev
```

Runs:

- Express backend on `http://localhost:4000`
- Vite frontend on `http://localhost:5173`

### Start backend only

```powershell
npm.cmd run server
```

### Start frontend only

```powershell
npm.cmd run client
```

### Production build

```powershell
npm.cmd run build
```

### Preview production build

```powershell
npm.cmd run preview
```

## API Endpoints

### `POST /api/register`

Registers a new user.

Request body:

```json
{
  "email": "user@example.com",
  "password": "secret123"
}
```

Example response:

```json
{
  "message": "Registration successful."
}
```

### `POST /api/login`

Logs in an existing user.

Request body:

```json
{
  "email": "user@example.com",
  "password": "secret123"
}
```

Example response:

```json
{
  "message": "Login successful.",
  "user": {
    "email": "user@example.com",
    "createdAt": "2026-04-19T06:51:36.040Z"
  }
}
```

### `POST /api/generate`

Generates a project plan from a prompt.

Request body:

```json
{
  "prompt": "Build a simple login page"
}
```

Example response shape:

```json
{
  "message": "Project structure generated successfully.",
  "model": "openai/gpt-oss-20b",
  "projectPlan": {
    "projectName": "Login Page Starter",
    "summary": "A minimal React + Vite login page starter.",
    "dependencies": [
      {
        "name": "react",
        "version": "^18.2.0",
        "kind": "dependency",
        "reason": "Component rendering"
      }
    ],
    "entries": [
      {
        "path": "src",
        "type": "folder",
        "description": "Source directory",
        "content": null
      },
      {
        "path": "src/App.jsx",
        "type": "file",
        "description": "Main application component",
        "content": "export default function App() { return <div />; }"
      }
    ]
  }
}
```

## Authentication Storage

User data is stored in:

```text
server/users.json
```

Each user record contains:

- `email`
- `passwordHash`
- `createdAt`

Passwords are never stored in plain text.

## Groq Integration Notes

The app uses Groq from the backend instead of the frontend so the API key remains private.

Current flow:

1. frontend sends the prompt to backend
2. backend calls Groq
3. backend parses the returned JSON
4. frontend displays the result

If Groq returns malformed JSON for very large generations, a future improvement would be:

1. generate structure first
2. generate file contents one file at a time

That would be slower, but more reliable for bigger projects.

## Security Notes

- Keep `.env` private
- Rotate API keys if they are ever exposed
- Do not commit production secrets
- `server/users.json` contains local auth data and should be handled carefully

## Known Limitations

- Generated code is a starter output, not guaranteed production-ready
- Groq output quality depends on prompt quality
- Large prompts may return incomplete or inconsistent code
- File generation currently previews code in the UI; it does not yet write generated files to disk automatically

## Suggested Next Improvements

- Export generated files to a real project folder
- Add syntax highlighting in the code preview
- Generate code file-by-file for improved reliability
- Add JWT/session-based authentication
- Move user storage from JSON file to a database
- Add prompt history per user

## Troubleshooting

### `Missing GROQ_API_KEY on the backend.`

Make sure:

- `.env` exists in the project root
- it contains a valid `GROQ_API_KEY`
- you restarted the backend after editing `.env`

Restart with:

```powershell
Stop-Process -Name node -Force
npm.cmd run dev
```

### `No configured push destination`

This means the local git repo has no remote yet. Add one:

```powershell
git remote add origin https://github.com/sarveshsarvs/prompt2deploy.git
git push -u origin main
```

### `npm` blocked in PowerShell

If `npm` is blocked by PowerShell execution policy, use:

```powershell
npm.cmd install
npm.cmd run dev
```

## License

No license has been added yet.

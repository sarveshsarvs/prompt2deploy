import cors from "cors";
import express from "express";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config({ path: path.join(process.cwd(), ".env") });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const usersFilePath = path.join(__dirname, "users.json");
const distPath = path.join(__dirname, "..", "dist");
const app = express();
const port = 4000;
const groqApiUrl = "https://api.groq.com/openai/v1/chat/completions";
const groqModel = process.env.GROQ_MODEL || "openai/gpt-oss-20b";

app.use(cors());
app.use(express.json());

async function ensureUsersFile() {
  try {
    await fs.access(usersFilePath);
  } catch {
    await fs.writeFile(usersFilePath, JSON.stringify([], null, 2));
  }
}

async function readUsers() {
  await ensureUsersFile();
  const fileContents = await fs.readFile(usersFilePath, "utf-8");
  return JSON.parse(fileContents);
}

async function writeUsers(users) {
  await fs.writeFile(usersFilePath, JSON.stringify(users, null, 2));
}

function sanitizeUser(user) {
  return {
    email: user.email,
    createdAt: user.createdAt,
  };
}

async function generateProjectPlan(prompt) {
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    throw new Error("Missing GROQ_API_KEY on the backend.");
  }

  const response = await fetch(groqApiUrl, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: groqModel,
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content:
            "You are a senior software architect. Return only raw JSON with no markdown fences. Build a practical starter project from the user's prompt. Include dependencies, folders, files, and concise starter code for each file. Never return a root folder like '/' or '.'.",
        },
        {
          role: "user",
          content:
            `Create a project plan for this prompt:\n\n${prompt}\n\n` +
            "Return exactly this JSON shape:\n" +
            "{\n" +
            '  "projectName": "string",\n' +
            '  "summary": "string",\n' +
            '  "dependencies": [\n' +
            '    { "name": "string", "version": "string", "kind": "dependency|devDependency", "reason": "string" }\n' +
            "  ],\n" +
            '  "entries": [\n' +
            '    { "path": "string", "type": "folder|file", "description": "string", "content": "string or null" }\n' +
            "  ]\n" +
            "}\n\n" +
            "Rules:\n" +
            "- Valid JSON only.\n" +
            "- No markdown.\n" +
            "- Folders must have content set to null.\n" +
            "- Files must have code in content.\n" +
            "- Keep the project reasonably small.\n" +
            "- Prefer React + Vite for frontend prompts.\n",
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Groq request failed: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error("Groq returned an empty response.");
  }

  return normalizeProjectPlan(parseGroqJson(content));
}

function isEnvMissing(error) {
  return error.message.includes("GROQ_API_KEY");
}

function parseGroqJson(content) {
  const trimmed = content.trim();

  try {
    return JSON.parse(trimmed);
  } catch {
    const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fencedMatch) {
      return JSON.parse(fencedMatch[1].trim());
    }

    const firstBrace = trimmed.indexOf("{");
    const lastBrace = trimmed.lastIndexOf("}");

    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
    }

    throw new Error("Groq returned invalid JSON.");
  }
}

function normalizeProjectPlan(projectPlan) {
  const dependencies = Array.isArray(projectPlan.dependencies)
    ? projectPlan.dependencies
        .filter((item) => item && item.name)
        .map((item) => ({
          name: String(item.name),
          version: String(item.version || "latest"),
          kind: item.kind === "devDependency" ? "devDependency" : "dependency",
          reason: String(item.reason || "Recommended by generator."),
        }))
    : [];

  const entries = Array.isArray(projectPlan.entries)
    ? projectPlan.entries
        .filter((item) => item && item.path && item.path !== "/" && item.path !== ".")
        .map((item) => ({
          path: String(item.path).replace(/^\/+/, "").replace(/\/{2,}/g, "/"),
          type: item.type === "folder" ? "folder" : "file",
          description: String(item.description || ""),
          content: item.type === "folder" ? null : String(item.content || ""),
        }))
    : [];

  return {
    projectName: String(projectPlan.projectName || "Generated Project"),
    summary: String(projectPlan.summary || "Generated starter project."),
    dependencies,
    entries,
  };
}

app.post("/api/register", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required." });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const users = await readUsers();
    const existingUser = users.find((user) => user.email === normalizedEmail);

    if (existingUser) {
      return res.status(409).json({ message: "User already exists. Please sign in." });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const newUser = {
      email: normalizedEmail,
      passwordHash,
      createdAt: new Date().toISOString(),
    };

    users.push(newUser);
    await writeUsers(users);

    return res.status(201).json({ message: "Registration successful." });
  } catch (error) {
    return res.status(500).json({ message: "Unable to register user." });
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required." });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const users = await readUsers();
    const existingUser = users.find((user) => user.email === normalizedEmail);

    if (!existingUser) {
      return res.status(401).json({ message: "Invalid email or password." });
    }

    const passwordMatches = await bcrypt.compare(password, existingUser.passwordHash);

    if (!passwordMatches) {
      return res.status(401).json({ message: "Invalid email or password." });
    }

    return res.status(200).json({
      message: "Login successful.",
      user: sanitizeUser(existingUser),
    });
  } catch (error) {
    return res.status(500).json({ message: "Unable to login." });
  }
});

app.post("/api/generate", async (req, res) => {
  try {
    const { prompt } = req.body;

    if (!prompt || !String(prompt).trim()) {
      return res.status(400).json({ message: "A prompt is required." });
    }

    const projectPlan = await generateProjectPlan(String(prompt).trim());

    return res.status(200).json({
      message: "Project structure generated successfully.",
      model: groqModel,
      projectPlan,
    });
  } catch (error) {
    const statusCode = isEnvMissing(error) ? 500 : 502;
    return res.status(statusCode).json({
      message: error.message || "Unable to generate the project structure.",
    });
  }
});

app.use(express.static(distPath));

app.get("*", async (req, res, next) => {
  if (req.path.startsWith("/api")) {
    return next();
  }

  try {
    await fs.access(path.join(distPath, "index.html"));
    return res.sendFile(path.join(distPath, "index.html"));
  } catch {
    return res
      .status(404)
      .send("Frontend not built yet. Run `npm.cmd run build` first.");
  }
});

app.listen(port, async () => {
  await ensureUsersFile();
  console.log(`prompt2deploy backend running on http://localhost:${port}`);
});

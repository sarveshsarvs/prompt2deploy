import cors from "cors";
import express from "express";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import fs from "fs/promises";
import JSZip from "jszip";
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
  const candidates = [];
  const trimmed = content.trim();

  if (!trimmed) {
    throw new Error("Groq returned an empty response.");
  }

  candidates.push(trimmed);

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch) {
    candidates.push(fencedMatch[1].trim());
  }

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    candidates.push(trimmed.slice(firstBrace, lastBrace + 1));
  }

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      const repaired = repairJsonString(candidate);
      if (repaired) {
        return JSON.parse(repaired);
      }
    }
  }

  throw new Error(
    "Groq returned malformed JSON. Try generating again or use a shorter prompt."
  );
}

function repairJsonString(input) {
  let candidate = input;

  if (!candidate) {
    return "";
  }

  candidate = candidate.replace(/^\uFEFF/, "");
  candidate = candidate.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
  candidate = candidate.replace(/,\s*([}\]])/g, "$1");

  const firstBrace = candidate.indexOf("{");
  const lastBrace = candidate.lastIndexOf("}");

  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    candidate = candidate.slice(firstBrace, lastBrace + 1);
  }

  const openCurly = (candidate.match(/{/g) || []).length;
  const closeCurly = (candidate.match(/}/g) || []).length;
  const openSquare = (candidate.match(/\[/g) || []).length;
  const closeSquare = (candidate.match(/]/g) || []).length;

  if (openSquare > closeSquare) {
    candidate += "]".repeat(openSquare - closeSquare);
  }

  if (openCurly > closeCurly) {
    candidate += "}".repeat(openCurly - closeCurly);
  }

  try {
    JSON.parse(candidate);
    return candidate;
  } catch {
    return "";
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

function sanitizeZipPath(filePath) {
  return String(filePath)
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/\.\.(\/|\\)/g, "")
    .replace(/\/{2,}/g, "/")
    .trim();
}

async function createProjectZip(projectPlan) {
  const zip = new JSZip();
  const entries = Array.isArray(projectPlan.entries) ? projectPlan.entries : [];

  for (const entry of entries) {
    const normalizedPath = sanitizeZipPath(entry.path);

    if (!normalizedPath) {
      continue;
    }

    if (entry.type === "folder") {
      zip.folder(normalizedPath);
      continue;
    }

    zip.file(normalizedPath, String(entry.content || ""));
  }

  const dependencyLines = (projectPlan.dependencies || []).map(
    (dependency) =>
      `- ${dependency.name}@${dependency.version} (${dependency.kind}): ${dependency.reason}`
  );

  const exportReadme = [
    `# ${projectPlan.projectName || "Generated Project"}`,
    "",
    projectPlan.summary || "Generated by prompt2deploy.",
    "",
    "## Recommended Dependencies",
    ...(dependencyLines.length
      ? dependencyLines
      : ["- No extra dependencies recommended."]),
  ].join("\n");

  if (!entries.some((entry) => sanitizeZipPath(entry.path).toLowerCase() === "readme.md")) {
    zip.file("README.generated.md", exportReadme);
  }

  return zip.generateAsync({ type: "nodebuffer" });
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

app.post("/api/export", async (req, res) => {
  try {
    const { projectPlan } = req.body;

    if (!projectPlan || !Array.isArray(projectPlan.entries)) {
      return res.status(400).json({ message: "A generated project plan is required." });
    }

    const normalizedPlan = normalizeProjectPlan(projectPlan);
    const zipBuffer = await createProjectZip(normalizedPlan);
    const safeProjectName = String(normalizedPlan.projectName || "generated-project")
      .toLowerCase()
      .replace(/[^a-z0-9-_]+/g, "-")
      .replace(/^-+|-+$/g, "") || "generated-project";

    res.setHeader("Content-Type", "application/zip");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${safeProjectName}.zip"`
    );

    return res.status(200).send(zipBuffer);
  } catch (error) {
    return res.status(500).json({
      message: "Unable to export the generated project.",
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

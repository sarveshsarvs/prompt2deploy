import { useEffect, useState } from "react";

const storageKey = "prompt2deploy-user";

const initialForm = {
  email: "",
  password: "",
};

function normalizeEntries(entries) {
  return [...entries]
    .filter((entry) => entry.path && entry.path !== "/" && entry.path !== ".")
    .sort((left, right) => {
    const leftDepth = left.path.split("/").length;
    const rightDepth = right.path.split("/").length;

    if (leftDepth !== rightDepth) {
      return leftDepth - rightDepth;
    }

    if (left.type !== right.type) {
      return left.type === "folder" ? -1 : 1;
    }

    return left.path.localeCompare(right.path);
    });
}

function getDepth(path) {
  return path.split("/").length - 1;
}

function getLabel(path, type) {
  const segments = path.split("/");
  const name = segments[segments.length - 1];
  return type === "folder" ? `${name}/` : name;
}

function getFileEntries(entries) {
  return entries.filter((entry) => entry.type === "file");
}

function getLanguageFromPath(path) {
  const extension = path.split(".").pop();

  switch (extension) {
    case "js":
    case "jsx":
      return "javascript";
    case "ts":
    case "tsx":
      return "typescript";
    case "css":
      return "css";
    case "html":
      return "html";
    case "json":
      return "json";
    case "md":
      return "markdown";
    default:
      return "text";
  }
}

function App() {
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState(initialForm);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [user, setUser] = useState(null);
  const [projectPlan, setProjectPlan] = useState(null);
  const [generationError, setGenerationError] = useState("");
  const [generationLoading, setGenerationLoading] = useState(false);
  const [generatedWithModel, setGeneratedWithModel] = useState("");
  const [selectedFilePath, setSelectedFilePath] = useState("");
  const [downloadLoading, setDownloadLoading] = useState(false);

  useEffect(() => {
    const savedUser = window.localStorage.getItem(storageKey);
    if (savedUser) {
      setUser(JSON.parse(savedUser));
    }
  }, []);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  };

  const resetFeedback = () => {
    setMessage("");
    setError("");
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    resetFeedback();
    setLoading(true);

    try {
      const endpoint = mode === "register" ? "/api/register" : "/api/login";
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(form),
      });

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.message || "Something went wrong.");
      }

      if (mode === "register") {
        setMessage("Registration complete. You can sign in now.");
        setMode("login");
        setForm(initialForm);
      } else {
        window.localStorage.setItem(storageKey, JSON.stringify(payload.user));
        setUser(payload.user);
        setForm(initialForm);
      }
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    window.localStorage.removeItem(storageKey);
    setUser(null);
    setPrompt("");
    setProjectPlan(null);
    setGenerationError("");
    setGeneratedWithModel("");
    setSelectedFilePath("");
    setDownloadLoading(false);
    resetFeedback();
    setMode("login");
  };

  const handleGenerate = async () => {
    setGenerationError("");
    setGenerationLoading(true);

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ prompt }),
      });

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.message || "Unable to generate files.");
      }

      setProjectPlan(payload.projectPlan);
      setGeneratedWithModel(payload.model);
      const generatedFiles = getFileEntries(normalizeEntries(payload.projectPlan.entries));
      setSelectedFilePath(generatedFiles[0]?.path || "");
    } catch (generationRequestError) {
      setGenerationError(generationRequestError.message);
    } finally {
      setGenerationLoading(false);
    }
  };

  const handleDownload = async () => {
    if (!projectPlan) {
      return;
    }

    setGenerationError("");
    setDownloadLoading(true);

    try {
      const response = await fetch("/api/export", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ projectPlan }),
      });

      if (!response.ok) {
        const payload = await response.json();
        throw new Error(payload.message || "Unable to download project.");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      const projectName = (projectPlan.projectName || "generated-project")
        .toLowerCase()
        .replace(/[^a-z0-9-_]+/g, "-")
        .replace(/^-+|-+$/g, "");

      link.href = url;
      link.download = `${projectName || "generated-project"}.zip`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (downloadError) {
      setGenerationError(downloadError.message);
    } finally {
      setDownloadLoading(false);
    }
  };

  if (user) {
    const entries = projectPlan ? normalizeEntries(projectPlan.entries) : [];
    const files = getFileEntries(entries);
    const selectedFile =
      files.find((item) => item.path === selectedFilePath) || files[0] || null;

    return (
      <main className="workspace-shell">
        <section className="workspace-topbar">
          <div>
            <p className="eyebrow">Signed in</p>
            <h1>prompt2deploy</h1>
            <p className="subtle">Welcome back, {user.email}</p>
          </div>
          <button className="ghost-button" onClick={handleLogout}>
            Logout
          </button>
        </section>

        <section className="workspace-grid">
          <div className="panel panel-prompt">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Prompt input</p>
                <h2>Describe the project you want to generate</h2>
              </div>
              <span className="pill">
                {projectPlan ? "Structure ready" : "Groq generator"}
              </span>
            </div>

            <textarea
              className="prompt-box"
              placeholder="Example: Build a SaaS landing page with dashboard, auth, and billing settings..."
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
            />

            {generationError ? (
              <p className="feedback error">{generationError}</p>
            ) : null}

            <div className="prompt-footer">
              <p>
                Generate a structured starter project from your prompt and render
                the planned folders, dependency list, and generated file code on
                the right.
              </p>
              <button
                className="primary-button"
                type="button"
                onClick={handleGenerate}
                disabled={generationLoading || !prompt.trim()}
              >
                {generationLoading ? "Generating..." : "Generate Files"}
              </button>
            </div>
          </div>

          <div className="panel panel-files">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Project structure</p>
                <h2>Generated files preview</h2>
              </div>
            </div>

            {projectPlan ? (
              <>
                <div className="generated-meta">
                  <strong>{projectPlan.projectName}</strong>
                  <span>{projectPlan.summary}</span>
                  {generatedWithModel ? (
                    <span className="model-badge">{generatedWithModel}</span>
                  ) : null}
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={handleDownload}
                    disabled={downloadLoading}
                  >
                    {downloadLoading ? "Preparing ZIP..." : "Download ZIP"}
                  </button>
                </div>

                <div className="dependency-card">
                  <div className="dependency-header">
                    <h3>Recommended packages</h3>
                    <span>{projectPlan.dependencies.length} packages</span>
                  </div>
                  <div className="dependency-list">
                    {projectPlan.dependencies.map((dependency) => (
                      <div
                        className="dependency-row"
                        key={`${dependency.name}-${dependency.kind}`}
                      >
                        <div className="dependency-main">
                          <strong>{dependency.name}</strong>
                          <span>{dependency.version}</span>
                        </div>
                        <small>
                          {dependency.kind} • {dependency.reason}
                        </small>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="file-tree">
                  {entries.map((item) => (
                    <button
                      className={`file-row ${item.type} ${selectedFile?.path === item.path ? "selected" : ""}`}
                      key={`${item.path}-${item.type}`}
                      style={{ paddingLeft: `${getDepth(item.path) * 20 + 16}px` }}
                      type="button"
                      onClick={() => {
                        if (item.type === "file") {
                          setSelectedFilePath(item.path);
                        }
                      }}
                      disabled={item.type !== "file"}
                    >
                      <span className="file-icon">
                        {item.type === "folder" ? ">" : "-"}
                      </span>
                      <div className="file-text">
                        <span>{getLabel(item.path, item.type)}</span>
                        <small>{item.description}</small>
                      </div>
                    </button>
                  ))}
                </div>

                <div className="code-panel">
                  <div className="code-panel-header">
                    <div>
                      <p className="eyebrow">Generated code</p>
                      <h3>{selectedFile ? selectedFile.path : "Select a file"}</h3>
                    </div>
                    {selectedFile ? (
                      <span className="model-badge">
                        {getLanguageFromPath(selectedFile.path)}
                      </span>
                    ) : null}
                  </div>

                  {selectedFile ? (
                    <pre className="code-block">
                      <code>{selectedFile.content || "// No content generated."}</code>
                    </pre>
                  ) : (
                    <div className="empty-state compact">
                      <p>
                        Click any generated file to inspect the code content
                        returned by Groq.
                      </p>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="empty-state">
                <p className="eyebrow">Waiting for prompt</p>
                <h3>No generated structure yet</h3>
                <p>
                  Enter a prompt and click <strong>Generate Files</strong> to fill
                  this panel with a proposed project tree, dependencies, and file
                  code from Groq.
                </p>
              </div>
            )}
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="auth-shell">
      <section className="hero-panel">
        <p className="badge">AI project launcher</p>
        <h1>prompt2deploy</h1>
        <p className="hero-copy">
          Sign in to start shaping prompts into structured project outputs. New
          users need to register once before their first login.
        </p>

        <div className="feature-grid">
          <article>
            <h3>Secure access</h3>
            <p>Passwords are hashed in the backend before they are saved.</p>
          </article>
          <article>
            <h3>Fluid workflow</h3>
            <p>A responsive two-stage experience for auth and prompt entry.</p>
          </article>
          <article>
            <h3>Project-ready</h3>
            <p>The next page already includes a structured file-output panel.</p>
          </article>
        </div>
      </section>

      <section className="auth-panel">
        <div className="auth-card">
          <div className="tabs">
            <button
              className={mode === "login" ? "tab active" : "tab"}
              onClick={() => {
                setMode("login");
                resetFeedback();
              }}
              type="button"
            >
              Sign in
            </button>
            <button
              className={mode === "register" ? "tab active" : "tab"}
              onClick={() => {
                setMode("register");
                resetFeedback();
              }}
              type="button"
            >
              Register
            </button>
          </div>

          <div className="auth-copy">
            <p className="eyebrow">
              {mode === "register" ? "Create your account" : "Welcome back"}
            </p>
            <h2>
              {mode === "register"
                ? "Register before first sign in"
                : "Login with email and password"}
            </h2>
          </div>

          <form className="auth-form" onSubmit={handleSubmit}>
            <label>
              Email
              <input
                name="email"
                type="email"
                placeholder="you@example.com"
                value={form.email}
                onChange={handleChange}
                required
              />
            </label>

            <label>
              Password
              <input
                name="password"
                type="password"
                placeholder="Enter your password"
                value={form.password}
                onChange={handleChange}
                required
                minLength={6}
              />
            </label>

            {message ? <p className="feedback success">{message}</p> : null}
            {error ? <p className="feedback error">{error}</p> : null}

            <button className="primary-button" disabled={loading} type="submit">
              {loading
                ? "Please wait..."
                : mode === "register"
                  ? "Create account"
                  : "Sign in"}
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}

export default App;

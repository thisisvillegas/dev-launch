import { Project, ProjectScript } from "../types/project";

// Directories to skip during scanning
const DEFAULT_EXCLUSIONS = [
  'node_modules',
  '.git',
  '.next',
  'dist',
  'build',
  'coverage',
  '__pycache__',
  '.cache',
  '.turbo',
  'out',
  'target',        // Rust build output
  '.venv',         // Python virtualenv
  'venv',
  'vendor',        // Go vendor
];

export interface ScannerOptions {
  maxDepth: number;
  excludePatterns: string[];
  followSymlinks: boolean;
}

const DEFAULT_OPTIONS: ScannerOptions = {
  maxDepth: 2,
  excludePatterns: DEFAULT_EXCLUSIONS,
  followSymlinks: false,
};

/**
 * Check if a path should be excluded from scanning
 */
function shouldExclude(name: string, excludePatterns: string[]): boolean {
  // Skip hidden directories (start with .)
  if (name.startsWith('.')) {
    return true;
  }

  // Skip directories matching exclusion patterns
  return excludePatterns.some(pattern => {
    // Simple glob support: *.ext or exact match
    if (pattern.startsWith('*')) {
      return name.endsWith(pattern.slice(1));
    }
    return name === pattern;
  });
}

/**
 * Check if a path is a symlink
 */
async function isSymlink(path: string): Promise<boolean> {
  try {
    const { lstat } = await import("@tauri-apps/plugin-fs");
    const stat = await lstat(path);
    return stat.isSymlink;
  } catch {
    return false;
  }
}

/**
 * Recursively scan a directory for projects
 */
async function scanRecursive(
  currentPath: string,
  currentDepth: number,
  options: ScannerOptions,
  foundProjects: Project[]
): Promise<void> {
  // Stop if we've exceeded max depth
  if (currentDepth > options.maxDepth) {
    return;
  }

  try {
    const { readDir } = await import("@tauri-apps/plugin-fs");
    const entries = await readDir(currentPath);

    for (const entry of entries) {
      if (!entry.isDirectory) continue;

      const entryPath = `${currentPath}/${entry.name}`;

      // Skip excluded directories
      if (shouldExclude(entry.name, options.excludePatterns)) {
        continue;
      }

      // Skip symlinks if configured (prevents infinite loops)
      if (!options.followSymlinks && await isSymlink(entryPath)) {
        continue;
      }

      // Try to detect a project at this path
      const project = await detectProject(entryPath, entry.name);

      if (project) {
        foundProjects.push(project);
        // Note: We still continue scanning subdirectories even if this is a project
        // This allows finding nested projects (e.g., monorepos)
      }

      // Recurse into subdirectories
      await scanRecursive(entryPath, currentDepth + 1, options, foundProjects);
    }
  } catch (error) {
    console.error(`Failed to scan directory ${currentPath}:`, error);
  }
}

/**
 * Scan a directory for runnable projects
 * Detects Node.js, Python, Go, Rust, and Docker projects
 * Supports recursive scanning with configurable depth and exclusions
 */
export async function scanDirectoryForProjects(
  rootPath: string,
  options: Partial<ScannerOptions> = {}
): Promise<Project[]> {
  const mergedOptions: ScannerOptions = {
    ...DEFAULT_OPTIONS,
    ...options,
  };

  const projects: Project[] = [];

  try {
    // Start recursive scan from depth 0
    await scanRecursive(rootPath, 0, mergedOptions, projects);
  } catch (error) {
    console.error("Failed to scan directory:", error);
  }

  return projects;
}

async function detectProject(path: string, name: string): Promise<Project | null> {
  const { exists, readTextFile } = await import("@tauri-apps/plugin-fs");

  // Check for Node.js project
  const packageJsonPath = `${path}/package.json`;
  if (await exists(packageJsonPath)) {
    try {
      const content = await readTextFile(packageJsonPath);
      const pkg = JSON.parse(content);
      const scripts = extractNodeScripts(pkg.scripts || {});

      if (scripts.length > 0) {
        return {
          path,
          name: pkg.name || name,
          type: "node",
          scripts,
          status: "stopped",
          logs: [],
        };
      }
    } catch (e) {
      console.error("Failed to parse package.json:", e);
    }
  }

  // Check for Python project
  const pyprojectPath = `${path}/pyproject.toml`;
  const requirementsPath = `${path}/requirements.txt`;
  if (await exists(pyprojectPath) || await exists(requirementsPath)) {
    const scripts = await detectPythonScripts(path);
    if (scripts.length > 0) {
      return {
        path,
        name,
        type: "python",
        scripts,
        status: "stopped",
        logs: [],
      };
    }
  }

  // Check for Go project
  const goModPath = `${path}/go.mod`;
  if (await exists(goModPath)) {
    return {
      path,
      name,
      type: "go",
      scripts: [{ name: "run", command: "go run ." }],
      status: "stopped",
      logs: [],
    };
  }

  // Check for Rust project
  const cargoPath = `${path}/Cargo.toml`;
  if (await exists(cargoPath)) {
    return {
      path,
      name,
      type: "rust",
      scripts: [
        { name: "run", command: "cargo run" },
        { name: "watch", command: "cargo watch -x run" },
      ],
      status: "stopped",
      logs: [],
    };
  }

  // Check for Docker Compose
  const dockerComposePath = `${path}/docker-compose.yml`;
  const dockerComposePath2 = `${path}/docker-compose.yaml`;
  const composePath = `${path}/compose.yaml`;
  if (await exists(dockerComposePath) || await exists(dockerComposePath2) || await exists(composePath)) {
    return {
      path,
      name,
      type: "docker",
      scripts: [
        { name: "up", command: "docker compose up" },
        { name: "up -d", command: "docker compose up -d" },
      ],
      status: "stopped",
      logs: [],
    };
  }

  return null;
}

/**
 * Extract runnable scripts from package.json
 * Prioritize common dev scripts
 */
function extractNodeScripts(scripts: Record<string, string>): ProjectScript[] {
  const priority = ["dev", "start", "serve", "watch", "develop"];
  const result: ProjectScript[] = [];

  // Add priority scripts first
  for (const name of priority) {
    if (scripts[name]) {
      result.push({ name, command: `npm run ${name}` });
    }
  }

  // Add other scripts
  for (const [name] of Object.entries(scripts)) {
    if (!priority.includes(name) && !name.startsWith("pre") && !name.startsWith("post")) {
      // Skip build/test scripts unless explicitly named
      if (!["build", "test", "lint", "format", "typecheck"].includes(name)) {
        result.push({ name, command: `npm run ${name}` });
      }
    }
  }

  return result;
}

/**
 * Detect Python runnable scripts
 */
async function detectPythonScripts(path: string): Promise<ProjectScript[]> {
  const { exists } = await import("@tauri-apps/plugin-fs");
  const scripts: ProjectScript[] = [];

  // Check for common entry points
  if (await exists(`${path}/main.py`)) {
    scripts.push({ name: "main", command: "python main.py" });
  }

  if (await exists(`${path}/app.py`)) {
    scripts.push({ name: "app", command: "python app.py" });
  }

  if (await exists(`${path}/manage.py`)) {
    scripts.push({ name: "runserver", command: "python manage.py runserver" });
  }

  // Check for uvicorn/FastAPI
  if (await exists(`${path}/src/main.py`)) {
    scripts.push({ name: "uvicorn", command: "uvicorn src.main:app --reload" });
  }

  return scripts;
}

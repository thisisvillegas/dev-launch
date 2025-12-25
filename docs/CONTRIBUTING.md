# Contributing to DevLaunch

Thank you for your interest in contributing to DevLaunch! This guide will help you get started.

## Getting Started

### Prerequisites
- Node.js 18+ and npm
- Rust (via rustup)
- Git
- Basic knowledge of React, TypeScript, and Rust

### Setup
```bash
# Clone the repository
git clone <repository-url>
cd dev-launch

# Install dependencies
npm install

# Start development environment
npm run tauri dev
```

## Development Workflow

### 1. Create a Branch
```bash
git checkout -b feature/your-feature-name
```

Use branch naming conventions:
- `feature/` - New features
- `fix/` - Bug fixes
- `docs/` - Documentation updates
- `refactor/` - Code refactoring

### 2. Make Changes
- Write clean, readable code
- Follow existing code style and conventions
- Add comments for complex logic
- Update documentation as needed

### 3. Test Your Changes
```bash
# Run development build
npm run tauri dev

# Test in production mode
npm run tauri build
```

Verify:
- UI changes render correctly
- Features work as expected
- No console errors
- Tauri builds successfully

### 4. Commit
```bash
git add .
git commit -m "Brief description of changes"
```

Commit message format:
```
<type>: <subject>

<body (optional)>
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

Example:
```
feat: add preset management for project groups

Allows saving and loading groups of projects to start
them all with one click.
```

### 5. Push and Create Pull Request
```bash
git push origin feature/your-feature-name
```

Then create a PR on GitHub with:
- Clear title and description
- Screenshots/GIFs for UI changes
- Reference related issues

## Code Style Guidelines

### TypeScript (Frontend)
- Use TypeScript for all new code
- Define proper types and interfaces
- Avoid `any` type when possible

### Rust (Backend)
- Use idiomatic Rust patterns
- Handle errors with `Result<T, E>`
- Keep Tauri commands focused and simple

### React
- Use functional components with hooks
- Keep components small and focused
- Extract reusable logic into custom hooks
- Use meaningful component and prop names

### Formatting
- 2-space indentation
- Single quotes for strings
- Semicolons at line endings
- Trailing commas in multi-line objects/arrays

Run Prettier before committing (if configured).

### File Organization
```
src/components/NewFeature.tsx      # React component
src/hooks/useNewFeature.ts         # Custom hook
src/lib/newFeatureUtils.ts         # Utility functions
src-tauri/src/new_feature.rs       # Rust module
```

## Project-Specific Guidelines

### Adding a New Tab
1. Create component in `src/components/TabName.tsx`
2. Add tab icon import from Lucide React
3. Add `TabButton` in `App.tsx`
4. Add tab content in the tab content section
5. Update documentation

### Adding a Tauri Command
1. Create function in appropriate `src-tauri/src/*.rs` file
2. Add `#[tauri::command]` attribute
3. Register in `invoke_handler` in `lib.rs`
4. Call from frontend via `invoke("command_name", { args })`

### Modifying Tray Behavior
- Changes to tray in `lib.rs` require app restart
- Test left-click toggle and right-click menu
- Ensure quit properly kills all processes

### Working with System APIs
- Always check platform compatibility (macOS, Windows, Linux)
- Provide fallbacks for unavailable features
- Test on multiple operating systems if possible

## Documentation

Update documentation when:
- Adding new features
- Changing architecture
- Modifying APIs or interfaces
- Fixing non-obvious bugs

Documentation locations:
- `/docs/` - General documentation
- `/docs/research/` - Research notes and findings
- Component comments - Inline code documentation

## Testing

Currently, formal testing is minimal. Contributions to testing infrastructure are welcome!

Manual testing checklist:
- [ ] Feature works in dev mode (`npm run tauri dev`)
- [ ] Feature works in production build
- [ ] No console errors or warnings
- [ ] UI is responsive and accessible
- [ ] Tray icon and menu work correctly
- [ ] Config persists across restarts
- [ ] Cross-platform compatibility (if applicable)

## Reporting Issues

When filing an issue, include:
- DevLaunch version
- Operating system and version
- Steps to reproduce
- Expected vs actual behavior
- Screenshots/logs (if applicable)

## Questions?

- Check existing documentation in `/docs/`
- Review closed issues and PRs for similar work
- Open a discussion issue for architectural questions

---

We appreciate your contributions to making DevLaunch better!

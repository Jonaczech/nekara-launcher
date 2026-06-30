# ADR 0001: Launcher Technology Stack

## Status

Accepted

## Date

2026-06-30

## Context

Nekara Launcher is a custom desktop application for preparing and launching one
supported Minecraft configuration: Nekara.

The launcher needs access to desktop capabilities such as filesystem
management, process spawning, logging, secure token storage, downloads,
integrity checks, and platform-specific application directories.

The initial target platform is Windows, but the architecture should not
unnecessarily prevent future Linux or macOS support.

The launcher UI should remain focused on a simple player flow:

```text
Start launcher -> sign in -> wait for check or installation -> press Play
```

## Decision

Use the following stack:

- Tauri 2 for the desktop application shell and native integration.
- Rust for trusted backend/system operations.
- React for the user interface.
- TypeScript for typed frontend application code.
- Vite for frontend development and bundling.
- pnpm for JavaScript package management.

## Rationale

Tauri 2 is a strong fit because it provides a small desktop shell, a Rust
backend, and a clear command boundary between UI code and privileged system
operations.

Rust is a good fit for:

- filesystem operations,
- downloads and integrity checks,
- process execution and monitoring,
- explicit error modeling,
- cross-platform system boundaries,
- future security-sensitive token and configuration handling.

React and TypeScript provide a productive UI layer while keeping system logic
out of frontend components.

Vite and pnpm provide a fast, common frontend toolchain with predictable package
management.

## Alternatives Considered

### Electron

Electron has a mature ecosystem and broad desktop adoption. It was not chosen
because it usually ships a larger runtime footprint and encourages a Node.js
backend model. Nekara Launcher benefits from a smaller native shell and a Rust
system layer.

### .NET Desktop

.NET can produce robust Windows desktop applications, but it is less aligned
with the preferred cross-platform frontend stack and would move the project
away from the requested Tauri/React direction.

### JavaFX

JavaFX would reuse the Java ecosystem but is not ideal for a modern custom
launcher UI and would add friction around packaging, native integration, and
long-term frontend iteration.

### Flutter Desktop

Flutter can build cross-platform desktop UIs, but it would introduce a separate
language and UI ecosystem. The project currently benefits more from React,
TypeScript, and Rust.

## Consequences

- The project requires a working Rust toolchain for desktop build and backend
  verification.
- Frontend code must not perform privileged launcher operations directly.
- Tauri command APIs should be typed and treated as the application boundary.
- Build and test commands must cover both frontend and Rust layers once the
  scaffold exists.

## Follow-Up Work

- Scaffold the Tauri 2 application.
- Add the initial frontend and Rust module structure.
- Define the central Nekara launcher configuration.
- Add a first Tauri command for launcher status and diagnostics.


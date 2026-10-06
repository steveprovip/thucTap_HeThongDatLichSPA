---
name: hoyoplay-desktop-experience
description: Guidelines and automation for the HoYoPlay-style 1-click desktop launcher, headless execution, silent background services, and 1-click GitHub live updates without zip downloads.
---

# HoYoPlay Desktop Experience Protocol

## 1. Zero-Terminal Rule
- Running `HoYoSalon.bat` or desktop shortcut must NOT leave intrusive black CMD windows open.
- Background services (PostgreSQL Docker container, NestJS API, Vite Web Server) must run detached with logging redirected to `logs/`.

## 2. 1-Click Seamless Transition
- When the user clicks "BẮT ĐẦU", services spin up asynchronously.
- Once healthcheck `http://127.0.0.1:3000/health` returns 200, the default browser opens directly to the web app (`http://localhost:5173` or `http://localhost:3000`).
- The Launcher UI should automatically minimize or close so the user transitions straight into the Salon Spa system.

## 3. Real-time GitHub Update
- Launcher checks `origin` tags via `git ls-remote` and GitHub Releases API.
- If a new version exists, button changes to "CẬP NHẬT (vX.Y.Z)".
- Clicking "CẬP NHẬT" performs atomic backup -> git pull -> build -> migration -> restart without requiring manual zip downloads.

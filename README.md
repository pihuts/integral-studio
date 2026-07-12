# Integral Studio

Self-paced calculus practice with a live 3D visual.

## Run

```bash
cd C:\Users\peter\integral-studio
npm install
npm run dev
```

Open http://127.0.0.1:5173/

## Copy to Drive D (when D: is healthy)

```powershell
robocopy C:\Users\peter\integral-studio D:\teaching\integral-studio /E /XD node_modules
cd D:\teaching\integral-studio
npm install
npm run dev
```

## Features

- Landing page: topic + difficulty
- Exact-answer application problems
- Detailed worked solutions after Check
- Viz: strips 4-48, speed, progress scrubber, play/pause
- Camera: left/middle orbit, wheel zoom, right pan

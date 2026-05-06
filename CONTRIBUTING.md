# Contributing

Thanks for considering a contribution. This project is a pilot/reference implementation, but improvements, bug reports, and hardware-compatibility patches are welcome.

## Ways to contribute

- **Bug reports** — open an issue with reproduction steps, hardware (board model, sensors), and serial logs.
- **Feature ideas** — open a discussion or issue first to align before implementation.
- **Pull requests** — small, focused PRs preferred. One concern per PR.
- **Hardware notes** — wiring tips, sensor variants, alternative GPS/IMU modules.

## Development workflow

```bash
git clone https://github.com/NamanKansal230505/IoT-based-Fleet-Monitoring.git
cd IoT-based-Fleet-Monitoring

# Backend
cd server
cp config.example.json config.json
npm install
npm start

# Firmware
cd ../firmware/AgriTracker
cp config.example.h config.h   # then edit WiFi + server IP
arduino-cli compile --fqbn esp32:esp32:esp32 .
arduino-cli upload  --fqbn esp32:esp32:esp32 -p COMx .
```

## Code style

- 2-space indent for JS / HTML / CSS, 4-space for `.ino` / C++ (see `.editorconfig`).
- Keep dependencies minimal; prefer Node built-ins where reasonable.
- No new top-level frameworks without discussion.

## Commit messages

Conventional, short imperative subjects:

```
feat(server): add per-district utilisation report
fix(firmware): silence I2C NACK spam when MPU absent
docs(api): document /api/history endpoint
```

## Security

If you discover a vulnerability (auth bypass, RCE, credential leak in default config), **please do not open a public issue**. Email the maintainer or open a private security advisory on GitHub.

## License

By contributing you agree your work is licensed under the project's MIT License.

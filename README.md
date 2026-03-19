<div align="center">
  <h1>Easy Share 🚀</h1>
  <p><b>High-performance, ephemeral text synchronization for the modern workflow.</b></p>

  <p>
    <a href="https://owsam22-easy-share.vercel.app"><b>Explore Live Demo</b></a> •
    <a href="#-technical-architecture">Architecture</a> •
    <a href="#-security--privacy">Privacy</a> •
    <a href="#-deployment">Deployment</a>
  </p>

  <img src="https://img.shields.io/github/stars/owsam22/easy-share?style=for-the-badge&color=00C7FF" />
  <img src="https://img.shields.io/github/license/owsam22/easy-share?style=for-the-badge&color=white" />
  <img src="https://img.shields.io/badge/PRs-Welcome-brightgreen?style=for-the-badge" />
</div>

---

## 📈 Executive Summary
**Easy Share** eliminates the friction of cross-device data transfer. By leveraging **WebSocket (Socket.io)** technology, it creates a secure, temporary tunnel between devices via a simple QR-handshake—removing the need for account creation, cloud storage, or permanent data footprints.

## 🛠 Technical Architecture
The system is built on a **Decoupled Client-Server Model** designed for sub-100ms latency.

* **Frontend Engine:** React 18+ with **Vite** for optimized HMR and **Tailwind CSS v4** for high-fidelity UI rendering.
* **State Management:** Real-time bi-directional event emitters via **Socket.io-client**.
* **Backend Layer:** Event-driven **Node.js** environment optimized for concurrent socket connections.
* **Animations:** Declarative motion design using **Framer Motion** to ensure a premium user experience.

---

## 🔐 Security & Privacy
In an era of data harvesting, **Easy Share** operates on a **Zero-Persistence Policy**:
1.  **Volatile Memory:** Messages exist only in the application's runtime memory.
2.  **Auto-Purge:** All shared data is programmatically destroyed after **60 seconds** of inactivity.
3.  **Isolation:** Unique Room IDs generated via QR ensure session-specific tunneling.

---

## 🚀 Key Features
* **Zero-Config Connection:** Direct pairing via QR-Code protocol.
* **Universal Compatibility:** Responsive architecture optimized for iOS, Android, and Web.
* **Bi-Directional Sync:** Simultaneous updates across linked nodes.
* **Glassmorphic Design:** Modern, professional aesthetic with accessibility in mind.

---

## 🏁 Deployment & Installation

### Environment Setup
```bash
# Clone the repository
git clone [https://github.com/owsam22/easy-share.git](https://github.com/owsam22/easy-share.git)

# Initialize Backend Services
cd backend
npm install
npm start

# Initialize Frontend Interface
cd ../frontend
npm install
npm run dev
```
🗺️ Product Roadmap
[ ] Phase 2: Implementation of WebRTC for P2P file tunneling.

[ ] Phase 3: AES-256 End-to-End Encryption (E2EE) integration.

[ ] Phase 4: Desktop-native wrappers (Electron/Tauri).

<div align="center">
<sub>Built with precision by <b><a href="https://github.com/owsam22">Samarpan (owsam22)</a></b></sub>


<sub>© 2026 Easy Share Project. All rights reserved.</sub>
</div>
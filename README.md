<div align="center">
  <img src="https://i.pinimg.com/originals/8e/ad/b7/8eadb717a261f5b10e7ef97feb4cd00d.gif" alt="Easy Share gif" width="150" />
  <h1>Easy Share 🚀</h1>
  <p><b>High-performance, ephemeral text & file synchronization for the modern workflow.</b></p>
  <br />
  <a href="https://owsam22-easy-share.vercel.app"><b>Explore Live Demo</b></a>
</div>

<br />

---

## 🎯 The Problem We Solve
In an era of cloud drives, messaging apps, and USB drives, transferring a quick link, text snippet, or file to an adjacent device is ironically frustrating. You usually have to email yourself, install an app, create an account, leave a permanent data footprint on a server, or deal with Bluetooth pairing issues.

**Easy Share** eliminates this friction. By scanning a simple QR code, you instantly create a secure, self-destructing data tunnel between any two devices. **No logins, no data footprints, no hassle.**

---

## 🚀 Key Features

### ⚡ Lightning-Fast P2P File Sync
We bypass slow cloud file uploads entirely. By utilizing **WebRTC Data Channels**, your files fly directly peer-to-peer at maximum network speed. Even gigabyte-sized files transfer seamlessly without ever touching a database.

### 🛡️ Unbreakable Network Traversal
Strict corporate firewalls and complex NATs normally break P2P connections. Easy Share integrates dedicated **Metered TURN/STUN servers** and a robust **Socket.io Fallback Cloud Sync**, guaranteeing a seamless connection success rate across entirely different Wi-Fi and mobile networks.

### 🔏 Zero-Persistence & Privacy
Your data is yours. All file sharing is secured by **End-to-End Encryption (E2EE)** powered by native WebRTC DTLS. Text inputs and signaling data exist strictly in temporary runtime memory and are aggressively **auto-purged** upon connection drop or after 60 seconds of inactivity. 

### 📱 Scan to Connect
There are no IPs to type and no Room IDs to copy. The host generates a unique session, the recipient scans it natively with their iOS or Android camera, and the responsive glassmorphic UI instantly synchronizes your clipboards.

---

## 🛠 The Tech Stack
Engineered for sub-100ms UI latency and ultimate reliability:
* **Frontend:** React 18, Vite, Tailwind CSS v4, Framer Motion
* **Real-time Signaling & Fallback:** Node.js, Socket.io
* **P2P Transfer Tunneling:** Native WebRTC
* **Relay Infrastructure:** Metered.ca TURN & Global STUN Servers

<br />

<div align="center">
  <sub>Built with precision by <b><a href="https://github.com/owsam22">Samarpan (owsam22)</a></b></sub>
</div>